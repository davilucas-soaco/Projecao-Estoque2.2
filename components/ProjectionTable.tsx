import React, { useState, useMemo, useRef, useEffect } from 'react';
import { ProductConsolidated, Order, ComponentData, ProjecaoImportada } from '../types';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  ROUTE_SO_MOVEIS,
  CATEGORY_ENTREGA_GT,
  CATEGORY_INSERIR_ROMANEIO,
  CATEGORY_RETIRADA,
  CATEGORY_REQUISICAO,
  extractRotasFromProjection,
  dateToKey,
  normalizeText,
  getCategoriaFromObservacoes,
  parseOrderDate,
  getSupervisaoCellForItem,
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
  Maximize2,
  Minimize2,
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
  ignorePreviousConsumptions?: boolean;
  /** Token incrementado externamente para resetar filtros locais da tabela. */
  tableFiltersResetToken?: number;
  /** Ref do container para fullscreen (inclui filtros + tabela). Se não informado, usa o wrapper interno. */
  fullscreenContainerRef?: React.RefObject<HTMLDivElement | null>;
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

interface TooltipPedidoGroup {
  destino: string;
  total: number;
  pedidos: Array<{ numeroPedido: string; qty: number }>;
}

const formatCellNum = (v: unknown): string | number => {
  if (v === undefined || v === null) return '-';
  const n = Number(v);
  if (Number.isNaN(n) || n === 0) return '-';
  return Math.round(n);
};

const HEADER_SAFE_TOP = 140;

const getTooltipInitialPosition = (anchorRect: DOMRect) => {
  const maxX = Math.max(16, window.innerWidth - 340);
  const maxY = Math.max(16, window.innerHeight - 320);
  return {
    left: Math.min(Math.max(8, anchorRect.right), maxX),
    top: Math.min(Math.max(HEADER_SAFE_TOP, anchorRect.bottom + 8), maxY),
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

const ROTA_FILTRO_CATEGORIAS_ESPECIAIS = new Set<string>([
  normalizeText(CATEGORY_REQUISICAO),
  normalizeText(CATEGORY_ENTREGA_GT),
  normalizeText(CATEGORY_RETIRADA),
  normalizeText(CATEGORY_INSERIR_ROMANEIO),
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
  ignorePreviousConsumptions = false,
  tableFiltersResetToken = 0,
  fullscreenContainerRef,
}) => {
  const selectedCategorias = new Set<string>();
  const [sortCriteria, setSortCriteria] = useState<SortCriterion[]>([]);
  const [descriptionWidth, setDescriptionWidth] = useState(280);
  const [isResizing, setIsResizing] = useState(false);
  const [expandedShelves, setExpandedShelves] = useState<Set<string>>(new Set());
  const [selectedRowCodigo, setSelectedRowCodigo] = useState<string | null>(null);
  const [routeValueFilterMenu, setRouteValueFilterMenu] = useState<RouteValueFilterMenu | null>(null);
  const [routeValueFilterSearch, setRouteValueFilterSearch] = useState('');
  const [routeValueFilters, setRouteValueFilters] = useState<Record<string, Set<string>>>({});
  const [codigoColumnFilter, setCodigoColumnFilter] = useState<Set<string>>(new Set());
  const [descricaoColumnFilter, setDescricaoColumnFilter] = useState<Set<string>>(new Set());
  const [codigoFilterMenu, setCodigoFilterMenu] = useState<{ anchorRect: DOMRect } | null>(null);
  const [descricaoFilterMenu, setDescricaoFilterMenu] = useState<{ anchorRect: DOMRect } | null>(null);
  const [codigoFilterSearch, setCodigoFilterSearch] = useState('');
  const [descricaoFilterSearch, setDescricaoFilterSearch] = useState('');
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const tableWrapperRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPrintMode, setIsPrintMode] = useState(false);
  const prePrintScrollRef = useRef<{ top: number; left: number }>({ top: 0, left: 0 });
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
  const codigoFilterMenuRef = useRef<HTMLDivElement>(null);
  const descricaoFilterMenuRef = useRef<HTMLDivElement>(null);
  const tooltipDragRef = useRef<{ dragging: boolean; offsetX: number; offsetY: number }>({
    dragging: false,
    offsetX: 0,
    offsetY: 0,
  });
  const codigoFilterAnchorRef = useRef<HTMLElement | null>(null);
  const descricaoFilterAnchorRef = useRef<HTMLElement | null>(null);
  const valueFilterAnchorRef = useRef<HTMLElement | null>(null);
  const [codigoFilterPosition, setCodigoFilterPosition] = useState<{ left: number; top: number } | null>(null);
  const [descricaoFilterPosition, setDescricaoFilterPosition] = useState<{ left: number; top: number } | null>(null);
  const [valueFilterPosition, setValueFilterPosition] = useState<{ left: number; top: number } | null>(null);
  const codigoFilterDragRef = useRef<{ dragging: boolean; offsetX: number; offsetY: number }>({ dragging: false, offsetX: 0, offsetY: 0 });
  const descricaoFilterDragRef = useRef<{ dragging: boolean; offsetX: number; offsetY: number }>({ dragging: false, offsetX: 0, offsetY: 0 });
  const valueFilterDragRef = useRef<{ dragging: boolean; offsetX: number; offsetY: number }>({ dragging: false, offsetX: 0, offsetY: 0 });
  const codigoFilterDraggedRef = useRef(false);
  const descricaoFilterDraggedRef = useRef(false);
  const valueFilterDraggedRef = useRef(false);

  useEffect(() => {
    const onBeforePrint = () => {
      const el = tableContainerRef.current;
      if (el) {
        prePrintScrollRef.current = { top: el.scrollTop, left: el.scrollLeft };
        // Garante que a impressão comece no primeiro item da tabela.
        el.scrollTop = 0;
        el.scrollLeft = 0;
      }
      setIsPrintMode(true);
    };
    const onAfterPrint = () => {
      setIsPrintMode(false);
      const el = tableContainerRef.current;
      if (el) {
        el.scrollTop = prePrintScrollRef.current.top;
        el.scrollLeft = prePrintScrollRef.current.left;
      }
    };
    window.addEventListener('beforeprint', onBeforePrint);
    window.addEventListener('afterprint', onAfterPrint);
    return () => {
      window.removeEventListener('beforeprint', onBeforePrint);
      window.removeEventListener('afterprint', onAfterPrint);
    };
  }, []);

  useEffect(() => {
    setRouteValueFilters({});
    setCodigoColumnFilter(new Set());
    setDescricaoColumnFilter(new Set());
    setRouteValueFilterSearch('');
    setCodigoFilterSearch('');
    setDescricaoFilterSearch('');
    setRouteValueFilterMenu(null);
    setCodigoFilterMenu(null);
    setDescricaoFilterMenu(null);
    setValueFilterPosition(null);
    setCodigoFilterPosition(null);
    setDescricaoFilterPosition(null);
  }, [tableFiltersResetToken]);

  const tooltipPedidoGroups = useMemo<TooltipPedidoGroup[]>(() => {
    if (!tooltip || tooltip.type !== 'P') return [];
    const byDestino = new Map<string, { total: number; byPedido: Map<string, number> }>();
    for (const b of tooltip.breakdown) {
      const destino = (b.destino || 'Sem destino').trim();
      if (!byDestino.has(destino)) byDestino.set(destino, { total: 0, byPedido: new Map() });
      const agg = byDestino.get(destino)!;
      const qty = Math.max(0, Number(b.qty) || 0);
      agg.total += qty;
      const pedidoKey = (b.numeroPedido || '').trim() || 'Sem pedido';
      agg.byPedido.set(pedidoKey, (agg.byPedido.get(pedidoKey) || 0) + qty);
    }
    return Array.from(byDestino.entries()).map(([destino, agg]) => ({
      destino,
      total: agg.total,
      pedidos: Array.from(agg.byPedido.entries()).map(([numeroPedido, qty]) => ({ numeroPedido, qty })),
    }));
  }, [tooltip]);

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

  const parseRotaScopedColKey = (colKey: string): { routeName: string; dateKey: string } | null => {
    const overdueMatch = colKey.match(/^rotaScopedOverdue\|(.*)$/);
    if (overdueMatch) {
      return { routeName: overdueMatch[1], dateKey: 'ATRASADOS' };
    }
    const m = colKey.match(/^rotaScoped\|(.*)\|(\d{4}-\d{2}-\d{2})$/);
    if (!m) return null;
    return { routeName: m[1], dateKey: m[2] };
  };

  const normalizeRotaForMatch = (v: string): string =>
    (v ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s*-\s*\d{2}\/\d{2}\/\d{4}\s*$/, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();

  const rotaDestinoMatches = (destino: string, routeName: string): boolean => {
    const dNorm = normalizeRotaForMatch(destino);
    const rNorm = normalizeRotaForMatch(routeName);
    return !!dNorm && !!rNorm && (dNorm === rNorm || dNorm.includes(rNorm) || rNorm.includes(dNorm));
  };

  const getRouteDataForColumn = (
    item: ProductConsolidated | ComponentData,
    colKey: string
  ): { pedido: number; falta: number; breakdown?: { destino: string; qty: number; numeroPedido?: string }[]; breakdownFalta?: { destino: string; qty: number; numeroPedido?: string }[] } => {
    const scoped = parseRotaScopedColKey(colKey);
    if (!scoped) {
      const rd = item.routeData[colKey] || { pedido: 0, falta: 0 };
      // Quando filtro de rota está ativo, evita duplicidade:
      // colunas normais exibem apenas o que NÃO pertence às rotas selecionadas.
      if (selectedRotaNames.size === 0) return rd;

      const breakdown = (rd.breakdown ?? []).filter(
        (b) => !selectedRotaEntries.some((route) => rotaDestinoMatches(b.destino ?? '', route.routeName))
      );
      const pedido = Math.round(
        breakdown.reduce((acc, b) => acc + Math.max(0, Number(b.qty) || 0), 0)
      );

      const rawBreakdownFalta = (rd as any).breakdownFalta as
        | { destino: string; qty: number; numeroPedido?: string }[]
        | undefined;
      const breakdownFalta = (rawBreakdownFalta ?? []).filter(
        (b) => !selectedRotaEntries.some((route) => rotaDestinoMatches(b.destino ?? '', route.routeName))
      );
      const faltaFromBreakdown = breakdownFalta.reduce(
        (acc, b) => acc + Math.max(0, Number(b.qty) || 0),
        0
      );
      const falta =
        breakdownFalta.length > 0
          ? (faltaFromBreakdown === 0 ? 0 : -Math.round(faltaFromBreakdown))
          : Number(rd.falta ?? 0);

      return { ...rd, pedido, falta, breakdown, breakdownFalta };
    }

    const rdDate = item.routeData[scoped.dateKey] || { pedido: 0, falta: 0 };
    const breakdown = (rdDate.breakdown ?? []).filter((b) => rotaDestinoMatches(b.destino ?? '', scoped.routeName));
    const rawBreakdownFalta =
      (
        rdDate as {
          breakdownFalta?: { destino: string; qty: number; numeroPedido?: string }[];
        }
      ).breakdownFalta ?? [];
    const breakdownFalta = rawBreakdownFalta.filter((b) =>
      rotaDestinoMatches(b.destino ?? '', scoped.routeName)
    );

    // Regra padrão: seguir consumo cronológico já consolidado no sistema (inclui consumos anteriores).
    // Regra especial: só quando usuário marcar "Desconsiderar consumos anteriores".
    if (!ignorePreviousConsumptions) {
      const pedidoFromBreakdown = Math.round(
        breakdown.reduce((acc, b) => acc + Math.max(0, Number(b.qty) || 0), 0)
      );
      const faltaFromBreakdown = Math.round(
        breakdownFalta.reduce((acc: number, b) => acc + Math.max(0, Number(b.qty) || 0), 0)
      );
      const falta = faltaFromBreakdown > 0 ? -faltaFromBreakdown : 0;
      return {
        pedido: pedidoFromBreakdown,
        falta,
        breakdown,
        breakdownFalta,
      };
    }

    const cell = getSupervisaoCellForItem(
      item as {
        routeData: Record<string, { pedido: number; falta: number; breakdown?: { destino: string; qty: number }[] }>;
        estoqueAtual?: number;
      },
      `rota|${scoped.routeName}`,
      { visibleColKeysForConsumption: [scoped.dateKey] }
    );

    return {
      pedido: cell.pedido,
      falta: cell.falta,
      breakdown,
      breakdownFalta,
    };
  };

  const handlePClick = (
    e: React.MouseEvent,
    item: ProductConsolidated | ComponentData,
    colKey: string,
    colLabel: string,
    highlightCodigo: string
  ) => {
    e.stopPropagation();
    const rd = getRouteDataForColumn(item, colKey);
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
    const rd = getRouteDataForColumn(item, colKey);
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
    const rd = getRouteDataForColumn(item, colKey);
    let raw = Number(rd.pedido ?? 0);
    if (field === 'falta') {
      if (ignorePreviousConsumptions) {
        const estoqueAtual = Math.max(0, Number((item as { estoqueAtual?: number }).estoqueAtual ?? 0));
        const pedidoAtual = Math.max(0, Number(rd.pedido ?? 0));
        raw = pedidoAtual > estoqueAtual ? -(pedidoAtual - estoqueAtual) : 0;
      } else {
        raw = Number(rd.falta ?? 0);
      }
    }
    return String(formatCellNum(raw));
  };

  const getRouteFilterKey = (colKey: string, field: RouteValueField) =>
    `${encodeURIComponent(colKey)}::${field}`;
  const parseRouteFilterKey = (key: string): { colKey: string; field: RouteValueField } | null => {
    const sepIdx = key.lastIndexOf('::');
    if (sepIdx <= 0 || sepIdx >= key.length - 2) return null;
    const rawCol = key.slice(0, sepIdx);
    const fieldRaw = key.slice(sepIdx + 2);
    if (fieldRaw !== 'pedido' && fieldRaw !== 'falta') return null;
    return {
      colKey: decodeURIComponent(rawCol),
      field: fieldRaw,
    };
  };

  const rotasCompletas = useMemo(() => extractRotasFromProjection(projectionSource), [projectionSource]);
  const allRouteNames = useMemo(() => new Set(rotasCompletas.map((r) => r.routeName)), [rotasCompletas]);
  const selectedRotaNames = useMemo(() => {
    const set = new Set<string>();
    selectedRotas.forEach((r) => {
      if (allRouteNames.has(r)) set.add(r);
    });
    return set;
  }, [selectedRotas, allRouteNames]);

  const todayStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  /** Coleta TODAS as datas de previsão das linhas da projeção que pertencem às rotas selecionadas.
   * Uma rota pode ter pedidos em várias datas; antes usávamos só a primeira data (de rotasCompletas). */
  const dateKeysForSelectedRotas = useMemo(() => {
    if (selectedRotaNames.size === 0) return null;
    const keys = new Set<string>();
    const overdueDates = new Set<string>();
    const rotaBaseMatches = (base: string): boolean => {
      if (selectedRotaNames.has(base)) return true;
      const baseNorm = normalizeText(base);
      for (const sel of selectedRotaNames) {
        const selNorm = normalizeText(sel);
        if (baseNorm === selNorm) return true;
        if (base.toUpperCase().startsWith('ROTA') && sel.toUpperCase().startsWith('ROTA')) {
          const core = (s: string) =>
            s
              .normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '')
              .replace(/\s*-\s*[A-Za-zÀ-ÿ\s]+$/, '')
              .replace(/\s+/g, ' ')
              .trim()
              .toLowerCase();
          if (core(base) === core(sel)) return true;
        }
      }
      return false;
    };
    projectionSource.forEach((row) => {
      const obs = (row.observacoes ?? '').toString().trim();
      const prefixMatch = obs.match(/^\d+\s*[-–]\s*(.*)$/);
      const base = (prefixMatch ? prefixMatch[1] : obs).trim();
      if (!base || !rotaBaseMatches(base)) return;
      const previsao = (row.previsaoAtual ?? '').toString().trim();
      if (!previsao) return;
      const d = parseOrderDate(previsao);
      if (!d) return;
      d.setHours(0, 0, 0, 0);
      if (d < todayStart) {
        overdueDates.add(
          d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
        );
      } else {
        keys.add(dateToKey(d));
      }
    });
    return { keys, overdueDates };
  }, [projectionSource, selectedRotaNames, todayStart]);

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

  const codigoToCategoriasNorm = useMemo(() => {
    const map = new Map<string, Set<string>>();
    codigoToCategorias.forEach((cats, codigo) => {
      map.set(codigo, new Set(Array.from(cats).map((c) => normalizeCategoria(c))));
    });
    return map;
  }, [codigoToCategorias]);

  const rotaCoreNorm = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s*-\s*[A-Za-zÀ-ÿ\s]+$/, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();

  const productHasRota = (codigo: string, rotas: Set<string>): boolean => {
    if (rotas.size === 0) return true;
    const prodRotas = codigoToRotas.get(codigo.trim().toUpperCase());
    if (!prodRotas) return false;
    for (const prodRota of prodRotas) {
      if (rotas.has(prodRota)) return true;
      if (prodRota.toUpperCase().startsWith('ROTA') && selectedRotaCoresNorm.size > 0 && selectedRotaCoresNorm.has(rotaCoreNorm(prodRota)))
        return true;
    }
    return false;
  };

  const selectedRotasNorm = useMemo(() => {
    const set = new Set<string>();
    selectedRotaNames.forEach((r) => set.add(normalizeText(r)));
    return set;
  }, [selectedRotaNames]);

  /** Core da rota (sem sufixo " - LIBERADA", " - CONSTRUÇÃO", etc.) para match de variantes */
  const selectedRotaCoresNorm = useMemo(() => {
    const set = new Set<string>();
    const core = (s: string) =>
      s
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s*-\s*[A-Za-zÀ-ÿ\s]+$/, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
    selectedRotaNames.forEach((r) => {
      if (r.toUpperCase().startsWith('ROTA')) set.add(core(r));
    });
    return set;
  }, [selectedRotaNames]);

  const selectedRotaCategoriasNorm = useMemo(() => {
    const set = new Set<string>();
    selectedRotas.forEach((r) => {
      const norm = normalizeCategoria(r);
      if (ROTA_FILTRO_CATEGORIAS_ESPECIAIS.has(norm)) set.add(norm);
    });
    return set;
  }, [selectedRotas]);

  const productHasSelectedRotaInBreakdown = (
    item: ProductConsolidated | ComponentData,
    rotasNorm: Set<string>
  ): boolean => {
    if (rotasNorm.size === 0 && selectedRotaCoresNorm.size === 0) return false;
    for (const rd of Object.values(item.routeData ?? {})) {
      const breakdown = rd?.breakdown ?? [];
      for (const b of breakdown) {
        const destino = b?.destino ?? '';
        const destinoNorm = normalizeText(destino);
        if (destinoNorm && rotasNorm.has(destinoNorm)) return true;
        if (destino.toUpperCase().startsWith('ROTA') && selectedRotaCoresNorm.size > 0 && selectedRotaCoresNorm.has(rotaCoreNorm(destino))) return true;
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

  const productHasCategoriaNormalized = (codigo: string, categoriasNorm: Set<string>): boolean => {
    if (categoriasNorm.size === 0) return false;
    const prodCategorias = codigoToCategoriasNorm.get(codigo.trim().toUpperCase());
    if (!prodCategorias) return false;
    for (const c of categoriasNorm) {
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
      if (codigoFilterMenu && codigoFilterMenuRef.current && !codigoFilterMenuRef.current.contains(e.target as Node)) {
        const target = e.target as HTMLElement;
        if (!target.closest('th[data-codigo-filter-head]')) {
          setCodigoFilterMenu(null);
        }
      }
      if (descricaoFilterMenu && descricaoFilterMenuRef.current && !descricaoFilterMenuRef.current.contains(e.target as Node)) {
        const target = e.target as HTMLElement;
        if (!target.closest('th[data-descricao-filter-head]')) {
          setDescricaoFilterMenu(null);
        }
      }
    };
    document.addEventListener('pointerdown', handleClickOutside, true);
    return () => {
      document.removeEventListener('pointerdown', handleClickOutside, true);
    };
  }, [tooltip, selectedRowCodigo, routeValueFilterMenu, codigoFilterMenu, descricaoFilterMenu]);

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

  useEffect(() => {
    const anyOpen = codigoFilterMenu || descricaoFilterMenu || routeValueFilterMenu;
    if (!anyOpen) return;
    const updateFilterPositions = () => {
      if (codigoFilterMenu && codigoFilterAnchorRef.current && !codigoFilterDragRef.current.dragging && !codigoFilterDraggedRef.current) {
        const rect = codigoFilterAnchorRef.current.getBoundingClientRect();
        setCodigoFilterPosition(getTooltipInitialPosition(rect));
      }
      if (descricaoFilterMenu && descricaoFilterAnchorRef.current && !descricaoFilterDragRef.current.dragging && !descricaoFilterDraggedRef.current) {
        const rect = descricaoFilterAnchorRef.current.getBoundingClientRect();
        setDescricaoFilterPosition(getTooltipInitialPosition(rect));
      }
      if (routeValueFilterMenu && valueFilterAnchorRef.current && !valueFilterDragRef.current.dragging && !valueFilterDraggedRef.current) {
        const rect = valueFilterAnchorRef.current.getBoundingClientRect();
        setValueFilterPosition(getTooltipInitialPosition(rect));
      }
    };
    const interval = setInterval(updateFilterPositions, 150);
    const onScroll = () => updateFilterPositions();
    window.addEventListener('scroll', onScroll, true);
    const tableEl = tableContainerRef.current;
    tableEl?.addEventListener('scroll', onScroll);
    window.addEventListener('resize', updateFilterPositions);
    return () => {
      clearInterval(interval);
      window.removeEventListener('scroll', onScroll, true);
      tableEl?.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', updateFilterPositions);
    };
  }, [codigoFilterMenu, descricaoFilterMenu, routeValueFilterMenu]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const dragHandlers = [
        { ref: codigoFilterDragRef, elRef: codigoFilterMenuRef },
        { ref: descricaoFilterDragRef, elRef: descricaoFilterMenuRef },
        { ref: valueFilterDragRef, elRef: valueFilterMenuRef },
      ];
      for (const { ref: dragRef, elRef } of dragHandlers) {
        if (dragRef.current.dragging && elRef.current) {
          const nextX = e.clientX - dragRef.current.offsetX;
          const nextY = e.clientY - dragRef.current.offsetY;
          const maxX = Math.max(8, window.innerWidth - 340);
          const maxY = Math.max(8, window.innerHeight - 320);
          const x = Math.min(Math.max(8, nextX), maxX);
          const y = Math.min(Math.max(HEADER_SAFE_TOP, nextY), maxY);
          elRef.current.style.left = `${x}px`;
          elRef.current.style.top = `${y}px`;
          return;
        }
      }
    };
    const handleMouseUp = () => {
      if (codigoFilterDragRef.current.dragging && codigoFilterMenuRef.current) {
        codigoFilterDragRef.current.dragging = false;
        const s = codigoFilterMenuRef.current.style;
        setCodigoFilterPosition({ left: parseFloat(s.left) || 0, top: parseFloat(s.top) || 0 });
        codigoFilterDraggedRef.current = true;
      } else if (descricaoFilterDragRef.current.dragging && descricaoFilterMenuRef.current) {
        descricaoFilterDragRef.current.dragging = false;
        const s = descricaoFilterMenuRef.current.style;
        setDescricaoFilterPosition({ left: parseFloat(s.left) || 0, top: parseFloat(s.top) || 0 });
        descricaoFilterDraggedRef.current = true;
      } else if (valueFilterDragRef.current.dragging && valueFilterMenuRef.current) {
        valueFilterDragRef.current.dragging = false;
        const s = valueFilterMenuRef.current.style;
        setValueFilterPosition({ left: parseFloat(s.left) || 0, top: parseFloat(s.top) || 0 });
        valueFilterDraggedRef.current = true;
      }
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

  const toggleFullscreen = async () => {
    const el = (fullscreenContainerRef?.current ?? tableWrapperRef.current);
    if (!el) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        setIsFullscreen(false);
      } else {
        await el.requestFullscreen();
        setIsFullscreen(true);
      }
    } catch {
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && document.fullscreenElement) {
        document.exitFullscreen();
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  /** Colunas vêm do filtro Colunas visíveis (Só Móveis e Atrasados são opções, não fixos). */
  const allColumns = dateColumns.map((c) => ({
    key: c.key,
    label: c.label,
    isSoMoveis: c.key === ROUTE_SO_MOVEIS,
  }));
  const rotaFilterActive = selectedRotaNames.size > 0;
  const selectedRotaEntries = useMemo(
    () => rotasCompletas.filter((r) => selectedRotaNames.has(r.routeName)),
    [rotasCompletas, selectedRotaNames]
  );

  const rotaScopedColumns = useMemo(() => {
    if (!rotaFilterActive) return null;
    const cols: { key: string; label: string; isSoMoveis: false }[] = [];
    const sortOverdue = (arr: string[]) =>
      arr.sort((a, b) => {
        const parseOverdue = (s: string) => {
          const [dd, mm, yy] = s.split('/');
          return new Date(`20${yy}-${mm}-${dd}T00:00:00`).getTime();
        };
        return parseOverdue(a) - parseOverdue(b);
      });
    const formatOverdueLabel = (dates: string[]) =>
      dates.length <= 2 ? dates.join(' • ') : `${dates[0]} +${dates.length - 1}`;

    const formatDateKey = (key: string) => {
      const [yy, mm, dd] = key.split('-');
      return `${dd}/${mm}/${yy.slice(-2)}`;
    };

    const routeOrder = new Map<string, number>();
    selectedRotaEntries.forEach((r, idx) => routeOrder.set(r.routeName, idx));

    const routeDatePairs: Array<{ routeName: string; dateKey: string }> = [];
    const routeOverdueDates = new Map<string, Set<string>>();
    const seenPairs = new Set<string>();

    const rotaNameMatches = (base: string, routeName: string): boolean => {
      const baseNorm = normalizeText(base);
      const routeNorm = normalizeText(routeName);
      if (baseNorm === routeNorm) return true;
      if (base.toUpperCase().startsWith('ROTA') && routeName.toUpperCase().startsWith('ROTA')) {
        const core = (s: string) =>
          s
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/\s*-\s*[A-Za-zÀ-ÿ\s]+$/, '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
        return core(base) === core(routeName);
      }
      return false;
    };

    for (const route of selectedRotaEntries) {
      for (const row of projectionSource) {
        const obs = (row.observacoes ?? '').toString().trim();
        const prefixMatch = obs.match(/^\d+\s*[-–]\s*(.*)$/);
        const base = (prefixMatch ? prefixMatch[1] : obs).trim();
        if (!base || !rotaNameMatches(base, route.routeName)) continue;
        const d = parseOrderDate((row.previsaoAtual ?? '').toString().trim());
        if (!d) continue;
        d.setHours(0, 0, 0, 0);
        if (d < todayStart) continue;
        const dateKey = dateToKey(d);
        const pairKey = `${route.routeName}|${dateKey}`;
        if (seenPairs.has(pairKey)) continue;
        seenPairs.add(pairKey);
        routeDatePairs.push({ routeName: route.routeName, dateKey });
      }
    }

    for (const route of selectedRotaEntries) {
      for (const row of projectionSource) {
        const obs = (row.observacoes ?? '').toString().trim();
        const prefixMatch = obs.match(/^\d+\s*[-–]\s*(.*)$/);
        const base = (prefixMatch ? prefixMatch[1] : obs).trim();
        if (!base || !rotaNameMatches(base, route.routeName)) continue;
        const d = parseOrderDate((row.previsaoAtual ?? '').toString().trim());
        if (!d) continue;
        d.setHours(0, 0, 0, 0);
        if (d >= todayStart) continue;
        const overdueLabel = d.toLocaleDateString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          year: '2-digit',
        });
        if (!routeOverdueDates.has(route.routeName)) routeOverdueDates.set(route.routeName, new Set());
        routeOverdueDates.get(route.routeName)!.add(overdueLabel);
      }
    }

    selectedRotaEntries.forEach((route) => {
      const dates = Array.from(routeOverdueDates.get(route.routeName) ?? []);
      if (dates.length === 0) return;
      const sorted = sortOverdue(dates);
      cols.push({
        key: `rotaScopedOverdue|${route.routeName}`,
        label: `${route.routeName} - ${formatOverdueLabel(sorted)}`,
        isSoMoveis: false,
      });
    });

    routeDatePairs.sort((a, b) => {
      const byDate = a.dateKey.localeCompare(b.dateKey);
      if (byDate !== 0) return byDate;
      return (routeOrder.get(a.routeName) ?? 9999) - (routeOrder.get(b.routeName) ?? 9999);
    });

    for (const pair of routeDatePairs) {
      cols.push({
        key: `rotaScoped|${pair.routeName}|${pair.dateKey}`,
        label: `${pair.routeName} - ${formatDateKey(pair.dateKey)}`,
        isSoMoveis: false,
      });
    }
    return cols;
  }, [rotaFilterActive, dateKeysForSelectedRotas, selectedRotaEntries, projectionSource, todayStart]);

  const visibleColumns = useMemo(() => {
    const hasCategoriasFixasSelecionadas = selectedRotaCategoriasNorm.size > 0;
    const baseColumns =
      rotaFilterActive && hasCategoriasFixasSelecionadas && rotaScopedColumns
        ? [...rotaScopedColumns, ...allColumns]
        : (rotaScopedColumns ?? allColumns);

    // Filtro de colunas por categoria só é aplicado para categorias de destino (Requisição, GT, Retirada).
    if (!dateKeysForSelectedCategorias || dateKeysForSelectedCategorias.size === 0) return baseColumns;

    const filtered = baseColumns.filter((c) => dateKeysForSelectedCategorias.has(c.key));

    // Fallback seguro para não ocultar dados por inconsistência entre tipoF x destino consolidado.
    return filtered.length > 0 ? filtered : baseColumns;
  }, [rotaScopedColumns, allColumns, dateKeysForSelectedCategorias, rotaFilterActive, selectedRotaCategoriasNorm]);

  /** Quando há colunas de data visíveis (YYYY-MM-DD), exibe apenas itens com pedido em pelo menos uma delas. */
  const dataFilteredByVisibleDateColumns = useMemo(() => {
    const visibleKeys = dateColumns.map((c) => c.key);
    if (visibleKeys.length === 0) return data;
    const dateOnlyKeys = visibleKeys.filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k));
    const keysToCheck = dateOnlyKeys.length > 0 ? dateOnlyKeys : visibleKeys;
    const hasPedidoInKeys = (item: ProductConsolidated | ComponentData) =>
      keysToCheck.some((key) => (item.routeData?.[key]?.pedido ?? 0) > 0);
    return data.filter((item) => {
      if (hasPedidoInKeys(item)) return true;
      if (item.isShelf && item.components?.length) {
        return item.components.some((comp) => hasPedidoInKeys(comp));
      }
      return false;
    });
  }, [data, dateColumns]);

  const dataFilteredByCodigoDescricao = useMemo(() => {
    const base = dataFilteredByVisibleDateColumns;
    if (codigoColumnFilter.size === 0 && descricaoColumnFilter.size === 0) return base;
    return base.filter((item) => {
      const codigoOk = codigoColumnFilter.size === 0 || codigoColumnFilter.has(item.codigo);
      const descricaoOk = descricaoColumnFilter.size === 0 || descricaoColumnFilter.has(item.descricao);
      if (codigoOk && descricaoOk) return true;
      if (item.isShelf && item.components?.length) {
        return item.components.some((comp) => {
          const cOk = codigoColumnFilter.size === 0 || codigoColumnFilter.has(comp.codigo);
          const dOk = descricaoColumnFilter.size === 0 || descricaoColumnFilter.has(comp.descricao);
          return cOk && dOk;
        });
      }
      return false;
    });
  }, [dataFilteredByVisibleDateColumns, codigoColumnFilter, descricaoColumnFilter]);

  const dataFilteredByColumns = useMemo(() => {
    let result = dataFilteredByCodigoDescricao;
    if (selectedRotas.size > 0) {
      result = result.filter((item) => {
        const routeMatch =
          (selectedRotaNames.size > 0 &&
            (productHasRota(item.codigo, selectedRotaNames) ||
              productHasSelectedRotaInBreakdown(item, selectedRotasNorm))) ||
          false;
        const categoriaMatch =
          (selectedRotaCategoriasNorm.size > 0 &&
            (productHasCategoriaNormalized(item.codigo, selectedRotaCategoriasNorm) ||
              rowHasSelectedCategoriaInRouteData(item, selectedRotaCategoriasNorm))) ||
          false;
        if (routeMatch || categoriaMatch) return true;
        if (item.isShelf && item.components?.length) {
          return item.components.some(
            (comp) =>
              (selectedRotaNames.size > 0 &&
                (productHasRota(comp.codigo, selectedRotaNames) ||
                  productHasSelectedRotaInBreakdown(comp, selectedRotasNorm))) ||
              (selectedRotaCategoriasNorm.size > 0 &&
                (productHasCategoriaNormalized(comp.codigo, selectedRotaCategoriasNorm) ||
                  rowHasSelectedCategoriaInRouteData(comp, selectedRotaCategoriasNorm)))
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
    dataFilteredByCodigoDescricao,
    selectedRotas,
    selectedSetores,
    selectedCategorias,
    selectedRotaNames,
    selectedRotaCategoriasNorm,
    selectedRotasNorm,
    selectedDestinoCategoriasNorm,
    codigoToSetores,
    codigoToRotas,
    codigoToCategorias,
    codigoToCategoriasNorm,
  ]);

  const activeRouteValueFilterKeys = useMemo(
    () => Object.keys(routeValueFilters).filter((k) => (routeValueFilters[k]?.size ?? 0) > 0),
    [routeValueFilters]
  );

  const rowMatchesRouteValueFilters = (row: ProductConsolidated | ComponentData): boolean => {
    if (activeRouteValueFilterKeys.length === 0) return true;
    for (const key of activeRouteValueFilterKeys) {
      const parsed = parseRouteFilterKey(key);
      if (!parsed) continue;
      const { colKey, field } = parsed;
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

  /**
   * Oculta colunas de data (YYYY-MM-DD) sem nenhuma unidade pedida no conjunto atualmente exibido.
   * Colunas especiais (ex.: Só Móveis / Atrasados) permanecem visíveis.
   */
  const columnsToRender = useMemo(() => {
    const isDateKey = (key: string) => /^\d{4}-\d{2}-\d{2}$/.test(key);
    const hasPedidoInCol = (item: ProductConsolidated | ComponentData, colKey: string) =>
      (item.routeData?.[colKey]?.pedido ?? 0) > 0;

    return visibleColumns.filter((col) => {
      if (!isDateKey(col.key)) return true;
      return dataFilteredByValues.some((item) => {
        if (hasPedidoInCol(item, col.key)) return true;
        if (item.isShelf && item.components?.length) {
          return item.components.some((comp) => hasPedidoInCol(comp, col.key));
        }
        return false;
      });
    });
  }, [visibleColumns, dataFilteredByValues]);

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
          (selectedRotaNames.size > 0 &&
            (productHasRota(comp.codigo, selectedRotaNames) ||
              productHasSelectedRotaInBreakdown(comp, selectedRotasNorm))) ||
          (selectedRotaCategoriasNorm.size > 0 &&
            (productHasCategoriaNormalized(comp.codigo, selectedRotaCategoriasNorm) ||
              rowHasSelectedCategoriaInRouteData(comp, selectedRotaCategoriasNorm)));
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
  }, [dataFilteredByValues, selectedRotas, selectedRotaNames, selectedRotaCategoriasNorm, selectedRotasNorm, selectedSetores, selectedCategorias, activeRouteValueFilterKeys, routeValueFilters]);

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
          (selectedRotaNames.size > 0 &&
            (productHasRota(comp.codigo, selectedRotaNames) ||
              productHasSelectedRotaInBreakdown(comp, selectedRotasNorm))) ||
          (selectedRotaCategoriasNorm.size > 0 &&
            (productHasCategoriaNormalized(comp.codigo, selectedRotaCategoriasNorm) ||
              rowHasSelectedCategoriaInRouteData(comp, selectedRotaCategoriasNorm)));
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
  }, [sortedData, selectedRotas, selectedRotaNames, selectedRotaCategoriasNorm, selectedRotasNorm, selectedSetores, selectedCategorias, activeRouteValueFilterKeys, routeValueFilters, dateKeysForSelectedRotas]);

  const flatRows = useMemo<FlatRow[]>(() => {
    const rows: FlatRow[] = [];
    const itemRows: Omit<FlatRow, 'rowBgClass'>[] = [];
    const componentRows: Omit<FlatRow, 'rowBgClass'>[] = [];
    const collator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });
    const fichaComponentCodes = new Set<string>();
    for (const prod of data) {
      if (!prod.isShelf || !prod.components?.length) continue;
      for (const comp of prod.components) {
        fichaComponentCodes.add((comp.codigo ?? '').trim().toUpperCase());
      }
    }
    const sortByDescricaoThenCodigo = (a: { descricao: string; codigo: string }, b: { descricao: string; codigo: string }) => {
      const byDescricao = collator.compare(a.descricao ?? '', b.descricao ?? '');
      if (byDescricao !== 0) return byDescricao;
      return collator.compare(a.codigo ?? '', b.codigo ?? '');
    };
    const compareRowsByCriteria = (
      a: Omit<FlatRow, 'rowBgClass'>,
      b: Omit<FlatRow, 'rowBgClass'>
    ) => {
      for (const criterion of sortCriteria) {
        let valA: unknown;
        let valB: unknown;
        if (criterion.column.startsWith('route:')) {
          const parts = criterion.column.split(':');
          const routeName = parts[1];
          const field = parts[2] as 'pedido' | 'falta';
          valA = a.routeData?.[routeName]?.[field] || 0;
          valB = b.routeData?.[routeName]?.[field] || 0;
        } else {
          const mapColumn = criterion.column === 'pendenteProducao' ? 'falta' : criterion.column;
          valA = (a as unknown as Record<string, unknown>)[mapColumn] ?? '';
          valB = (b as unknown as Record<string, unknown>)[mapColumn] ?? '';
        }
        const isAsc = criterion.direction === 'asc';
        if (typeof valA === 'string' && typeof valB === 'string') {
          const cmp = collator.compare(valA, valB);
          if (cmp !== 0) return isAsc ? cmp : -cmp;
          continue;
        }
        const numA = Number(valA);
        const numB = Number(valB);
        if (valA === valB) continue;
        if (numA < numB) return isAsc ? -1 : 1;
        if (numA > numB) return isAsc ? 1 : -1;
      }
      return sortByDescricaoThenCodigo(a, b);
    };
    let rowIndex = 0;
    for (const item of sortedData) {
      const isExpanded = expandedShelves.has(item.codigo) || autoExpandedShelves.has(item.codigo);
      const itemRow: Omit<FlatRow, 'rowBgClass'> = {
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
      };
      const isFichaComponentCode = fichaComponentCodes.has((item.codigo ?? '').trim().toUpperCase());
      if (isFichaComponentCode) componentRows.push(itemRow);
      else itemRows.push(itemRow);
      const comps = filteredComponentsByParent.get(item.codigo) ?? [];
      for (const comp of comps) {
        componentRows.push({
          key: `${item.codigo}-${comp.codigo}`,
          kind: 'component',
          parentCodigo: item.codigo,
          codigo: comp.codigo,
          descricao: comp.descricao,
          estoqueAtual: comp.estoqueAtual,
          totalPedido: comp.totalPedido,
          falta: comp.falta,
          routeData: comp.routeData,
        });
      }
    }

    if (sortCriteria.length > 0) {
      itemRows.sort(compareRowsByCriteria);
      componentRows.sort(compareRowsByCriteria);
    } else {
      itemRows.sort(sortByDescricaoThenCodigo);
      componentRows.sort(sortByDescricaoThenCodigo);
    }

    for (const row of [...itemRows, ...componentRows]) {
      const rowBgClass = rowIndex % 2 === 0 ? 'bg-[#FFFFFF] dark:bg-[#252525]' : 'bg-[#F6F8FC] dark:bg-[#2A2A2A]';
      rows.push({ ...row, rowBgClass });
      rowIndex += 1;
    }
    return rows;
  }, [sortedData, data, expandedShelves, autoExpandedShelves, filteredComponentsByParent, sortCriteria]);

  const rowVirtualizer = useVirtualizer({
    count: flatRows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: (idx) => (flatRows[idx]?.kind === 'component' ? 28 : 34),
    overscan: 10,
  });

  const columnVirtualizer = useVirtualizer({
    count: columnsToRender.length,
    horizontal: true,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 96,
    overscan: 6,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const virtualColumns = columnVirtualizer.getVirtualItems();
  const rowsToRender = isPrintMode
    ? flatRows.map((_, index) => ({ index, size: 0 }))
    : virtualRows.map((v) => ({ index: v.index, size: v.size }));
  const colsToRender = isPrintMode
    ? columnsToRender.map((_, index) => ({ index, size: 96 }))
    : virtualColumns.map((v) => ({ index: v.index, size: v.size }));
  const topRowPadding = isPrintMode ? 0 : (virtualRows.length > 0 ? virtualRows[0].start : 0);
  const bottomRowPadding = isPrintMode
    ? 0
    : (virtualRows.length > 0 ? rowVirtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end : 0);
  const leftColPadding = isPrintMode ? 0 : (virtualColumns.length > 0 ? virtualColumns[0].start : 0);
  const rightColPadding = isPrintMode
    ? 0
    : (virtualColumns.length > 0
      ? columnVirtualizer.getTotalSize() - virtualColumns[virtualColumns.length - 1].end
      : 0);

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

  const totalColSpan = 5 + columnsToRender.length * 2;
  const shouldCompactPrint = columnsToRender.length > 10 || flatRows.length > 55;
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

  const uniqueCodigos = useMemo(() => {
    const set = new Set<string>();
    for (const item of data) {
      set.add(item.codigo);
      if (item.isShelf && item.components?.length) {
        for (const comp of item.components) set.add(comp.codigo);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
  }, [data]);
  const uniqueDescricoes = useMemo(() => {
    const set = new Set<string>();
    for (const item of data) {
      set.add(item.descricao);
      if (item.isShelf && item.components?.length) {
        for (const comp of item.components) set.add(comp.descricao);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
  }, [data]);
  const filteredCodigoValues = useMemo(() => {
    const term = codigoFilterSearch.trim().toLowerCase();
    if (!term) return uniqueCodigos;
    return uniqueCodigos.filter((v) => v.toLowerCase().includes(term));
  }, [uniqueCodigos, codigoFilterSearch]);
  const matchesSqlLikePercentSearch = (value: string, rawSearch: string): boolean => {
    const search = rawSearch.trim().toLowerCase();
    if (!search) return true;
    const candidate = value.toLowerCase();

    // Sem %, mantém comportamento atual (contains simples).
    if (!search.includes('%')) return candidate.includes(search);

    // Com %, busca cada bloco em sequência (LIKE '%a%b%c%').
    const parts = search.split('%').map((p) => p.trim()).filter(Boolean);
    if (parts.length === 0) return true;

    let startFrom = 0;
    for (const part of parts) {
      const idx = candidate.indexOf(part, startFrom);
      if (idx === -1) return false;
      startFrom = idx + part.length;
    }
    return true;
  };
  const filteredDescricaoValues = useMemo(() => {
    const term = descricaoFilterSearch.trim();
    if (!term) return uniqueDescricoes;
    return uniqueDescricoes.filter((v) => matchesSqlLikePercentSearch(v, term));
  }, [uniqueDescricoes, descricaoFilterSearch]);

  const exportProjectionExcel = () => {
    const excelColCount = 5 + columnsToRender.length * 2;
    const colGroup = [
      `<col style="width:140px">`,
      `<col style="width:520px">`,
      `<col style="width:100px">`,
      `<col style="width:100px">`,
      `<col style="width:100px">`,
      ...columnsToRender.flatMap(() => [`<col style="width:68px">`, `<col style="width:68px">`]),
    ].join('');

    const topHeader = [
      `<th style="background:#041E42;border:1px solid #203f77;padding:12px 12px;height:34px;"></th>`,
      `<th style="background:#041E42;border:1px solid #203f77;padding:12px 12px;height:34px;"></th>`,
      `<th style="background:#062c61;border:1px solid #203f77;padding:12px 12px;height:34px;"></th>`,
      `<th style="background:#062c61;border:1px solid #203f77;padding:12px 12px;height:34px;"></th>`,
      `<th style="background:#062c61;border:1px solid #203f77;padding:12px 12px;height:34px;"></th>`,
      ...columnsToRender.map(
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
      ...columnsToRender.flatMap(() => [
        `<th style="background:#1d6f2f;color:#fff;border:1px solid #203f77;padding:8px 8px;height:32px;">P</th>`,
        `<th style="background:#9b0f0f;color:#fff;border:1px solid #203f77;padding:8px 8px;height:32px;">F</th>`,
      ]),
    ].join('');

    const bodyRows = sortedData
      .map((item, idx) => {
        const rowBg = idx % 2 === 0 ? '#ffffff' : '#f6f8fc';
        const baseCells = [
          `<td style="border:1px solid #d8e0ef;padding:6px 8px;background:${rowBg};font-weight:700;text-align:center;vertical-align:middle;">${escapeHtml(item.codigo)}</td>`,
          `<td style="border:1px solid #d8e0ef;padding:6px 8px;background:${rowBg};text-align:left;vertical-align:middle;">${escapeHtml(item.descricao)}</td>`,
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

        const routeCells = columnsToRender.flatMap((col) => {
          const rd = getRouteDataForColumn(item, col.key);
          const pedidoDisplay = Math.max(0, Number(rd.pedido ?? 0));
          const faltaDisplay = ignorePreviousConsumptions
            ? (pedidoDisplay > Math.max(0, Number(item.estoqueAtual ?? 0))
                ? -(pedidoDisplay - Math.max(0, Number(item.estoqueAtual ?? 0)))
                : 0)
            : Number(rd.falta ?? 0);
          return [
            `<td style="border:1px solid #d8e0ef;padding:4px 8px;background:${rowBg};text-align:center;color:#0a58ca;font-weight:700;">${escapeHtml(
              formatCellNum(pedidoDisplay)
            )}</td>`,
            `<td style="border:1px solid #d8e0ef;padding:4px 8px;background:${rowBg};text-align:center;color:${
              faltaDisplay < 0 ? '#b06a00' : '#8d99ae'
            };font-weight:700;">${escapeHtml(item.isShelf ? '-' : formatCellNum(faltaDisplay))}</td>`,
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
<x:AutoFilter x:Range="R2C1:R2C${excelColCount}" xmlns:x="urn:schemas-microsoft-com:office:excel"/>
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
    <div className={`projection-table-shell ${shouldCompactPrint ? 'print-compact' : 'print-comfort'} space-y-4 h-full flex flex-col`}>
      <div
        ref={tableWrapperRef}
        className="projection-table-wrapper bg-white dark:bg-[#252525] rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col flex-1 relative min-h-0 transition-all duration-300"
      >
        <div className="no-print px-3 py-2 border-b border-gray-200 dark:border-gray-700 flex justify-end gap-2">
          <button
            type="button"
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Sair da tela cheia' : 'Expandir tabela'}
            className="inline-flex items-center justify-center p-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
          >
            {isFullscreen ? (
              <Minimize2 className="w-3.5 h-3.5" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" />
            )}
          </button>
          <button
            type="button"
            onClick={exportProjectionExcel}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Exportar Excel
          </button>
        </div>
        <div
          ref={tableContainerRef}
          className={`projection-table-scroll overflow-auto flex-1 relative scroll-smooth min-h-0 ${isFullscreen ? '' : 'max-h-[calc(100vh-215px)]'}`}
        >
          <table className="w-full text-left text-sm border-separate border-spacing-0 min-w-max">
            <thead className="sticky top-0 z-[70]">
              <tr className="bg-primary text-white">
                <th
                  data-codigo-filter-head
                  onClick={(e) => handleSort('codigo', e.ctrlKey)}
                  className="print-code-col px-2 py-1 sticky left-0 top-0 z-[80] bg-primary border-b border-white/10 w-[110px] shadow-[2px_0_5px_rgba(0,0,0,0.2)] cursor-pointer group hover:bg-[#0b2b58] transition-colors"
                  style={{ width: `${CODE_COL_W}px`, minWidth: `${CODE_COL_W}px` }}
                >
                  <div className="flex items-center justify-between text-[11px] uppercase tracking-wider font-bold mb-0.5">
                    <span>Código</span>
                    {renderSortIndicator('codigo')}
                  </div>
                  <div
                    ref={(el) => { if (codigoFilterMenu) codigoFilterAnchorRef.current = el; }}
                    onClick={(e) => {
                      e.stopPropagation();
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      const willOpen = !codigoFilterMenu;
                      codigoFilterAnchorRef.current = willOpen ? (e.currentTarget as HTMLElement) : null;
                      if (willOpen) codigoFilterDraggedRef.current = false;
                      setCodigoFilterPosition(willOpen ? getTooltipInitialPosition(rect) : null);
                      setCodigoFilterMenu((prev) => (prev ? null : { anchorRect: rect }));
                      setDescricaoFilterMenu(null);
                    }}
                    className="flex items-center justify-end gap-0.5 border-t border-white/20 pt-1 pr-1 text-[8px] font-bold cursor-pointer hover:bg-white/10 rounded"
                  >
                    <Filter className="w-2.5 h-2.5 opacity-80" />
                    {codigoColumnFilter.size > 0 ? ' ●' : ''}
                  </div>
                </th>
                <th
                  data-descricao-filter-head
                  data-print-desc-col
                  onClick={(e) => handleSort('descricao', e.ctrlKey)}
                  style={{ width: `${descriptionWidth}px`, minWidth: `${descriptionWidth}px` }}
                  className="print-desc-col px-2 py-1 sticky left-[110px] top-0 z-[80] bg-primary border-b border-white/10 shadow-[2px_0_5px_rgba(0,0,0,0.2)] cursor-pointer group hover:bg-[#0b2b58] transition-colors relative"
                >
                  <div className="flex items-center justify-between text-[11px] uppercase tracking-wider font-bold pr-2 mb-0.5">
                    <span className="truncate">Descrição</span>
                    {renderSortIndicator('descricao')}
                  </div>
                  <div
                    ref={(el) => { if (descricaoFilterMenu) descricaoFilterAnchorRef.current = el; }}
                    onClick={(e) => {
                      e.stopPropagation();
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      const willOpen = !descricaoFilterMenu;
                      descricaoFilterAnchorRef.current = willOpen ? (e.currentTarget as HTMLElement) : null;
                      if (willOpen) descricaoFilterDraggedRef.current = false;
                      setDescricaoFilterPosition(willOpen ? getTooltipInitialPosition(rect) : null);
                      setDescricaoFilterMenu((prev) => (prev ? null : { anchorRect: rect }));
                      setCodigoFilterMenu(null);
                    }}
                    className="flex items-center justify-end gap-0.5 border-t border-white/20 pt-1 pr-1 text-[8px] font-bold cursor-pointer hover:bg-white/10 rounded"
                  >
                    <Filter className="w-2.5 h-2.5 opacity-80" />
                    {descricaoColumnFilter.size > 0 ? ' ●' : ''}
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
                  className="print-num-col px-3 py-2 text-center bg-[#062c61] border-b border-white/10 border-l border-white/10 sticky top-0 z-[78] cursor-pointer hover:bg-[#083a80] transition-colors"
                  style={{ left: `${CODE_COL_W + descriptionWidth}px`, width: `${STOCK_COL_W}px`, minWidth: `${STOCK_COL_W}px` }}
                >
                  <div className="flex items-center justify-center text-[11px] uppercase tracking-wider font-bold">
                    <span>Estoque</span>
                    {renderSortIndicator('estoqueAtual')}
                  </div>
                </th>
                <th
                  onClick={(e) => handleSort('totalPedido', e.ctrlKey)}
                  className="print-num-col px-3 py-2 text-center bg-[#062c61] border-b border-white/10 sticky top-0 z-[78] cursor-pointer hover:bg-[#083a80] transition-colors"
                  style={{ left: `${CODE_COL_W + descriptionWidth + STOCK_COL_W}px`, width: `${PEDIDO_COL_W}px`, minWidth: `${PEDIDO_COL_W}px` }}
                >
                  <div className="flex items-center justify-center text-[11px] uppercase tracking-wider font-bold">
                    <span>Pedido</span>
                    {renderSortIndicator('totalPedido')}
                  </div>
                </th>
                <th
                  onClick={(e) => handleSort('pendenteProducao', e.ctrlKey)}
                  className="print-num-col px-3 py-2 text-center bg-[#062c61] border-b border-white/10 border-r border-white/10 sticky top-0 z-[78] cursor-pointer hover:bg-[#083a80] transition-colors"
                  style={{ left: `${CODE_COL_W + descriptionWidth + STOCK_COL_W + PEDIDO_COL_W}px`, width: `${FALTA_COL_W}px`, minWidth: `${FALTA_COL_W}px` }}
                >
                  <div className="flex items-center justify-center text-[11px] uppercase tracking-wider font-bold">
                    <span>Falta</span>
                    {renderSortIndicator('pendenteProducao')}
                  </div>
                </th>
                {leftColPadding > 0 && <th colSpan={2} style={{ width: `${leftColPadding}px`, minWidth: `${leftColPadding}px` }} />}
                {colsToRender.map((vCol) => {
                  const col = columnsToRender[vCol.index];
                  return (
                  <th
                    key={col.key}
                    data-route-filter-head
                    className="print-route-head px-2 py-1 text-center bg-blue-800 border-b border-white/10 border-l border-white/10 sticky top-0 z-[70]"
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
                        ref={(el) => { if (routeValueFilterMenu?.field === 'pedido') valueFilterAnchorRef.current = el; }}
                        onClick={(e) => {
                          e.stopPropagation();
                          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                          const willOpen = !(routeValueFilterMenu?.colKey === col.key && routeValueFilterMenu?.field === 'pedido');
                          valueFilterAnchorRef.current = willOpen ? (e.currentTarget as HTMLElement) : null;
                          if (willOpen) valueFilterDraggedRef.current = false;
                          setValueFilterPosition(willOpen ? getTooltipInitialPosition(rect) : null);
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
                        ref={(el) => { if (routeValueFilterMenu?.field === 'falta') valueFilterAnchorRef.current = el; }}
                        onClick={(e) => {
                          e.stopPropagation();
                          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                          const willOpen = !(routeValueFilterMenu?.colKey === col.key && routeValueFilterMenu?.field === 'falta');
                          valueFilterAnchorRef.current = willOpen ? (e.currentTarget as HTMLElement) : null;
                          if (willOpen) valueFilterDraggedRef.current = false;
                          setValueFilterPosition(willOpen ? getTooltipInitialPosition(rect) : null);
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
              {rowsToRender.map((vRow) => {
                const row = flatRows[vRow.index];
                const isSelected = selectedRowCodigo === row.key || selectedRowCodigo === row.parentCodigo;
                const isItem = row.kind === 'item';
                return (
                  <tr
                    key={row.key}
                    data-index={vRow.index}
                    ref={isPrintMode ? undefined : rowVirtualizer.measureElement}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (tooltip) return;
                      if (isItem) setSelectedRowCodigo((prev) => (prev === row.key ? null : row.key));
                      else if (row.parentCodigo) {
                        const parentCodigo = row.parentCodigo;
                        setSelectedRowCodigo((prev) => (prev === parentCodigo ? null : parentCodigo));
                      }
                    }}
                    className={`${row.rowBgClass} hover:bg-blue-100/70 dark:hover:bg-blue-900/25 transition-colors group cursor-pointer ${
                      isSelected ? 'ring-1 ring-secondary/40 bg-blue-50/70 dark:bg-blue-900/20' : ''
                    } ${row.kind === 'component' ? 'border-l-4 border-secondary' : ''}`}
                  >
                    <td className="print-code-col px-3 py-1.5 font-mono font-bold text-[11px] sticky left-0 z-[40] bg-inherit border-r border-gray-100 dark:border-gray-800 shadow-[2px_0_5px_rgba(0,0,0,0.05)]">
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
                      className={`print-desc-col px-3 py-1.5 sticky left-[110px] z-[40] bg-inherit border-r border-gray-100 dark:border-gray-800 shadow-[2px_0_5px_rgba(0,0,0,0.05)] truncate ${
                        row.kind === 'component' ? 'text-[10px] italic text-neutral' : 'text-[11px]'
                      }`}
                    >
                      {row.descricao}
                    </td>
                    <td
                      className={`print-num-col px-3 py-1.5 text-center font-semibold text-[11px] border-l border-gray-100 dark:border-gray-800 ${
                        Number(row.estoqueAtual) < 0 ? 'text-[#B06A66]' : ''
                      }`}
                      style={{ position: 'sticky', left: `${CODE_COL_W + descriptionWidth}px`, zIndex: 38, background: 'inherit', width: `${STOCK_COL_W}px`, minWidth: `${STOCK_COL_W}px` }}
                    >
                      {row.estoqueAtual}
                    </td>
                    <td
                      className="print-num-col px-3 py-1.5 text-center font-medium text-[11px]"
                      style={{ position: 'sticky', left: `${CODE_COL_W + descriptionWidth + STOCK_COL_W}px`, zIndex: 38, background: 'inherit', width: `${PEDIDO_COL_W}px`, minWidth: `${PEDIDO_COL_W}px` }}
                    >
                      {row.totalPedido === 0 ? '-' : row.totalPedido}
                    </td>
                    <td
                      className="print-num-col px-3 py-1.5 text-center font-bold text-[11px] border-r border-gray-100 dark:border-gray-800"
                      style={{ position: 'sticky', left: `${CODE_COL_W + descriptionWidth + STOCK_COL_W + PEDIDO_COL_W}px`, zIndex: 38, background: 'inherit', width: `${FALTA_COL_W}px`, minWidth: `${FALTA_COL_W}px` }}
                    >
                      {row.kind === 'item' ? (Number(row.falta) < 0 ? formatCellNum(row.falta) : '-') : formatCellNum(row.falta)}
                    </td>
                    {leftColPadding > 0 && <td colSpan={2} style={{ width: `${leftColPadding}px`, minWidth: `${leftColPadding}px` }} />}
                    {colsToRender.map((vCol) => {
                      const col = columnsToRender[vCol.index];
                      const rd = getRouteDataForColumn(row as unknown as ProductConsolidated | ComponentData, col.key);
                      const pedidoCell = Math.max(0, Number(rd.pedido ?? 0));
                      const estoqueCell = Math.max(0, Number((row as { estoqueAtual?: number }).estoqueAtual ?? 0));
                      const faltaCell = ignorePreviousConsumptions
                        ? (pedidoCell > estoqueCell ? -(pedidoCell - estoqueCell) : 0)
                        : Number(rd.falta ?? 0);
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
                            className="print-route-col px-2 py-1.5 text-center border-l border-gray-100 dark:border-gray-800 text-blue-600 dark:text-emerald-400 font-bold text-[11px] cursor-pointer hover:bg-blue-50/50 dark:hover:bg-blue-900/5 transition-colors"
                            style={{ width: `${Math.max(40, (vCol.size || 96) / 2)}px` }}
                          >
                            {formatCellNum(pedidoCell)}
                          </td>
                          <td
                            data-tooltip-cell
                            onClick={undefined}
                            className={`print-route-col print-f-col px-2 py-1.5 text-center font-bold text-[11px] ${
                              faltaCell < 0 ? 'bg-orange-50 dark:bg-orange-900/10 text-highlight' : 'text-gray-300 dark:text-gray-600'
                            }`}
                            style={{ width: `${Math.max(40, (vCol.size || 96) / 2)}px` }}
                          >
                            {row.kind === 'item' && row.isShelf ? '-' : formatCellNum(faltaCell)}
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

      {codigoFilterMenu && (
        <div
          ref={codigoFilterMenuRef}
          className="fixed z-[110] bg-white dark:bg-[#252525] rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden min-w-[280px] max-w-[420px]"
          style={codigoFilterPosition ?? getTooltipInitialPosition(codigoFilterMenu.anchorRect)}
        >
          <div
            onMouseDown={(e) => {
              if (!codigoFilterMenuRef.current) return;
              const rect = codigoFilterMenuRef.current.getBoundingClientRect();
              codigoFilterDragRef.current = { dragging: true, offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top };
              document.body.style.userSelect = 'none';
              document.body.style.cursor = 'move';
            }}
            className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#1f2933] cursor-move"
            title="Arraste para mover"
          >
            <p className="text-[11px] font-bold uppercase tracking-wider text-neutral">Filtro Código</p>
          </div>
          <div className="p-3 space-y-2">
            <input
              type="text"
              placeholder="Buscar valor..."
              className="w-full px-2 py-1.5 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-[#1f1f1f]"
              value={codigoFilterSearch}
              onChange={(e) => setCodigoFilterSearch(e.target.value)}
            />
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                className="text-[10px] font-bold text-secondary hover:underline"
                onClick={() => setSortCriteria([{ column: 'codigo', direction: 'asc' }])}
              >
                Ordenar ASC
              </button>
              <button
                type="button"
                className="text-[10px] font-bold text-secondary hover:underline"
                onClick={() => setSortCriteria([{ column: 'codigo', direction: 'desc' }])}
              >
                Ordenar DESC
              </button>
            </div>
            <div className="flex items-center justify-between">
              <button
                type="button"
                className="text-[10px] font-bold text-secondary hover:underline"
                onClick={() => {
                  if (filteredCodigoValues.length > 0 && codigoColumnFilter.size === filteredCodigoValues.length) {
                    setCodigoColumnFilter(new Set());
                  } else {
                    setCodigoColumnFilter(new Set(filteredCodigoValues));
                  }
                }}
              >
                {filteredCodigoValues.length > 0 && codigoColumnFilter.size === filteredCodigoValues.length ? 'Desmarcar todos' : 'Selecionar todos'}
              </button>
              <button
                type="button"
                className="text-[10px] font-bold text-neutral hover:underline"
                onClick={() => setCodigoColumnFilter(new Set())}
              >
                Limpar
              </button>
            </div>
            <div className="max-h-56 overflow-auto space-y-1 border border-gray-200 dark:border-gray-700 rounded p-1">
              {filteredCodigoValues.map((value) => (
                <label
                  key={value}
                  className="flex items-center gap-2 text-xs px-1 py-1 rounded hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={codigoColumnFilter.has(value)}
                    onChange={(e) => {
                      setCodigoColumnFilter((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(value);
                        else next.delete(value);
                        return next;
                      });
                    }}
                  />
                  <span className="break-words whitespace-normal flex-1 min-w-0">{value}</span>
                </label>
              ))}
              {filteredCodigoValues.length === 0 && (
                <p className="text-[11px] text-neutral px-1 py-2">Sem valores para filtrar.</p>
              )}
            </div>
          </div>
        </div>
      )}


      {descricaoFilterMenu && (
        <div
          ref={descricaoFilterMenuRef}
          className="fixed z-[110] bg-white dark:bg-[#252525] rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden min-w-[280px] max-w-[420px]"
          style={descricaoFilterPosition ?? getTooltipInitialPosition(descricaoFilterMenu.anchorRect)}
        >
          <div
            onMouseDown={(e) => {
              if (!descricaoFilterMenuRef.current) return;
              const rect = descricaoFilterMenuRef.current.getBoundingClientRect();
              descricaoFilterDragRef.current = {
                dragging: true,
                offsetX: e.clientX - rect.left,
                offsetY: e.clientY - rect.top,
              };
              document.body.style.userSelect = 'none';
              document.body.style.cursor = 'move';
            }}
            className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#1f2933] cursor-move flex items-center justify-between"
            title="Arraste para mover"
          >
            <p className="text-[11px] font-bold uppercase tracking-wider text-neutral">Filtro Descrição</p>
            <button
              onClick={() => {
                setDescricaoFilterMenu(null);
                setDescricaoFilterPosition(null);
                descricaoFilterAnchorRef.current = null;
              }}
              className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="p-3 space-y-2">
            <input
              type="text"
              placeholder="Buscar valor..."
              className="w-full px-2 py-1.5 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-[#1f1f1f]"
              value={descricaoFilterSearch}
              onChange={(e) => setDescricaoFilterSearch(e.target.value)}
            />
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                className="text-[10px] font-bold text-secondary hover:underline"
                onClick={() => setSortCriteria([{ column: 'descricao', direction: 'asc' }])}
              >
                Ordenar ASC
              </button>
              <button
                type="button"
                className="text-[10px] font-bold text-secondary hover:underline"
                onClick={() => setSortCriteria([{ column: 'descricao', direction: 'desc' }])}
              >
                Ordenar DESC
              </button>
            </div>
            <div className="flex items-center justify-between">
              <button
                type="button"
                className="text-[10px] font-bold text-secondary hover:underline"
                onClick={() => {
                  if (filteredDescricaoValues.length === 0) return;
                  const allSelected = filteredDescricaoValues.every((v) => descricaoColumnFilter.has(v));
                  setDescricaoColumnFilter(allSelected ? new Set() : new Set(filteredDescricaoValues));
                }}
              >
                {filteredDescricaoValues.every((v) => descricaoColumnFilter.has(v)) && filteredDescricaoValues.length > 0 ? 'Desmarcar todos' : 'Selecionar todos'}
              </button>
              <button
                type="button"
                className="text-[10px] font-bold text-neutral hover:underline"
                onClick={() => setDescricaoColumnFilter(new Set())}
              >
                Limpar
              </button>
            </div>
            <div className="max-h-56 overflow-auto space-y-1 border border-gray-200 dark:border-gray-700 rounded p-1">
              {filteredDescricaoValues.map((value) => (
                <label key={value} className="flex items-center gap-2 text-xs px-1 py-1 rounded hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={descricaoColumnFilter.has(value)}
                    onChange={(e) => {
                      setDescricaoColumnFilter((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(value);
                        else next.delete(value);
                        return next;
                      });
                    }}
                  />
                  <span className="break-words whitespace-normal">{value}</span>
                </label>
              ))}
              {filteredDescricaoValues.length === 0 && (
                <p className="text-[11px] text-neutral px-1 py-2">Sem valores para filtrar.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {routeValueFilterMenu && (
        <div
          ref={valueFilterMenuRef}
          className="fixed z-[110] bg-white dark:bg-[#252525] rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden min-w-[280px] max-w-[420px]"
          style={valueFilterPosition ?? getTooltipInitialPosition(routeValueFilterMenu.anchorRect)}
        >
          <div
            onMouseDown={(e) => {
              if (!valueFilterMenuRef.current) return;
              const rect = valueFilterMenuRef.current.getBoundingClientRect();
              valueFilterDragRef.current = {
                dragging: true,
                offsetX: e.clientX - rect.left,
                offsetY: e.clientY - rect.top,
              };
              document.body.style.userSelect = 'none';
              document.body.style.cursor = 'move';
            }}
            className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#1f2933] cursor-move flex items-center justify-between"
            title="Arraste para mover"
          >
            <p className="text-[11px] font-bold uppercase tracking-wider text-neutral">
              Filtro {routeValueFilterMenu.field === 'pedido' ? 'P' : 'F'} ({routeValueFilterMenu.colKey})
            </p>
            <button
              onClick={() => {
                setRouteValueFilterMenu(null);
                setValueFilterPosition(null);
                valueFilterAnchorRef.current = null;
              }}
              className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
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
                  <span className="break-words whitespace-normal">{value}</span>
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
              {tooltip.type === 'P' ? (
                tooltipPedidoGroups.map((g, i) => (
                  <li key={`${g.destino}-${i}`} className="text-[11px]">
                    <div className="flex justify-between gap-4 items-baseline">
                      <span className="text-gray-800 dark:text-gray-100 font-semibold">{g.destino}</span>
                      <span className="font-bold text-gray-800 dark:text-gray-100">{g.total}</span>
                    </div>
                    <ul className="mt-1 space-y-1">
                      {g.pedidos.map((p, j) => (
                        <li key={`${p.numeroPedido}-${j}`} className="text-[10px] text-gray-500 dark:text-gray-400 flex justify-between gap-3 pl-2">
                          <span>Pedido {p.numeroPedido}</span>
                          <span className="font-semibold">{p.qty}</span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))
              ) : (
                tooltip.breakdown.map((b, i) => (
                  <li key={i} className="text-[11px]">
                    <div className="flex justify-between gap-4 items-baseline">
                      <span className="text-gray-800 dark:text-gray-100">{b.destino}</span>
                      <span className="font-bold text-gray-800 dark:text-gray-100">{b.qty}</span>
                    </div>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      )}

      <div className="no-print bg-white dark:bg-[#252525] p-2 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center gap-3 text-[10px] text-neutral italic shrink-0">
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
