import { v4 as uuidv4 } from 'uuid';
import React, { useState, useEffect, useMemo } from 'react';
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
} from 'lucide-react';
import { UserProfile, Order, StockItem, Route, ProductConsolidated, UserAccount, ShelfFicha, ProjecaoImportada, mapProjecaoImportadaToOrders } from './types';
import { getHorizonInfo, ROUTE_G_TERESINA, ROUTE_SO_MOVEIS, ROUTE_CLIENTE_BUSCA, getCategoriaFromObservacoes, isCategoriaEspecial, CATEGORY_REQUISICAO, CATEGORY_INSERIR_ROMANEIO, CATEGORY_ENTREGA_GT, CATEGORY_RETIRADA } from './utils';
import { fetchStock } from './api';
import {
  supabase,
  fetchShelfFicha,
  upsertShelfFicha,
  fetchDeliverySequence,
  syncDeliverySequenceFull,
  subscribeDeliverySequence,
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
import SequenceTable from './components/SequenceTable';
import OrdersView from './components/OrdersView';
import ImportModal from './components/ImportModal';
import Login from './components/Login';
import UserManagement from './components/UserManagement';

const STORAGE_KEYS = {
  USERS: 'sa_industrial_accounts_v2',
  ROUTES: 'sa_industrial_routes_v2',
  SHELF_FICHA: 'sa_industrial_shelf_ficha_v2',
  USER_SESSION: 'sa_industrial_user_session_v2',
  LOGO: 'sa_industrial_company_logo_v1',
};

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'PROJECAO' | 'SEQUENCIA' | 'ROMANEIO' | 'USUARIOS'>('PROJECAO');
  const [darkMode, setDarkMode] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRouteNames, setSelectedRouteNames] = useState<string[]>([]);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [companyLogo, setCompanyLogo] = useState<string | null>(() => localStorage.getItem(STORAGE_KEYS.LOGO));
  const [showErpPanel, setShowErpPanel] = useState(false);
  const [erpStatus, setErpStatus] = useState<'idle' | 'connected' | 'disconnected'>('idle');

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

  const [routes, setRoutes] = useState<Route[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.ROUTES);
    return saved ? JSON.parse(saved) : [];
  });

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

  // Supabase: sequenciamento de entrega (com real-time)
  const routesQuery = useQuery({
    queryKey: ['delivery_sequence'],
    queryFn: fetchDeliverySequence,
    enabled: !!supabase,
    initialData: undefined,
  });
  const routesFromSupabase = routesQuery.data;

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
  const effectiveRoutes = supabase && routesFromSupabase !== undefined ? routesFromSupabase : routes;
  const effectiveLogo = supabase && logoFromSupabase !== undefined ? logoFromSupabase : companyLogo;


  useEffect(() => {
    if (!supabase) localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
  }, [supabase, users]);
  useEffect(() => {
    if (!supabase) localStorage.setItem(STORAGE_KEYS.ROUTES, JSON.stringify(routes));
  }, [supabase, routes]);
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

  // Subscriptions em tempo real (Supabase)
  useEffect(() => {
    if (!supabase) return;
    const unsubUsers = subscribeUserAccounts((list) => {
      queryClient.setQueryData(['user_accounts'], list);
    });
    const unsubRoutes = subscribeDeliverySequence((list) => {
      queryClient.setQueryData(['delivery_sequence'], list);
    });
    const unsubLogo = subscribeCompanyLogo((logo) => {
      queryClient.setQueryData(['company_logo'], logo);
    });
    return () => {
      unsubUsers();
      unsubRoutes();
      unsubLogo();
    };
  }, [supabase, queryClient]);

  // Sincroniza rotas quando os pedidos (projeção) carregam (merge com rotas existentes)
  useEffect(() => {
    const source = orders;
    if (source.length === 0) return;
    if (supabase && routesFromSupabase === undefined) return; // Aguarda carregar do Supabase
    const routeNamesInData = Array.from(
      new Set(
        source.map((o) => {
          const categoria = getCategoriaFromObservacoes(o.observacoesRomaneio);
          if (isCategoriaEspecial(categoria)) return null;
          return categoria || o.observacoesRomaneio;
        })
      )
    ).filter((n): n is string => n !== null && n.trim() !== '' && n !== '&nbsp;');
    const prev = supabase ? (routesFromSupabase ?? []) : routes;
    const filtered = prev.filter((r) => routeNamesInData.includes(r.name));
    const existingNames = new Set(filtered.map((r) => r.name));
    const newNames = routeNamesInData.filter((n) => !existingNames.has(n));
    const added: Route[] = newNames.map((name) => ({
      id: uuidv4(),
      name,
      date: new Date().toISOString().split('T')[0],
      order: 0,
    }));
    const merged = [...filtered, ...added].map((r, i) => ({ ...r, order: i + 1 }));
    if (supabase) {
      syncDeliverySequenceFull(merged).catch(console.error);
    } else {
      setRoutes(merged);
    }
  }, [orders, supabase, routesFromSupabase, routes, queryClient]);

  useEffect(() => {
    if (darkMode) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [darkMode]);

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

  const setRoutesWithSync = (newRoutes: Route[] | ((prev: Route[]) => Route[])) => {
    const resolved = typeof newRoutes === 'function' ? newRoutes(effectiveRoutes) : newRoutes;
    if (supabase) {
      syncDeliverySequenceFull(resolved).catch(console.error);
    } else {
      setRoutes(resolved);
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
    const backup = { users: effectiveUsers, stock, routes: effectiveRoutes, shelfFicha, exportedAt: new Date().toISOString() };
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
    if (json.routes) {
      if (supabase) {
        syncDeliverySequenceFull(json.routes)
          .then(() => queryClient.invalidateQueries({ queryKey: ['delivery_sequence'] }))
          .catch(console.error);
      } else {
        setRoutes(json.routes);
      }
    }
    if (json.shelfFicha && !supabase) setShelfFichaLocal(json.shelfFicha);
    if (json.shelfFicha && supabase) {
      upsertShelfFicha(json.shelfFicha).then(() => queryClient.invalidateQueries({ queryKey: ['shelf_ficha'] })).catch(console.error);
    }
    alert('Sistema restaurado com sucesso!');
  };

  const consolidatedData = useMemo(() => {
    const productMap = new Map<string, ProductConsolidated>();
    const shelfFichaMap = new Map<string, ShelfFicha>();
    shelfFicha.forEach(f => {
      if (f.codigoEstante) {
        shelfFichaMap.set(f.codigoEstante.trim().toUpperCase(), f);
      }
    });

    const horizon = getHorizonInfo();
    const horizonDate = horizon.end;


    const parseOrderDateLocal = (dateStr: string) => {
      if (!dateStr) return null;
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) return d;
      const parts = dateStr.split('/');
      if (parts.length === 3) {
        return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
      }
      return null;
    };
    
    orders.forEach(order => {
      const categoria = getCategoriaFromObservacoes(order.observacoesRomaneio);

      // Validação do Horizonte para todos os pedidos (com base na data de entrega)
      let isInHorizon = false;
      const dEntrega = parseOrderDateLocal(order.dataEntrega);
      if (dEntrega) {
        dEntrega.setHours(0, 0, 0, 0);
        isInHorizon = dEntrega <= horizonDate;
      }
      if (!isInHorizon) return;

      if (!productMap.has(order.codigoProduto)) {
        const normalizedCode = order.codigoProduto.trim().toUpperCase();
        const ficha = shelfFichaMap.get(normalizedCode);
        productMap.set(order.codigoProduto, {
          codigo: order.codigoProduto,
          descricao: order.descricao,
          estoqueAtual: 0,
          totalPedido: 0,
          pendenteProducao: 0,
          routeData: {},
          isShelf: !!ficha,
          components: ficha ? [
            { codigo: ficha.codColuna, descricao: ficha.descColuna, estoqueAtual: 0, totalPedido: 0, falta: 0, routeData: {} },
            { codigo: ficha.codBandeja, descricao: ficha.descBandeja, estoqueAtual: 0, totalPedido: 0, falta: 0, routeData: {} }
          ] : undefined
        });
      }
      const prod = productMap.get(order.codigoProduto)!;
      const orderQty = order.qtdVinculada || order.qtdPedida;
      prod.totalPedido += orderQty;
      
      const routeName = categoria || order.observacoesRomaneio;
      
      if (routeName && routeName !== '&nbsp;') {
        if (!prod.routeData[routeName]) prod.routeData[routeName] = { pedido: 0, falta: 0 };
        prod.routeData[routeName].pedido += orderQty;

        // Se for estante, replica para os componentes
        if (prod.isShelf && prod.components) {
          const normalizedCode = prod.codigo.trim().toUpperCase();
          const ficha = shelfFichaMap.get(normalizedCode)!;
          
          // Coluna
          const col = prod.components[0];
          col.totalPedido += orderQty * ficha.qtdColuna;
          if (!col.routeData[routeName]) col.routeData[routeName] = { pedido: 0, falta: 0 };
          col.routeData[routeName].pedido += orderQty * ficha.qtdColuna;

          // Bandeja
          const ban = prod.components[1];
          ban.totalPedido += orderQty * ficha.qtdBandeja;
          if (!ban.routeData[routeName]) ban.routeData[routeName] = { pedido: 0, falta: 0 };
          ban.routeData[routeName].pedido += orderQty * ficha.qtdBandeja;
        }
      }
    });

    // Mapeamento de estoque para produtos e componentes
    const stockMap = new Map<string, number>();
    stock.forEach(s => stockMap.set(s.codigo, s.saldoSetorFinal));

    productMap.forEach(prod => {
      if (!prod.isShelf) {
        prod.estoqueAtual = stockMap.get(prod.codigo) || 0;
      } else if (prod.components) {
        prod.components.forEach(comp => {
          comp.estoqueAtual = stockMap.get(comp.codigo) || 0;
        });
      }
    });

    const sortedRoutes = [...effectiveRoutes].sort((a, b) => a.order - b.order);
    
    productMap.forEach(prod => {
      if (!prod.isShelf) {
        let runningBalance = Math.max(0, prod.estoqueAtual);
        let totalFalta = 0;

        const processRoute = (routeName: string) => {
          const rd = prod.routeData[routeName];
          if (rd) {
            const needed = rd.pedido;
            if (runningBalance >= needed) {
              rd.falta = 0;
              runningBalance -= needed;
            } else {
              const missing = needed - runningBalance;
              rd.falta = -missing;
              totalFalta += rd.falta;
              runningBalance = 0;
            }
          }
        };

        processRoute(CATEGORY_REQUISICAO);
        processRoute(CATEGORY_INSERIR_ROMANEIO);
        processRoute(CATEGORY_ENTREGA_GT);
        processRoute(CATEGORY_RETIRADA);
        sortedRoutes.forEach(r => processRoute(r.name));
        
        prod.pendenteProducao = totalFalta;
      } else if (prod.components) {
        // Processamento para componentes da estante
        let shelfTotalFalta = 0;

        prod.components.forEach(comp => {
          let runningBalance = Math.max(0, comp.estoqueAtual);
          let compTotalFalta = 0;

          const processCompRoute = (routeName: string) => {
            const rd = comp.routeData[routeName];
            if (rd) {
              const needed = rd.pedido;
              if (runningBalance >= needed) {
                rd.falta = 0;
                runningBalance -= needed;
              } else {
                const missing = needed - runningBalance;
                rd.falta = -missing;
                compTotalFalta += rd.falta;
                runningBalance = 0;
              }
              
              // Atualiza a falta na rota principal do produto pai para visualização
              if (!prod.routeData[routeName]) prod.routeData[routeName] = { pedido: 0, falta: 0 };
              // A falta do pai é a soma das faltas dos componentes? 
              // O requisito diz: "exibir informações dos componentes"
              // Vamos manter a falta do pai como 0 ou baseada no componente mais crítico?
              // Geralmente se falta 1 componente, falta a estante.
              prod.routeData[routeName].falta = Math.min(prod.routeData[routeName].falta || 0, rd.falta);
            }
          };

          processCompRoute(CATEGORY_REQUISICAO);
          processCompRoute(CATEGORY_INSERIR_ROMANEIO);
          processCompRoute(CATEGORY_ENTREGA_GT);
          processCompRoute(CATEGORY_RETIRADA);
          sortedRoutes.forEach(r => processCompRoute(r.name));

          comp.falta = compTotalFalta;
          shelfTotalFalta = Math.min(shelfTotalFalta, compTotalFalta);
        });

        prod.pendenteProducao = shelfTotalFalta;
      }
    });

    let result = Array.from(productMap.values());
    if (searchTerm) {
      const lowerSearch = searchTerm.toLowerCase();
      result = result.filter(p => p.codigo.toLowerCase().includes(lowerSearch) || p.descricao.toLowerCase().includes(lowerSearch));
    }
    return result;
  }, [orders, stock, effectiveRoutes, shelfFicha, searchTerm]);

  const displayData = useMemo(() => {
    if (selectedRouteNames.length === 0) return consolidatedData;
    return consolidatedData.filter(p => selectedRouteNames.some(routeName => p.routeData[routeName] && p.routeData[routeName].pedido > 0));
  }, [consolidatedData, selectedRouteNames]);

  const uniqueOrdersCount = useMemo(() => new Set(orders.map(o => o.numeroPedido)).size, [orders]);
  const uniqueOrdersInRouteCount = useMemo(() => {
    const horizon = getHorizonInfo();
    const horizonDate = horizon.end;
    const parseOrderDateLocal = (dateStr: string) => {
      if (!dateStr) return null;
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) return d;
      const parts = dateStr.split('/');
      if (parts.length === 3) {
        return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
      }
      return null;
    };

    return new Set(
      orders
        .filter(o => {
          const categoria = getCategoriaFromObservacoes(o.observacoesRomaneio);
          if (!categoria) return false;
          const dEntrega = parseOrderDateLocal(o.dataEntrega);
          if (!dEntrega) return false;
          dEntrega.setHours(0, 0, 0, 0);
          return dEntrega <= horizonDate;
        })
        .map(o => o.numeroPedido)
    ).size;
  }, [orders]);

  if (!currentUser) return <Login onLogin={handleLogin} users={effectiveUsers} companyLogo={effectiveLogo} />;

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-[#1a1a1a]">
      <header className="bg-primary text-white p-4 shadow-lg sticky top-0 z-[60] flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div className="relative h-10 flex items-center">
            <img src={effectiveLogo || 'logo.png'} alt="Logo da Empresa" className="h-10 w-auto object-contain" onError={(e) => { 
              e.currentTarget.style.display = 'none'; 
              e.currentTarget.parentElement!.innerHTML = `
                <div class="flex items-baseline gap-1 font-black italic select-none">
                  <span class="text-[#F4A900] text-2xl">SÓ</span>
                  <span class="text-white text-2xl tracking-tighter">AÇO</span>
                </div>
              `; 
            }} />
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
        <TabButton active={activeTab === 'SEQUENCIA'} onClick={() => setActiveTab('SEQUENCIA')} icon={<ArrowRightLeft className="w-4 h-4" />} label="Sequência de Entrega" />
        <TabButton active={activeTab === 'ROMANEIO'} onClick={() => setActiveTab('ROMANEIO')} icon={<ClipboardList className="w-4 h-4" />} label="Romaneio / Pedidos" />
        {currentUser.profile === 'ADMIN' && ( <TabButton active={activeTab === 'USUARIOS'} onClick={() => setActiveTab('USUARIOS')} icon={<Users className="w-4 h-4" />} label="Gestão" /> )}
      </nav>

      <main className="flex-1 p-6 overflow-auto">
        {activeTab === 'PROJECAO' && (
          <ProjectionTable
            data={displayData}
            routes={effectiveRoutes}
            orders={orders}
            onRoutesReorder={setRoutesWithSync}
            selectedRoutes={selectedRouteNames}
            onFilterRoutes={setSelectedRouteNames}
            horizonLabel={getHorizonInfo().label}
          />
        )}
        {activeTab === 'SEQUENCIA' && ( <SequenceTable routes={effectiveRoutes} orders={orders} onReorder={setRoutesWithSync} isAdmin={currentUser.profile !== 'CONSULTA'} /> )}
        {activeTab === 'ROMANEIO' && ( <OrdersView orders={orders} /> )}
        {activeTab === 'USUARIOS' && currentUser.profile === 'ADMIN' && ( <UserManagement users={effectiveUsers} onAddUser={handleAddUser} onDeleteUser={handleDeleteUser} onUpdateUser={handleUpdateUser} onExport={handleExportData} onImport={handleImportData} companyLogo={effectiveLogo} onLogoChange={handleLogoChange} /> )}
      </main>

      <footer className="bg-white dark:bg-[#252525] border-t border-gray-200 dark:border-gray-700 p-2 px-6 flex justify-between text-[11px] text-neutral">
        <div className="flex gap-4">
          <span>Pedidos Únicos: <b>{uniqueOrdersCount}</b></span>
          <span>Produtos: <b>{displayData.length}</b></span>
          <span>Rotas Ativas: <b>{effectiveRoutes.length}</b></span>
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
                  : 'Aguardando sincronização'}
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
                : 'Aguardando sincronização'}
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
                  setErpStatus('idle');
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
