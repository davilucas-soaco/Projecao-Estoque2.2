
import React, { useState, useEffect, useMemo } from 'react';
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
  Users
} from 'lucide-react';
import { UserProfile, Order, StockItem, Route, ProductConsolidated, UserAccount, ShelfFicha } from './types';
import { normalizeText, isEligibleForGTeresina, getHorizonInfo, ROUTE_G_TERESINA, ROUTE_SO_MOVEIS, isClienteVemBuscar, ROUTE_CLIENTE_BUSCA, isSoMoveis, isRotaNormal } from './utils';
import ProjectionTable from './components/ProjectionTable';
import SequenceTable from './components/SequenceTable';
import OrdersView from './components/OrdersView';
import ImportModal from './components/ImportModal';
import Login from './components/Login';
import UserManagement from './components/UserManagement';

const STORAGE_KEYS = {
  USERS: 'sa_industrial_accounts_v2',
  ORDERS: 'sa_industrial_orders_v2',
  STOCK: 'sa_industrial_stock_v2',
  ROUTES: 'sa_industrial_routes_v2',
  SHELF_FICHA: 'sa_industrial_shelf_ficha_v2',
  USER_SESSION: 'sa_industrial_user_session_v2'
};

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'PROJECAO' | 'SEQUENCIA' | 'ROMANEIO' | 'USUARIOS'>('PROJECAO');
  const [darkMode, setDarkMode] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRouteNames, setSelectedRouteNames] = useState<string[]>([]);
  const [showUserMenu, setShowUserMenu] = useState(false);

  // Auth State
  const [currentUser, setCurrentUser] = useState<{ profile: UserProfile, name: string } | null>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.USER_SESSION);
    return saved ? JSON.parse(saved) : null;
  });

  const [users, setUsers] = useState<UserAccount[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.USERS);
    let accountList: UserAccount[] = saved ? JSON.parse(saved) : [];
    const hasMaster = accountList.some(u => u.username === 'admin' || u.username === 'administrador');
    if (!hasMaster) {
      accountList = [{ id: 'master', username: 'admin', name: 'Administrador Principal', password: 'admin123', profile: 'ADMIN' }, ...accountList];
    }
    return accountList;
  });

  // Data State
  const [orders, setOrders] = useState<Order[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.ORDERS);
    return saved ? JSON.parse(saved) : [];
  });

  const [stock, setStock] = useState<StockItem[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.STOCK);
    return saved ? JSON.parse(saved) : [];
  });

  const [routes, setRoutes] = useState<Route[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.ROUTES);
    return saved ? JSON.parse(saved) : [];
  });

  const [shelfFicha, setShelfFicha] = useState<ShelfFicha[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.SHELF_FICHA);
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => { localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users)); }, [users]);
  useEffect(() => { localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(orders)); }, [orders]);
  useEffect(() => { localStorage.setItem(STORAGE_KEYS.STOCK, JSON.stringify(stock)); }, [stock]);
  useEffect(() => { localStorage.setItem(STORAGE_KEYS.ROUTES, JSON.stringify(routes)); }, [routes]);
  useEffect(() => { localStorage.setItem(STORAGE_KEYS.SHELF_FICHA, JSON.stringify(shelfFicha)); }, [shelfFicha]);

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

  const handleAddUser = (user: UserAccount) => setUsers(prev => [...prev, user]);
  const handleDeleteUser = (id: string) => setUsers(prev => prev.filter(u => u.id !== id));
  const handleUpdateUser = (updatedUser: UserAccount) => setUsers(prev => prev.map(u => u.id === updatedUser.id ? updatedUser : u));

  const handleImportOrders = (newOrders: Order[]) => {
    setOrders(newOrders);
    
    const routeNamesInNewData = Array.from(new Set(newOrders.map(o => {
      if (isSoMoveis(o) || isClienteVemBuscar(o) || isEligibleForGTeresina(o)) return null;
      return o.observacoesRomaneio;
    })))
    .filter((n): n is string => n !== null && n.trim() !== '' && n !== '&nbsp;');
    
    setRoutes(prevRoutes => {
      const filteredExisting = prevRoutes.filter(r => routeNamesInNewData.includes(r.name));
      const existingNames = new Set(filteredExisting.map(r => r.name));
      const newRouteNames = routeNamesInNewData.filter(name => !existingNames.has(name));
      const brandNewRoutes: Route[] = newRouteNames.map(name => ({
        id: crypto.randomUUID(),
        name,
        date: new Date().toISOString().split('T')[0],
        order: 0
      }));
      return [...filteredExisting, ...brandNewRoutes].map((r, i) => ({
        ...r,
        order: i + 1
      }));
    });
  };

  const handleImportStock = (newStock: StockItem[]) => {
    setStock(newStock); 
  };

  const handleImportShelfFicha = (newFicha: ShelfFicha[]) => {
    setShelfFicha(newFicha);
  };

  const handleExportData = () => {
    const backup = { users, orders, stock, routes, shelfFicha, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup_so_aco_${new Date().toLocaleDateString().replace(/\//g, '-')}.json`;
    a.click();
  };

  const handleImportData = (json: any) => {
    if (json.users) setUsers(json.users);
    if (json.orders) setOrders(json.orders);
    if (json.stock) setStock(json.stock);
    if (json.routes) setRoutes(json.routes);
    if (json.shelfFicha) setShelfFicha(json.shelfFicha);
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
      const isSM = isSoMoveis(order);
      const isCB = isClienteVemBuscar(order);
      const isGT = isEligibleForGTeresina(order);
      const isRN = isRotaNormal(order);
      
      // Validação do Horizonte para G.Teresina, Só Móveis e Cliente vem buscar
      let isInHorizon = false;
      if (isGT || isSM || isCB) {
        const dEntrega = parseOrderDateLocal(order.dataEntrega);
        if (dEntrega) {
          dEntrega.setHours(0, 0, 0, 0);
          isInHorizon = dEntrega <= horizonDate;
        }
      }

      // Se for rota fixa, só processa se estiver dentro do horizonte de 13 dias.
      // Se não for rota fixa, exige romaneio vinculado (isRN já garante isso).
      if (!isSM && !isCB && !isGT && !isRN) return;
      if ((isSM || isCB || isGT) && !isInHorizon) return;

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
      
      // Decisão de Rota seguindo a prioridade
      let routeName = '';
      if (isSM) {
        routeName = ROUTE_SO_MOVEIS;
      } else if (isCB) {
        routeName = ROUTE_CLIENTE_BUSCA;
      } else if (isGT) {
        routeName = ROUTE_G_TERESINA;
      } else if (isRN) {
        routeName = order.observacoesRomaneio;
      }
      
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

    const sortedRoutes = [...routes].sort((a, b) => a.order - b.order);
    
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

        processRoute(ROUTE_SO_MOVEIS);
        processRoute(ROUTE_G_TERESINA);
        processRoute(ROUTE_CLIENTE_BUSCA);
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

          processCompRoute(ROUTE_SO_MOVEIS);
          processCompRoute(ROUTE_G_TERESINA);
          processCompRoute(ROUTE_CLIENTE_BUSCA);
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
  }, [orders, stock, routes, shelfFicha, searchTerm]);

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

    return new Set(orders.filter(o => {
      const isSM = isSoMoveis(o);
      const isCB = isClienteVemBuscar(o);
      const isGT = isEligibleForGTeresina(o);
      const isRN = isRotaNormal(o);
      
      let isInHorizon = false;
      if (isGT || isSM || isCB) {
        const dEntrega = parseOrderDateLocal(o.dataEntrega);
        if (dEntrega) {
          dEntrega.setHours(0, 0, 0, 0);
          isInHorizon = dEntrega <= horizonDate;
        }
      }
      return isRN || isInHorizon;
    }).map(o => o.numeroPedido)).size;
  }, [orders, isEligibleForGTeresina]);

  if (!currentUser) return <Login onLogin={handleLogin} users={users} />;

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-[#1a1a1a]">
      <header className="bg-primary text-white p-4 shadow-lg sticky top-0 z-[60] flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div className="relative h-10 flex items-center">
            <img src="logo.png" alt="Só Aço Industrial" className="h-10 w-auto object-contain" onError={(e) => { 
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
            <span>Importar</span>
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
                    Gerir Usuários
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
        {currentUser.profile === 'ADMIN' && ( <TabButton active={activeTab === 'USUARIOS'} onClick={() => setActiveTab('USUARIOS')} icon={<Users className="w-4 h-4" />} label="Gestão Usuários" /> )}
      </nav>

      <main className="flex-1 p-6 overflow-auto">
        {activeTab === 'PROJECAO' && ( <ProjectionTable data={displayData} routes={routes} onRoutesReorder={setRoutes} selectedRoutes={selectedRouteNames} onFilterRoutes={setSelectedRouteNames} horizonLabel={getHorizonInfo().label} /> )}
        {activeTab === 'SEQUENCIA' && ( <SequenceTable routes={routes} orders={orders} onReorder={setRoutes} isAdmin={currentUser.profile !== 'CONSULTA'} /> )}
        {activeTab === 'ROMANEIO' && ( <OrdersView orders={orders} /> )}
        {activeTab === 'USUARIOS' && currentUser.profile === 'ADMIN' && ( <UserManagement users={users} onAddUser={handleAddUser} onDeleteUser={handleDeleteUser} onUpdateUser={handleUpdateUser} onExport={handleExportData} onImport={handleImportData} /> )}
      </main>

      <footer className="bg-white dark:bg-[#252525] border-t border-gray-200 dark:border-gray-700 p-2 px-6 flex justify-between text-[11px] text-neutral">
        <div className="flex gap-4">
          <span>Pedidos Únicos: <b>{uniqueOrdersCount}</b></span>
          <span>Produtos: <b>{displayData.length}</b></span>
          <span>Rotas Ativas: <b>{routes.length}</b></span>
        </div>
        <div><span>&copy; 2025 Só Aço Industrial</span></div>
      </footer>

      {isImportModalOpen && ( 
        <ImportModal 
          onClose={() => setIsImportModalOpen(false)} 
          onImportOrders={handleImportOrders} 
          onImportStock={handleImportStock} 
          onImportShelfFicha={handleImportShelfFicha}
          shelfFicha={shelfFicha}
        /> 
      )}
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
