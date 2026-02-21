
import React, { useMemo, useState, useRef, useEffect } from 'react';
import { ShoppingCart, Truck, Store, User, AlertCircle, ArrowUp, ArrowDown, Download, Filter, X, MapPin } from 'lucide-react';
import { Order } from '../types';
import { isEligibleForGTeresina, getHorizonInfo, parseOrderDate, ROUTE_G_TERESINA, ROUTE_SO_MOVEIS, isClienteVemBuscar, ROUTE_CLIENTE_BUSCA } from '../utils';
import * as XLSX from 'xlsx';

interface Props {
  orders: Order[];
}

type KpiFilterType = 'all' | 'so_moveis' | 'g_teresina' | 'cliente_busca' | 'em_rota' | 'sem_vinculo';

const OrdersView: React.FC<Props> = ({ orders }) => {
  const [filters, setFilters] = useState({
    pedido: '',
    cliente: '',
    produto: '',
    rota: '',
    romaneio: '',
    status: '',
    kpi: 'all' as KpiFilterType
  });

  const [sortCriteria, setSortCriteria] = useState<{ key: string; direction: 'asc' | 'desc' }[]>([]);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({
    codigoRomaneio: 120,
    observacoesRomaneio: 200,
    numeroPedido: 100,
    cliente: 150,
    codigoProduto: 120,
    descricao: 250,
    um: 60,
    qtdPedida: 80,
    qtdVinculada: 100,
    precoUnitario: 100,
    dataEntrega: 110,
    municipio: 120,
    uf: 50,
    endereco: 200,
    metodoEntrega: 150,
    requisicaoLoja: 80,
    tipoEntrega: 120,
    status: 100
  });
  const [resizingColumn, setResizingColumn] = useState<string | null>(null);
  const resizeStartX = useRef<number>(0);
  const resizeStartWidth = useRef<number>(0);

  const handleSort = (key: string, isCtrl: boolean) => {
    setSortCriteria(prev => {
      const existingIndex = prev.findIndex(s => s.key === key);
      
      if (isCtrl) {
        if (existingIndex > -1) {
          const newCriteria = [...prev];
          newCriteria[existingIndex] = {
            ...newCriteria[existingIndex],
            direction: newCriteria[existingIndex].direction === 'asc' ? 'desc' : 'asc'
          };
          return newCriteria;
        } else {
          return [...prev, { key, direction: 'asc' }];
        }
      } else {
        if (existingIndex > -1 && prev.length === 1) {
          return [{ key, direction: prev[0].direction === 'asc' ? 'desc' : 'asc' }];
        } else {
          return [{ key, direction: 'asc' }];
        }
      }
    });
  };

  const startResizing = (e: React.MouseEvent, key: string) => {
    e.preventDefault();
    e.stopPropagation();
    setResizingColumn(key);
    resizeStartX.current = e.pageX;
    resizeStartWidth.current = columnWidths[key];
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!resizingColumn) return;
      const diff = e.pageX - resizeStartX.current;
      setColumnWidths(prev => ({
        ...prev,
        [resizingColumn]: Math.max(50, resizeStartWidth.current + diff)
      }));
    };

    const handleMouseUp = () => {
      setResizingColumn(null);
    };

    if (resizingColumn) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
    };
  }, [resizingColumn]);

  const { uniqueTotal, uniqueInRoute, uniquePending, uniqueRoutesCount, uniqueGTTotal, uniqueGTHorizon, uniqueSoMoveisTotal, uniqueSoMoveisHorizon, uniqueClienteBuscaTotal, uniqueClienteBuscaHorizon, uniqueNoLinkTotal, horizonLabel } = useMemo(() => {
    // Filter out invalid orders (e.g., missing numeroPedido or codigoProduto, or zero quantities/price)
    const validOrders = orders.filter(o => 
      o.numeroPedido && o.numeroPedido.trim() !== '' &&
      o.codigoProduto && o.codigoProduto.trim() !== '' &&
      (o.qtdPedida > 0 || o.qtdVinculada > 0 || (o.precoUnitario && o.precoUnitario > 0))
    );

    const allUniquePedidos = Array.from(new Set(validOrders.map(o => o.numeroPedido)));
    const totalUnique = allUniquePedidos.length;

    const horizon = getHorizonInfo();
    const horizonDate = horizon.end;

    const uniqueInRouteSet = new Set(
      validOrders
        .filter(o => o.codigoRomaneio && o.codigoRomaneio.trim() !== '' && o.codigoRomaneio !== '&nbsp;')
        .map(o => o.numeroPedido)
    );
    const inRouteCount = uniqueInRouteSet.size;
    const pendingCount = totalUnique - inRouteCount;

    // Cálculo das rotas únicas criadas
    const uniqueRoutesSet = new Set(
      orders
        .map(o => o.observacoesRomaneio)
        .filter(n => n && n.trim() !== '' && n !== '&nbsp;')
    );

    // Indicadores G.Teresina
    const gtOrders = validOrders.filter(o => isEligibleForGTeresina(o));
    const uniqueGTTotal = new Set(gtOrders.map(o => o.numeroPedido)).size;
    
    const uniqueGTHorizon = new Set(gtOrders.filter(o => {
      const dEntrega = parseOrderDate(o.dataEntrega);
      if (dEntrega) {
        dEntrega.setHours(0, 0, 0, 0);
        return dEntrega <= horizonDate;
      }
      return false;
    }).map(o => o.numeroPedido)).size;

    // Indicadores Só Móveis
    const soMoveisOrders = validOrders.filter(o => o.requisicaoLoja === true);
    const uniqueSoMoveisTotal = new Set(soMoveisOrders.map(o => o.numeroPedido)).size;
    const uniqueSoMoveisHorizon = new Set(soMoveisOrders.filter(o => {
      const dEntrega = parseOrderDate(o.dataEntrega);
      if (dEntrega) {
        dEntrega.setHours(0, 0, 0, 0);
        return dEntrega <= horizonDate;
      }
      return false;
    }).map(o => o.numeroPedido)).size;

    // Indicadores Cliente Vem Buscar
    const clienteBuscaOrders = validOrders.filter(o => isClienteVemBuscar(o));
    const uniqueClienteBuscaTotal = new Set(clienteBuscaOrders.map(o => o.numeroPedido)).size;
    const uniqueClienteBuscaHorizon = new Set(clienteBuscaOrders.filter(o => {
      const dEntrega = parseOrderDate(o.dataEntrega);
      if (dEntrega) {
        dEntrega.setHours(0, 0, 0, 0);
        return dEntrega <= horizonDate;
      }
      return false;
    }).map(o => o.numeroPedido)).size;

    // Indicadores Pedidos Sem Vínculo (Nem Rota, Nem GT, Nem SM, Nem CB)
    const noLinkOrders = validOrders.filter(o => {
      const isGT = isEligibleForGTeresina(o);
      const isSM = o.requisicaoLoja === true;
      const isCB = isClienteVemBuscar(o);
      const hasRoute = o.codigoRomaneio && o.codigoRomaneio.trim() !== '' && o.codigoRomaneio !== '&nbsp;';
      return !isGT && !isSM && !isCB && !hasRoute;
    });
    const uniqueNoLinkTotal = new Set(noLinkOrders.map(o => o.numeroPedido)).size;

    return {
      uniqueTotal: totalUnique,
      uniqueInRoute: inRouteCount,
      uniquePending: pendingCount,
      uniqueRoutesCount: uniqueRoutesSet.size,
      uniqueGTTotal,
      uniqueGTHorizon,
      uniqueSoMoveisTotal,
      uniqueSoMoveisHorizon,
      uniqueClienteBuscaTotal,
      uniqueClienteBuscaHorizon,
      uniqueNoLinkTotal,
      horizonLabel: horizon.label
    };
  }, [orders]);

  const handleExportCSV = () => {
    const headers = [
      "Cód. Romaneio", "Obs. Romaneio", "Nº Pedido", "Cliente", "Cód. Produto", "Descrição", "U.M.", "Qtd. Pedida", "Qtd. Vinculada", "Preço Unit.", "Data Entrega", "Município", "UF", "Endereço", "Método Entrega", "Req. Loja", "Tipo Entrega", "Status"
    ];
    
    const dataToExport = filteredOrders.map(order => {
      const isGT = isEligibleForGTeresina(order);
      const isSoMoveis = order.requisicaoLoja === true;
      const isClienteBusca = isClienteVemBuscar(order);
      let deliveryType = '-';
      if (isSoMoveis) {
        deliveryType = ROUTE_SO_MOVEIS;
      } else if (isClienteBusca) {
        deliveryType = ROUTE_CLIENTE_BUSCA;
      } else if (isGT) {
        deliveryType = ROUTE_G_TERESINA;
      } else if (order.observacoesRomaneio && order.observacoesRomaneio.trim() !== '') {
        deliveryType = `${order.observacoesRomaneio} (${order.codigoRomaneio})`;
      }
      const hasRoute = (order.codigoRomaneio && order.codigoRomaneio !== '&nbsp;') || isGT || isSoMoveis || isClienteBusca;
      const statusText = hasRoute ? 'VINCULADO' : 'SEM ROTA';

      return [
        order.codigoRomaneio,
        order.observacoesRomaneio,
        order.numeroPedido,
        order.cliente,
        order.codigoProduto,
        order.descricao,
        order.um,
        order.qtdPedida,
        order.qtdVinculada,
        order.precoUnitario,
        formatDate(order.dataEntrega),
        order.municipio,
        order.uf,
        order.endereco,
        order.metodoEntrega,
        order.requisicaoLoja ? 'Sim' : 'Não',
        deliveryType,
        statusText
      ];
    });

    const ws = XLSX.utils.aoa_to_sheet([headers, ...dataToExport]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pedidos Filtrados");
    XLSX.writeFile(wb, "pedidos_filtrados.csv");
  };

  const filteredOrders = useMemo(() => {
    let filtered = orders.filter(o => {
      const isGT = isEligibleForGTeresina(o);
      const isSoMoveis = o.requisicaoLoja === true;
      const isClienteBusca = isClienteVemBuscar(o);
      
      let deliveryType = '-';
      if (isSoMoveis) {
        deliveryType = ROUTE_SO_MOVEIS;
      } else if (isClienteBusca) {
        deliveryType = ROUTE_CLIENTE_BUSCA;
      } else if (isGT) {
        deliveryType = ROUTE_G_TERESINA;
      } else if (o.observacoesRomaneio && o.observacoesRomaneio.trim() !== '') {
        deliveryType = `${o.observacoesRomaneio} (${o.codigoRomaneio})`;
      }

      // KPI Filter Logic
      if (filters.kpi !== 'all') {
        if (filters.kpi === 'so_moveis' && !isSoMoveis) return false;
        if (filters.kpi === 'g_teresina' && !isGT) return false;
        if (filters.kpi === 'cliente_busca' && !isClienteBusca) return false;
        if (filters.kpi === 'em_rota') {
           // Em rota = tem código de romaneio válido (conforme lógica do KPI)
           if (!o.codigoRomaneio || o.codigoRomaneio.trim() === '' || o.codigoRomaneio === '&nbsp;') return false;
        }
        if (filters.kpi === 'sem_vinculo') {
           const hasRoute = (o.codigoRomaneio && o.codigoRomaneio.trim() !== '' && o.codigoRomaneio !== '&nbsp;') || isGT || isSoMoveis || isClienteBusca;
           if (hasRoute) return false;
        }
      }

      const matchPedido = o.numeroPedido.toLowerCase().includes(filters.pedido.toLowerCase());
      const matchCliente = o.cliente.toLowerCase().includes(filters.cliente.toLowerCase());
      const matchProduto = o.codigoProduto.toLowerCase().includes(filters.produto.toLowerCase()) || 
                           o.descricao.toLowerCase().includes(filters.produto.toLowerCase());
      const matchRota = deliveryType.toLowerCase().includes(filters.rota.toLowerCase());
      
      const romaneioTerm = filters.romaneio.toLowerCase();
      const matchRomaneio = 
        o.codigoRomaneio.toLowerCase().includes(romaneioTerm) || 
        o.observacoesRomaneio.toLowerCase().includes(romaneioTerm);

      const hasRoute = (o.codigoRomaneio && o.codigoRomaneio.trim() !== '' && o.codigoRomaneio !== '&nbsp;') || isGT || isSoMoveis || isClienteBusca;
      const statusText = hasRoute ? 'vinculado' : 'sem rota';
      const matchStatus = filters.status === '' || statusText === filters.status;

      return matchPedido && matchCliente && matchProduto && matchRota && matchRomaneio && matchStatus;
    });

    if (sortCriteria.length > 0) {
      filtered.sort((a, b) => {
        for (const criterion of sortCriteria) {
          let valA: any = a[criterion.key as keyof Order];
          let valB: any = b[criterion.key as keyof Order];

          // Custom sort logic for calculated fields
          if (criterion.key === 'requisicaoLoja') {
            valA = a.requisicaoLoja ? 'Sim' : 'Não';
            valB = b.requisicaoLoja ? 'Sim' : 'Não';
          } else if (criterion.key === 'tipoEntrega') {
            const getDeliveryType = (o: Order) => {
              if (o.requisicaoLoja) return ROUTE_SO_MOVEIS;
              if (isClienteVemBuscar(o)) return ROUTE_CLIENTE_BUSCA;
              if (isEligibleForGTeresina(o)) return ROUTE_G_TERESINA;
              if (o.observacoesRomaneio && o.observacoesRomaneio.trim() !== '') return `${o.observacoesRomaneio} (${o.codigoRomaneio})`;
              return '-';
            };
            valA = getDeliveryType(a);
            valB = getDeliveryType(b);
          } else if (criterion.key === 'status') {
            const getStatus = (o: Order) => {
              const isGT = isEligibleForGTeresina(o);
              const isSM = o.requisicaoLoja === true;
              const isCB = isClienteVemBuscar(o);
              const hasRoute = (o.codigoRomaneio && o.codigoRomaneio.trim() !== '' && o.codigoRomaneio !== '&nbsp;') || isGT || isSM || isCB;
              return hasRoute ? 'VINCULADO' : 'SEM ROTA';
            }
            valA = getStatus(a);
            valB = getStatus(b);
          } else if (criterion.key === 'dataEntrega') {
            valA = parseOrderDate(a.dataEntrega)?.getTime() || 0;
            valB = parseOrderDate(b.dataEntrega)?.getTime() || 0;
          }

          if (valA === valB) continue;
          if (valA === undefined || valA === null) return 1;
          if (valB === undefined || valB === null) return -1;

          const comparison = valA < valB ? -1 : 1;
          return criterion.direction === 'asc' ? comparison : -comparison;
        }
        return 0;
      });
    }

    return filtered;
  }, [orders, filters, sortCriteria]);

  const hasActiveFilters = useMemo(() => {
    return Object.values(filters).some(val => val !== '' && val !== 'all');
  }, [filters]);

  const clearFilters = () => setFilters({ pedido: '', cliente: '', produto: '', rota: '', romaneio: '', status: '', kpi: 'all' });

  const formatDate = (dateStr: string) => {
    const date = parseOrderDate(dateStr);
    if (!date) return dateStr;
    return date.toLocaleDateString('pt-BR');
  };

  const renderSortIcon = (key: string) => {
    const idx = sortCriteria.findIndex(s => s.key === key);
    if (idx === -1) return null;
    const criterion = sortCriteria[idx];
    return (
      <div className="inline-flex items-center ml-1 text-secondary">
        {criterion.direction === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
        {sortCriteria.length > 1 && <span className="ml-0.5 text-[9px] font-bold">{idx + 1}</span>}
      </div>
    );
  };

  const renderHeader = (key: string, label: string) => (
    <th 
      className="px-4 py-3 font-bold cursor-pointer hover:bg-gray-100 dark:hover:bg-[#333] transition-colors relative group select-none border-r border-gray-200 dark:border-gray-700"
      style={{ width: columnWidths[key], minWidth: columnWidths[key] }}
      onClick={(e) => handleSort(key, e.ctrlKey)}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="truncate">{label}</span>
        {renderSortIcon(key)}
      </div>
      <div 
        className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-blue-500 z-10 transition-colors"
        onMouseDown={(e) => startResizing(e, key)}
        onClick={(e) => e.stopPropagation()}
      />
    </th>
  );

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
        <KpiCard 
          icon={<ShoppingCart className="text-secondary" />} 
          label="Total Pedidos Únicos" 
          value={uniqueTotal} 
          active={filters.kpi === 'all'}
          onClick={() => setFilters(f => ({ ...f, kpi: 'all' }))}
        />
        
        <KpiCard 
          icon={<Store className="text-emerald-600" />} 
          label="Requisições / Só Móveis" 
          value={uniqueSoMoveisTotal} 
          subLabel={`No ${horizonLabel}`}
          subValue={uniqueSoMoveisHorizon}
          active={filters.kpi === 'so_moveis'}
          onClick={() => setFilters(f => ({ ...f, kpi: 'so_moveis' }))}
        />

        <KpiCard 
          icon={<MapPin className="text-blue-600" />} 
          label="Entrega G.Teresina" 
          value={uniqueGTTotal} 
          subLabel={`No ${horizonLabel}`}
          subValue={uniqueGTHorizon}
          active={filters.kpi === 'g_teresina'}
          onClick={() => setFilters(f => ({ ...f, kpi: 'g_teresina' }))}
        />

        <KpiCard 
          icon={<User className="text-purple-600" />} 
          label="Cliente Vem Buscar" 
          value={uniqueClienteBuscaTotal} 
          subLabel={`No ${horizonLabel}`}
          subValue={uniqueClienteBuscaHorizon}
          active={filters.kpi === 'cliente_busca'}
          onClick={() => setFilters(f => ({ ...f, kpi: 'cliente_busca' }))}
        />

        <KpiCard 
          icon={<Truck className="text-blue-500" />} 
          label="Pedidos em Rota" 
          value={uniqueInRoute} 
          subValue={uniqueRoutesCount}
          active={filters.kpi === 'em_rota'}
          onClick={() => setFilters(f => ({ ...f, kpi: 'em_rota' }))}
        />

        <KpiCard 
          icon={<AlertCircle className="text-red-500" />} 
          label="Pedidos Sem Vínculo" 
          value={uniqueNoLinkTotal} 
          active={filters.kpi === 'sem_vinculo'}
          onClick={() => setFilters(f => ({ ...f, kpi: 'sem_vinculo' }))}
        />
      </div>

      <div className="flex flex-col gap-6">
        {/* Table List */}
        <div className="bg-white dark:bg-[#252525] rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col h-full">
          <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50/50 dark:bg-[#2a2a2a]">
            <div className="flex items-center gap-4">
              <h3 className="font-bold text-sm text-gray-900 dark:text-gray-100">Lista Detalhada de Itens</h3>
              <div className="text-[10px] text-neutral bg-white dark:bg-[#1a1a1a] px-2 py-0.5 rounded border border-gray-200 dark:border-gray-700">
                Mostrando {filteredOrders.length} de {orders.length} itens
              </div>
            </div>
            <div className="flex gap-4 items-center">
              {hasActiveFilters && (
                <button 
                  onClick={clearFilters} 
                  className="text-[10px] font-black text-red-600 hover:text-red-700 uppercase flex items-center gap-1.5 transition-all animate-in fade-in slide-in-from-right-2"
                >
                  <X className="w-3.5 h-3.5" /> LIMPAR FILTROS
                </button>
              )}
              <button onClick={handleExportCSV} className="text-[11px] font-bold flex items-center gap-2 bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-700 px-4 py-1.5 rounded hover:bg-gray-50 dark:hover:bg-[#333] transition-colors shadow-sm active:scale-95">
                <Download className="w-3.5 h-3.5" /> CSV
              </button>
            </div>
          </div>

          {/* Table Filters */}
          <div className="p-3 bg-gray-100/50 dark:bg-[#1a1a1a] border-b border-gray-200 dark:border-gray-700 grid grid-cols-2 md:grid-cols-6 gap-2">
            <FilterInput placeholder="Filtro Romaneio (Cód/Obs)" value={filters.romaneio} onChange={(v) => setFilters(f => ({...f, romaneio: v}))} />
            <FilterInput placeholder="Filtro Pedido" value={filters.pedido} onChange={(v) => setFilters(f => ({...f, pedido: v}))} />
            <FilterInput placeholder="Filtro Cliente" value={filters.cliente} onChange={(v) => setFilters(f => ({...f, cliente: v}))} />
            <FilterInput placeholder="Filtro Produto" value={filters.produto} onChange={(v) => setFilters(f => ({...f, produto: v}))} />
            <FilterInput placeholder="Filtro Entrega" value={filters.rota} onChange={(v) => setFilters(f => ({...f, rota: v}))} />
            <select 
              value={filters.status}
              onChange={(e) => setFilters(f => ({...f, status: e.target.value}))}
              className="bg-white dark:bg-[#2a2a2a] text-[10px] border border-gray-300 dark:border-gray-600 rounded px-2 py-1 outline-none text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-secondary transition-all"
            >
              <option value="">Todos Status</option>
              <option value="vinculado">VINCULADO</option>
              <option value="sem rota">SEM ROTA</option>
            </select>
          </div>

          <div className="overflow-auto flex-1 max-h-[600px]">
            <table className="w-full text-left text-xs border-separate border-spacing-0">
              <thead className="bg-gray-50 dark:bg-[#1a1a1a] sticky top-0 z-20 text-gray-900 dark:text-gray-100 uppercase tracking-wider shadow-sm">
                <tr>
                  {renderHeader('codigoRomaneio', 'Cód. Romaneio')}
                  {renderHeader('observacoesRomaneio', 'Obs. Romaneio')}
                  {renderHeader('numeroPedido', 'Nº Pedido')}
                  {renderHeader('cliente', 'Cliente')}
                  {renderHeader('codigoProduto', 'Cód. Produto')}
                  {renderHeader('descricao', 'Descrição')}
                  {renderHeader('um', 'U.M.')}
                  {renderHeader('qtdPedida', 'Qtd. Pedida')}
                  {renderHeader('qtdVinculada', 'Qtd. Vinculada')}
                  {renderHeader('precoUnitario', 'Preço Unit.')}
                  {renderHeader('dataEntrega', 'Data Entrega')}
                  {renderHeader('municipio', 'Município')}
                  {renderHeader('uf', 'UF')}
                  {renderHeader('endereco', 'Endereço')}
                  {renderHeader('metodoEntrega', 'Método Entrega')}
                  {renderHeader('requisicaoLoja', 'Req. Loja')}
                  {renderHeader('tipoEntrega', 'Tipo Entrega')}
                  {renderHeader('status', 'Status')}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800 text-gray-700 dark:text-gray-300">
                {filteredOrders.map((order, i) => {
                  const isGT = isEligibleForGTeresina(order);
                  const isSoMoveis = order.requisicaoLoja === true;
                  const isClienteBusca = isClienteVemBuscar(order);
                  
                  let deliveryType = '-';
                  if (isSoMoveis) {
                    deliveryType = ROUTE_SO_MOVEIS;
                  } else if (isClienteBusca) {
                    deliveryType = ROUTE_CLIENTE_BUSCA;
                  } else if (isGT) {
                    deliveryType = ROUTE_G_TERESINA;
                  } else if (order.observacoesRomaneio && order.observacoesRomaneio.trim() !== '') {
                    deliveryType = `${order.observacoesRomaneio} (${order.codigoRomaneio})`;
                  }

                  const hasRoute = (order.codigoRomaneio && order.codigoRomaneio !== '&nbsp;') || isGT || isSoMoveis || isClienteBusca;

                  return (
                    <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                      <td className="px-4 py-3 font-mono text-[10px] border-b border-gray-100 dark:border-gray-800 whitespace-nowrap">{order.codigoRomaneio}</td>
                      <td className="px-4 py-3 text-[10px] border-b border-gray-100 dark:border-gray-800 whitespace-normal leading-tight" style={{ width: columnWidths.observacoesRomaneio }}>{order.observacoesRomaneio}</td>
                      <td className="px-4 py-3 font-medium font-mono border-b border-gray-100 dark:border-gray-800 whitespace-nowrap">{order.numeroPedido}</td>
                      <td className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 whitespace-normal leading-tight" style={{ width: columnWidths.cliente }}>{order.cliente}</td>
                      <td className="px-4 py-3 font-mono border-b border-gray-100 dark:border-gray-800 whitespace-nowrap">{order.codigoProduto}</td>
                      <td className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 whitespace-normal leading-tight" style={{ width: columnWidths.descricao }}>{order.descricao}</td>
                      <td className="px-4 py-3 text-[10px] border-b border-gray-100 dark:border-gray-800 whitespace-nowrap">{order.um}</td>
                      <td className="px-4 py-3 text-center border-b border-gray-100 dark:border-gray-800 whitespace-nowrap">{order.qtdPedida}</td>
                      <td className="px-4 py-3 text-center border-b border-gray-100 dark:border-gray-800 whitespace-nowrap">{order.qtdVinculada}</td>
                      <td className="px-4 py-3 text-right font-mono text-[10px] border-b border-gray-100 dark:border-gray-800 whitespace-nowrap">
                        {order.precoUnitario ? order.precoUnitario.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '-'}
                      </td>
                      <td className="px-4 py-3 text-[10px] border-b border-gray-100 dark:border-gray-800 whitespace-nowrap">{formatDate(order.dataEntrega)}</td>
                      <td className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 whitespace-normal leading-tight" style={{ width: columnWidths.municipio }}>{order.municipio}</td>
                      <td className="px-4 py-3 text-center border-b border-gray-100 dark:border-gray-800 whitespace-nowrap">{order.uf}</td>
                      <td className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 whitespace-normal leading-tight" style={{ width: columnWidths.endereco }}>{order.endereco}</td>
                      <td className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 whitespace-normal leading-tight" style={{ width: columnWidths.metodoEntrega }}>{order.metodoEntrega}</td>
                      <td className="px-4 py-3 text-center text-[10px] border-b border-gray-100 dark:border-gray-800 whitespace-nowrap">{order.requisicaoLoja ? 'SIM' : 'NÃO'}</td>
                      <td className="px-4 py-3 text-[10px] font-bold border-b border-gray-100 dark:border-gray-800 whitespace-normal leading-tight" style={{ width: columnWidths.tipoEntrega }}>
                        <span className={isSoMoveis ? 'text-emerald-600 dark:text-emerald-400' : isClienteBusca ? 'text-purple-600 dark:text-purple-400' : isGT ? 'text-blue-600 dark:text-blue-400' : order.observacoesRomaneio && order.observacoesRomaneio.trim() !== '' ? 'text-blue-500' : 'text-neutral italic font-normal'}>
                          {deliveryType}
                        </span>
                      </td>
                      <td className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${hasRoute ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-500'}`}>
                          {hasRoute ? 'VINCULADO' : 'SEM ROTA'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {filteredOrders.length === 0 && (
                  <tr>
                    <td colSpan={18} className="px-4 py-12 text-center text-neutral italic">Nenhum item corresponde aos filtros.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

const FilterInput: React.FC<{ placeholder: string; value: string; onChange: (v: string) => void }> = ({ placeholder, value, onChange }) => (
  <input 
    type="text" 
    placeholder={placeholder}
    value={value}
    onChange={(e) => onChange(e.target.value)}
    className="bg-white dark:bg-[#2a2a2a] text-[10px] border border-gray-300 dark:border-gray-600 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-secondary text-gray-900 dark:text-gray-100 transition-all placeholder:text-gray-400"
  />
);

const KpiCard: React.FC<{ icon: React.ReactNode; label: string; value: string | number; subValue?: string | number; subLabel?: string; active?: boolean; onClick?: () => void }> = ({ icon, label, value, subValue, subLabel, active, onClick }) => (
  <div 
    onClick={onClick}
    className={`bg-white dark:bg-[#252525] p-4 rounded-xl border shadow-sm flex items-center gap-4 group transition-all cursor-pointer ${active ? 'border-secondary ring-1 ring-secondary' : 'border-gray-200 dark:border-gray-700 hover:border-secondary'}`}
  >
    <div className={`p-3 rounded-lg transition-colors ${active ? 'bg-blue-50 dark:bg-blue-900/20' : 'bg-gray-50 dark:bg-[#2a2a2a] group-hover:bg-blue-50 dark:group-hover:bg-blue-900/10'}`}>
      {icon}
    </div>
    <div className="flex-1">
      <p className={`text-[10px] font-bold uppercase tracking-wider ${active ? 'text-secondary' : 'text-neutral'}`}>{label}</p>
      <p className="text-xl font-black text-gray-900 dark:text-gray-100">{value}</p>
      {subValue !== undefined && (
        <p className="text-[10px] text-neutral mt-0.5 leading-none">
          {subLabel || 'Total de rotas'}: <span className="font-bold">{subValue}</span>
        </p>
      )}
    </div>
  </div>
);

export default OrdersView;
