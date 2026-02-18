
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { ProductConsolidated, Route } from '../types';
import { 
  AlertTriangle, 
  TrendingDown, 
  Filter, 
  X, 
  Search, 
  ChevronDown, 
  ArrowUp, 
  ArrowDown,
  Info,
  GripVertical
} from 'lucide-react';

interface SortCriterion {
  column: string;
  direction: 'asc' | 'desc';
}

interface Props {
  data: ProductConsolidated[];
  routes: Route[];
  onRoutesReorder: (routes: Route[]) => void;
  selectedRoutes: string[];
  onFilterRoutes: (routeNames: string[]) => void;
}

const ProjectionTable: React.FC<Props> = ({ data, routes, selectedRoutes, onFilterRoutes }) => {
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filterSearch, setFilterSearch] = useState('');
  const [sortCriteria, setSortCriteria] = useState<SortCriterion[]>([]);
  
  // Estado para largura da coluna de descrição
  const [descriptionWidth, setDescriptionWidth] = useState(280);
  const [isResizing, setIsResizing] = useState(false);
  const resizeRef = useRef<number>(0);

  const sortedRoutes = useMemo(() => [...routes].sort((a, b) => a.order - b.order), [routes]);
  
  const filteredRoutesList = sortedRoutes.filter(r => 
    r.name.toLowerCase().includes(filterSearch.toLowerCase())
  );

  const routesToDisplay = useMemo(() => 
    selectedRoutes.length > 0 
      ? sortedRoutes.filter(r => selectedRoutes.includes(r.name))
      : sortedRoutes
  , [selectedRoutes, sortedRoutes]);

  const toggleRoute = (name: string) => {
    if (selectedRoutes.includes(name)) {
      onFilterRoutes(selectedRoutes.filter(n => n !== name));
    } else {
      onFilterRoutes([...selectedRoutes, name]);
    }
  };

  const handleSort = (columnKey: string, isCtrl: boolean) => {
    if (isResizing) return; // Evita ordenar enquanto redimensiona
    setSortCriteria(prev => {
      const existingIndex = prev.findIndex(s => s.column === columnKey);
      
      if (isCtrl) {
        if (existingIndex > -1) {
          const newCriteria = [...prev];
          newCriteria[existingIndex] = {
            ...newCriteria[existingIndex],
            direction: newCriteria[existingIndex].direction === 'asc' ? 'desc' : 'asc'
          };
          return newCriteria;
        } else {
          return [...prev, { column: columnKey, direction: 'asc' }];
        }
      } else {
        if (existingIndex > -1 && prev.length === 1) {
          return [{ column: columnKey, direction: prev[0].direction === 'asc' ? 'desc' : 'asc' }];
        } else {
          return [{ column: columnKey, direction: 'asc' }];
        }
      }
    });
  };

  // Lógica de Redimensionamento
  const startResizing = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    resizeRef.current = e.pageX;
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const delta = e.pageX - resizeRef.current;
      setDescriptionWidth(prev => Math.max(150, Math.min(800, prev + delta)));
      resizeRef.current = e.pageX;
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
    };
  }, [isResizing]);

  const sortedData = useMemo(() => {
    if (sortCriteria.length === 0) return data;

    return [...data].sort((a, b) => {
      for (const criterion of sortCriteria) {
        let valA: any;
        let valB: any;

        if (criterion.column.startsWith('route:')) {
          const parts = criterion.column.split(':');
          const routeName = parts[1];
          const field = parts[2] as 'pedido' | 'falta';
          valA = a.routeData[routeName]?.[field] || 0;
          valB = b.routeData[routeName]?.[field] || 0;
        } else {
          valA = (a as any)[criterion.column] ?? '';
          valB = (b as any)[criterion.column] ?? '';
        }

        const isAsc = criterion.direction === 'asc';

        if (typeof valA === 'string' && typeof valB === 'string') {
          const cmp = valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' });
          if (cmp !== 0) return isAsc ? cmp : -cmp;
          continue;
        }

        if (valA === valB) continue;
        if (valA < valB) return isAsc ? -1 : 1;
        if (valA > valB) return isAsc ? 1 : -1;
      }
      return 0;
    });
  }, [data, sortCriteria]);

  const renderSortIndicator = (columnKey: string) => {
    const idx = sortCriteria.findIndex(s => s.column === columnKey);
    if (idx === -1) return null;
    const criterion = sortCriteria[idx];
    return (
      <div className="inline-flex items-center ml-1 text-highlight">
        {criterion.direction === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
        {sortCriteria.length > 1 && <span className="ml-0.5 text-[9px] font-bold">{idx + 1}</span>}
      </div>
    );
  };

  return (
    <div className="space-y-4 h-full flex flex-col">
      {/* Filtro de Rotas */}
      <div className="flex items-center gap-4 bg-white dark:bg-[#252525] p-2 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm shrink-0">
        <div className="relative">
          <button 
            onClick={() => setIsFilterOpen(!isFilterOpen)}
            className="flex items-center gap-2 bg-gray-50 dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-700 px-3 py-1.5 rounded-lg text-xs font-bold text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-[#333] transition-colors"
          >
            <Filter className="w-3.5 h-3.5 text-secondary" />
            <span>Colunas de Rotas ({selectedRoutes.length || sortedRoutes.length})</span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isFilterOpen ? 'rotate-180' : ''}`} />
          </button>

          {isFilterOpen && (
            <div className="absolute top-full left-0 mt-1 w-80 bg-white dark:bg-[#252525] border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl z-[100] overflow-hidden">
              <div className="p-2 border-b border-gray-100 dark:border-gray-800">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
                  <input 
                    type="text"
                    placeholder="Pesquisar rota..."
                    value={filterSearch}
                    onChange={(e) => setFilterSearch(e.target.value)}
                    className="w-full pl-7 pr-3 py-1 text-[11px] bg-gray-50 dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-700 rounded outline-none text-gray-900 dark:text-gray-100"
                  />
                </div>
              </div>
              <div className="max-h-60 overflow-auto p-1">
                {filteredRoutesList.map(route => (
                  <label key={route.id} className="flex items-center gap-2 p-1.5 hover:bg-gray-50 dark:hover:bg-[#2a2a2a] rounded cursor-pointer transition-colors">
                    <input 
                      type="checkbox"
                      checked={selectedRoutes.includes(route.name)}
                      onChange={() => toggleRoute(route.name)}
                      className="rounded border-gray-300 text-secondary focus:ring-secondary h-3.5 w-3.5"
                    />
                    <span className="text-[11px] truncate text-gray-900 dark:text-gray-100">{route.name}</span>
                  </label>
                ))}
              </div>
              {selectedRoutes.length > 0 && (
                <div className="p-1 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-[#2a2a2a]">
                  <button 
                    onClick={() => onFilterRoutes([])}
                    className="w-full text-[9px] font-bold text-red-500 uppercase py-1.5 hover:underline"
                  >
                    Exibir Todas as Rotas
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5 max-h-12 overflow-y-auto pr-2 flex-1 items-center">
          {selectedRoutes.map(name => (
            <span key={name} className="flex items-center gap-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-md text-[9px] font-bold">
              {name}
              <button onClick={() => toggleRoute(name)}><X className="w-2.5 h-2.5 hover:text-red-500" /></button>
            </span>
          ))}
          {selectedRoutes.length === 0 && (
            <span className="text-[11px] text-neutral italic">Todas as rotas visíveis</span>
          )}
        </div>
      </div>

      {/* Tabela de Projeção */}
      <div className="bg-white dark:bg-[#252525] rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col flex-1 relative min-h-0">
        <div className="overflow-auto flex-1 relative scroll-smooth max-h-[calc(100vh-250px)]">
          <table className="w-full text-left text-sm border-separate border-spacing-0 min-w-max">
            <thead className="sticky top-0 z-[70]">
              <tr className="bg-primary text-white">
                <th 
                  onClick={(e) => handleSort('codigo', e.ctrlKey)}
                  className="px-3 py-2 sticky left-0 top-0 z-[80] bg-primary border-b border-white/10 w-[110px] shadow-[2px_0_5px_rgba(0,0,0,0.2)] cursor-pointer group hover:bg-[#0b2b58] transition-colors"
                >
                  <div className="flex items-center justify-between text-[11px] uppercase tracking-wider font-bold">
                    <span>Código</span>
                    {renderSortIndicator('codigo')}
                  </div>
                </th>
                <th 
                  onClick={(e) => handleSort('descricao', e.ctrlKey)}
                  style={{ width: `${descriptionWidth}px`, minWidth: `${descriptionWidth}px` }}
                  className="px-3 py-2 sticky left-[110px] top-0 z-[80] bg-primary border-b border-white/10 shadow-[2px_0_5px_rgba(0,0,0,0.2)] cursor-pointer group hover:bg-[#0b2b58] transition-colors relative"
                >
                  <div className="flex items-center justify-between text-[11px] uppercase tracking-wider font-bold pr-2">
                    <span className="truncate">Descrição</span>
                    {renderSortIndicator('descricao')}
                  </div>
                  
                  {/* Resizer Handle */}
                  <div 
                    onMouseDown={startResizing}
                    className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-highlight/50 transition-colors z-[90] flex items-center justify-center"
                    title="Arraste para redimensionar"
                  >
                    <div className="w-0.5 h-4 bg-white/20"></div>
                  </div>
                </th>
                <th 
                  onClick={(e) => handleSort('estoqueAtual', e.ctrlKey)}
                  className="px-3 py-2 text-center bg-[#062c61] border-b border-white/10 border-l border-white/10 sticky top-0 z-[70] cursor-pointer hover:bg-[#083a80] transition-colors"
                >
                  <div className="flex items-center justify-center text-[11px] uppercase tracking-wider font-bold">
                    <span>Estoque</span>
                    {renderSortIndicator('estoqueAtual')}
                  </div>
                </th>
                <th 
                  onClick={(e) => handleSort('totalPedido', e.ctrlKey)}
                  className="px-3 py-2 text-center bg-[#062c61] border-b border-white/10 sticky top-0 z-[70] cursor-pointer hover:bg-[#083a80] transition-colors"
                >
                  <div className="flex items-center justify-center text-[11px] uppercase tracking-wider font-bold">
                    <span>Pedido</span>
                    {renderSortIndicator('totalPedido')}
                  </div>
                </th>
                <th 
                  onClick={(e) => handleSort('pendenteProducao', e.ctrlKey)}
                  className="px-3 py-2 text-center bg-[#062c61] border-b border-white/10 border-r border-white/10 sticky top-0 z-[70] cursor-pointer hover:bg-[#083a80] transition-colors"
                >
                  <div className="flex items-center justify-center text-[11px] uppercase tracking-wider font-bold">
                    <span>Falta</span>
                    {renderSortIndicator('pendenteProducao')}
                  </div>
                </th>
                
                {routesToDisplay.map(route => (
                  <th key={route.id} className="px-2 py-1 text-center bg-secondary border-b border-white/10 border-l border-white/10 min-w-[130px] sticky top-0 z-[70]" colSpan={2}>
                    <div className="text-[8px] opacity-70 uppercase tracking-widest leading-none mb-0.5 font-medium">Rota {route.order}</div>
                    <div className="text-[10px] whitespace-normal break-words leading-tight max-w-[125px] mx-auto uppercase font-bold mb-0.5 h-[24px] flex items-center justify-center overflow-hidden">
                      {route.name}
                    </div>
                    <div className="flex border-t border-white/20 pt-1 text-[8px] font-bold">
                      <div 
                        onClick={(e) => { e.stopPropagation(); handleSort(`route:${route.name}:pedido`, e.ctrlKey); }}
                        className="flex-1 border-r border-white/20 cursor-pointer hover:bg-white/10 p-0.5 rounded transition-colors flex items-center justify-center gap-0.5"
                      >
                        P {renderSortIndicator(`route:${route.name}:pedido`)}
                      </div>
                      <div 
                        onClick={(e) => { e.stopPropagation(); handleSort(`route:${route.name}:falta`, e.ctrlKey); }}
                        className="flex-1 cursor-pointer hover:bg-white/10 p-0.5 rounded transition-colors flex items-center justify-center gap-0.5"
                      >
                        F {renderSortIndicator(`route:${route.name}:falta`)}
                      </div>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="text-gray-900 dark:text-gray-100">
              {sortedData.map((item, idx) => (
                <tr key={item.codigo} className={`${idx % 2 === 0 ? 'bg-white dark:bg-[#252525]' : 'bg-gray-50/50 dark:bg-[#2a2a2a]'} hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-colors group`}>
                  <td className="px-3 py-1.5 font-mono font-bold text-[11px] sticky left-0 z-[40] bg-inherit border-r border-gray-100 dark:border-gray-800 shadow-[2px_0_5px_rgba(0,0,0,0.05)]">
                    {item.codigo}
                  </td>
                  <td 
                    style={{ width: `${descriptionWidth}px`, maxWidth: `${descriptionWidth}px` }}
                    className="px-3 py-1.5 text-[11px] sticky left-[110px] z-[40] bg-inherit border-r border-gray-100 dark:border-gray-800 shadow-[2px_0_5px_rgba(0,0,0,0.05)] truncate"
                  >
                    {item.descricao}
                  </td>
                  
                  <td className={`px-3 py-1.5 text-center font-semibold text-[11px] border-l border-gray-100 dark:border-gray-800 ${item.estoqueAtual < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-gray-100'}`}>
                    {item.estoqueAtual}
                  </td>
                  
                  <td className="px-3 py-1.5 text-center font-medium text-[11px] text-gray-900 dark:text-gray-100">
                    {item.totalPedido}
                  </td>

                  <td className={`px-3 py-1.5 text-center font-bold text-[11px] border-r border-gray-100 dark:border-gray-800 ${item.pendenteProducao > 0 ? 'text-highlight' : 'text-green-600 dark:text-green-400'}`}>
                    {item.pendenteProducao > 0 ? (
                      <div className="flex items-center justify-center gap-1">
                        {item.pendenteProducao}
                        <TrendingDown className="w-2.5 h-2.5" />
                      </div>
                    ) : '0'}
                  </td>

                  {routesToDisplay.map(route => {
                    const rd = item.routeData[route.name] || { pedido: 0, falta: 0 };
                    return (
                      <React.Fragment key={route.id}>
                        <td className="px-2 py-1.5 text-center border-l border-gray-100 dark:border-gray-800 text-gray-600 dark:text-gray-400 font-medium text-[11px]">
                          {rd.pedido || '-'}
                        </td>
                        <td className={`px-2 py-1.5 text-center font-bold text-[11px] ${rd.falta > 0 ? 'bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400' : 'text-gray-300 dark:text-gray-600'}`}>
                          {rd.falta || '-'}
                        </td>
                      </React.Fragment>
                    );
                  })}
                </tr>
              ))}
              {sortedData.length === 0 && (
                <tr>
                  <td colSpan={5 + routesToDisplay.length * 2} className="px-4 py-16 text-center text-neutral">
                    <div className="flex flex-col items-center gap-2">
                      <AlertTriangle className="w-10 h-10 opacity-20" />
                      <p className="text-gray-500 dark:text-gray-400 text-sm">Nenhum dado encontrado para exibição.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white dark:bg-[#252525] p-2 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center gap-3 text-[10px] text-neutral italic shrink-0">
        <Info className="w-3.5 h-3.5 text-secondary" />
        <span>
          <strong>Dica Operacional:</strong> Arraste o canto direito da coluna <strong>Descrição</strong> para expandir e visualizar nomes longos. Use <strong>CTRL + Clique</strong> para ordenação múltipla.
        </span>
      </div>
    </div>
  );
};

export default ProjectionTable;
