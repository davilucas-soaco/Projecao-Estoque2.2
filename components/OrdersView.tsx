import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, ArrowDown, ArrowUp, Download, MapPin, ShoppingCart, Store, Truck, User, X } from 'lucide-react';
import { ProjecaoImportada } from '../types';
import { CATEGORY_ENTREGA_GT, CATEGORY_INSERIR_ROMANEIO, CATEGORY_REQUISICAO, CATEGORY_RETIRADA, getCategoriaFromObservacoes, getHorizonInfo, isCategoriaEspecial, parseOrderDate } from '../utils';
import * as XLSX from 'xlsx';

interface Props {
  projection: ProjecaoImportada[];
}

type ProjectionColumnKey =
  | 'idChave'
  | 'observacoes'
  | 'rm'
  | 'pd'
  | 'cliente'
  | 'cod'
  | 'descricaoProduto'
  | 'setorProducao'
  | 'requisicaoLojaGrupo'
  | 'uf'
  | 'municipioEntrega'
  | 'qtdePendenteReal'
  | 'previsaoAtual';

interface SortCriterion {
  key: ProjectionColumnKey;
  direction: 'asc' | 'desc';
}

type KpiFilterType = 'all' | 'so_moveis' | 'g_teresina' | 'cliente_busca' | 'em_rota' | 'sem_vinculo';

const COLUMNS: { key: ProjectionColumnKey; label: string; width: number }[] = [
  { key: 'idChave', label: 'idChave', width: 200 },
  { key: 'observacoes', label: 'Observações', width: 220 },
  { key: 'rm', label: 'RM', width: 110 },
  { key: 'pd', label: 'PD', width: 130 },
  { key: 'cliente', label: 'Cliente', width: 240 },
  { key: 'cod', label: 'Cod', width: 110 },
  { key: 'descricaoProduto', label: 'Descrição do produto', width: 360 },
  { key: 'setorProducao', label: 'Setor de Produção', width: 200 },
  { key: 'requisicaoLojaGrupo', label: 'Requisição de loja do grupo?', width: 220 },
  { key: 'uf', label: 'UF', width: 80 },
  { key: 'municipioEntrega', label: 'Município de entrega', width: 200 },
  { key: 'qtdePendenteReal', label: 'Qtde Pendente Real', width: 170 },
  { key: 'previsaoAtual', label: 'Previsão atual', width: 140 },
];

const FILTER_KEYS: ProjectionColumnKey[] = [
  'idChave',
  'observacoes',
  'rm',
  'pd',
  'cliente',
  'cod',
  'descricaoProduto',
  'setorProducao',
  'requisicaoLojaGrupo',
  'uf',
  'municipioEntrega',
  'previsaoAtual',
];

const safeStr = (v: unknown): string => (v == null ? '' : String(v));
const safeNum = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const formatDateBR = (value: string): string => {
  const d = parseOrderDate(value);
  if (!d) return value || '';
  return d.toLocaleDateString('pt-BR');
};

const OrdersView: React.FC<Props> = ({ projection }) => {
  const [filters, setFilters] = useState<Record<ProjectionColumnKey, string>>({
    idChave: '',
    observacoes: '',
    rm: '',
    pd: '',
    cliente: '',
    cod: '',
    descricaoProduto: '',
    setorProducao: '',
    requisicaoLojaGrupo: '',
    uf: '',
    municipioEntrega: '',
    qtdePendenteReal: '',
    previsaoAtual: '',
  });
  const [sortCriteria, setSortCriteria] = useState<SortCriterion[]>([]);
  const [kpiFilter, setKpiFilter] = useState<KpiFilterType>('all');
  const [columnWidths, setColumnWidths] = useState<Record<ProjectionColumnKey, number>>(
    () =>
      COLUMNS.reduce(
        (acc, c) => {
          acc[c.key] = c.width;
          return acc;
        },
        {} as Record<ProjectionColumnKey, number>
      )
  );
  const [resizingColumn, setResizingColumn] = useState<ProjectionColumnKey | null>(null);
  const resizeStartX = useRef<number>(0);
  const resizeStartWidth = useRef<number>(0);
  const didResizeRef = useRef(false);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!resizingColumn) return;
      const diff = e.pageX - resizeStartX.current;
      if (diff !== 0) didResizeRef.current = true;
      setColumnWidths((prev) => ({
        ...prev,
        [resizingColumn]: Math.max(80, resizeStartWidth.current + diff),
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

  const startResizing = (e: React.MouseEvent, key: ProjectionColumnKey) => {
    e.preventDefault();
    e.stopPropagation();
    didResizeRef.current = false;
    setResizingColumn(key);
    resizeStartX.current = e.pageX;
    resizeStartWidth.current = columnWidths[key];
  };

  const handleSort = (key: ProjectionColumnKey, isCtrl: boolean) => {
    if (resizingColumn || didResizeRef.current) {
      didResizeRef.current = false;
      return;
    }

    setSortCriteria((prev) => {
      const idx = prev.findIndex((s) => s.key === key);
      if (isCtrl) {
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = { ...next[idx], direction: next[idx].direction === 'asc' ? 'desc' : 'asc' };
          return next;
        }
        return [...prev, { key, direction: 'asc' }];
      }
      if (idx >= 0 && prev.length === 1) {
        return [{ key, direction: prev[0].direction === 'asc' ? 'desc' : 'asc' }];
      }
      return [{ key, direction: 'asc' }];
    });
  };

  const filteredRows = useMemo(() => {
    let rows = projection.filter((row) =>
      FILTER_KEYS.every((key) => {
        const term = safeStr(filters[key]).toLowerCase().trim();
        if (!term) return true;
        if (key === 'previsaoAtual') {
          const br = formatDateBR(safeStr(row.previsaoAtual)).toLowerCase();
          return br.includes(term) || safeStr(row.previsaoAtual).toLowerCase().includes(term);
        }
        return safeStr(row[key]).toLowerCase().includes(term);
      })
    );

    rows = rows.filter((row) => {
      if (kpiFilter === 'all') return true;

      const categoria = getCategoriaFromObservacoes(row.observacoes);
      const hasRm = safeStr(row.rm).trim() !== '' && safeStr(row.rm).trim() !== '&nbsp;';
      const isRotaCategoria = categoria && !isCategoriaEspecial(categoria);

      if (kpiFilter === 'so_moveis') return categoria === CATEGORY_REQUISICAO;
      if (kpiFilter === 'g_teresina') return categoria === CATEGORY_ENTREGA_GT;
      if (kpiFilter === 'cliente_busca') return categoria === CATEGORY_RETIRADA;
      if (kpiFilter === 'em_rota') return Boolean(isRotaCategoria && hasRm);
      if (kpiFilter === 'sem_vinculo') return categoria === CATEGORY_INSERIR_ROMANEIO;
      return true;
    });

    if (sortCriteria.length > 0) {
      rows = [...rows].sort((a, b) => {
        for (const criterion of sortCriteria) {
          let aVal: string | number = '';
          let bVal: string | number = '';

          if (criterion.key === 'qtdePendenteReal') {
            aVal = safeNum(a.qtdePendenteReal);
            bVal = safeNum(b.qtdePendenteReal);
          } else if (criterion.key === 'previsaoAtual') {
            aVal = parseOrderDate(safeStr(a.previsaoAtual))?.getTime() || 0;
            bVal = parseOrderDate(safeStr(b.previsaoAtual))?.getTime() || 0;
          } else {
            aVal = safeStr(a[criterion.key]).toLowerCase();
            bVal = safeStr(b[criterion.key]).toLowerCase();
          }

          if (aVal === bVal) continue;
          const cmp = aVal < bVal ? -1 : 1;
          return criterion.direction === 'asc' ? cmp : -cmp;
        }
        return 0;
      });
    }

    return rows;
  }, [projection, filters, sortCriteria, kpiFilter]);

  const kpis = useMemo(() => {
    const horizon = getHorizonInfo();
    const horizonDate = horizon.end;

    const uniqueTotal = new Set(projection.map((r) => safeStr(r.pd).trim()).filter(Boolean)).size;

    const rows = projection.map((r) => {
      const categoria = getCategoriaFromObservacoes(r.observacoes);
      const d = parseOrderDate(safeStr(r.previsaoAtual));
      if (d) d.setHours(0, 0, 0, 0);
      return {
        pedido: safeStr(r.pd).trim(),
        categoria,
        hasRm: safeStr(r.rm).trim() !== '' && safeStr(r.rm).trim() !== '&nbsp;',
        dEntrega: d,
      };
    });

    const inHorizon = (d: Date | null) => !!d && d <= horizonDate;
    const onlyWithPedido = rows.filter((r) => r.pedido);

    const reqRows = onlyWithPedido.filter((r) => r.categoria === CATEGORY_REQUISICAO);
    const gtRows = onlyWithPedido.filter((r) => r.categoria === CATEGORY_ENTREGA_GT);
    const retRows = onlyWithPedido.filter((r) => r.categoria === CATEGORY_RETIRADA);
    const semVincRows = onlyWithPedido.filter((r) => r.categoria === CATEGORY_INSERIR_ROMANEIO);
    const rotaRows = onlyWithPedido.filter((r) => r.categoria && !isCategoriaEspecial(r.categoria) && r.hasRm);

    const reqTotal = new Set(reqRows.map((r) => r.pedido)).size;
    const reqHorizon = new Set(reqRows.filter((r) => inHorizon(r.dEntrega)).map((r) => r.pedido)).size;
    const gtTotal = new Set(gtRows.map((r) => r.pedido)).size;
    const gtHorizon = new Set(gtRows.filter((r) => inHorizon(r.dEntrega)).map((r) => r.pedido)).size;
    const retTotal = new Set(retRows.map((r) => r.pedido)).size;
    const retHorizon = new Set(retRows.filter((r) => inHorizon(r.dEntrega)).map((r) => r.pedido)).size;
    const rotaTotal = new Set(rotaRows.map((r) => r.pedido)).size;
    const rotasUnicas = new Set(rotaRows.map((r) => r.categoria)).size;
    const semVincTotal = new Set(semVincRows.map((r) => r.pedido)).size;

    return {
      uniqueTotal,
      reqTotal,
      reqHorizon,
      gtTotal,
      gtHorizon,
      retTotal,
      retHorizon,
      rotaTotal,
      rotasUnicas,
      semVincTotal,
      horizonLabel: horizon.label,
    };
  }, [projection]);

  const hasActiveFilters = useMemo(
    () => FILTER_KEYS.some((k) => safeStr(filters[k]).trim() !== '') || kpiFilter !== 'all',
    [filters, kpiFilter]
  );

  const clearFilters = () => {
    setFilters({
      idChave: '',
      observacoes: '',
      rm: '',
      pd: '',
      cliente: '',
      cod: '',
      descricaoProduto: '',
      setorProducao: '',
      requisicaoLojaGrupo: '',
      uf: '',
      municipioEntrega: '',
      qtdePendenteReal: '',
      previsaoAtual: '',
    });
    setKpiFilter('all');
  };

  const renderSortIcon = (key: ProjectionColumnKey) => {
    const idx = sortCriteria.findIndex((s) => s.key === key);
    if (idx === -1) return null;
    const criterion = sortCriteria[idx];
    return (
      <div className="inline-flex items-center ml-1 text-[#FFAD00]">
        {criterion.direction === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
        {sortCriteria.length > 1 && <span className="ml-0.5 text-[9px] font-bold">{idx + 1}</span>}
      </div>
    );
  };

  const exportExcel = () => {
    const headers = COLUMNS.map((c) => c.label);
    const rows = filteredRows.map((row) =>
      COLUMNS.map((c) => {
        if (c.key === 'previsaoAtual') return formatDateBR(safeStr(row.previsaoAtual));
        return row[c.key];
      })
    );
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws['!cols'] = COLUMNS.map((c) => ({ wch: Math.max(12, Math.floor(columnWidths[c.key] / 8)) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Romaneio');
    XLSX.writeFile(wb, 'romaneio_projecao.xlsx');
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[#cfd8ea] dark:border-gray-700 overflow-hidden shadow-sm bg-[#f7f9fd] dark:bg-[#252525]">
        <div className="p-4 grid grid-cols-1 md:grid-cols-6 gap-3 bg-[#f1f5ff] dark:bg-[#1a1a1a] border-b border-[#dce3f1] dark:border-gray-800">
          <KpiCard icon={<ShoppingCart className="text-[#1E22AA]" />} label="Total Pedidos Únicos" value={kpis.uniqueTotal} active={kpiFilter === 'all'} onClick={() => setKpiFilter('all')} />
          <KpiCard icon={<Store className="text-emerald-600" />} label="Requisições" value={kpis.reqTotal} subLabel={`No Horizonte: ${kpis.horizonLabel.replace('Horizonte: ', '')}`} subValue={kpis.reqHorizon} active={kpiFilter === 'so_moveis'} onClick={() => setKpiFilter('so_moveis')} />
          <KpiCard icon={<MapPin className="text-blue-600" />} label="Entrega em Grande Teresina" value={kpis.gtTotal} subLabel={`No Horizonte: ${kpis.horizonLabel.replace('Horizonte: ', '')}`} subValue={kpis.gtHorizon} active={kpiFilter === 'g_teresina'} onClick={() => setKpiFilter('g_teresina')} />
          <KpiCard icon={<User className="text-purple-600" />} label="Retirada" value={kpis.retTotal} subLabel={`No Horizonte: ${kpis.horizonLabel.replace('Horizonte: ', '')}`} subValue={kpis.retHorizon} active={kpiFilter === 'cliente_busca'} onClick={() => setKpiFilter('cliente_busca')} />
          <KpiCard icon={<Truck className="text-blue-500" />} label="Pedidos em Rota" value={kpis.rotaTotal} subLabel="Total de rotas" subValue={kpis.rotasUnicas} active={kpiFilter === 'em_rota'} onClick={() => setKpiFilter('em_rota')} />
          <KpiCard icon={<AlertCircle className="text-red-500" />} label="Pedidos Sem Vínculo" value={kpis.semVincTotal} active={kpiFilter === 'sem_vinculo'} onClick={() => setKpiFilter('sem_vinculo')} />
        </div>

        <div className="p-4 border-b border-[#dce3f1] dark:border-gray-800 flex justify-between items-center bg-gradient-to-r from-[#041E42] to-[#1E22AA]">
          <div className="flex items-center gap-4">
            <h3 className="font-bold text-sm text-white">Romaneio / Pedidos (Espelho da Projeção)</h3>
            <div className="text-[10px] text-white/90 bg-white/10 px-2 py-0.5 rounded border border-white/20">
              Mostrando {filteredRows.length} de {projection.length} itens
            </div>
          </div>
          <div className="flex gap-3 items-center">
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="text-[10px] font-black text-[#FFAD00] hover:text-yellow-300 uppercase flex items-center gap-1.5"
              >
                <X className="w-3.5 h-3.5" /> Limpar Filtros
              </button>
            )}
            <button
              onClick={exportExcel}
              className="text-[11px] font-bold flex items-center gap-2 bg-white text-[#041E42] border border-white/30 px-4 py-1.5 rounded hover:bg-[#f3f6ff] transition-colors shadow-sm active:scale-95"
            >
              <Download className="w-3.5 h-3.5" /> Excel
            </button>
          </div>
        </div>

        <div className="p-3 bg-[#eef3fb] dark:bg-[#1a1a1a] border-b border-[#dce3f1] dark:border-gray-700 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
          {FILTER_KEYS.map((key) => {
            const col = COLUMNS.find((c) => c.key === key)!;
            return (
              <input
                key={`f-${col.key}`}
                type="text"
                placeholder={`Filtro ${col.label}`}
                value={filters[col.key]}
                onChange={(e) => setFilters((prev) => ({ ...prev, [col.key]: e.target.value }))}
                className="bg-white dark:bg-[#2a2a2a] text-[10px] border border-[#c6d3ee] dark:border-gray-600 rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-[#1E22AA] text-gray-900 dark:text-gray-100 transition-all placeholder:text-gray-500"
              />
            );
          })}
        </div>

        <div className="overflow-auto max-h-[650px]">
          <table className="w-full text-left text-xs border-separate border-spacing-0 table-fixed">
            <colgroup>
              {COLUMNS.map((col) => (
                <col key={`col-${col.key}`} style={{ width: `${columnWidths[col.key]}px` }} />
              ))}
            </colgroup>
            <thead className="bg-[#041E42] sticky top-0 z-20 text-white uppercase tracking-wider shadow-sm">
              <tr>
                {COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    className="px-3 py-3 font-bold cursor-pointer hover:bg-[#1E22AA] transition-colors relative select-none border-r border-[#2d4472]"
                    style={{ width: columnWidths[col.key], minWidth: columnWidths[col.key] }}
                    onClick={(e) => handleSort(col.key, e.ctrlKey)}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="truncate">{col.label}</span>
                      {renderSortIcon(col.key)}
                    </div>
                    <div
                      className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-[#FFAD00]/40 transition-colors"
                      onMouseDown={(e) => startResizing(e, col.key)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="text-gray-800 dark:text-gray-300">
              {filteredRows.map((row, idx) => (
                <tr
                  key={`${row.idChave}-${idx}`}
                  className={`${idx % 2 === 0 ? 'bg-white dark:bg-[#252525]' : 'bg-[#f4f7fc] dark:bg-[#2a2a2a]'} hover:bg-[#e8eefb] dark:hover:bg-gray-800/30 transition-colors`}
                >
                  {COLUMNS.map((col) => (
                    <td
                      key={`${row.idChave}-${col.key}-${idx}`}
                      style={{ width: `${columnWidths[col.key]}px`, minWidth: `${columnWidths[col.key]}px`, maxWidth: `${columnWidths[col.key]}px` }}
                      className="px-3 py-2 border-b border-[#e2e8f4] dark:border-gray-800 whitespace-nowrap truncate"
                      title={col.key === 'previsaoAtual' ? formatDateBR(safeStr(row.previsaoAtual)) : safeStr(row[col.key])}
                    >
                      {col.key === 'previsaoAtual' ? formatDateBR(safeStr(row.previsaoAtual)) : safeStr(row[col.key])}
                    </td>
                  ))}
                </tr>
              ))}
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={COLUMNS.length} className="px-4 py-12 text-center text-neutral italic">
                    Nenhum item corresponde aos filtros.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const KpiCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: number;
  subLabel?: string;
  subValue?: number;
  active?: boolean;
  onClick?: () => void;
}> = ({ icon, label, value, subLabel, subValue, active, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`text-left bg-white dark:bg-[#252525] rounded-xl border px-3 py-2 shadow-sm transition-all ${
      active ? 'border-[#1E22AA] ring-1 ring-[#1E22AA]' : 'border-[#d7dfee] dark:border-gray-700 hover:border-[#1E22AA]/60'
    }`}
  >
    <div className="flex items-center gap-2">
      <div className="p-2 rounded-lg bg-[#f4f7ff] dark:bg-[#1a1a1a]">{icon}</div>
      <div className="min-w-0">
        <p className="text-[9px] uppercase tracking-wider font-bold text-neutral truncate">{label}</p>
        <p className="text-xl font-black text-[#041E42] dark:text-gray-100 leading-none">{value}</p>
        {subValue !== undefined && (
          <p className="text-[9px] text-neutral leading-none mt-1 truncate">
            {subLabel}: <span className="font-bold">{subValue}</span>
          </p>
        )}
      </div>
    </div>
  </button>
);

export default OrdersView;
