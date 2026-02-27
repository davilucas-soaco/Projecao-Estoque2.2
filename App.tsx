import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  ArrowRightLeft,
  Upload,
  Search,
  Moon,
  Sun,
  ClipboardList,
  LogOut,
  ChevronDown,
  Users,
  X,
  FileDown,
} from 'lucide-react';
import { UserProfile, Order, StockItem, ProductConsolidated, UserAccount, ShelfFicha, ProjecaoImportada, mapProjecaoImportadaToOrders } from './types';
import { getHorizonInfo, getDateColumns, getTodayStart } from './utils';
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
import OrdersView from './components/OrdersView';
import ImportModal from './components/ImportModal';
import ImportSimulationModal from './components/ImportSimulationModal';
import PdfReportModal from './components/PdfReportModal';
import Login from './components/Login';
import UserManagement from './components/UserManagement';
import { buildConsolidatedData, countEligibleProjectionRows, getEligibleUniqueOrderCount } from './consolidation';

const STORAGE_KEYS = {
  USERS: 'sa_industrial_accounts_v2',
  SHELF_FICHA: 'sa_industrial_shelf_ficha_v2',
  USER_SESSION: 'sa_industrial_user_session_v2',
  LOGO: 'sa_industrial_company_logo_v1',
  SIMULATION: 'sa_industrial_simulation_v1',
};

type ProjectionSubMode = 'PADRAO' | 'SIMULADO';
type HorizonDays = 15 | 30 | 45 | 60;

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
  const [activeTab, setActiveTab] = useState<'PROJECAO' | 'ROMANEIO' | 'USUARIOS'>('PROJECAO');
  const [projectionSubMode, setProjectionSubMode] = useState<ProjectionSubMode>('PADRAO');
  const [darkMode, setDarkMode] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isImportSimulationModalOpen, setIsImportSimulationModalOpen] = useState(false);
  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [companyLogo, setCompanyLogo] = useState<string | null>(() => localStorage.getItem(STORAGE_KEYS.LOGO));
  const [showErpPanel, setShowErpPanel] = useState(false);
  const [erpStatus, setErpStatus] = useState<'connected' | 'disconnected' | 'syncing'>('syncing');
  const [logoLoadError, setLogoLoadError] = useState(false);

  // Auth State
  const [currentUser, setCurrentUser] = useState<{ profile: UserProfile, name: string } | null>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.USER_SESSION);
    return saved ? JSON.parse(saved) : null;
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
  const [horizonDays, setHorizonDays] = useState<HorizonDays>(60);
  const ordersSimulation: Order[] = useMemo(() => mapProjecaoImportadaToOrders(simulationState.data), [simulationState.data]);

  useEffect(() => {
    if (simulationState.data.length > 0 || simulationState.considerarRequisicoes !== true) {
      localStorage.setItem(STORAGE_KEYS.SIMULATION, JSON.stringify(simulationState));
    } else {
      localStorage.removeItem(STORAGE_KEYS.SIMULATION);
    }
  }, [simulationState]);

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
    if (darkMode) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [darkMode]);

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
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem(STORAGE_KEYS.USER_SESSION);
    setShowUserMenu(false);
    setActiveTab('PROJECAO');
  };

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

  const dateColumns = useMemo(() => getDateColumns(horizonDays), [horizonDays]);
  const horizonInfo = useMemo(() => getHorizonInfo(horizonDays), [horizonDays]);
  const todayStart = useMemo(() => getTodayStart(), []);

  const consolidatedData = useMemo(
    () =>
      buildConsolidatedData(orders, stock, shelfFicha, searchTerm, dateColumns, todayStart, {
        considerarRequisicoes: true,
        flattenShelfProducts: true,
      }),
    [orders, stock, shelfFicha, searchTerm, dateColumns, todayStart]
  );

  const consolidatedDataSimulation = useMemo(
    () =>
      buildConsolidatedData(ordersSimulation, stock, shelfFicha, searchTerm, dateColumns, todayStart, {
        considerarRequisicoes: simulationState.considerarRequisicoes,
        flattenShelfProducts: true,
      }),
    [ordersSimulation, stock, shelfFicha, searchTerm, dateColumns, todayStart, simulationState.considerarRequisicoes]
  );
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
      return buildConsolidatedData(ords, stock, shelfFicha, searchTerm, dateColumns, todayStart, {
        considerarRequisicoes,
        flattenShelfProducts: true,
      });
    },
    [projectionSubMode, orders, ordersSimulation, stock, shelfFicha, searchTerm, dateColumns, todayStart]
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
          <div className="relative hidden md:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" placeholder="Buscar produto..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="bg-[#0b2b58] text-sm rounded-full py-2 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-highlight w-64 border-none text-white placeholder-gray-400 transition-all" />
          </div>
          <button onClick={() => setDarkMode(!darkMode)} className="p-2 rounded-full hover:bg-white/10 transition-colors">
            {darkMode ? <Sun className="w-5 h-5 text-highlight" /> : <Moon className="w-5 h-5" />}
          </button>
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
        <div className={activeTab === 'PROJECAO' && projectionSubMode === 'PADRAO' ? '' : 'hidden'}>
          <div className="rounded-2xl border border-[#cfd8ea] dark:border-gray-700 bg-[#f7f9fd] dark:bg-[#1f1f1f] p-4 shadow-sm">
            <div className="flex justify-end mb-4">
              <button
                onClick={() => setIsPdfModalOpen(true)}
                className="flex items-center gap-2 bg-secondary hover:bg-blue-700 px-4 py-2 rounded-lg font-semibold text-sm text-white transition-all active:scale-95 shadow-md"
              >
                <FileDown className="w-4 h-4" />
                Gerar PDF
              </button>
            </div>
            <ProjectionTable
              data={consolidatedData}
              orders={orders}
              horizonLabel={horizonInfo.label}
              dateColumns={dateColumns}
              considerarRequisicoes={true}
              horizonDays={horizonDays}
              onHorizonDaysChange={setHorizonDays}
            />
          </div>
        </div>
        <div className={activeTab === 'PROJECAO' && projectionSubMode === 'SIMULADO' ? '' : 'hidden'}>
          <div className="rounded-2xl border border-[#cfd8ea] dark:border-gray-700 bg-[#f7f9fd] dark:bg-[#1f1f1f] p-4 shadow-sm">
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
              <button
                onClick={() => setIsPdfModalOpen(true)}
                disabled={simulationState.data.length === 0}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
                  simulationState.data.length === 0
                    ? 'bg-gray-200 dark:bg-gray-700 text-gray-500 cursor-not-allowed'
                    : 'bg-secondary hover:bg-blue-700 text-white active:scale-95 shadow-md'
                }`}
              >
                <FileDown className="w-4 h-4" />
                Gerar PDF
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
              <ProjectionTable
                data={consolidatedDataSimulation}
                orders={ordersSimulation}
                horizonLabel={horizonInfo.label}
                dateColumns={dateColumns}
                considerarRequisicoes={simulationState.considerarRequisicoes}
                horizonDays={horizonDays}
                onHorizonDaysChange={setHorizonDays}
              />
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
          <span>Produtos: <b>{activeTab === 'PROJECAO' && projectionSubMode === 'SIMULADO' ? consolidatedDataSimulation.length : consolidatedData.length}</b></span>
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
          companyLogo={effectiveLogo}
          currentUserName={currentUser.name}
          reportTitle={
            projectionSubMode === 'SIMULADO'
              ? 'Relatório de Projeção de Estoque (Simulação)'
              : 'Relatório de Projeção de Estoque'
          }
          projection={projectionSubMode === 'SIMULADO' ? simulationState.data : projection}
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
