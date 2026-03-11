import React, { useState, useMemo, useRef, useEffect } from 'react';
import { ProductConsolidated, Order, ComponentData, ProjecaoImportada } from '../types';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  ROUTE_SO_MOVEIS,
  CATEGORY_ENTREGA_GT,
  CATEGORY_RETIRADA,
  CATEGORY_REQUISICAO,
  extractRotasFromProjection,
  dateToKey,
  normalizeText,
  getCategoriaFromObservacoes,
} from '../utils';
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
  Download,
  Filter,
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
  selectedCategorias?: Set<string>;
}

type RouteValueField = 'pedido' | 'falta';

interface RouteValueFilterMenu {
  colKey: string;
  field: RouteValueField;
  anchorRect: DOMRect;
}

interface FlatRow {
  key: string;
  kind: 'item' | 'component';
  parentCodigo?: string;
  isShelf?: boolean;
  isExpanded?: boolean;
  codigo: string;
  descricao: string;
  estoqueAtual: number | string;
  totalPedido: number;
  falta: number | string;
  routeData: Record<string, { pedido: number; falta: number; breakdown?: { destino: string; qty: number; numeroPedido?: string }[] }>;
  rowBgClass: string;
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

const escapeHtml = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const CODE_COL_W = 110;
const STOCK_COL_W = 96;
const PEDIDO_COL_W = 96;
const FALTA_COL_W = 96;
const DESTINO_CATEGORIAS_ESPECIAIS = new Set<string>([
  normalizeText(CATEGORY_REQUISICAO),
  normalizeText(CATEGORY_ENTREGA_GT),
  normalizeText(CATEGORY_RETIRADA),
]);

const normalizeCategoria = (value: string): string => {
  const categoria = getCategoriaFromObservacoes(value) || value;
  return normalizeText(categoria);
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
  selectedCategorias = new Set(),
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
    type: 'P' | 'F';
    breakdown: { destino: string; qty: number; numeroPedido?: string }[];
    valor: number;
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
    colLabel: string,
    highlightCodigo: string
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
      type: 'P',
      breakdown,
      valor: rd.pedido,
      anchorRect: rect,
    });
    setSelectedRowCodigo(highlightCodigo);
  };

  const handleFClick = (
    e: React.MouseEvent,
    item: ProductConsolidated | ComponentData,
    colKey: string,
    colLabel: string,
    highlightCodigo: string
  ) => {
    e.stopPropagation();
    const rd = item.routeData[colKey];
    const falta = rd?.falta ?? 0;
    if (!rd || falta >= 0) return;
    const breakdown = (rd.breakdownFalta && rd.breakdownFalta.length > 0)
      ? rd.breakdownFalta
      : [{ destino: 'Total', qty: Math.abs(falta) } as { destino: string; qty: number; numeroPedido?: string }];
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setTooltip({
      codigo: item.codigo,
      colKey,
      colLabel,
      type: 'F',
      breakdown,
      valor: Math.abs(falta),
      anchorRect: rect,
    });
    setSelectedRowCodigo(highlightCodigo);
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

  const codigoToCategorias = useMemo(() => {
    const map = new Map<string, Set<string>>();
    projectionSource.forEach((r) => {
      const cod = (r.cod ?? '').trim().toUpperCase();
      const categoria = (r.tipoF ?? '').trim();
      if (!cod || !categoria) return;
      if (!map.has(cod)) map.set(cod, new Set());
      map.get(cod)!.add(categoria);
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

  const selectedRotasNorm = useMemo(() => {
    const set = new Set<string>();
    selectedRotas.forEach((r) => set.add(normalizeText(r)));
    return set;
  }, [selectedRotas]);

  const productHasSelectedRotaInBreakdown = (item: ProductConsolidated | ComponentData): boolean => {
    if (selectedRotasNorm.size === 0) return true;
    for (const rd of Object.values(item.routeData ?? {})) {
      const breakdown = rd?.breakdown ?? [];
      for (const b of breakdown) {
        const destinoNorm = normalizeText(b?.destino ?? '');
        if (destinoNorm && selectedRotasNorm.has(destinoNorm)) return true;
      }
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

  const productHasCategoria = (codigo: string, categorias: Set<string>): boolean => {
    if (categorias.size === 0) return true;
    const prodCategorias = codigoToCategorias.get(codigo.trim().toUpperCase());
    if (!prodCategorias) return false;
    for (const c of categorias) {
      if (prodCategorias.has(c)) return true;
    }
    return false;
  };

  const rowHasSelectedCategoriaInRouteData = (
    row: ProductConsolidated | ComponentData,
    selectedDestinoNorm: Set<string>
  ): boolean => {
    if (selectedDestinoNorm.size === 0) return false;
    for (const [colKey, rd] of Object.entries(row.routeData ?? {})) {
      if (!rd || (rd.pedido ?? 0) <= 0) continue;
      if (colKey === ROUTE_SO_MOVEIS && selectedDestinoNorm.has(normalizeText(CATEGORY_REQUISICAO))) return true;
      const breakdown = rd.breakdown ?? [];
      if (breakdown.some((b) => selectedDestinoNorm.has(normalizeCategoria(b.destino ?? '')))) return true;
    }
    return false;
  };

  const selectedDestinoCategoriasNorm = useMemo(() => {
    const set = new Set<string>();
    selectedCategorias.forEach((categoria) => {
      const norm = normalizeCategoria(categoria);
      if (DESTINO_CATEGORIAS_ESPECIAIS.has(norm)) set.add(norm);
    });
    return set;
  }, [selectedCategorias]);

  const dateKeysForSelectedCategorias = useMemo(() => {
    if (selectedDestinoCategoriasNorm.size === 0) return null;
    const keys = new Set<string>();

    const collectFromRouteData = (
      routeData: Record<string, { pedido: number; falta: number; breakdown?: { destino: string; qty: number; numeroPedido?: string }[] }>
    ) => {
      for (const [colKey, rd] of Object.entries(routeData ?? {})) {
        if (!rd || (rd.pedido ?? 0) <= 0) continue;

        if (colKey === ROUTE_SO_MOVEIS) {
          if (selectedDestinoCategoriasNorm.has(normalizeText(CATEGORY_REQUISICAO))) {
            keys.add(colKey);
          }
          continue;
        }

        const breakdown = rd.breakdown ?? [];
        if (breakdown.length === 0) continue;
        const matchesCategoria = breakdown.some((b) => selectedDestinoCategoriasNorm.has(normalizeCategoria(b.destino ?? '')));
        if (matchesCategoria) keys.add(colKey);
      }
    };

    for (const item of data) {
      const itemMatchesCategoria =
        productHasCategoria(item.codigo, selectedCategorias) ||
        (item.isShelf && item.components?.some((comp) => productHasCategoria(comp.codigo, selectedCategorias)));
      if (!itemMatchesCategoria) continue;
      collectFromRouteData(item.routeData);
      if (item.isShelf && item.components?.length) {
        for (const comp of item.components) collectFromRouteData(comp.routeData);
      }
    }

    return keys;
  }, [data, selectedCategorias, selectedDestinoCategoriasNorm, productHasCategoria]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (tooltip && tooltipRef.current && !tooltipRef.current.contains(e.target as Node)) {
        const target = e.target as HTMLElement;
        if (!target.closest('td[data-tooltip-cell]')) {
          setTooltip(null);
          setSelectedRowCodigo(null);
        }
      }
      if (!tooltip && selectedRowCodigo && tableContainerRef.current && !tableContainerRef.current.contains(e.target as Node)) {
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

  const rotaScopedColumns = useMemo(() => {
    if (!rotaFilterActive) return null;
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
  }, [rotaFilterActive, dateKeysForSelectedRotas, dateColumns]);

  const visibleColumns = useMemo(() => {
    const baseColumns = rotaScopedColumns ?? allColumns;

    // Filtro de colunas por categoria só é aplicado para categorias de destino (Requisição, GT, Retirada).
    if (!dateKeysForSelectedCategorias || dateKeysForSelectedCategorias.size === 0) return baseColumns;

    const filtered = baseColumns.filter((c) => dateKeysForSelectedCategorias.has(c.key));

    // Fallback seguro para não ocultar dados por inconsistência entre tipoF x destino consolidado.
    return filtered.length > 0 ? filtered : baseColumns;
  }, [rotaScopedColumns, allColumns, dateKeysForSelectedCategorias]);

  const dataFilteredByColumns = useMemo(() => {
    let result = data;
    if (selectedRotas.size > 0) {
      result = result.filter((item) => {
        if (productHasRota(item.codigo, selectedRotas) || productHasSelectedRotaInBreakdown(item)) return true;
        if (item.isShelf && item.components?.length) {
          return item.components.some(
            (comp) => productHasRota(comp.codigo, selectedRotas) || productHasSelectedRotaInBreakdown(comp)
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
    if (selectedCategorias.size > 0) {
      result = result.filter((item) => {
        if (productHasCategoria(item.codigo, selectedCategorias)) return true;
        if (rowHasSelectedCategoriaInRouteData(item, selectedDestinoCategoriasNorm)) return true;
        if (item.isShelf && item.components?.length) {
          return item.components.some(
            (comp) =>
              productHasCategoria(comp.codigo, selectedCategorias) ||
              rowHasSelectedCategoriaInRouteData(comp, selectedDestinoCategoriasNorm)
          );
        }
        return false;
      });
    }
    return result;
  }, [
    data,
    selectedRotas,
    selectedSetores,
    selectedCategorias,
    selectedDestinoCategoriasNorm,
    codigoToSetores,
    codigoToRotas,
    codigoToCategorias,
  ]);

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
    const hasFilter =
      selectedRotas.size > 0 ||
      selectedSetores.size > 0 ||
      selectedCategorias.size > 0 ||
      activeRouteValueFilterKeys.length > 0;
    if (!hasFilter) return new Set<string>();
    const set = new Set<string>();
    for (const item of dataFilteredByValues) {
      if (!item.isShelf || !item.components?.length) continue;
      const parentMatchesCategoria = selectedCategorias.size === 0 || productHasCategoria(item.codigo, selectedCategorias);
      const hasMatchingComponent = item.components.some((comp) => {
        const okRota =
          selectedRotas.size === 0 ||
          productHasRota(comp.codigo, selectedRotas) ||
          productHasSelectedRotaInBreakdown(comp);
        const okSetor = selectedSetores.size === 0 || productHasSetor(comp.codigo, selectedSetores);
        const okCategoria =
          selectedCategorias.size === 0 ||
          parentMatchesCategoria ||
          productHasCategoria(comp.codigo, selectedCategorias);
        return okRota && okSetor && okCategoria && rowMatchesRouteValueFilters(comp);
      });
      if (hasMatchingComponent) set.add(item.codigo);
    }
    return set;
  }, [dataFilteredByValues, selectedRotas, selectedSetores, selectedCategorias, activeRouteValueFilterKeys, routeValueFilters]);

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

  const filteredComponentsByParent = useMemo(() => {
    const map = new Map<string, ComponentData[]>();
    for (const item of sortedData) {
      if (!item.isShelf || !item.components?.length) continue;
      const parentMatchesCategoria = selectedCategorias.size === 0 || productHasCategoria(item.codigo, selectedCategorias);
      const filtered = item.components.filter((comp) => {
        const okRota =
          selectedRotas.size === 0 ||
          productHasRota(comp.codigo, selectedRotas) ||
          productHasSelectedRotaInBreakdown(comp);
        const okSetor = selectedSetores.size === 0 || productHasSetor(comp.codigo, selectedSetores);
        const okCategoria =
          selectedCategorias.size === 0 ||
          parentMatchesCategoria ||
          productHasCategoria(comp.codigo, selectedCategorias);
        return okRota && okSetor && okCategoria && rowMatchesRouteValueFilters(comp);
      });
      map.set(item.codigo, filtered);
    }
    return map;
  }, [sortedData, selectedRotas, selectedSetores, selectedCategorias, activeRouteValueFilterKeys, routeValueFilters, dateKeysForSelectedRotas]);

  const flatRows = useMemo<FlatRow[]>(() => {
    const rows: FlatRow[] = [];
    let rowIndex = 0;
    for (const item of sortedData) {
      const isExpanded = expandedShelves.has(item.codigo) || autoExpandedShelves.has(item.codigo);
      const rowBgClass = rowIndex % 2 === 0 ? 'bg-white dark:bg-[#252525]' : 'bg-gray-50/50 dark:bg-[#2a2a2a]';
      rows.push({
        key: item.codigo,
        kind: 'item',
        isShelf: !!item.isShelf,
        isExpanded,
        codigo: item.codigo,
        descricao: item.descricao,
        estoqueAtual: item.isShelf ? '-' : item.estoqueAtual,
        totalPedido: item.totalPedido,
        falta: item.isShelf ? '-' : item.pendenteProducao,
        routeData: item.routeData,
        rowBgClass,
      });
      rowIndex += 1;
      if (isExpanded) {
        const comps = filteredComponentsByParent.get(item.codigo) ?? [];
        for (const comp of comps) {
          const compBg = rowIndex % 2 === 0 ? 'bg-gray-100/30 dark:bg-gray-800/20' : 'bg-gray-100/30 dark:bg-gray-800/20';
          rows.push({
            key: `${item.codigo}-${comp.codigo}`,
            kind: 'component',
            parentCodigo: item.codigo,
            codigo: comp.codigo,
            descricao: comp.descricao,
            estoqueAtual: comp.estoqueAtual,
            totalPedido: comp.totalPedido,
            falta: comp.falta,
            routeData: comp.routeData,
            rowBgClass: compBg,
          });
          rowIndex += 1;
        }
      }
    }
    return rows;
  }, [sortedData, expandedShelves, autoExpandedShelves, filteredComponentsByParent]);

  const rowVirtualizer = useVirtualizer({
    count: flatRows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: (idx) => (flatRows[idx]?.kind === 'component' ? 28 : 34),
    overscan: 10,
  });

  const columnVirtualizer = useVirtualizer({
    count: visibleColumns.length,
    horizontal: true,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 96,
    overscan: 6,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const virtualColumns = columnVirtualizer.getVirtualItems();
  const topRowPadding = virtualRows.length > 0 ? virtualRows[0].start : 0;
  const bottomRowPadding =
    virtualRows.length > 0 ? rowVirtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end : 0;
  const leftColPadding = virtualColumns.length > 0 ? virtualColumns[0].start : 0;
  const rightColPadding =
    virtualColumns.length > 0
      ? columnVirtualizer.getTotalSize() - virtualColumns[virtualColumns.length - 1].end
      : 0;

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
  const activeMenuValues = useMemo(() => {
    if (!routeValueFilterMenu || !activeMenuKey) return [];
    const values = new Set<string>();
    const { colKey, field } = routeValueFilterMenu;
    for (const item of dataFilteredByColumns) {
      values.add(getRouteDisplayValue(item, colKey, field));
      if (item.isShelf && item.components?.length) {
        for (const comp of item.components) {
          values.add(getRouteDisplayValue(comp, colKey, field));
        }
      }
    }
    return Array.from(values).sort((a, b) => {
      if (a === '-') return 1;
      if (b === '-') return -1;
      return Number(a) - Number(b);
    });
  }, [routeValueFilterMenu, activeMenuKey, dataFilteredByColumns]);
  const filteredActiveMenuValues = useMemo(() => {
    const term = routeValueFilterSearch.trim().toLowerCase();
    if (!term) return activeMenuValues;
    return activeMenuValues.filter((v) => v.toLowerCase().includes(term));
  }, [activeMenuValues, routeValueFilterSearch]);
  const activeSelectedValues = activeMenuKey ? (routeValueFilters[activeMenuKey] ?? new Set<string>()) : new Set<string>();
  const activeAllSelected = activeMenuValues.length > 0 && activeSelectedValues.size === activeMenuValues.length;

  const exportProjectionExcel = () => {
    const colGroup = [
      `<col style="width:140px">`,
      `<col style="width:520px">`,
      `<col style="width:100px">`,
      `<col style="width:100px">`,
      `<col style="width:100px">`,
      ...visibleColumns.flatMap(() => [`<col style="width:68px">`, `<col style="width:68px">`]),
    ].join('');

    const topHeader = [
      `<th style="background:#041E42;border:1px solid #203f77;padding:12px 12px;height:34px;"></th>`,
      `<th style="background:#041E42;border:1px solid #203f77;padding:12px 12px;height:34px;"></th>`,
      `<th style="background:#062c61;border:1px solid #203f77;padding:12px 12px;height:34px;"></th>`,
      `<th style="background:#062c61;border:1px solid #203f77;padding:12px 12px;height:34px;"></th>`,
      `<th style="background:#062c61;border:1px solid #203f77;padding:12px 12px;height:34px;"></th>`,
      ...visibleColumns.map(
        (col) =>
          `<th colspan="2" style="background:#1E22AA;color:#fff;border:1px solid #203f77;padding:10px 10px;height:34px;text-align:center;">${escapeHtml(
            col.label
          )}</th>`
      ),
    ].join('');

    const secondHeader = [
      `<th style="background:#041E42;color:#fff;border:1px solid #203f77;padding:10px 10px;height:32px;text-align:center;">CÓDIGO</th>`,
      `<th style="background:#041E42;color:#fff;border:1px solid #203f77;padding:10px 10px;height:32px;text-align:center;">DESCRIÇÃO</th>`,
      `<th style="background:#062c61;color:#fff;border:1px solid #203f77;padding:10px 10px;height:32px;text-align:center;">ESTOQUE</th>`,
      `<th style="background:#062c61;color:#fff;border:1px solid #203f77;padding:10px 10px;height:32px;text-align:center;">PEDIDO</th>`,
      `<th style="background:#062c61;color:#fff;border:1px solid #203f77;padding:10px 10px;height:32px;text-align:center;">FALTA</th>`,
      ...visibleColumns.flatMap(() => [
        `<th style="background:#1d6f2f;color:#fff;border:1px solid #203f77;padding:8px 8px;height:32px;">P</th>`,
        `<th style="background:#9b0f0f;color:#fff;border:1px solid #203f77;padding:8px 8px;height:32px;">F</th>`,
      ]),
    ].join('');

    const bodyRows = sortedData
      .map((item, idx) => {
        const rowBg = idx % 2 === 0 ? '#ffffff' : '#f6f8fc';
        const baseCells = [
          `<td style="border:1px solid #d8e0ef;padding:6px 8px;background:${rowBg};font-weight:700;text-align:center;vertical-align:middle;">${escapeHtml(item.codigo)}</td>`,
          `<td style="border:1px solid #d8e0ef;padding:6px 8px;background:${rowBg};text-align:center;vertical-align:middle;">${escapeHtml(item.descricao)}</td>`,
          `<td style="border:1px solid #d8e0ef;padding:4px 8px;background:${rowBg};text-align:center;">${escapeHtml(
            item.isShelf ? '-' : item.estoqueAtual
          )}</td>`,
          `<td style="border:1px solid #d8e0ef;padding:4px 8px;background:${rowBg};text-align:center;">${escapeHtml(
            item.totalPedido === 0 ? '-' : item.totalPedido
          )}</td>`,
          `<td style="border:1px solid #d8e0ef;padding:4px 8px;background:${rowBg};text-align:center;">${escapeHtml(
            item.isShelf ? '-' : formatCellNum(item.pendenteProducao)
          )}</td>`,
        ];

        const routeCells = visibleColumns.flatMap((col) => {
          const rd = item.routeData[col.key] || { pedido: 0, falta: 0 };
          return [
            `<td style="border:1px solid #d8e0ef;padding:4px 8px;background:${rowBg};text-align:center;color:#0a58ca;font-weight:700;">${escapeHtml(
              formatCellNum(rd.pedido)
            )}</td>`,
            `<td style="border:1px solid #d8e0ef;padding:4px 8px;background:${rowBg};text-align:center;color:${
              rd.falta < 0 ? '#b06a00' : '#8d99ae'
            };font-weight:700;">${escapeHtml(item.isShelf ? '-' : formatCellNum(rd.falta))}</td>`,
          ];
        });

        return `<tr>${[...baseCells, ...routeCells].join('')}</tr>`;
      })
      .join('');

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8" />
<!--[if gte mso 9]><xml>
<x:ExcelWorkbook xmlns:x="urn:schemas-microsoft-com:office:excel">
<x:ExcelWorksheets>
<x:ExcelWorksheet>
<x:Name>Projeção</x:Name>
<x:WorksheetOptions>
<x:FreezePanes/>
<x:FrozenNoSplit/>
<x:SplitHorizontal>2</x:SplitHorizontal>
<x:TopRowBottomPane>2</x:TopRowBottomPane>
<x:SplitVertical>5</x:SplitVertical>
<x:LeftColumnRightPane>5</x:LeftColumnRightPane>
<x:ActivePane>0</x:ActivePane>
</x:WorksheetOptions>
</x:ExcelWorksheet>
</x:ExcelWorksheets>
</x:ExcelWorkbook>
</xml><![endif]-->
</head><body><table style="border-collapse:collapse;table-layout:fixed;"><colgroup>${colGroup}</colgroup><tr>${topHeader}</tr><tr>${secondHeader}</tr>${bodyRows}</table></body></html>`;
    const blob = new Blob([`\ufeff${html}`], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `projecao_estoque_${new Date().toISOString().slice(0, 10)}.xls`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4 h-full flex flex-col">
      <div className="bg-white dark:bg-[#252525] rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col flex-1 relative min-h-0">
        <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 flex justify-end">
          <button
            type="button"
            onClick={exportProjectionExcel}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Exportar Excel
          </button>
        </div>
        <div ref={tableContainerRef} className="overflow-auto flex-1 relative scroll-smooth max-h-[calc(100vh-215px)]">
          <table className="w-full text-left text-sm border-separate border-spacing-0 min-w-max">
            <thead className="sticky top-0 z-[70]">
              <tr className="bg-primary text-white">
                <th
                  onClick={(e) => handleSort('codigo', e.ctrlKey)}
                  className="px-3 py-2 sticky left-0 top-0 z-[80] bg-primary border-b border-white/10 w-[110px] shadow-[2px_0_5px_rgba(0,0,0,0.2)] cursor-pointer group hover:bg-[#0b2b58] transition-colors"
                  style={{ width: `${CODE_COL_W}px`, minWidth: `${CODE_COL_W}px` }}
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
                  className="px-3 py-2 text-center bg-[#062c61] border-b border-white/10 border-l border-white/10 sticky top-0 z-[78] cursor-pointer hover:bg-[#083a80] transition-colors"
                  style={{ left: `${CODE_COL_W + descriptionWidth}px`, width: `${STOCK_COL_W}px`, minWidth: `${STOCK_COL_W}px` }}
                >
                  <div className="flex items-center justify-center text-[11px] uppercase tracking-wider font-bold">
                    <span>Estoque</span>
                    {renderSortIndicator('estoqueAtual')}
                  </div>
                </th>
                <th
                  onClick={(e) => handleSort('totalPedido', e.ctrlKey)}
                  className="px-3 py-2 text-center bg-[#062c61] border-b border-white/10 sticky top-0 z-[78] cursor-pointer hover:bg-[#083a80] transition-colors"
                  style={{ left: `${CODE_COL_W + descriptionWidth + STOCK_COL_W}px`, width: `${PEDIDO_COL_W}px`, minWidth: `${PEDIDO_COL_W}px` }}
                >
                  <div className="flex items-center justify-center text-[11px] uppercase tracking-wider font-bold">
                    <span>Pedido</span>
                    {renderSortIndicator('totalPedido')}
                  </div>
                </th>
                <th
                  onClick={(e) => handleSort('pendenteProducao', e.ctrlKey)}
                  className="px-3 py-2 text-center bg-[#062c61] border-b border-white/10 border-r border-white/10 sticky top-0 z-[78] cursor-pointer hover:bg-[#083a80] transition-colors"
                  style={{ left: `${CODE_COL_W + descriptionWidth + STOCK_COL_W + PEDIDO_COL_W}px`, width: `${FALTA_COL_W}px`, minWidth: `${FALTA_COL_W}px` }}
                >
                  <div className="flex items-center justify-center text-[11px] uppercase tracking-wider font-bold">
                    <span>Falta</span>
                    {renderSortIndicator('pendenteProducao')}
                  </div>
                </th>

                {leftColPadding > 0 && <th colSpan={2} style={{ width: `${leftColPadding}px`, minWidth: `${leftColPadding}px` }} />}
                {virtualColumns.map((vCol) => {
                  const col = visibleColumns[vCol.index];
                  return (
                  <th
                    key={col.key}
                    data-route-filter-head
                    className="px-2 py-1 text-center bg-blue-800 border-b border-white/10 border-l border-white/10 sticky top-0 z-[70]"
                    style={{ width: `${vCol.size}px`, minWidth: `${vCol.size}px` }}
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
                          setRouteValueFilterMenu((prev) => {
                            if (prev?.colKey === col.key && prev.field === 'pedido') return null;
                            return { colKey: col.key, field: 'pedido', anchorRect: rect };
                          });
                        }}
                        className="flex-1 border-r border-white/20 cursor-pointer hover:bg-white/10 p-0.5 rounded transition-colors flex items-center justify-center gap-0.5"
                      >
                        <Filter className="w-2.5 h-2.5 opacity-80" />
                        P {(routeValueFilters[getRouteFilterKey(col.key, 'pedido')]?.size ?? 0) > 0 ? '●' : ''}
                      </div>
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                          setRouteValueFilterMenu((prev) => {
                            if (prev?.colKey === col.key && prev.field === 'falta') return null;
                            return { colKey: col.key, field: 'falta', anchorRect: rect };
                          });
                        }}
                        className="flex-1 cursor-pointer hover:bg-white/10 p-0.5 rounded transition-colors flex items-center justify-center gap-0.5"
                      >
                        <Filter className="w-2.5 h-2.5 opacity-80" />
                        F {(routeValueFilters[getRouteFilterKey(col.key, 'falta')]?.size ?? 0) > 0 ? '●' : ''}
                      </div>
                    </div>
                  </th>
                );})}
                {rightColPadding > 0 && <th colSpan={2} style={{ width: `${rightColPadding}px`, minWidth: `${rightColPadding}px` }} />}
              </tr>
            </thead>
            <tbody className="text-gray-900 dark:text-gray-100">
              {topRowPadding > 0 && (
                <tr>
                  <td colSpan={totalColSpan} style={{ height: `${topRowPadding}px`, padding: 0, border: 0 }} />
                </tr>
              )}
              {virtualRows.map((vRow) => {
                const row = flatRows[vRow.index];
                const isSelected = selectedRowCodigo === row.key || selectedRowCodigo === row.parentCodigo;
                const isItem = row.kind === 'item';
                return (
                  <tr
                    key={row.key}
                    data-index={vRow.index}
                    ref={rowVirtualizer.measureElement}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (tooltip) return;
                      if (isItem) setSelectedRowCodigo((prev) => (prev === row.key ? null : row.key));
                      else if (row.parentCodigo) {
                        const parentCodigo = row.parentCodigo;
                        setSelectedRowCodigo((prev) => (prev === parentCodigo ? null : parentCodigo));
                      }
                    }}
                    className={`${row.rowBgClass} hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-colors group cursor-pointer ${
                      isSelected ? 'ring-1 ring-secondary/40 bg-blue-50/70 dark:bg-blue-900/20' : ''
                    } ${row.kind === 'component' ? 'border-l-4 border-secondary' : ''}`}
                  >
                    <td className="px-3 py-1.5 font-mono font-bold text-[11px] sticky left-0 z-[40] bg-inherit border-r border-gray-100 dark:border-gray-800 shadow-[2px_0_5px_rgba(0,0,0,0.05)]">
                      <div className={`flex items-center gap-2 ${row.kind === 'component' ? 'pl-4' : ''}`}>
                        {isItem && row.isShelf && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleShelf(row.key);
                            }}
                            className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                          >
                            {row.isExpanded ? <Minus className="w-3 h-3 text-secondary" /> : <Plus className="w-3 h-3 text-secondary" />}
                          </button>
                        )}
                        {row.kind === 'component' && <CornerDownRight className="w-3 h-3 text-neutral opacity-50" />}
                        {row.codigo}
                      </div>
                    </td>
                    <td
                      style={{ width: `${descriptionWidth}px`, maxWidth: `${descriptionWidth}px` }}
                      className={`px-3 py-1.5 sticky left-[110px] z-[40] bg-inherit border-r border-gray-100 dark:border-gray-800 shadow-[2px_0_5px_rgba(0,0,0,0.05)] truncate ${
                        row.kind === 'component' ? 'text-[10px] italic text-neutral' : 'text-[11px]'
                      }`}
                    >
                      {row.descricao}
                    </td>
                    <td
                      className={`px-3 py-1.5 text-center font-semibold text-[11px] border-l border-gray-100 dark:border-gray-800 ${
                        Number(row.estoqueAtual) < 0 ? 'text-[#B06A66]' : ''
                      }`}
                      style={{ position: 'sticky', left: `${CODE_COL_W + descriptionWidth}px`, zIndex: 38, background: 'inherit', width: `${STOCK_COL_W}px`, minWidth: `${STOCK_COL_W}px` }}
                    >
                      {row.estoqueAtual}
                    </td>
                    <td
                      className="px-3 py-1.5 text-center font-medium text-[11px]"
                      style={{ position: 'sticky', left: `${CODE_COL_W + descriptionWidth + STOCK_COL_W}px`, zIndex: 38, background: 'inherit', width: `${PEDIDO_COL_W}px`, minWidth: `${PEDIDO_COL_W}px` }}
                    >
                      {row.totalPedido === 0 ? '-' : row.totalPedido}
                    </td>
                    <td
                      className="px-3 py-1.5 text-center font-bold text-[11px] border-r border-gray-100 dark:border-gray-800"
                      style={{ position: 'sticky', left: `${CODE_COL_W + descriptionWidth + STOCK_COL_W + PEDIDO_COL_W}px`, zIndex: 38, background: 'inherit', width: `${FALTA_COL_W}px`, minWidth: `${FALTA_COL_W}px` }}
                    >
                      {row.kind === 'item' ? (Number(row.falta) < 0 ? formatCellNum(row.falta) : '-') : formatCellNum(row.falta)}
                    </td>
                    {leftColPadding > 0 && <td colSpan={2} style={{ width: `${leftColPadding}px`, minWidth: `${leftColPadding}px` }} />}
                    {virtualColumns.map((vCol) => {
                      const col = visibleColumns[vCol.index];
                      const rd = row.routeData[col.key] || { pedido: 0, falta: 0 };
                      return (
                        <React.Fragment key={`${row.key}-${col.key}`}>
                          <td
                            data-tooltip-cell
                            onClick={(e) =>
                              handlePClick(
                                e,
                                row as unknown as ProductConsolidated,
                                col.key,
                                col.label,
                                row.kind === 'item' ? row.key : (row.parentCodigo ?? row.key)
                              )
                            }
                            className="px-2 py-1.5 text-center border-l border-gray-100 dark:border-gray-800 text-blue-600 dark:text-emerald-400 font-bold text-[11px] cursor-pointer hover:bg-blue-50/50 dark:hover:bg-blue-900/5 transition-colors"
                            style={{ width: `${Math.max(40, vCol.size / 2)}px` }}
                          >
                            {formatCellNum(rd.pedido)}
                          </td>
                          <td
                            data-tooltip-cell
                            onClick={rd.falta < 0 && row.kind === 'item' && !row.isShelf
                              ? (e) =>
                                  handleFClick(
                                    e,
                                    row as unknown as ProductConsolidated,
                                    col.key,
                                    col.label,
                                    row.kind === 'item' ? row.key : (row.parentCodigo ?? row.key)
                                  )
                              : undefined
                            }
                            className={`px-2 py-1.5 text-center font-bold text-[11px] ${
                              rd.falta < 0 ? 'bg-orange-50 dark:bg-orange-900/10 text-highlight' : 'text-gray-300 dark:text-gray-600'
                            } ${rd.falta < 0 && row.kind === 'item' && !row.isShelf ? 'cursor-pointer hover:bg-orange-100/50 dark:hover:bg-orange-900/20 transition-colors' : ''}`}
                            style={{ width: `${Math.max(40, vCol.size / 2)}px` }}
                          >
                            {row.kind === 'item' && row.isShelf ? '-' : formatCellNum(rd.falta)}
                          </td>
                        </React.Fragment>
                      );
                    })}
                    {rightColPadding > 0 && <td colSpan={2} style={{ width: `${rightColPadding}px`, minWidth: `${rightColPadding}px` }} />}
                  </tr>
                );
              })}
              {bottomRowPadding > 0 && (
                <tr>
                  <td colSpan={totalColSpan} style={{ height: `${bottomRowPadding}px`, padding: 0, border: 0 }} />
                </tr>
              )}
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
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                className="text-[10px] font-bold text-secondary hover:underline"
                onClick={() => {
                  if (!routeValueFilterMenu) return;
                  setSortCriteria([{ column: `route:${routeValueFilterMenu.colKey}:${routeValueFilterMenu.field}`, direction: 'asc' }]);
                }}
              >
                Ordenar ASC
              </button>
              <button
                type="button"
                className="text-[10px] font-bold text-secondary hover:underline"
                onClick={() => {
                  if (!routeValueFilterMenu) return;
                  setSortCriteria([{ column: `route:${routeValueFilterMenu.colKey}:${routeValueFilterMenu.field}`, direction: 'desc' }]);
                }}
              >
                Ordenar DESC
              </button>
            </div>
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
              onClick={() => {
                setTooltip(null);
                setSelectedRowCodigo(null);
              }}
              className="p-1.5 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="px-4 py-3">
            <p className="text-[10px] text-neutral mb-2">
              {tooltip.type === 'P' ? 'Quantidade pedida:' : 'Quantidade em falta:'} <strong>{tooltip.valor}</strong>
            </p>
            <p className="text-[9px] uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">
              {tooltip.type === 'P' ? 'Destinos:' : 'Destinos não atendidos:'}
            </p>
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
          Clique em <strong>P</strong> para ver o detalhamento por destino. Clique em <strong>F</strong> para ver os destinos não atendidos por falta de estoque.
        </span>
      </div>
    </div>
  );
};

export default React.memo(ProjectionTable);
