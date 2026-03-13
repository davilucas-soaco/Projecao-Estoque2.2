import React, { useState, useEffect, useMemo, useCallback, useDeferredValue, startTransition, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  ArrowRightLeft,
  Upload,
  ClipboardList,
  LogOut,
  ChevronDown,
  Users,
  X,
} from 'lucide-react';
import { UserProfile, Order, StockItem, ProductConsolidated, UserAccount, ShelfFicha, ProjecaoImportada, mapProjecaoImportadaToOrders } from './types';
import { getDateColumns, getExtendedDateColumns, getTodayStart, getSoMoveisHorizonInfo, ROUTE_SO_MOVEIS } from './utils';
import { fetchStock } from './api';
import {
  supabase,
  fetchShelfFicha,
  upsertShelfFicha,
  fetchUserAccounts,
  upsertUserAccount,
  deleteUserAccount,
  subscribeUserAccounts,
  fetchCompanyLogo,
  upsertCompanyLogo,
  subscribeCompanyLogo,
  fetchProjecaoImportada,
  replaceProjecaoImportada,
  fetchProjectionUploadMeta,
  upsertProjectionUploadMeta,
  fetchStockSyncMeta,
  upsertStockSyncMeta,
} from './supabaseClient';
import { useQueryClient } from '@tanstack/react-query';
import ProjectionTable from './components/ProjectionTable';
import ProjectionFiltersBar from './components/ProjectionFiltersBar';
import OrdersView from './components/OrdersView';
import ImportModal from './components/ImportModal';
import ImportSimulationModal from './components/ImportSimulationModal';
import PdfReportModal from './components/PdfReportModal';
import Login from './components/Login';
import UserManagement from './components/UserManagement';
import ThemeToggle from './components/ThemeToggle';
import { buildConsolidatedData, countEligibleProjectionRows, getEligibleUniqueOrderCount } from './consolidation';

const STORAGE_KEYS = {
  USERS: 'sa_industrial_accounts_v2',
  SHELF_FICHA: 'sa_industrial_shelf_ficha_v2',
  USER_SESSION: 'sa_industrial_user_session_v2',
  USER_LAST_ACTIVITY: 'sa_industrial_user_last_activity_v1',
  LOGO: 'sa_industrial_company_logo_v1',
  SIMULATION: 'sa_industrial_simulation_v1',
};

const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000;

type ProjectionSubMode = 'PADRAO' | 'SIMULADO';
type MainTab = 'PROJECAO' | 'ROMANEIO' | 'USUARIOS';

const normalizePath = (path: string): string => decodeURIComponent(path || '/').toLowerCase();

const getInitialRouteState = (): { tab: MainTab; subMode: ProjectionSubMode } => {
  if (typeof window === 'undefined') return { tab: 'PROJECAO', subMode: 'PADRAO' };
  const p = normalizePath(window.location.pathname);
  if (p.includes('/romaneio')) return { tab: 'ROMANEIO', subMode: 'PADRAO' };
  if (p.includes('/gestao')) return { tab: 'USUARIOS', subMode: 'PADRAO' };
  if (p.includes('/projecao-simulado')) return { tab: 'PROJECAO', subMode: 'SIMULADO' };
  return { tab: 'PROJECAO', subMode: 'PADRAO' };
};

interface SimulationState {
  data: ProjecaoImportada[];
  considerarRequisicoes: boolean;
}

const loadSimulationFromStorage = (): SimulationState => {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.SIMULATION);
    if (!saved) return { data: [], considerarRequisicoes: true };
    const parsed = JSON.parse(saved);
    return {
      data: Array.isArray(parsed?.data) ? parsed.data : [],
      considerarRequisicoes: typeof parsed?.considerarRequisicoes === 'boolean' ? parsed.considerarRequisicoes : true,
    };
  } catch {
    return { data: [], considerarRequisicoes: true };
  }
};

const App: React.FC = () => {
  const initialRouteState = useMemo(() => getInitialRouteState(), []);
  const [activeTab, setActiveTab] = useState<MainTab>(initialRouteState.tab);
  const [projectionSubMode, setProjectionSubMode] = useState<ProjectionSubMode>(initialRouteState.subMode);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isImportSimulationModalOpen, setIsImportSimulationModalOpen] = useState(false);
  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
  const [projectionFilterRotas, setProjectionFilterRotas] = useState<Set<string>>(new Set());
  const [projectionFilterSetores, setProjectionFilterSetores] = useState<Set<string>>(new Set());
  const [ignorePreviousConsumptions, setIgnorePreviousConsumptions] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [companyLogo, setCompanyLogo] = useState<string | null>(() => localStorage.getItem(STORAGE_KEYS.LOGO));
  const [showErpPanel, setShowErpPanel] = useState(false);
  const [erpStatus, setErpStatus] = useState<'connected' | 'disconnected' | 'syncing'>('syncing');
  const [logoLoadError, setLogoLoadError] = useState(false);
  const [visibleProductsPadrao, setVisibleProductsPadrao] = useState<number | null>(null);
  const [visibleProductsSimulacao, setVisibleProductsSimulacao] = useState<number | null>(null);

  // Auth State
  const [currentUser, setCurrentUser] = useState<{ profile: UserProfile, name: string } | null>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.USER_SESSION);
    if (!saved) return null;
    const lastActivityRaw = localStorage.getItem(STORAGE_KEYS.USER_LAST_ACTIVITY);
    const lastActivity = Number(lastActivityRaw || '0');
    if (!lastActivity || Date.now() - lastActivity > SESSION_IDLE_TIMEOUT_MS) {
      localStorage.removeItem(STORAGE_KEYS.USER_SESSION);
      localStorage.removeItem(STORAGE_KEYS.USER_LAST_ACTIVITY);
      return null;
    }
    return JSON.parse(saved);
  });

  const [users, setUsers] = useState<UserAccount[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.USERS);
    let accountList: UserAccount[] = saved ? JSON.parse(saved) : [];
    const hasMaster = accountList.some((u) => u.username === 'admin' || u.username === 'administrador');
    if (!hasMaster) {
      accountList = [{ id: 'master', username: 'admin', name: 'Administrador Principal', password: 'admin123', profile: 'ADMIN' }, ...accountList];
    }
    return accountList;
  });

  // Server state: estoque via API
  const stockQuery = useQuery({ queryKey: ['stock'], queryFn: fetchStock });
  const stockFromApi = stockQuery.data ?? [];
  const [stockOverlay, setStockOverlay] = useState<StockItem[] | null>(null);
  const stock = stockOverlay ?? stockFromApi;

  // Projeção importada (Supabase ou local)
  const projectionQuery = useQuery({
    queryKey: ['projection'],
    queryFn: fetchProjecaoImportada,
    enabled: !!supabase,
  });
  const projectionFromSupabase = projectionQuery.data ?? [];
  const [projectionLocal, setProjectionLocal] = useState<ProjecaoImportada[]>(() => {
    const saved = localStorage.getItem('sa_industrial_projection_v1');
    return saved ? JSON.parse(saved) : [];
  });
  const projection: ProjecaoImportada[] = supabase ? projectionFromSupabase : projectionLocal;
  const orders: Order[] = useMemo(() => mapProjecaoImportadaToOrders(projection), [projection]);

  // Simulação: totalmente isolada, apenas LocalStorage
  const [simulationState, setSimulationState] = useState<SimulationState>(loadSimulationFromStorage);
  const [selectedDateKeys, setSelectedDateKeys] = useState<Set<string>>(() => {
    const initialColumns = getDateColumns(60).filter((c) => !c.isAtrasados);
    const keys = new Set(initialColumns.map((c) => c.key));
    keys.add(ROUTE_SO_MOVEIS);
    keys.add('ATRASADOS');
    return keys;
  });
  const ordersSimulation: Order[] = useMemo(() => mapProjecaoImportadaToOrders(simulationState.data), [simulationState.data]);

  const projectionFullscreenRefPadrao = useRef<HTMLDivElement>(null);
  const projectionFullscreenRefSimulado = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (simulationState.data.length > 0 || simulationState.considerarRequisicoes !== true) {
      localStorage.setItem(STORAGE_KEYS.SIMULATION, JSON.stringify(simulationState));
    } else {
      localStorage.removeItem(STORAGE_KEYS.SIMULATION);
    }
  }, [simulationState]);

  useEffect(() => {
    if (!currentUser) return;

    let lastPersist = Date.now();
    const markActive = () => {
      const now = Date.now();
      if (now - lastPersist < 15000) return;
      lastPersist = now;
      localStorage.setItem(STORAGE_KEYS.USER_LAST_ACTIVITY, String(now));
    };

    const checkIdle = () => {
      const last = Number(localStorage.getItem(STORAGE_KEYS.USER_LAST_ACTIVITY) || '0');
      if (!last || Date.now() - last > SESSION_IDLE_TIMEOUT_MS) {
        setCurrentUser(null);
        localStorage.removeItem(STORAGE_KEYS.USER_SESSION);
        localStorage.removeItem(STORAGE_KEYS.USER_LAST_ACTIVITY);
      }
    };

    localStorage.setItem(STORAGE_KEYS.USER_LAST_ACTIVITY, String(Date.now()));
    const interval = window.setInterval(checkIdle, 30000);
    window.addEventListener('mousedown', markActive, { passive: true });
    window.addEventListener('keydown', markActive);
    window.addEventListener('touchstart', markActive, { passive: true });
    window.addEventListener('mousemove', markActive, { passive: true });

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('mousedown', markActive);
      window.removeEventListener('keydown', markActive);
      window.removeEventListener('touchstart', markActive);
      window.removeEventListener('mousemove', markActive);
    };
  }, [currentUser]);

  const queryClient = useQueryClient();

  // Supabase: usuários (com real-time)
  const usersQuery = useQuery({
    queryKey: ['user_accounts'],
    queryFn: async () => {
      const list = await fetchUserAccounts();
      const hasMaster = list.some((u) => u.username === 'admin' || u.username === 'administrador');
      if (!hasMaster) {
        const admin: UserAccount = {
          id: 'master',
          username: 'admin',
          name: 'Administrador Principal',
          password: 'admin123',
          profile: 'ADMIN',
        };
        await upsertUserAccount(admin);
        return [admin, ...list];
      }
      return list;
    },
    enabled: !!supabase,
    initialData: undefined,
  });
  const usersFromSupabase = usersQuery.data;

  const shelfFichaQuery = useQuery({
    queryKey: ['shelf_ficha'],
    queryFn: fetchShelfFicha,
    enabled: !!supabase,
  });
  const shelfFichaFromSupabase = shelfFichaQuery.data ?? [];

  // Supabase: logo da empresa (com real-time)
  const logoQuery = useQuery({
    queryKey: ['company_logo'],
    queryFn: fetchCompanyLogo,
    enabled: !!supabase,
    initialData: undefined,
  });
  const logoFromSupabase = logoQuery.data;
  const [shelfFichaLocal, setShelfFichaLocal] = useState<ShelfFicha[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.SHELF_FICHA);
    return saved ? JSON.parse(saved) : [];
  });
  const shelfFicha = supabase ? shelfFichaFromSupabase : shelfFichaLocal;

  // Metadados de upload da projeção e sincronização de estoque
  const projectionMetaQuery = useQuery({
    queryKey: ['projection_upload_meta'],
    queryFn: fetchProjectionUploadMeta,
    enabled: !!supabase,
  });
  const projectionMeta = projectionMetaQuery.data;

  const stockSyncMetaQuery = useQuery({
    queryKey: ['stock_sync_meta'],
    queryFn: fetchStockSyncMeta,
    enabled: !!supabase,
  });
  const lastStockSyncAt = stockSyncMetaQuery.data ?? null;

  // Fonte de dados: Supabase ou localStorage
  const effectiveUsers = supabase && usersFromSupabase ? usersFromSupabase : users;
  const effectiveLogo = supabase && logoFromSupabase !== undefined ? logoFromSupabase : companyLogo;


  useEffect(() => {
    if (!supabase) localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
  }, [supabase, users]);
  useEffect(() => {
    if (!supabase) localStorage.setItem(STORAGE_KEYS.SHELF_FICHA, JSON.stringify(shelfFichaLocal));
  }, [supabase, shelfFichaLocal]);
  useEffect(() => {
    if (!supabase) localStorage.setItem('sa_industrial_projection_v1', JSON.stringify(projectionLocal));
  }, [supabase, projectionLocal]);
  useEffect(() => {
    if (!supabase && companyLogo) localStorage.setItem(STORAGE_KEYS.LOGO, companyLogo);
    else if (!supabase) localStorage.removeItem(STORAGE_KEYS.LOGO);
  }, [supabase, companyLogo]);

  useEffect(() => {
    setLogoLoadError(false);
  }, [effectiveLogo]);

  // Subscriptions em tempo real (Supabase)
  useEffect(() => {
    if (!supabase) return;
    const unsubUsers = subscribeUserAccounts((list) => {
      queryClient.setQueryData(['user_accounts'], list);
    });
    const unsubLogo = subscribeCompanyLogo((logo) => {
      queryClient.setQueryData(['company_logo'], logo);
    });
    return () => {
      unsubUsers();
      unsubLogo();
    };
  }, [supabase, queryClient]);

  useEffect(() => {
    if (erpStatus === 'syncing' && stockQuery.isFetching) return;
    if (stockQuery.isFetching) {
      setErpStatus('syncing');
      return;
    }
    if (stockQuery.error) {
      setErpStatus('disconnected');
      return;
    }
    if (Array.isArray(stockQuery.data)) {
      setErpStatus('connected');
    }
  }, [stockQuery.isFetching, stockQuery.error, stockQuery.data, erpStatus]);

  const handleLogin = (profile: UserProfile, name: string) => {
    const user = { profile, name };
    setCurrentUser(user);
    localStorage.setItem(STORAGE_KEYS.USER_SESSION, JSON.stringify(user));
    localStorage.setItem(STORAGE_KEYS.USER_LAST_ACTIVITY, String(Date.now()));
    if (typeof window !== 'undefined') window.history.replaceState({}, '', '/projecao-padrao');
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem(STORAGE_KEYS.USER_SESSION);
    localStorage.removeItem(STORAGE_KEYS.USER_LAST_ACTIVITY);
    setShowUserMenu(false);
    setActiveTab('PROJECAO');
    if (typeof window !== 'undefined') window.history.replaceState({}, '', '/login');
  };
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onPopState = () => {
      const p = normalizePath(window.location.pathname);
      if (p.includes('/romaneio')) {
        setActiveTab('ROMANEIO');
        return;
      }
      if (p.includes('/gestao')) {
        setActiveTab('USUARIOS');
        return;
      }
      if (p.includes('/projecao-simulado')) {
        setActiveTab('PROJECAO');
        setProjectionSubMode('SIMULADO');
        return;
      }
      if (p.includes('/projecao') || p.includes('/login')) {
        setActiveTab('PROJECAO');
        setProjectionSubMode('PADRAO');
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!currentUser) {
      if (normalizePath(window.location.pathname) !== '/login') {
        window.history.replaceState({}, '', '/login');
      }
      return;
    }
    let nextPath = '/projecao-padrao';
    if (activeTab === 'ROMANEIO') nextPath = '/romaneio';
    else if (activeTab === 'USUARIOS') nextPath = '/gestao';
    else if (projectionSubMode === 'SIMULADO') nextPath = '/projecao-simulado';
    if (normalizePath(window.location.pathname) !== nextPath) {
      window.history.replaceState({}, '', nextPath);
    }
  }, [currentUser, activeTab, projectionSubMode]);


  const handleAddUser = async (user: UserAccount) => {
    if (supabase) {
      await upsertUserAccount(user);
      await queryClient.invalidateQueries({ queryKey: ['user_accounts'] });
    } else {
      setUsers((prev) => [...prev, user]);
    }
  };
  const handleDeleteUser = (id: string) => {
    if (supabase) {
      deleteUserAccount(id).catch(console.error);
    } else {
      setUsers((prev) => prev.filter((u) => u.id !== id));
    }
  };
  const handleUpdateUser = (updatedUser: UserAccount) => {
    if (supabase) {
      upsertUserAccount(updatedUser).catch(console.error);
    } else {
      setUsers((prev) => prev.map((u) => (u.id === updatedUser.id ? updatedUser : u)));
    }
  };

  const handleLogoChange = async (logoDataUrl: string | null) => {
    if (supabase) {
      try {
        await upsertCompanyLogo(logoDataUrl);
        await queryClient.invalidateQueries({ queryKey: ['company_logo'] });
      } catch (err) {
        console.error(err);
      }
    } else {
      setCompanyLogo(logoDataUrl);
    }
  };

  const handleImportProjection = async (rows: ProjecaoImportada[]) => {
    if (supabase) {
      await replaceProjecaoImportada(rows);
      const at = new Date().toLocaleString('pt-BR');
      const userName = currentUser?.name ?? 'Desconhecido';
      await upsertProjectionUploadMeta({ at, user: userName });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['projection'] }),
        queryClient.invalidateQueries({ queryKey: ['projection_upload_meta'] }),
      ]);
    } else {
      setProjectionLocal(rows);
    }
  };

  const handleImportSimulation = (rows: ProjecaoImportada[], considerarRequisicoes: boolean) => {
    setSimulationState({ data: rows, considerarRequisicoes });
  };

  const handleClearSimulation = () => {
    setSimulationState({ data: [], considerarRequisicoes: true });
    localStorage.removeItem(STORAGE_KEYS.SIMULATION);
  };

  const handleImportShelfFicha = async (newFicha: ShelfFicha[]) => {
    if (supabase) {
      try {
        await upsertShelfFicha(newFicha);
        await queryClient.invalidateQueries({ queryKey: ['shelf_ficha'] });
      } catch (err) {
        console.error('Erro ao enviar ficha para Supabase:', err);
        throw err;
      }
    } else {
      setShelfFichaLocal(newFicha);
    }
  };

  const handleExportData = () => {
    const backup = { users: effectiveUsers, stock, shelfFicha, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup_so_aco_${new Date().toLocaleDateString().replace(/\//g, '-')}.json`;
    a.click();
  };

  const handleImportData = (json: any) => {
    if (json.users) {
      if (supabase) {
        Promise.all(json.users.map((u: UserAccount) => upsertUserAccount(u)))
          .then(() => queryClient.invalidateQueries({ queryKey: ['user_accounts'] }))
          .catch(console.error);
      } else {
        setUsers(json.users);
      }
    }
    if (json.stock) setStockOverlay(json.stock);
    if (json.shelfFicha && !supabase) setShelfFichaLocal(json.shelfFicha);
    if (json.shelfFicha && supabase) {
      upsertShelfFicha(json.shelfFicha).then(() => queryClient.invalidateQueries({ queryKey: ['shelf_ficha'] })).catch(console.error);
    }
    alert('Sistema restaurado com sucesso!');
  };

  const allDateColumns = useMemo(
    () => getExtendedDateColumns(60, [...orders, ...ordersSimulation]),
    [orders, ordersSimulation]
  );

  useEffect(() => {
    const futureKeys = allDateColumns.filter((c) => !c.isAtrasados).map((c) => c.key);
    setSelectedDateKeys((prev) => {
      const missing = futureKeys.filter((k) => !prev.has(k));
      if (missing.length === 0) return prev;
      return new Set([...prev, ...missing]);
    });
  }, [allDateColumns]);
  const dateColumns = useMemo(() => {
    const result: { key: string; label: string; date: Date | null; isAtrasados: boolean }[] = [];
    if (selectedDateKeys.has(ROUTE_SO_MOVEIS)) {
      result.push({ key: ROUTE_SO_MOVEIS, label: 'Só Móveis', date: null, isAtrasados: false });
    }
    const atrasados = allDateColumns.find((c) => c.isAtrasados);
    if (atrasados && selectedDateKeys.has('ATRASADOS')) {
      result.push(atrasados);
    }
    const future = allDateColumns.filter((c) => !c.isAtrasados && selectedDateKeys.has(c.key));
    result.push(...future);
    return result;
  }, [allDateColumns, selectedDateKeys]);
  const selectableDateOptions = useMemo(
    () => [
      { key: ROUTE_SO_MOVEIS, label: 'Só Móveis' },
      { key: 'ATRASADOS', label: 'Atrasados até hoje' },
      ...allDateColumns.filter((c) => !c.isAtrasados).map((c) => ({ key: c.key, label: c.label })),
    ],
    [allDateColumns]
  );
  const horizonInfo = useMemo(() => {
    const future = dateColumns.filter((c) => !c.isAtrasados);
    if (future.length === 0) return { label: 'Horizonte: sem datas selecionadas' };
    const first = future[0];
    const last = future[future.length - 1];
    return { label: `Horizonte: ${first.label} até ${last.label}` };
  }, [dateColumns]);

  const appliedFiltersLabel = useMemo(() => {
    const parts: string[] = [];
    if (projectionFilterRotas.size > 0) {
      const rotaLabels: Record<string, string> = {
        'Retirada na So Aço': '1-Retirada na So Aço',
        'Retirada na So Moveis': '2-Retirada na So Moveis',
        'Entrega em Grande Teresina': '3-Entrega em Grande Teresina',
        'Requisição': '5-Requisicao',
      };
      const labels = Array.from(projectionFilterRotas).map((r) => rotaLabels[r] ?? r);
      parts.push(`Rotas: ${labels.join(', ')}`);
    }
    if (projectionFilterSetores.size > 0) {
      parts.push(`Setores: ${Array.from(projectionFilterSetores).join(', ')}`);
    }
    if (ignorePreviousConsumptions) {
      parts.push('Desconsiderar consumos anteriores: Sim');
    }
    return parts.length > 0 ? parts.join(' | ') : '';
  }, [projectionFilterRotas, projectionFilterSetores, ignorePreviousConsumptions]);
  const soMoveisHorizonInfo = useMemo(() => getSoMoveisHorizonInfo(), []);
  const todayStart = useMemo(() => getTodayStart(), []);

  const handleProjectionRotasChange = useCallback((next: Set<string>) => {
    startTransition(() => setProjectionFilterRotas(next));
  }, []);

  const handleProjectionSetoresChange = useCallback((next: Set<string>) => {
    startTransition(() => setProjectionFilterSetores(next));
  }, []);

  const handleProjectionDatesChange = useCallback((next: Set<string>) => {
    startTransition(() => setSelectedDateKeys(next));
  }, []);

  const consolidatedData = useMemo(
    () =>
      buildConsolidatedData(orders, stock, shelfFicha, '', allDateColumns, todayStart, {
        considerarRequisicoes: true,
        flattenShelfProducts: true,
        soMoveisHorizonEndDate: soMoveisHorizonInfo.endDate,
      }),
    [orders, stock, shelfFicha, allDateColumns, todayStart, soMoveisHorizonInfo.endDate]
  );

  /** Filtra itens que não têm pedido em nenhuma coluna visível.
   * Se houver colunas de data (YYYY-MM-DD) visíveis, exige pedido em pelo menos uma delas — não considera Só Móveis/Atrasados. */
  const consolidatedDataFilteredByVisibleColumns = useMemo(() => {
    const visibleKeys = new Set(dateColumns.map((c) => c.key));
    if (visibleKeys.size === 0) return consolidatedData;
    const dateOnlyKeys = Array.from(visibleKeys).filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k));
    const keysToCheck = dateOnlyKeys.length > 0 ? dateOnlyKeys : Array.from(visibleKeys);
    const hasPedidoInKeys = (item: ProductConsolidated | { routeData: Record<string, { pedido?: number }> }) =>
      keysToCheck.some((key) => (item.routeData?.[key]?.pedido ?? 0) > 0);
    return consolidatedData.filter((item) => {
      if (hasPedidoInKeys(item)) return true;
      if (item.isShelf && item.components?.length) {
        return item.components.some((comp) => hasPedidoInKeys(comp));
      }
      return false;
    });
  }, [consolidatedData, dateColumns]);

  const consolidatedDataSimulation = useMemo(
    () =>
      buildConsolidatedData(ordersSimulation, stock, shelfFicha, '', allDateColumns, todayStart, {
        considerarRequisicoes: simulationState.considerarRequisicoes,
        flattenShelfProducts: true,
        soMoveisHorizonEndDate: soMoveisHorizonInfo.endDate,
      }),
    [ordersSimulation, stock, shelfFicha, allDateColumns, todayStart, simulationState.considerarRequisicoes, soMoveisHorizonInfo.endDate]
  );

  /** Filtra itens de simulação: se houver colunas de data visíveis, exige pedido em pelo menos uma. */
  const consolidatedDataSimulationFilteredByVisibleColumns = useMemo(() => {
    const visibleKeys = new Set(dateColumns.map((c) => c.key));
    if (visibleKeys.size === 0) return consolidatedDataSimulation;
    const dateOnlyKeys = Array.from(visibleKeys).filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k));
    const keysToCheck = dateOnlyKeys.length > 0 ? dateOnlyKeys : Array.from(visibleKeys);
    const hasPedidoInKeys = (item: ProductConsolidated | { routeData: Record<string, { pedido?: number }> }) =>
      keysToCheck.some((key) => (item.routeData?.[key]?.pedido ?? 0) > 0);
    return consolidatedDataSimulation.filter((item) => {
      if (hasPedidoInKeys(item)) return true;
      if (item.isShelf && item.components?.length) {
        return item.components.some((comp) => hasPedidoInKeys(comp));
      }
      return false;
    });
  }, [consolidatedDataSimulation, dateColumns]);

  const simulationEligibleRowsCount = useMemo(
    () =>
      countEligibleProjectionRows(ordersSimulation, dateColumns, {
        considerarRequisicoes: simulationState.considerarRequisicoes,
      }),
    [ordersSimulation, dateColumns, simulationState.considerarRequisicoes]
  );

  const uniqueOrdersCount = useMemo(
    () => getEligibleUniqueOrderCount(orders, dateColumns, { considerarRequisicoes: true }),
    [orders, dateColumns]
  );
  const uniqueOrdersCountSimulation = useMemo(
    () =>
      getEligibleUniqueOrderCount(ordersSimulation, dateColumns, {
        considerarRequisicoes: simulationState.considerarRequisicoes,
      }),
    [ordersSimulation, dateColumns, simulationState.considerarRequisicoes]
  );

  const getDataForPdf = useCallback(
    (considerarRequisicoes: boolean) => {
      const ords = projectionSubMode === 'SIMULADO' ? ordersSimulation : orders;
      return buildConsolidatedData(ords, stock, shelfFicha, '', allDateColumns, todayStart, {
        considerarRequisicoes,
        flattenShelfProducts: true,
        soMoveisHorizonEndDate: soMoveisHorizonInfo.endDate,
      });
    },
    [projectionSubMode, orders, ordersSimulation, stock, shelfFicha, allDateColumns, todayStart, soMoveisHorizonInfo.endDate]
  );

  if (!currentUser) return <Login onLogin={handleLogin} users={effectiveUsers} companyLogo={effectiveLogo} />;

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-[#1a1a1a]">
      <header className="bg-primary text-white p-4 shadow-lg sticky top-0 z-[60] flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div className="relative h-10 flex items-center">
            {effectiveLogo && !logoLoadError ? (
              <img
                src={effectiveLogo}
                alt="Logo da Empresa"
                className="h-10 w-auto object-contain"
                onError={() => setLogoLoadError(true)}
              />
            ) : (
              <div className="flex items-baseline gap-1 font-black italic select-none">
                <span className="text-[#F4A900] text-2xl">SÓ</span>
                <span className="text-white text-2xl tracking-tighter">AÇO</span>
              </div>
            )}
          </div>
          <div className="border-l border-white/20 pl-4">
            <h1 className="text-lg font-bold tracking-tight leading-none">Projeção de Estoque</h1>
            <p className="text-[9px] text-gray-400 font-bold uppercase tracking-[0.2em] mt-1">Excelência Industrial</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <ThemeToggle />
          <button onClick={() => setIsImportModalOpen(true)} className="flex items-center gap-2 bg-secondary hover:bg-blue-700 px-4 py-2 rounded font-semibold text-sm transition-all active:scale-95 shadow-lg">
            <Upload className="w-4 h-4" />
            <span>Importações</span>
          </button>
          <div className="relative">
            <button onClick={() => setShowUserMenu(!showUserMenu)} className="flex items-center gap-2 border-l border-white/20 pl-4 ml-2 hover:opacity-80 transition-opacity">
              <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-xs font-bold border border-white/30">{currentUser.name.charAt(0)}</div>
              <div className="hidden lg:block text-left">
                <p className="text-xs font-bold leading-none">{currentUser.name}</p>
                <p className="text-[10px] text-highlight font-bold leading-none mt-1 uppercase tracking-tighter">{currentUser.profile}</p>
              </div>
              <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showUserMenu ? 'rotate-180' : ''}`} />
            </button>
            {showUserMenu && (
              <div className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-[#252525] rounded-xl shadow-2xl border border-gray-100 dark:border-gray-800 py-2 animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-800">
                  <p className="text-[10px] text-neutral uppercase font-bold tracking-widest">Acesso {currentUser.profile}</p>
                </div>
                {currentUser.profile === 'ADMIN' && (
                  <button onClick={() => { setActiveTab('USUARIOS'); setShowUserMenu(false); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800/50 font-bold transition-colors">
                    <Users className="w-4 h-4 text-secondary" />
                    Gestão
                  </button>
                )}
                <button onClick={handleLogout} className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/10 font-bold transition-colors">
                  <LogOut className="w-4 h-4" />
                  Sair do Sistema
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <nav className="bg-white dark:bg-[#252525] border-b border-gray-200 dark:border-gray-700 px-4 flex gap-1 sticky top-[72px] z-[55]">
        <TabButton active={activeTab === 'PROJECAO'} onClick={() => setActiveTab('PROJECAO')} icon={<BarChart3 className="w-4 h-4" />} label="Projeção de Estoque" />
        <TabButton active={activeTab === 'ROMANEIO'} onClick={() => setActiveTab('ROMANEIO')} icon={<ClipboardList className="w-4 h-4" />} label="Romaneio / Pedidos" />
        {currentUser.profile === 'ADMIN' && ( <TabButton active={activeTab === 'USUARIOS'} onClick={() => setActiveTab('USUARIOS')} icon={<Users className="w-4 h-4" />} label="Gestão" /> )}
      </nav>

      {activeTab === 'PROJECAO' && (
        <div className="bg-gray-100 dark:bg-[#1f1f1f] border-b border-gray-200 dark:border-gray-700 px-4 py-2 flex gap-2 items-center sticky top-[120px] z-[54]">
          <span className="text-[11px] font-bold text-neutral uppercase tracking-wider mr-2">Guia Projeção:</span>
          <button
            onClick={() => setProjectionSubMode('PADRAO')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              projectionSubMode === 'PADRAO'
                ? 'bg-secondary text-white shadow-md'
                : 'bg-white dark:bg-[#252525] text-neutral hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            Projeção Estoque Padrão
          </button>
          <button
            onClick={() => setProjectionSubMode('SIMULADO')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              projectionSubMode === 'SIMULADO'
                ? 'bg-secondary text-white shadow-md'
                : 'bg-white dark:bg-[#252525] text-neutral hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            Projeção Estoque Simulado
          </button>
        </div>
      )}

      <main className="flex-1 p-6 overflow-auto">
        <div className={activeTab === 'PROJECAO' && projectionSubMode === 'PADRAO' ? 'w-full' : 'hidden'}>
          <div className="w-full rounded-2xl border border-[#cfd8ea] dark:border-gray-700 bg-[#f7f9fd] dark:bg-[#1f1f1f] p-4 shadow-sm">
            <div
              ref={projectionFullscreenRefPadrao}
              className="projection-fullscreen-container flex w-full flex-col flex-1 min-h-0 min-w-0 gap-4 bg-[#f7f9fd] dark:bg-[#1a1a1a] p-4"
            >
              <ProjectionFiltersBar
                projectionSource={projection}
                selectedRotas={projectionFilterRotas}
                onSelectedRotasChange={handleProjectionRotasChange}
                selectedSetores={projectionFilterSetores}
                onSelectedSetoresChange={handleProjectionSetoresChange}
                dateOptions={selectableDateOptions}
                selectedDateKeys={selectedDateKeys}
                onSelectedDateKeysChange={handleProjectionDatesChange}
                ignorePreviousConsumptions={ignorePreviousConsumptions}
                onIgnorePreviousConsumptionsChange={setIgnorePreviousConsumptions}
                onGeneratePdf={() => setIsPdfModalOpen(true)}
                portalContainerRef={projectionFullscreenRefPadrao}
              />
              <div className="flex-1 min-h-0">
                <ProjectionTable
                  fullscreenContainerRef={projectionFullscreenRefPadrao}
                  data={consolidatedDataFilteredByVisibleColumns}
                  orders={orders}
                  horizonLabel={horizonInfo.label}
                  soMoveisHorizonLabel={soMoveisHorizonInfo.label}
                  dateColumns={dateColumns}
                  considerarRequisicoes={true}
                  onVisibleProductsCountChange={setVisibleProductsPadrao}
                  projectionSource={projection}
                  selectedRotas={projectionFilterRotas}
                  selectedSetores={projectionFilterSetores}
                  ignorePreviousConsumptions={ignorePreviousConsumptions}
                />
              </div>
            </div>
          </div>
        </div>
        <div className={activeTab === 'PROJECAO' && projectionSubMode === 'SIMULADO' ? 'w-full' : 'hidden'}>
          <div className="w-full rounded-2xl border border-[#cfd8ea] dark:border-gray-700 bg-[#f7f9fd] dark:bg-[#1f1f1f] p-4 shadow-sm">
            <div className="flex flex-wrap gap-2 mb-4">
              <button
                onClick={() => setIsImportSimulationModalOpen(true)}
                className="flex items-center gap-2 bg-secondary hover:bg-blue-700 px-4 py-2 rounded-lg font-semibold text-sm text-white transition-all active:scale-95 shadow-md"
              >
                <Upload className="w-4 h-4" />
                Importar Simulação
              </button>
              <button
                onClick={handleClearSimulation}
                disabled={simulationState.data.length === 0}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
                  simulationState.data.length === 0
                    ? 'bg-gray-200 dark:bg-gray-700 text-gray-500 cursor-not-allowed'
                    : 'bg-red-600 hover:bg-red-700 text-white active:scale-95 shadow-md'
                }`}
              >
                Limpar Simulação
              </button>
              {simulationState.data.length > 0 && (
                <span className="text-[11px] text-neutral self-center">
                  {simulationEligibleRowsCount} registros considerados • Requisições: {simulationState.considerarRequisicoes ? 'Sim' : 'Não'}
                </span>
              )}
            </div>
            {simulationState.data.length === 0 ? (
              <div className="py-16 text-center text-neutral border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl">
                <p className="text-sm font-medium mb-2">Nenhuma simulação carregada.</p>
                <p className="text-[11px] mb-4">Use &quot;Importar Simulação&quot; para carregar um arquivo com o mesmo layout da projeção oficial.</p>
                <button
                  onClick={() => setIsImportSimulationModalOpen(true)}
                  className="inline-flex items-center gap-2 bg-secondary hover:bg-blue-700 px-4 py-2 rounded-lg font-semibold text-sm text-white"
                >
                  <Upload className="w-4 h-4" />
                  Importar Simulação
                </button>
              </div>
            ) : (
              <div
                ref={projectionFullscreenRefSimulado}
                className="projection-fullscreen-container flex w-full flex-col flex-1 min-h-0 min-w-0 gap-4 bg-[#f7f9fd] dark:bg-[#1a1a1a] p-4"
              >
                <ProjectionFiltersBar
                  projectionSource={simulationState.data}
                  selectedRotas={projectionFilterRotas}
                  onSelectedRotasChange={handleProjectionRotasChange}
                  selectedSetores={projectionFilterSetores}
                  onSelectedSetoresChange={handleProjectionSetoresChange}
                  dateOptions={selectableDateOptions}
                  selectedDateKeys={selectedDateKeys}
                  onSelectedDateKeysChange={handleProjectionDatesChange}
                  ignorePreviousConsumptions={ignorePreviousConsumptions}
                  onIgnorePreviousConsumptionsChange={setIgnorePreviousConsumptions}
                  onGeneratePdf={() => setIsPdfModalOpen(true)}
                  portalContainerRef={projectionFullscreenRefSimulado}
                />
                <div className="flex-1 min-h-0">
                  <ProjectionTable
                    fullscreenContainerRef={projectionFullscreenRefSimulado}
                    data={consolidatedDataSimulationFilteredByVisibleColumns}
                    orders={ordersSimulation}
                    horizonLabel={horizonInfo.label}
                    soMoveisHorizonLabel={soMoveisHorizonInfo.label}
                    dateColumns={dateColumns}
                    considerarRequisicoes={simulationState.considerarRequisicoes}
                    onVisibleProductsCountChange={setVisibleProductsSimulacao}
                    projectionSource={simulationState.data}
                    selectedRotas={projectionFilterRotas}
                    selectedSetores={projectionFilterSetores}
                    ignorePreviousConsumptions={ignorePreviousConsumptions}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
        <div className={activeTab === 'ROMANEIO' ? '' : 'hidden'}>
          <OrdersView projection={projection} />
        </div>
        <div className={activeTab === 'USUARIOS' && currentUser.profile === 'ADMIN' ? '' : 'hidden'}>
          <div className="rounded-2xl border border-[#cfd8ea] dark:border-gray-700 bg-[#f7f9fd] dark:bg-[#1f1f1f] p-4 shadow-sm">
            <UserManagement users={effectiveUsers} onAddUser={handleAddUser} onDeleteUser={handleDeleteUser} onUpdateUser={handleUpdateUser} onExport={handleExportData} onImport={handleImportData} companyLogo={effectiveLogo} onLogoChange={handleLogoChange} />
          </div>
        </div>
      </main>

      <footer className="bg-white dark:bg-[#252525] border-t border-gray-200 dark:border-gray-700 p-2 px-6 flex justify-between text-[11px] text-neutral">
        <div className="flex gap-4">
          <span>Pedidos Únicos: <b>{activeTab === 'PROJECAO' && projectionSubMode === 'SIMULADO' ? uniqueOrdersCountSimulation : uniqueOrdersCount}</b></span>
          <span>
            Produtos:{' '}
            <b>
              {activeTab === 'PROJECAO' && projectionSubMode === 'SIMULADO'
                ? (visibleProductsSimulacao ?? consolidatedDataSimulationFilteredByVisibleColumns.length)
                : (visibleProductsPadrao ?? consolidatedDataFilteredByVisibleColumns.length)}
            </b>
          </span>
          {activeTab === 'PROJECAO' && projectionSubMode === 'SIMULADO' && simulationState.data.length > 0 && (
            <span className="text-amber-600 dark:text-amber-400 font-semibold">[Simulação]</span>
          )}
        </div>
        <div><span>&copy; 2025 Só Aço Industrial</span></div>
      </footer>

      {isImportModalOpen && (
        <ImportModal
          onClose={() => setIsImportModalOpen(false)}
          onImportShelfFicha={handleImportShelfFicha}
          shelfFicha={shelfFicha}
          onImportProjection={handleImportProjection}
          lastProjectionUploadAt={projectionMeta?.lastUploadAt ?? null}
          lastProjectionUploadUser={projectionMeta?.lastUploadUser ?? null}
        />
      )}

      {isImportSimulationModalOpen && (
        <ImportSimulationModal
          onClose={() => setIsImportSimulationModalOpen(false)}
          onImportSimulation={handleImportSimulation}
        />
      )}

      {isPdfModalOpen && (
        <PdfReportModal
          onClose={() => setIsPdfModalOpen(false)}
          getDataForPdf={getDataForPdf}
          dateColumns={dateColumns}
          horizonLabel={horizonInfo.label}
          todayStart={todayStart}
          companyLogo={effectiveLogo}
          currentUserName={currentUser.name}
          reportTitle={
            projectionSubMode === 'SIMULADO'
              ? 'Relatório de Projeção de Estoque (Simulação)'
              : 'Relatório de Projeção de Estoque'
          }
          projection={projectionSubMode === 'SIMULADO' ? simulationState.data : projection}
          appliedFilters={appliedFiltersLabel}
        />
      )}

      {/* Conexão API / ERP */}
      {showErpPanel && (
        <div className="fixed bottom-20 right-4 z-[70] w-80 bg-white dark:bg-[#252525] rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#1f2933] flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-[11px] font-bold text-neutral uppercase tracking-widest">
                Conexão com API / ERP
              </span>
              <span
                className={`text-xs font-bold ${
                  erpStatus === 'connected'
                    ? 'text-emerald-500'
                    : erpStatus === 'disconnected'
                    ? 'text-red-500'
                    : 'text-yellow-500'
                }`}
              >
                {erpStatus === 'connected'
                  ? 'Conectado'
                  : erpStatus === 'disconnected'
                  ? 'Desconectado'
                  : 'Sincronizando'}
              </span>
            </div>
            <button
              onClick={() => setShowErpPanel(false)}
              className="text-xs text-neutral hover:text-primary transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="px-4 py-3 text-[11px] text-neutral space-y-1">
            <p>
              <span className="font-bold">Status da API:</span>{' '}
              {erpStatus === 'connected'
                ? 'Conectado'
                : erpStatus === 'disconnected'
                ? 'Desconectado'
                : 'Sincronizando'}
            </p>
            <p className="mt-2">
              <span className="font-bold block">Última sincronização com ERP:</span>
              <span>{lastStockSyncAt || 'Nunca sincronizado'}</span>
            </p>
          </div>
          <div className="px-4 pb-4 pt-2 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={async () => {
                try {
                  setErpStatus('syncing');
                  const result = await stockQuery.refetch();
                  if (result.error) {
                    throw result.error;
                  }
                  if (supabase) {
                    const at = new Date().toLocaleString('pt-BR');
                    await upsertStockSyncMeta(at);
                    await queryClient.invalidateQueries({ queryKey: ['stock_sync_meta'] });
                  }
                  setErpStatus('connected');
                } catch (err) {
                  console.error(err);
                  setErpStatus('disconnected');
                }
              }}
              disabled={stockQuery.isFetching}
              className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-white shadow-md transition-all ${
                stockQuery.isFetching
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-secondary hover:bg-blue-700 active:scale-95'
              }`}
            >
              {stockQuery.isFetching ? 'Sincronizando...' : 'Sincronizar'}
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setShowErpPanel((prev) => !prev)}
        className="fixed bottom-4 right-4 z-[60] flex items-center gap-2 px-4 py-2 rounded-full bg-secondary hover:bg-blue-700 text-white text-xs font-bold shadow-xl active:scale-95 transition-all"
      >
        <ArrowRightLeft className="w-4 h-4" />
        <span>Conexão API / ERP</span>
      </button>
    </div>
  );
};

const TabButton: React.FC<{ active: boolean; onClick: () => void; icon: React.ReactNode; label: string }> = ({ active, onClick, icon, label }) => (
  <button onClick={onClick} className={`flex items-center gap-2 px-6 py-4 text-sm font-semibold transition-all border-b-2 ${active ? 'border-secondary text-secondary dark:text-blue-400' : 'border-transparent text-neutral hover:text-primary dark:hover:text-gray-200'}`}>
    {icon}
    {label}
  </button>
);

export default App;
