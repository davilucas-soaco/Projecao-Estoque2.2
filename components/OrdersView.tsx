
import React, { useMemo, useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, XAxis, YAxis, Bar } from 'recharts';
import { Order } from '../types';
import { Search, Filter, Download, Truck, ShoppingCart, BarChart3, X, MapPin } from 'lucide-react';
import { isEligibleForGTeresina, getHorizonInfo, parseOrderDate, ROUTE_G_TERESINA, ROUTE_SO_MOVEIS } from '../utils';
import * as XLSX from 'xlsx';

interface Props {
  orders: Order[];
}

const OrdersView: React.FC<Props> = ({ orders }) => {
  const [filters, setFilters] = useState({
    pedido: '',
    cliente: '',
    produto: '',
    rota: '',
    status: ''
  });

  const { chartData, uniqueTotal, uniqueInRoute, uniquePending, uniqueRoutesCount, uniqueGTTotal, uniqueGTHorizon, horizonLabel, deliveryTypeChartData } = useMemo(() => {
    const allUniquePedidos = Array.from(new Set(orders.map(o => o.numeroPedido)));
    const totalUnique = allUniquePedidos.length;

    const horizon = getHorizonInfo();
    const horizonDate = horizon.end;

    const uniqueInRouteSet = new Set(
      orders
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
    const gtOrders = orders.filter(o => isEligibleForGTeresina(o));
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
    const soMoveisOrders = orders.filter(o => o.requisicaoLoja === true);
    const uniqueSoMoveisTotal = new Set(soMoveisOrders.map(o => o.numeroPedido)).size;

    // Chart de Modalidades de Entrega
    const deliveryTypeCounts = new Map<string, number>();
    orders.forEach(order => {
      const isGT = isEligibleForGTeresina(order);
      const isSoMoveis = order.requisicaoLoja === true;
      let type = 'Outras Rotas';
      if (isSoMoveis) {
        type = ROUTE_SO_MOVEIS;
      } else if (isGT) {
        type = ROUTE_G_TERESINA;
      } else if (order.observacoesRomaneio && order.observacoesRomaneio.trim() !== '' && order.observacoesRomaneio !== '&nbsp;') {
        type = 'Rotas Manuais';
      }
      deliveryTypeCounts.set(type, (deliveryTypeCounts.get(type) || 0) + 1);
    });

    const deliveryTypeChartData = Array.from(deliveryTypeCounts.entries()).map(([name, value]) => ({
      name,
      value,
      color: name === ROUTE_G_TERESINA ? '#1E22AA' : name === ROUTE_SO_MOVEIS ? '#059669' : name === 'Rotas Manuais' ? '#3B82F6' : '#9CA3AF'
    }));

    return {
      uniqueTotal: totalUnique,
      uniqueInRoute: inRouteCount,
      uniquePending: pendingCount,
      uniqueRoutesCount: uniqueRoutesSet.size,
      uniqueGTTotal,
      uniqueGTHorizon,
      horizonLabel: horizon.label,
      deliveryTypeChartData,
      chartData: [
        { name: 'Em Rota', value: inRouteCount, color: '#1E22AA' },
        { name: 'Sem Rota', value: pendingCount, color: '#FFAD00' },
      ]
    };
  }, [orders]);

  const handleExportCSV = () => {
    const headers = [
      "Pedido", "Cliente", "Produto", "Qtd", "Tipo de Entrega", "Status"
    ];
    const dataToExport = filteredOrders.map(order => {
      const isGT = isEligibleForGTeresina(order);
      const isSoMoveis = order.requisicaoLoja === true;
      let deliveryType = (order.observacoesRomaneio || '-');
      if (isSoMoveis) {
        deliveryType = ROUTE_SO_MOVEIS;
      } else if (isGT) {
        deliveryType = ROUTE_G_TERESINA;
      }
      const hasRoute = (order.codigoRomaneio && order.codigoRomaneio !== '&nbsp;') || isGT || isSoMoveis;
      const statusText = hasRoute ? 'VINCULADO' : 'SEM ROTA';

      return [
        order.numeroPedido,
        order.cliente,
        order.codigoProduto,
        order.qtdPedida,
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
    return orders.filter(o => {
      const isGT = isEligibleForGTeresina(o);
      const isSoMoveis = o.requisicaoLoja === true;
      
      let deliveryType = (o.observacoesRomaneio || '');
      if (isSoMoveis) {
        deliveryType = ROUTE_SO_MOVEIS;
      } else if (isGT) {
        deliveryType = ROUTE_G_TERESINA;
      }

      const matchPedido = o.numeroPedido.toLowerCase().includes(filters.pedido.toLowerCase());
      const matchCliente = o.cliente.toLowerCase().includes(filters.cliente.toLowerCase());
      const matchProduto = o.codigoProduto.toLowerCase().includes(filters.produto.toLowerCase());
      const matchRota = deliveryType.toLowerCase().includes(filters.rota.toLowerCase());
      
      const hasRoute = (o.codigoRomaneio && o.codigoRomaneio.trim() !== '' && o.codigoRomaneio !== '&nbsp;') || isGT || isSoMoveis;
      const statusText = hasRoute ? 'vinculado' : 'sem rota';
      const matchStatus = filters.status === '' || statusText === filters.status;

      return matchPedido && matchCliente && matchProduto && matchRota && matchStatus;
    });
  }, [orders, filters]);

  const hasActiveFilters = useMemo(() => {
    return Object.values(filters).some(val => val !== '');
  }, [filters]);

  const clearFilters = () => setFilters({ pedido: '', cliente: '', produto: '', rota: '', status: '' });

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <KpiCard icon={<ShoppingCart className="text-secondary" />} label="Total Pedidos Únicos" value={uniqueTotal} />
        <KpiCard 
          icon={<Truck className="text-blue-500" />} 
          label="Pedidos em Rota" 
          value={uniqueInRoute} 
          subValue={uniqueRoutesCount}
        />
        <KpiCard 
          icon={<MapPin className="text-blue-600" />} 
          label="Entrega G.Teresina" 
          value={uniqueGTTotal} 
          subLabel={`No ${horizonLabel}`}
          subValue={uniqueGTHorizon}
        />
        <KpiCard icon={<div className="w-2 h-2 rounded-full bg-highlight" />} label="Pendente Rota (Sem Rota)" value={uniquePending} />
        <KpiCard 
          icon={<div className="w-2 h-2 rounded-full bg-green-500" />} 
          label="% Em Rota" 
          value={`${uniqueTotal > 0 ? Math.round((uniqueInRoute / uniqueTotal) * 100) : 0}%`} 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart de Status */} 
        <div className="bg-white dark:bg-[#252525] p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
          <h3 className="font-bold mb-4 flex items-center gap-2 text-gray-900 dark:text-gray-100">
            <BarChart3 className="w-4 h-4 text-secondary" />
            Status dos Pedidos (Únicos)
          </h3>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    if (data.name === 'Em Rota') {
                      return (
                        <div className="bg-white dark:bg-[#2a2a2a] p-2 border border-gray-200 dark:border-gray-700 rounded shadow-md text-xs">
                          <p className="font-bold text-blue-700 dark:text-blue-300">{data.name}</p>
                          <p>Pedidos vinculados: <span className="font-bold">{uniqueInRoute}</span></p>
                          <p>Rotas criadas: <span className="font-bold">{uniqueRoutesCount}</span></p>
                        </div>
                      );
                    } else if (data.name === 'Sem Rota') {
                      return (
                        <div className="bg-white dark:bg-[#2a2a2a] p-2 border border-gray-200 dark:border-gray-700 rounded shadow-md text-xs">
                          <p className="font-bold text-yellow-700 dark:text-yellow-500">{data.name}</p>
                          <p>Pedidos não vinculados: <span className="font-bold">{uniquePending}</span></p>
                        </div>
                      );
                    }
                  }
                  return null;
                }} />
                <Legend verticalAlign="bottom" height={36}/>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Table List */}
        <div className="lg:col-span-2 bg-white dark:bg-[#252525] rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col h-full">
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
          <div className="p-3 bg-gray-100/50 dark:bg-[#1a1a1a] border-b border-gray-200 dark:border-gray-700 grid grid-cols-2 md:grid-cols-5 gap-2">
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

          <div className="overflow-auto flex-1 max-h-[400px]">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 dark:bg-[#1a1a1a] sticky top-0 border-b border-gray-200 dark:border-gray-700 z-10 text-gray-900 dark:text-gray-100 uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3 font-bold">Pedido</th>
                  <th className="px-4 py-3 font-bold">Cliente</th>
                  <th className="px-4 py-3 font-bold">Produto</th>
                  <th className="px-4 py-3 font-bold text-center">Qtd</th>
                  <th className="px-4 py-3 font-bold">Tipos de entrega</th>
                  <th className="px-4 py-3 font-bold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800 text-gray-700 dark:text-gray-300">
                {filteredOrders.map((order, i) => {
                  const isGT = isEligibleForGTeresina(order);
                  const isSoMoveis = order.requisicaoLoja === true;
                  
                  let deliveryType = (order.observacoesRomaneio || '-');
                  if (isSoMoveis) {
                    deliveryType = ROUTE_SO_MOVEIS;
                  } else if (isGT) {
                    deliveryType = ROUTE_G_TERESINA;
                  }

                  const hasRoute = (order.codigoRomaneio && order.codigoRomaneio !== '&nbsp;') || isGT || isSoMoveis;

                  return (
                    <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                      <td className="px-4 py-3 font-medium font-mono">{order.numeroPedido}</td>
                      <td className="px-4 py-3 truncate max-w-[150px]">{order.cliente}</td>
                      <td className="px-4 py-3 font-mono">{order.codigoProduto}</td>
                      <td className="px-4 py-3 text-center">{order.qtdPedida}</td>
                      <td className="px-4 py-3 text-[10px] font-bold">
                        <span className={isSoMoveis ? 'text-emerald-600 dark:text-emerald-400' : isGT ? 'text-blue-600 dark:text-blue-400' : 'text-neutral italic font-normal'}>
                          {deliveryType}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${hasRoute ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-500'}`}>
                          {hasRoute ? 'VINCULADO' : 'SEM ROTA'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {filteredOrders.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-neutral italic">Nenhum item corresponde aos filtros.</td>
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

const KpiCard: React.FC<{ icon: React.ReactNode; label: string; value: string | number; subValue?: string | number; subLabel?: string }> = ({ icon, label, value, subValue, subLabel }) => (
  <div className="bg-white dark:bg-[#252525] p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm flex items-center gap-4 group hover:border-secondary transition-all">
    <div className="p-3 bg-gray-50 dark:bg-[#2a2a2a] rounded-lg group-hover:bg-blue-50 dark:group-hover:bg-blue-900/10 transition-colors">
      {icon}
    </div>
    <div className="flex-1">
      <p className="text-[10px] text-neutral font-bold uppercase tracking-wider">{label}</p>
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
