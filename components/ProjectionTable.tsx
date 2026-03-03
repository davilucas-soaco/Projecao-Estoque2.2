import React, { useState, useMemo, useRef, useEffect } from 'react';
import { ProductConsolidated, Order, ComponentData, ProjecaoImportada } from '../types';
import { ROUTE_SO_MOVEIS, extractRotasFromProjection, dateToKey } from '../utils';
import {
  AlertTriangle,
  TrendingDown,
  ArrowUp,
  ArrowDown,
  Info,
  Plus,
  Minus,
  CornerDownRight,
  X,
} from 'lucide-react';

interface SortCriterion {
  column: string;
  direction: 'asc' | 'desc';
}

interface DateColumn {
  key: string;
  label: string;
  date: Date | null;
  isAtrasados: boolean;
}

interface Props {
  data: ProductConsolidated[];
  orders: Order[];
  horizonLabel?: string;
  /** Label do horizonte da coluna Só Móveis (ex: "03/03 a 16/03") */
  soMoveisHorizonLabel?: string;
  dateColumns?: DateColumn[];
  /** Se false, a coluna "Só Móveis" não é renderizada (exclusivo da simulação) */
  considerarRequisicoes?: boolean;
  onVisibleProductsCountChange?: (count: number) => void;
  projectionSource?: ProjecaoImportada[];
  selectedRotas?: Set<string>;
  selectedSetores?: Set<string>;
}

type RouteValueField = 'pedido' | 'falta';

interface RouteValueFilterMenu {
  colKey: string;
  field: RouteValueField;
  anchorRect: DOMRect;
}

const formatCellNum = (v: unknown): string | number => {
  if (v === undefined || v === null) return '-';
  const n = Number(v);
  if (Number.isNaN(n) || n === 0) return '-';
  return Math.round(n);
};

const getTooltipInitialPosition = (anchorRect: DOMRect) => {
  const maxX = Math.max(16, window.innerWidth - 340);
  const maxY = Math.max(16, window.innerHeight - 320);
  return {
    left: Math.min(Math.max(8, anchorRect.right), maxX),
    top: Math.min(Math.max(8, anchorRect.bottom + 8), maxY),
  };
};

const ProjectionTable: React.FC<Props> = ({
  data,
  orders,
  horizonLabel,
  soMoveisHorizonLabel,
  dateColumns = [],
  considerarRequisicoes = true,
  onVisibleProductsCountChange,
  projectionSource = [],
  selectedRotas = new Set(),
  selectedSetores = new Set(),
}) => {
  const [sortCriteria, setSortCriteria] = useState<SortCriterion[]>([]);
  const [descriptionWidth, setDescriptionWidth] = useState(280);
  const [isResizing, setIsResizing] = useState(false);
  const [expandedShelves, setExpandedShelves] = useState<Set<string>>(new Set());
  const [selectedRowCodigo, setSelectedRowCodigo] = useState<string | null>(null);
  const [routeValueFilterMenu, setRouteValueFilterMenu] = useState<RouteValueFilterMenu | null>(null);
  const [routeValueFilterSearch, setRouteValueFilterSearch] = useState('');
  const [routeValueFilters, setRouteValueFilters] = useState<Record<string, Set<string>>>({});
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<{
    codigo: string;
    colKey: string;
    colLabel: string;
    breakdown: { destino: string; qty: number; numeroPedido?: string }[];
    pedido: number;
    anchorRect: DOMRect;
  } | null>(null);
  const resizeRef = useRef<number>(0);
  const didResizeRef = useRef(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const valueFilterMenuRef = useRef<HTMLDivElement>(null);
  const tooltipDragRef = useRef<{ dragging: boolean; offsetX: number; offsetY: number }>({
    dragging: false,
    offsetX: 0,
    offsetY: 0,
  });

  const toggleShelf = (codigo: string) => {
    setExpandedShelves(prev => {
      const next = new Set(prev);
      if (next.has(codigo)) next.delete(codigo);
      else next.add(codigo);
      return next;
    });
  };

  const handleSort = (columnKey: string, isCtrl: boolean) => {
    if (isResizing || didResizeRef.current) {
      didResizeRef.current = false;
      return;
    }
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

  const startResizing = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    didResizeRef.current = false;
    setIsResizing(true);
    resizeRef.current = e.pageX;
  };

  const handlePClick = (
    e: React.MouseEvent,
    item: ProductConsolidated | ComponentData,
    colKey: string,
    colLabel: string
  ) => {
    e.stopPropagation();
    const rd = item.routeData[colKey];
    if (!rd || rd.pedido === 0) return;
    const breakdown = rd.breakdown && rd.breakdown.length > 0 ? rd.breakdown : [{ destino: 'Total', qty: rd.pedido } as { destino: string; qty: number; numeroPedido?: string }];
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setTooltip({
      codigo: item.codigo,
      colKey,
      colLabel,
      breakdown,
      pedido: rd.pedido,
      anchorRect: rect,
    });
  };

  const getRouteDisplayValue = (
    item: ProductConsolidated | ComponentData,
    colKey: string,
    field: RouteValueField
  ): string => {
    const rd = item.routeData[colKey] || { pedido: 0, falta: 0 };
    const raw = field === 'pedido' ? rd.pedido : rd.falta;
    return String(formatCellNum(raw));
  };

  const getRouteFilterKey = (colKey: string, field: RouteValueField) => `${colKey}|${field}`;

  const rotasCompletas = useMemo(() => extractRotasFromProjection(projectionSource), [projectionSource]);

  const todayStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const dateKeysForSelectedRotas = useMemo(() => {
    if (selectedRotas.size === 0) return null;
    const keys = new Set<string>();
    const overdueDates = new Set<string>();
    for (const r of rotasCompletas) {
      if (!selectedRotas.has(r.routeName) || !r.previsaoDate) continue;
      const d = new Date(r.previsaoDate);
      d.setHours(0, 0, 0, 0);
      if (d <= todayStart) {
        overdueDates.add(
          d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
        );
      } else {
        keys.add(dateToKey(d));
      }
    }
    return { keys, overdueDates };
  }, [rotasCompletas, selectedRotas, todayStart]);

  const codigoToRotas = useMemo(() => {
    const map = new Map<string, Set<string>>();
    projectionSource.forEach((r) => {
      const cod = (r.cod ?? '').trim().toUpperCase();
      const rm = (r.rm ?? '').trim();
      const obs = (r.observacoes ?? '').toString().trim();
      if (!cod || !rm || !obs) return;
      const prefixMatch = obs.match(/^\d+\s*[-–]\s*(.*)$/);
      const base = (prefixMatch ? prefixMatch[1] : obs).trim();
      if (!base.toUpperCase().startsWith('ROTA')) return;
      if (!map.has(cod)) map.set(cod, new Set());
      map.get(cod)!.add(base);
    });
    return map;
  }, [projectionSource]);

  const codigoToSetores = useMemo(() => {
    const map = new Map<string, Set<string>>();
    projectionSource.forEach((r) => {
      const cod = (r.cod ?? '').trim().toUpperCase();
      const setor = (r.setorProducao ?? '').trim();
      if (!cod || !setor) return;
      if (!map.has(cod)) map.set(cod, new Set());
      map.get(cod)!.add(setor);
    });
    return map;
  }, [projectionSource]);

  const productHasRota = (codigo: string, rotas: Set<string>): boolean => {
    if (rotas.size === 0) return true;
    const prodRotas = codigoToRotas.get(codigo.trim().toUpperCase());
    if (!prodRotas) return false;
    for (const r of rotas) {
      if (prodRotas.has(r)) return true;
    }
    return false;
  };

  const productHasSetor = (codigo: string, setores: Set<string>): boolean => {
    if (setores.size === 0) return true;
    const prodSetores = codigoToSetores.get(codigo.trim().toUpperCase());
    if (!prodSetores) return false;
    for (const s of setores) {
      if (prodSetores.has(s)) return true;
    }
    return false;
  };

  const hasPedidoInSelectedRotaColumns = (item: ProductConsolidated | ComponentData): boolean => {
    if (!dateKeysForSelectedRotas) return false;
    const keys = Array.from(dateKeysForSelectedRotas.keys);
    if ((dateKeysForSelectedRotas.overdueDates?.size ?? 0) > 0) keys.unshift('ATRASADOS');
    for (const key of keys) {
      const rd = item.routeData[key];
      if ((rd?.pedido ?? 0) > 0) return true;
    }
    return false;
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (tooltip && tooltipRef.current && !tooltipRef.current.contains(e.target as Node)) {
        const target = e.target as HTMLElement;
        if (!target.closest('td[data-tooltip-cell]')) {
          setTooltip(null);
        }
      }
      if (selectedRowCodigo && tableContainerRef.current && !tableContainerRef.current.contains(e.target as Node)) {
        setSelectedRowCodigo(null);
      }
      if (routeValueFilterMenu && valueFilterMenuRef.current && !valueFilterMenuRef.current.contains(e.target as Node)) {
        const target = e.target as HTMLElement;
        if (!target.closest('th[data-route-filter-head]')) {
          setRouteValueFilterMenu(null);
        }
      }
    };
    document.addEventListener('pointerdown', handleClickOutside, true);
    return () => {
      document.removeEventListener('pointerdown', handleClickOutside, true);
    };
  }, [tooltip, selectedRowCodigo, routeValueFilterMenu]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!tooltipDragRef.current.dragging) return;
      if (!tooltipRef.current) return;
      const nextX = e.clientX - tooltipDragRef.current.offsetX;
      const nextY = e.clientY - tooltipDragRef.current.offsetY;
      const maxX = Math.max(8, window.innerWidth - 340);
      const maxY = Math.max(8, window.innerHeight - 120);
      const x = Math.min(Math.max(8, nextX), maxX);
      const y = Math.min(Math.max(8, nextY), maxY);
      tooltipRef.current.style.left = `${x}px`;
      tooltipRef.current.style.top = `${y}px`;
    };
    const handleMouseUp = () => {
      tooltipDragRef.current.dragging = false;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const delta = e.pageX - resizeRef.current;
      if (delta !== 0) didResizeRef.current = true;
      setDescriptionWidth(prev => Math.max(150, Math.min(800, prev + delta)));
      resizeRef.current = e.pageX;
    };
    const handleMouseUp = () => setIsResizing(false);
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

  useEffect(() => {
    setRouteValueFilterSearch('');
  }, [routeValueFilterMenu?.colKey, routeValueFilterMenu?.field]);

  const allColumns = [
    ...(considerarRequisicoes ? [{ key: ROUTE_SO_MOVEIS, label: 'Só Móveis', isSoMoveis: true as const }] : []),
    ...dateColumns.map(c => ({ key: c.key, label: c.label, isSoMoveis: false as const })),
  ];
  const rotaFilterActive = selectedRotas.size > 0;

  const visibleColumns = useMemo(() => {
    if (rotaFilterActive) {
      const cols: { key: string; label: string; isSoMoveis: false }[] = [];
      const overdueDates = Array.from(dateKeysForSelectedRotas?.overdueDates ?? []);
      if (overdueDates.length > 0) {
        const label =
          overdueDates.length <= 2
            ? overdueDates.join(' • ')
            : `${overdueDates[0]} +${overdueDates.length - 1}`;
        cols.push({ key: 'ATRASADOS', label, isSoMoveis: false });
      }
      const formatDateKey = (key: string) => {
        const [yy, mm, dd] = key.split('-');
        return `${dd}/${mm}/${yy.slice(-2)}`;
      };
      for (const key of dateKeysForSelectedRotas?.keys ?? []) {
        const col = dateColumns.find((c) => c.key === key);
        cols.push({ key, label: col?.label ?? formatDateKey(key), isSoMoveis: false });
      }
      return cols;
    }
    return allColumns;
  }, [rotaFilterActive, allColumns, dateKeysForSelectedRotas, dateColumns]);

  const dataFilteredByColumns = useMemo(() => {
    let result = data;
    if (selectedRotas.size > 0) {
      result = result.filter((item) => {
        if (productHasRota(item.codigo, selectedRotas) || hasPedidoInSelectedRotaColumns(item)) return true;
        if (item.isShelf && item.components?.length) {
          return item.components.some(
            (comp) => productHasRota(comp.codigo, selectedRotas) || hasPedidoInSelectedRotaColumns(comp)
          );
        }
        return false;
      });
    }
    if (selectedSetores.size > 0) {
      result = result.filter((item) => {
        if (productHasSetor(item.codigo, selectedSetores)) return true;
        if (item.isShelf && item.components?.length) {
          return item.components.some((comp) => productHasSetor(comp.codigo, selectedSetores));
        }
        return false;
      });
    }
    return result;
  }, [data, selectedRotas, selectedSetores, codigoToSetores, codigoToRotas]);

  const routeFilterUniqueValues = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const col of visibleColumns) {
      for (const field of ['pedido', 'falta'] as const) {
        const key = getRouteFilterKey(col.key, field);
        const values = new Set<string>();
        for (const item of dataFilteredByColumns) {
          values.add(getRouteDisplayValue(item, col.key, field));
          if (item.isShelf && item.components?.length) {
            for (const comp of item.components) {
              values.add(getRouteDisplayValue(comp, col.key, field));
            }
          }
        }
        const ordered = Array.from(values).sort((a, b) => {
          if (a === '-') return 1;
          if (b === '-') return -1;
          return Number(a) - Number(b);
        });
        map.set(key, ordered);
      }
    }
    return map;
  }, [visibleColumns, dataFilteredByColumns]);

  const activeRouteValueFilterKeys = useMemo(
    () => Object.keys(routeValueFilters).filter((k) => (routeValueFilters[k]?.size ?? 0) > 0),
    [routeValueFilters]
  );

  const rowMatchesRouteValueFilters = (row: ProductConsolidated | ComponentData): boolean => {
    if (activeRouteValueFilterKeys.length === 0) return true;
    for (const key of activeRouteValueFilterKeys) {
      const [colKey, fieldRaw] = key.split('|');
      const field = fieldRaw as RouteValueField;
      const allowed = routeValueFilters[key];
      if (!allowed || allowed.size === 0) continue;
      const val = getRouteDisplayValue(row, colKey, field);
      if (!allowed.has(val)) return false;
    }
    return true;
  };

  const dataFilteredByValues = useMemo(() => {
    if (activeRouteValueFilterKeys.length === 0) return dataFilteredByColumns;
    return dataFilteredByColumns.filter((item) => {
      if (rowMatchesRouteValueFilters(item)) return true;
      if (item.isShelf && item.components?.length) {
        return item.components.some((comp) => rowMatchesRouteValueFilters(comp));
      }
      return false;
    });
  }, [dataFilteredByColumns, activeRouteValueFilterKeys, routeValueFilters]);

  const autoExpandedShelves = useMemo(() => {
    const hasFilter = selectedRotas.size > 0 || selectedSetores.size > 0 || activeRouteValueFilterKeys.length > 0;
    if (!hasFilter) return new Set<string>();
    const set = new Set<string>();
    for (const item of dataFilteredByValues) {
      if (!item.isShelf || !item.components?.length) continue;
      const hasMatchingComponent = item.components.some((comp) => {
        const okRota =
          selectedRotas.size === 0 ||
          productHasRota(comp.codigo, selectedRotas) ||
          hasPedidoInSelectedRotaColumns(comp);
        const okSetor = selectedSetores.size === 0 || productHasSetor(comp.codigo, selectedSetores);
        return okRota && okSetor && rowMatchesRouteValueFilters(comp);
      });
      if (hasMatchingComponent) set.add(item.codigo);
    }
    return set;
  }, [dataFilteredByValues, selectedRotas, selectedSetores, activeRouteValueFilterKeys, routeValueFilters]);

  const sortedData = useMemo(() => {
    if (sortCriteria.length === 0) return dataFilteredByValues;
    return [...dataFilteredByValues].sort((a, b) => {
      for (const criterion of sortCriteria) {
        let valA: unknown;
        let valB: unknown;
        if (criterion.column.startsWith('route:')) {
          const parts = criterion.column.split(':');
          const routeName = parts[1];
          const field = parts[2] as 'pedido' | 'falta';
          valA = a.routeData[routeName]?.[field] || 0;
          valB = b.routeData[routeName]?.[field] || 0;
        } else {
          valA = (a as unknown as Record<string, unknown>)[criterion.column] ?? '';
          valB = (b as unknown as Record<string, unknown>)[criterion.column] ?? '';
        }
        const isAsc = criterion.direction === 'asc';
        if (typeof valA === 'string' && typeof valB === 'string') {
          const cmp = valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' });
          if (cmp !== 0) return isAsc ? cmp : -cmp;
          continue;
        }
        const numA = Number(valA);
        const numB = Number(valB);
        if (valA === valB) continue;
        if (numA < numB) return isAsc ? -1 : 1;
        if (numA > numB) return isAsc ? 1 : -1;
      }
      return 0;
    });
  }, [dataFilteredByValues, sortCriteria]);

  useEffect(() => {
    onVisibleProductsCountChange?.(sortedData.length);
  }, [sortedData.length, onVisibleProductsCountChange]);

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

  const totalColSpan = 5 + visibleColumns.length * 2;
  const activeMenuKey = routeValueFilterMenu
    ? getRouteFilterKey(routeValueFilterMenu.colKey, routeValueFilterMenu.field)
    : null;
  const activeMenuValues = activeMenuKey ? (routeFilterUniqueValues.get(activeMenuKey) ?? []) : [];
  const filteredActiveMenuValues = useMemo(() => {
    const term = routeValueFilterSearch.trim().toLowerCase();
    if (!term) return activeMenuValues;
    return activeMenuValues.filter((v) => v.toLowerCase().includes(term));
  }, [activeMenuValues, routeValueFilterSearch]);
  const activeSelectedValues = activeMenuKey ? (routeValueFilters[activeMenuKey] ?? new Set<string>()) : new Set<string>();
  const activeAllSelected = activeMenuValues.length > 0 && activeSelectedValues.size === activeMenuValues.length;

  return (
    <div className="space-y-4 h-full flex flex-col">
      <div className="bg-white dark:bg-[#252525] rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col flex-1 relative min-h-0">
        <div ref={tableContainerRef} className="overflow-auto flex-1 relative scroll-smooth max-h-[calc(100vh-215px)]">
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

                {visibleColumns.map(col => (
                  <th
                    key={col.key}
                    data-route-filter-head
                    className="px-2 py-1 text-center bg-blue-800 border-b border-white/10 border-l border-white/10 min-w-[90px] sticky top-0 z-[70]"
                    colSpan={2}
                  >
                    <div className="text-[8px] opacity-70 uppercase tracking-widest leading-none mb-0.5 font-medium">
                      {col.isSoMoveis ? (soMoveisHorizonLabel || horizonLabel || 'Horizonte') : 'Data'}
                    </div>
                    <div className="text-[10px] whitespace-normal break-words leading-tight max-w-[85px] mx-auto uppercase font-bold mb-0.5 min-h-[24px] flex items-center justify-center select-text">
                      {col.label}
                    </div>
                    <div className="flex border-t border-white/20 pt-1 text-[8px] font-bold">
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                          setRouteValueFilterMenu({ colKey: col.key, field: 'pedido', anchorRect: rect });
                        }}
                        className="flex-1 border-r border-white/20 cursor-pointer hover:bg-white/10 p-0.5 rounded transition-colors flex items-center justify-center gap-0.5"
                      >
                        P {(routeValueFilters[getRouteFilterKey(col.key, 'pedido')]?.size ?? 0) > 0 ? '●' : ''}
                      </div>
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                          setRouteValueFilterMenu({ colKey: col.key, field: 'falta', anchorRect: rect });
                        }}
                        className="flex-1 cursor-pointer hover:bg-white/10 p-0.5 rounded transition-colors flex items-center justify-center gap-0.5"
                      >
                        F {(routeValueFilters[getRouteFilterKey(col.key, 'falta')]?.size ?? 0) > 0 ? '●' : ''}
                      </div>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="text-gray-900 dark:text-gray-100">
              {sortedData.map((item, idx) => {
                const isExpanded = expandedShelves.has(item.codigo) || autoExpandedShelves.has(item.codigo);
                const filteredComponents =
                  item.isShelf && item.components
                    ? item.components.filter((comp) => {
                        const okRota =
                          selectedRotas.size === 0 ||
                          productHasRota(comp.codigo, selectedRotas) ||
                          hasPedidoInSelectedRotaColumns(comp);
                        const okSetor = selectedSetores.size === 0 || productHasSetor(comp.codigo, selectedSetores);
                        return okRota && okSetor && rowMatchesRouteValueFilters(comp);
                      })
                    : [];
                return (
                  <React.Fragment key={item.codigo}>
                    <tr
                      onClick={() => setSelectedRowCodigo((prev) => (prev === item.codigo ? null : item.codigo))}
                      className={`${idx % 2 === 0 ? 'bg-white dark:bg-[#252525]' : 'bg-gray-50/50 dark:bg-[#2a2a2a]'} hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-colors group cursor-pointer ${
                        selectedRowCodigo === item.codigo ? 'ring-1 ring-secondary/40 bg-blue-50/70 dark:bg-blue-900/20' : ''
                      }`}
                    >
                      <td className="px-3 py-1.5 font-mono font-bold text-[11px] sticky left-0 z-[40] bg-inherit border-r border-gray-100 dark:border-gray-800 shadow-[2px_0_5px_rgba(0,0,0,0.05)]">
                        <div className="flex items-center gap-2">
                          {item.isShelf && (
                            <button
                              onClick={() => toggleShelf(item.codigo)}
                              className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                            >
                              {isExpanded ? <Minus className="w-3 h-3 text-secondary" /> : <Plus className="w-3 h-3 text-secondary" />}
                            </button>
                          )}
                          {item.codigo}
                        </div>
                      </td>
                      <td
                        style={{ width: `${descriptionWidth}px`, maxWidth: `${descriptionWidth}px` }}
                        className="px-3 py-1.5 text-[11px] sticky left-[110px] z-[40] bg-inherit border-r border-gray-100 dark:border-gray-800 shadow-[2px_0_5px_rgba(0,0,0,0.05)] truncate"
                      >
                        {item.descricao}
                      </td>
                      <td className={`px-3 py-1.5 text-center font-semibold text-[11px] border-l border-gray-100 dark:border-gray-800 ${item.estoqueAtual < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-gray-100'}`}>
                        {item.isShelf ? '-' : item.estoqueAtual}
                      </td>
                      <td className="px-3 py-1.5 text-center font-medium text-[11px] text-gray-900 dark:text-gray-100">
                        {item.totalPedido === 0 ? '-' : item.totalPedido}
                      </td>
                      <td className={`px-3 py-1.5 text-center font-bold text-[11px] border-r border-gray-100 dark:border-gray-800 ${item.pendenteProducao < 0 ? 'text-highlight' : 'text-green-600 dark:text-green-400'}`}>
                        {item.isShelf ? '-' : (item.pendenteProducao < 0 ? (
                          <div className="flex items-center justify-center gap-1">
                            {item.pendenteProducao}
                            <TrendingDown className="w-2.5 h-2.5" />
                          </div>
                        ) : '-')}
                      </td>

                      {visibleColumns.map(col => {
                        const rd = item.routeData[col.key] || { pedido: 0, falta: 0 };
                        return (
                          <React.Fragment key={col.key}>
                            <td
                              data-tooltip-cell
                              onClick={(e) => handlePClick(e, item, col.key, col.label)}
                              className="px-2 py-1.5 text-center border-l border-gray-100 dark:border-gray-800 text-blue-600 dark:text-emerald-400 font-bold text-[11px] cursor-pointer hover:bg-blue-50/50 dark:hover:bg-blue-900/5 transition-colors"
                            >
                              {formatCellNum(rd.pedido)}
                            </td>
                            <td className={`px-2 py-1.5 text-center font-bold text-[11px] ${rd.falta < 0 ? 'bg-orange-50 dark:bg-orange-900/10 text-highlight' : 'text-gray-300 dark:text-gray-600'}`}>
                              {item.isShelf ? '-' : formatCellNum(rd.falta)}
                            </td>
                          </React.Fragment>
                        );
                      })}
                    </tr>

                    {item.isShelf && isExpanded && filteredComponents.map((comp) => (
                      <tr
                        key={`${item.codigo}-${comp.codigo}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedRowCodigo((prev) => (prev === item.codigo ? null : item.codigo));
                        }}
                        className={`bg-gray-100/30 dark:bg-gray-800/20 border-l-4 border-secondary animate-in slide-in-from-top-1 duration-200 ${
                          selectedRowCodigo === item.codigo ? 'ring-1 ring-secondary/40 bg-blue-50/50 dark:bg-blue-900/15' : ''
                        }`}
                      >
                        <td className="px-3 py-1 text-[10px] font-mono sticky left-0 z-[50] bg-gray-100/95 dark:bg-[#2a2a2a] border-r border-gray-100 dark:border-gray-800 shadow-[2px_0_8px_rgba(0,0,0,0.12)]">
                          <div className="flex items-center gap-2 pl-4">
                            <CornerDownRight className="w-3 h-3 text-neutral opacity-50" />
                            {comp.codigo}
                          </div>
                        </td>
                        <td
                          style={{ width: `${descriptionWidth}px`, maxWidth: `${descriptionWidth}px` }}
                          className="px-3 py-1 text-[10px] sticky left-[110px] z-[50] bg-gray-100/95 dark:bg-[#2a2a2a] border-r border-gray-100 dark:border-gray-800 shadow-[2px_0_8px_rgba(0,0,0,0.12)] truncate italic text-neutral"
                        >
                          {comp.descricao}
                        </td>
                        <td className="px-3 py-1 text-center font-medium text-[10px] text-gray-600 dark:text-gray-400 border-l border-gray-100 dark:border-gray-800">
                          {comp.estoqueAtual}
                        </td>
                        <td className="px-3 py-1 text-center font-medium text-[10px] text-gray-600 dark:text-gray-400">
                          {comp.totalPedido === 0 ? '-' : comp.totalPedido}
                        </td>
                        <td className={`px-3 py-1 text-center font-bold text-[10px] border-r border-gray-100 dark:border-gray-800 ${comp.falta < 0 ? 'text-highlight' : 'text-green-600'}`}>
                          {formatCellNum(comp.falta)}
                        </td>

                        {visibleColumns.map(col => {
                          const cRd = comp.routeData[col.key] || { pedido: 0, falta: 0 };
                          return (
                            <React.Fragment key={col.key}>
                              <td
                                data-tooltip-cell
                                onClick={(e) => handlePClick(e, comp, col.key, col.label)}
                                className="px-2 py-1 text-center border-l border-gray-100 dark:border-gray-800 text-blue-600/70 font-bold text-[10px] cursor-pointer hover:bg-blue-50/50 dark:hover:bg-blue-900/5 transition-colors"
                              >
                                {formatCellNum(cRd.pedido)}
                              </td>
                              <td className={`px-2 py-1 text-center font-bold text-[10px] ${cRd.falta < 0 ? 'text-highlight/70' : 'text-gray-300'}`}>
                                {formatCellNum(cRd.falta)}
                              </td>
                            </React.Fragment>
                          );
                        })}
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })}
              {sortedData.length === 0 && (
                <tr>
                  <td colSpan={totalColSpan} className="px-4 py-16 text-center text-neutral">
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

      {routeValueFilterMenu && (
        <div
          ref={valueFilterMenuRef}
          className="fixed z-[110] bg-white dark:bg-[#252525] rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden w-[280px]"
          style={getTooltipInitialPosition(routeValueFilterMenu.anchorRect)}
        >
          <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#1f2933]">
            <p className="text-[11px] font-bold uppercase tracking-wider text-neutral">
              Filtro {routeValueFilterMenu.field === 'pedido' ? 'P' : 'F'} ({routeValueFilterMenu.colKey})
            </p>
          </div>
          <div className="p-3 space-y-2">
            <input
              type="text"
              placeholder="Buscar valor..."
              className="w-full px-2 py-1.5 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-[#1f1f1f]"
              value={routeValueFilterSearch}
              onChange={(e) => setRouteValueFilterSearch(e.target.value)}
            />
            <div className="flex items-center justify-between">
              <button
                type="button"
                className="text-[10px] font-bold text-secondary hover:underline"
                onClick={() => {
                  if (!activeMenuKey) return;
                  setRouteValueFilters((prev) => {
                    const next = { ...prev };
                    if (activeAllSelected) {
                      delete next[activeMenuKey];
                    } else {
                      next[activeMenuKey] = new Set(activeMenuValues);
                    }
                    return next;
                  });
                }}
              >
                {activeAllSelected ? 'Desmarcar todos' : 'Selecionar todos'}
              </button>
              <button
                type="button"
                className="text-[10px] font-bold text-neutral hover:underline"
                onClick={() => {
                  if (!activeMenuKey) return;
                  setRouteValueFilters((prev) => {
                    const next = { ...prev };
                    delete next[activeMenuKey];
                    return next;
                  });
                }}
              >
                Limpar
              </button>
            </div>
            <div className="max-h-56 overflow-auto space-y-1 border border-gray-200 dark:border-gray-700 rounded p-1">
              {filteredActiveMenuValues.map((value) => (
                <label
                  key={value}
                  className="flex items-center gap-2 text-xs px-1 py-1 rounded hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={activeSelectedValues.has(value)}
                    onChange={(e) => {
                      if (!activeMenuKey) return;
                      setRouteValueFilters((prev) => {
                        const next = { ...prev };
                        const set = new Set(next[activeMenuKey] ?? []);
                        if (e.target.checked) set.add(value);
                        else set.delete(value);
                        if (set.size === 0) delete next[activeMenuKey];
                        else next[activeMenuKey] = set;
                        return next;
                      });
                    }}
                  />
                  <span>{value}</span>
                </label>
              ))}
              {filteredActiveMenuValues.length === 0 && (
                <p className="text-[11px] text-neutral px-1 py-2">Sem valores para filtrar.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {tooltip && (
        <div
          ref={tooltipRef}
          className="fixed z-[100] bg-white dark:bg-[#252525] rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden min-w-[220px] max-w-[320px]"
          style={getTooltipInitialPosition(tooltip.anchorRect)}
        >
          <div
            onMouseDown={(e) => {
              if (!tooltipRef.current) return;
              const rect = tooltipRef.current.getBoundingClientRect();
              tooltipDragRef.current = {
                dragging: true,
                offsetX: e.clientX - rect.left,
                offsetY: e.clientY - rect.top,
              };
              document.body.style.userSelect = 'none';
              document.body.style.cursor = 'move';
            }}
            className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between bg-gray-50 dark:bg-[#1f2933] cursor-move"
            title="Arraste para mover"
          >
            <div className="flex flex-col">
              <span className="text-[11px] font-bold text-neutral uppercase tracking-widest">{tooltip.codigo}</span>
              <span className="text-[10px] text-gray-600 dark:text-gray-400">{tooltip.colLabel}</span>
            </div>
            <button
              onClick={() => setTooltip(null)}
              className="p-1.5 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="px-4 py-3">
            <p className="text-[10px] text-neutral mb-2">Quantidade pedida: <strong>{tooltip.pedido}</strong></p>
            <p className="text-[9px] uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">Destinos:</p>
            <ul className="space-y-2 max-h-56 overflow-auto pr-1">
              {tooltip.breakdown.map((b, i) => (
                <li key={i} className="text-[11px]">
                  <div className="flex justify-between gap-4 items-baseline">
                    <span className="text-gray-800 dark:text-gray-100">{b.destino}</span>
                    <span className="font-bold text-gray-800 dark:text-gray-100">{b.qty}</span>
                  </div>
                  {b.numeroPedido && (
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 pl-0">Pedido: {b.numeroPedido}</p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-[#252525] p-2 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center gap-3 text-[10px] text-neutral italic shrink-0">
        <Info className="w-3.5 h-3.5 text-secondary" />
        <span>
          <strong>Dica Operacional:</strong>{' '}
          {considerarRequisicoes ? (
            <>A coluna <strong>Só Móveis</strong> é prioridade fixa nº 1. As demais colunas são por data de saída (<strong>previsao_atual</strong>).</>
          ) : (
            <>Colunas por data de saída (<strong>previsao_atual</strong>). Requisições não consideradas.</>
          )}{' '}
          Clique em <strong>P</strong> para ver o detalhamento por destino.
        </span>
      </div>
    </div>
  );
};

export default React.memo(ProjectionTable);
