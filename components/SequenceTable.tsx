import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Route, Order } from '../types';
import { GripVertical, Calendar, ArrowRightLeft, DollarSign, ListOrdered, X, ChevronRight, Package, Lock } from 'lucide-react';

interface Props {
  routes: Route[];
  orders: Order[];
  onReorder: (routes: Route[]) => void;
  isAdmin: boolean;
}

const SequenceTable: React.FC<Props> = ({ routes, orders, onReorder, isAdmin }) => {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [activeTooltipId, setActiveTooltipId] = useState<string | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Fechar tooltip ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(event.target as Node)) {
        setActiveTooltipId(null);
      }
    };
    if (activeTooltipId) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [activeTooltipId]);

  const moveRoute = (from: number, to: number) => {
    if (!isAdmin) return;
    const newRoutes = [...routes];
    const [removed] = newRoutes.splice(from, 1);
    newRoutes.splice(to, 0, removed);

    const updatedRoutes = newRoutes.map((route, index) => ({
      ...route,
      order: index + 1
    }));

    onReorder(updatedRoutes);
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    if (!isAdmin) {
      e.preventDefault();
      return;
    }
    
    // Se o clique for em um elemento de texto selecionável, não inicia o drag para permitir cópia
    const selection = window.getSelection();
    if (selection && selection.toString().length > 0) {
      e.preventDefault();
      return;
    }
    
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.currentTarget.classList.add('dragging');
  };

  const handleDragEnd = (e: React.DragEvent) => {
    setDraggedIndex(null);
    setDragOverIndex(null);
    e.currentTarget.classList.remove('dragging');
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (!isAdmin || draggedIndex === null || draggedIndex === index) return;
    setDragOverIndex(index);
  };

  const handleDrop = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (!isAdmin || draggedIndex === null) return;
    moveRoute(draggedIndex, index);
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const updateDate = (id: string, date: string) => {
    if (!isAdmin) return;
    onReorder(routes.map(r => r.id === id ? { ...r, date } : r));
  };

  const routeStats = useMemo(() => {
    const stats: Record<string, { totalValue: number; uniqueOrders: Map<string, { cliente: string; totalValue: number; items: any[] }> }> = {};

    orders.forEach(order => {
      const routeName = order.observacoesRomaneio;
      if (!routeName || routeName === '&nbsp;') return;

      if (!stats[routeName]) {
        stats[routeName] = { totalValue: 0, uniqueOrders: new Map() };
      }

      const itemTotalValue = order.precoUnitario * order.qtdVinculada;
      stats[routeName].totalValue += itemTotalValue;

      if (!stats[routeName].uniqueOrders.has(order.numeroPedido)) {
        stats[routeName].uniqueOrders.set(order.numeroPedido, {
          cliente: order.cliente,
          totalValue: 0,
          items: []
        });
      }

      const orderData = stats[routeName].uniqueOrders.get(order.numeroPedido)!;
      orderData.totalValue += itemTotalValue;
      orderData.items.push({
        codigo: order.codigoProduto,
        descricao: order.descricao,
        qtd: order.qtdVinculada,
        valor: itemTotalValue
      });
    });

    return stats;
  }, [orders]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="bg-white dark:bg-[#252525] p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2 text-gray-900 dark:text-gray-100 select-none">
              <ListOrdered className="w-5 h-5 text-secondary" />
              Sequência e Valor de Carga
            </h2>
            <p className="text-sm text-neutral mt-1 select-none">
              {isAdmin 
                ? 'Organize a ordem das entregas e visualize o valor financeiro vinculado a cada rota.' 
                : 'Visualize a ordem das entregas e o detalhamento financeiro por rota (Apenas Leitura).'}
            </p>
          </div>
          <div className="flex items-center gap-3">
             {!isAdmin && (
               <div className="flex items-center gap-1.5 px-3 py-1 bg-yellow-100 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-500 rounded-lg text-[10px] font-black uppercase">
                 <Lock className="w-3 h-3" /> Apenas Consulta
               </div>
             )}
             <div className="text-[10px] font-bold text-neutral uppercase tracking-widest bg-gray-100 dark:bg-[#1a1a1a] px-3 py-1 rounded-full select-none">
               {routes.length} Rotas
             </div>
          </div>
        </div>

        <div className="space-y-3">
          {routes.map((route, index) => {
            const data = routeStats[route.name] || { totalValue: 0, uniqueOrders: new Map() };
            const isTooltipActive = activeTooltipId === route.id;

            return (
              <div 
                key={route.id}
                draggable={isAdmin}
                onDragStart={(e) => handleDragStart(e, index)}
                onDragEnd={handleDragEnd}
                onDragOver={(e) => handleDragOver(e, index)}
                onDrop={(e) => handleDrop(e, index)}
                className={`flex items-center gap-4 p-4 bg-gray-50 dark:bg-[#2a2a2a] border rounded-lg transition-all duration-200 group relative
                  ${isAdmin ? 'cursor-default' : 'cursor-normal'}
                  ${dragOverIndex === index ? 'drop-target translate-y-1' : 'border-gray-200 dark:border-gray-700'}
                  hover:border-secondary hover:shadow-md
                `}
              >
                <div className="flex flex-col items-center justify-center bg-primary text-white rounded-lg w-10 h-10 font-bold shadow-inner shrink-0 select-none">
                  {route.order}
                </div>
                
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-sm uppercase text-gray-900 dark:text-gray-100 group-hover:text-secondary transition-colors truncate select-text cursor-text">
                    {route.name}
                  </h3>
                  <div className="flex items-center gap-4 mt-1 text-[10px] text-neutral">
                    <span className="flex items-center gap-1 font-medium select-text cursor-text">
                      <Calendar className="w-3 h-3" />
                      {route.date || 'Sem data'}
                    </span>
                    <span className="flex items-center gap-1 font-bold text-gray-700 dark:text-gray-300 select-text cursor-text">
                      <DollarSign className="w-3 h-3 text-green-600" />
                      {formatCurrency(data.totalValue)}
                    </span>
                    
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveTooltipId(isTooltipActive ? null : route.id);
                      }}
                      className="flex items-center gap-1 font-bold text-secondary hover:underline bg-secondary/10 px-2 py-0.5 rounded cursor-pointer transition-colors select-none"
                    >
                      <ListOrdered className="w-3 h-3" />
                      {data.uniqueOrders.size} {data.uniqueOrders.size === 1 ? 'Pedido' : 'Pedidos'}
                    </button>
                  </div>
                </div>

                {/* Tooltip de Detalhamento de Pedidos */}
                {isTooltipActive && (
                  <div 
                    ref={tooltipRef}
                    onDragStart={(e) => e.stopPropagation()}
                    draggable={false}
                    className="absolute left-0 top-full mt-2 w-full md:w-[600px] bg-white dark:bg-[#1e1e1e] border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl z-[100] animate-in slide-in-from-top-2 duration-200 cursor-default"
                  >
                    <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-primary text-white rounded-t-xl select-none">
                      <h4 className="text-xs font-bold uppercase flex items-center gap-2 select-text">
                        <Package className="w-4 h-4 text-highlight" />
                        Pedidos da Rota: {route.name}
                      </h4>
                      <button onClick={() => setActiveTooltipId(null)} className="hover:text-highlight transition-colors">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="max-h-[350px] overflow-auto p-4 space-y-4">
                      {Array.from(data.uniqueOrders.entries()).map(([pedId, pedData]) => (
                        <div key={pedId} className="border border-gray-100 dark:border-gray-800 rounded-lg overflow-hidden bg-gray-50/50 dark:bg-[#252525]">
                          <div className="bg-gray-100 dark:bg-[#1a1a1a] p-2 flex justify-between items-center border-b border-gray-200 dark:border-gray-700">
                            <div className="select-text cursor-text">
                              <p className="text-[10px] font-bold text-secondary">{pedId}</p>
                              <p className="text-[11px] font-bold text-gray-800 dark:text-gray-200 uppercase">{pedData.cliente}</p>
                            </div>
                            <div className="text-right select-text cursor-text">
                              <p className="text-[10px] font-bold text-neutral">VALOR TOTAL</p>
                              <p className="text-[11px] font-bold text-green-600">{formatCurrency(pedData.totalValue)}</p>
                            </div>
                          </div>
                          <div className="p-2 space-y-1">
                            {pedData.items.map((item, i) => (
                              <div key={i} className="flex justify-between items-start text-[10px] py-1 border-b border-gray-100 dark:border-gray-800 last:border-none">
                                <div className="flex-1 pr-4 select-text cursor-text">
                                  <p className="font-bold text-gray-700 dark:text-gray-300">{item.codigo}</p>
                                  <p className="text-neutral">{item.descricao}</p>
                                </div>
                                <div className="text-right whitespace-nowrap select-text cursor-text">
                                  <p className="font-bold">Qtd: {item.qtd}</p>
                                  <p className="text-neutral">{formatCurrency(item.valor)}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                      {data.uniqueOrders.size === 0 && (
                        <p className="text-center py-4 text-neutral text-xs italic select-none">Nenhum pedido vinculado a esta rota.</p>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-3 shrink-0 select-none">
                  <div className="flex flex-col">
                    <label className="text-[8px] font-bold text-neutral uppercase mb-0.5">Data Saída</label>
                    <input 
                      type="date"
                      value={route.date}
                      readOnly={!isAdmin}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => updateDate(route.id, e.target.value)}
                      className={`bg-white dark:bg-[#1a1a1a] text-[10px] border border-gray-300 dark:border-gray-600 rounded px-2 py-1 outline-none text-gray-900 dark:text-gray-100 ${
                        isAdmin ? 'focus:ring-2 focus:ring-secondary' : 'opacity-60 cursor-not-allowed'
                      }`}
                    />
                  </div>
                  
                  {isAdmin && (
                    <>
                      <div className="h-8 w-px bg-gray-200 dark:bg-gray-700 mx-1"></div>
                      <div className="text-neutral opacity-40 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing">
                        <GripVertical className="w-5 h-5" />
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}

          {routes.length === 0 && (
            <div className="text-center py-20 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl select-none">
              <div className="bg-gray-100 dark:bg-[#1a1a1a] w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4">
                <Calendar className="w-6 h-6 text-neutral opacity-40" />
              </div>
              <p className="text-neutral text-sm italic">Nenhuma rota importada para organização manual.</p>
              <p className="text-[10px] text-neutral mt-2">Importe o arquivo de romaneio para listar as rotas.</p>
            </div>
          )}
        </div>
      </div>
      
      {isAdmin && routes.length > 0 && (
        <div className="bg-blue-50 dark:bg-blue-900/10 p-4 rounded-xl border border-blue-100 dark:border-blue-900/30 flex items-start gap-3 select-none">
          <div className="p-2 bg-blue-100 dark:bg-blue-800 rounded-lg shrink-0">
            <ArrowRightLeft className="w-4 h-4 text-secondary dark:text-blue-300" />
          </div>
          <div className="text-[11px] text-blue-800 dark:text-blue-300 leading-relaxed">
            <strong>Planejamento Financeiro e Operacional:</strong> A ordem definida nesta tela impacta o cálculo de <strong>"Falta de Produção"</strong>. 
            Você pode selecionar e copiar informações clicando e arrastando o mouse sobre os textos (códigos, nomes e valores).
          </div>
        </div>
      )}
    </div>
  );
};

export default SequenceTable;