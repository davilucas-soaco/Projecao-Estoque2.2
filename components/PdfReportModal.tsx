import React, { useState, useMemo, useEffect } from 'react';
import { X, FileDown, SlidersHorizontal } from 'lucide-react';
import { ProductConsolidated, ComponentData, ProjecaoImportada } from '../types';
import {
  ROUTE_SO_MOVEIS,
  SUPERVISAO_SO_MOVEIS,
  SUPERVISAO_ENTREGA_GT,
  SUPERVISAO_RETIRADA,
  extractRotasFromProjection,
  dateToKey,
} from '../utils';
import { generateProjectionPdfV3, generateProjectionPdfV2Supervisao } from '../utils/pdfReport';
import { recalculateConsumptionForVisibleColumns } from '../consolidation';

interface DateColumn {
  key: string;
  label: string;
  date: Date | null;
  isAtrasados: boolean;
}

interface ColOption {
  key: string;
  label: string;
  isSoMoveis: boolean;
}

interface SupervisaoColOption {
  key: string;
  label: string;
}

interface Props {
  onClose: () => void;
  getDataForPdf: (considerarRequisicoes: boolean) => ProductConsolidated[];
  dateColumns: DateColumn[];
  horizonLabel: string;
  todayStart: Date;
  companyLogo: string | null;
  currentUserName: string;
  reportTitle?: string;
  projection?: ProjecaoImportada[];
  /** Linha de texto para o cabeçalho do PDF evidenciando filtros aplicados */
  appliedFilters?: string;
}

const PdfReportModal: React.FC<Props> = ({
  onClose,
  getDataForPdf,
  dateColumns,
  horizonLabel,
  todayStart,
  companyLogo,
  currentUserName,
  reportTitle = 'Relatório de Projeção de Estoque',
  projection = [],
  appliedFilters,
}) => {
  const [selectedColumnKeys, setSelectedColumnKeys] = useState<Set<string>>(new Set());
  const [showColumnFilter, setShowColumnFilter] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [relatorioSupervisao, setRelatorioSupervisao] = useState<boolean | null>(null);
  const [selectedSupervisaoKeys, setSelectedSupervisaoKeys] = useState<Set<string>>(new Set());
  const [filtroResultado, setFiltroResultado] = useState<'faltantes' | 'estoque' | 'todos'>('todos');

  const rotasSupervisao = useMemo(() => extractRotasFromProjection(projection), [projection]);

  const basePdfData = useMemo(() => getDataForPdf(true), [getDataForPdf]);

  const allSupervisaoColumns = useMemo((): SupervisaoColOption[] => {
    const base: SupervisaoColOption[] = [
      { key: SUPERVISAO_SO_MOVEIS, label: 'Só Móveis' },
      { key: SUPERVISAO_ENTREGA_GT, label: 'Entrega G. Teresina' },
      { key: SUPERVISAO_RETIRADA, label: 'Retirada' },
      ...rotasSupervisao.map((r) => ({ key: r.key, label: r.label })),
    ];
    return base;
  }, [rotasSupervisao]);

  const allColumns = useMemo((): ColOption[] => {
    const isDateKey = (key: string) => /^\d{4}-\d{2}-\d{2}$/.test(key);
    const hasPedidoInKey = (item: ProductConsolidated | ComponentData, key: string) =>
      (item.routeData?.[key]?.pedido ?? 0) > 0;

    const base = [{ key: ROUTE_SO_MOVEIS, label: 'Só Móveis', isSoMoveis: true }];
    const rest = dateColumns
      .filter((c) => c.key !== ROUTE_SO_MOVEIS)
      .filter((c) => {
        // Para datas, só mostra no modal se existir pedido em pelo menos uma linha/componente.
        if (!isDateKey(c.key)) return true;
        return basePdfData.some((item) => {
          if (hasPedidoInKey(item, c.key)) return true;
          if (item.isShelf && item.components?.length) {
            return item.components.some((comp) => hasPedidoInKey(comp, c.key));
          }
          return false;
        });
      })
      .map((c) => ({ key: c.key, label: c.label, isSoMoveis: false }));
    return [...base, ...rest];
  }, [dateColumns, basePdfData]);

  const visibleColumns = useMemo(
    () => allColumns.filter((c) => selectedColumnKeys.has(c.key)),
    [allColumns, selectedColumnKeys]
  );

  const visibleSupervisaoColumns = useMemo(
    () => allSupervisaoColumns.filter((c) => selectedSupervisaoKeys.has(c.key)),
    [allSupervisaoColumns, selectedSupervisaoKeys]
  );

  /** Última data entre as rotas selecionadas no filtro. Usada como horizonte máximo de consumo para Só Móveis, Entrega GT e Retirada (modo supervisão). */
  const maxHorizonEndDate = useMemo(() => {
    const rotaKeys = new Set(visibleSupervisaoColumns.map((c) => c.key).filter((k) => k.startsWith('rota|')));
    if (rotaKeys.size === 0) return undefined;
    let maxDate: Date | null = null;
    for (const r of rotasSupervisao) {
      if (rotaKeys.has(r.key) && r.previsaoDate) {
        if (!maxDate || r.previsaoDate > maxDate) maxDate = r.previsaoDate;
      }
    }
    return maxDate ?? undefined;
  }, [visibleSupervisaoColumns, rotasSupervisao]);

  /** Última data entre as colunas selecionadas no modo normal. Igual ao padrão do modo supervisão. */
  const maxHorizonEndDateForNormal = useMemo(() => {
    let maxDate: Date | null = null;
    for (const col of visibleColumns) {
      const dc = dateColumns.find((d) => d.key === col.key);
      if (dc?.date && (!maxDate || dc.date > maxDate)) maxDate = dc.date;
    }
    return maxDate ?? undefined;
  }, [visibleColumns, dateColumns]);

  const allColumnsSelected =
    allColumns.length > 0 && allColumns.every((c) => selectedColumnKeys.has(c.key));
  const selectedCountLabel = allColumnsSelected
    ? 'Todas as colunas selecionadas'
    : `${selectedColumnKeys.size} colunas selecionadas`;
  const allSupervisaoColumnsSelected =
    allSupervisaoColumns.length > 0 &&
    allSupervisaoColumns.every((c) => selectedSupervisaoKeys.has(c.key));

  const isV2Supervisao = relatorioSupervisao === true;

  useEffect(() => {
    if (!isV2Supervisao) {
      setSelectedColumnKeys(new Set(allColumns.map((c) => c.key)));
    }
  }, [allColumns, isV2Supervisao]);

  useEffect(() => {
    if (relatorioSupervisao === true) {
      setSelectedSupervisaoKeys(new Set(allSupervisaoColumns.map((c) => c.key)));
    }
  }, [relatorioSupervisao, allSupervisaoColumns]);

  const handleGenerate = async () => {
    if (isV2Supervisao) {
      if (visibleSupervisaoColumns.length === 0) {
        setErrorMsg('Selecione pelo menos uma categoria para incluir no relatório.');
        return;
      }
    } else {
      if (visibleColumns.length === 0) {
        setErrorMsg('Selecione pelo menos uma coluna para incluir no relatório.');
        return;
      }
    }

    setGenerating(true);
    setErrorMsg('');
    try {
      let data = getDataForPdf(true);
      if (isV2Supervisao) {
        const visKeys = visibleSupervisaoColumns.map((c) => c.key);
        const routeDataKeysSet = new Set<string>();
        if (visKeys.includes(SUPERVISAO_SO_MOVEIS)) routeDataKeysSet.add(ROUTE_SO_MOVEIS);
        if (visKeys.some((k) => k === SUPERVISAO_ENTREGA_GT || k === SUPERVISAO_RETIRADA || k.startsWith('rota|'))) {
          routeDataKeysSet.add('ATRASADOS');
          dateColumns.filter((c) => !c.isAtrasados).forEach((c) => routeDataKeysSet.add(c.key));
          // Incluir datas das rotas visíveis (dados de rota ficam sob a chave da data de previsão)
          for (const r of rotasSupervisao) {
            if (visKeys.includes(r.key) && r.previsaoDate) {
              routeDataKeysSet.add(dateToKey(r.previsaoDate));
            }
          }
        }
        const routeDataKeys = Array.from(routeDataKeysSet);
        if (routeDataKeys.length > 0) {
          data = recalculateConsumptionForVisibleColumns(data, routeDataKeys, true, dateColumns);
        }
      } else {
        data = recalculateConsumptionForVisibleColumns(
          data,
          visibleColumns.map((c) => c.key),
          true,
          dateColumns
        );
      }
      const colCount = isV2Supervisao ? visibleSupervisaoColumns.length : visibleColumns.length;
      const filtroLabel =
        filtroResultado === 'faltantes'
          ? 'apenas faltantes'
          : filtroResultado === 'estoque'
            ? 'apenas em estoque'
            : 'todos';
      const pdfConfigText = `Configurações do PDF: Gerar relatório de supervisão? -${isV2Supervisao ? 'sim' : 'não'}; Colunas a incluir -${colCount}; Tipo de resultado: -${filtroLabel} .`;
      if (isV2Supervisao) {
        const colOpts = visibleSupervisaoColumns.map((c) => ({ key: c.key, label: c.label }));
        const visibleRouteDateKeys = visibleSupervisaoColumns
          .filter((c) => c.key.startsWith('rota|'))
          .map((c) => rotasSupervisao.find((r) => r.key === c.key)?.previsaoDate)
          .filter((d): d is Date => !!d)
          .map((d) => dateToKey(d));
        await generateProjectionPdfV2Supervisao({
          data,
          visibleColumns: colOpts,
          filtroResultado,
          horizonLabel,
          todayStart,
          companyLogo,
          currentUserName,
          reportTitle,
          orientation: 'l',
          dateColumns,
          appliedFilters: pdfConfigText,
          maxHorizonEndDate,
          visibleRouteDateKeys: [...new Set(visibleRouteDateKeys)],
        });
      } else {
        const colOpts = visibleColumns.map((c) => ({ key: c.key, label: c.label, isSoMoveis: c.isSoMoveis }));
        await generateProjectionPdfV3({
          data,
          visibleColumns: colOpts,
          horizonLabel,
          companyLogo,
          currentUserName,
          reportTitle,
          orientation: 'l',
          appliedFilters: pdfConfigText,
          dateColumns,
          todayStart,
          maxHorizonEndDate: maxHorizonEndDateForNormal,
          filtroResultado,
        });
      }
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao gerar PDF.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-[#252525] rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <FileDown className="w-5 h-5 text-secondary" />
            Gerar Relatório PDF
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-4 overflow-auto flex-1 space-y-5">
          <div>
              <p className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-3">
                Gerar relatório de supervisão?
              </p>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="supervisao"
                    checked={relatorioSupervisao === true}
                    onChange={() => setRelatorioSupervisao(true)}
                  />
                  <span className="text-sm">Sim</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="supervisao"
                    checked={relatorioSupervisao === false}
                    onChange={() => setRelatorioSupervisao(false)}
                  />
                  <span className="text-sm">Não</span>
                </label>
              </div>
            </div>

          {isV2Supervisao ? (
            <>
              <div className="relative">
                <p className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-2">
                  Colunas a incluir
                </p>
                <button
                  type="button"
                  onClick={() => setShowColumnFilter((p) => !p)}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  Filtro de Categorias
                </button>
                <p className="mt-1 text-[10px] text-neutral font-semibold">
                  {selectedSupervisaoKeys.size} categorias selecionadas
                </p>
                {showColumnFilter && (
                  <div className="absolute left-0 mt-2 z-10 w-72 max-h-60 overflow-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#252525] shadow-xl p-2">
                    <div className="flex items-center justify-between mb-2 px-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-neutral">
                        Categorias visíveis
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          if (allSupervisaoColumnsSelected) {
                            setSelectedSupervisaoKeys(new Set());
                          } else {
                            setSelectedSupervisaoKeys(new Set(allSupervisaoColumns.map((c) => c.key)));
                          }
                        }}
                        className="text-[10px] font-bold text-secondary hover:underline"
                      >
                        {allSupervisaoColumnsSelected ? 'Desmarcar todas' : 'Selecionar todas'}
                      </button>
                    </div>
                    <div className="space-y-1">
                      {allSupervisaoColumns.map((col) => (
                        <label
                          key={col.key}
                          className="flex items-center gap-2 text-xs px-1 py-1 rounded hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={selectedSupervisaoKeys.has(col.key)}
                            onChange={(e) => {
                              setSelectedSupervisaoKeys((prev) => {
                                const next = new Set(prev);
                                if (e.target.checked) next.add(col.key);
                                else next.delete(col.key);
                                return next;
                              });
                            }}
                          />
                          <span>{col.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>

            </>
          ) : (
            <>
              <div className="relative">
                    <p className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-2">
                      Colunas a incluir
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowColumnFilter((p) => !p)}
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
                    >
                      <SlidersHorizontal className="w-3.5 h-3.5" />
                      Filtro de Colunas
                    </button>
                    <p className="mt-1 text-[10px] text-neutral font-semibold">{selectedCountLabel}</p>
                    {showColumnFilter && (
                      <div className="absolute left-0 mt-2 z-10 w-72 max-h-60 overflow-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#252525] shadow-xl p-2">
                        <div className="flex items-center justify-between mb-2 px-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-neutral">
                            Colunas visíveis
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              if (allColumnsSelected) {
                                setSelectedColumnKeys(new Set());
                              } else {
                                setSelectedColumnKeys(new Set(allColumns.map((c) => c.key)));
                              }
                            }}
                            className="text-[10px] font-bold text-secondary hover:underline"
                          >
                            {allColumnsSelected ? 'Desmarcar todas' : 'Selecionar todas'}
                          </button>
                        </div>
                        <div className="space-y-1">
                          {allColumns.map((col) => (
                            <label
                              key={col.key}
                              className="flex items-center gap-2 text-xs px-1 py-1 rounded hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={selectedColumnKeys.has(col.key)}
                                onChange={(e) => {
                                  setSelectedColumnKeys((prev) => {
                                    const next = new Set(prev);
                                    if (e.target.checked) next.add(col.key);
                                    else next.delete(col.key);
                                    return next;
                                  });
                                }}
                              />
                              <span>{col.label}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

            </>
          )}

          {((isV2Supervisao && visibleSupervisaoColumns.length > 0) ||
            (!isV2Supervisao && visibleColumns.length > 0)) && (
            <div>
              <p className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-2">
                Tipo de resultado a imprimir
              </p>
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="filtroResultado"
                    checked={filtroResultado === 'faltantes'}
                    onChange={() => setFiltroResultado('faltantes')}
                  />
                  <span className="text-sm">Apenas os faltantes</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="filtroResultado"
                    checked={filtroResultado === 'estoque'}
                    onChange={() => setFiltroResultado('estoque')}
                  />
                  <span className="text-sm">Apenas os em estoque</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="filtroResultado"
                    checked={filtroResultado === 'todos'}
                    onChange={() => setFiltroResultado('todos')}
                  />
                  <span className="text-sm">Todos os resultados</span>
                </label>
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">
              {errorMsg}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg font-semibold text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleGenerate}
            disabled={
              generating ||
              relatorioSupervisao === null ||
              (isV2Supervisao
                ? visibleSupervisaoColumns.length === 0
                : visibleColumns.length === 0)
            }
            className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm bg-secondary hover:bg-blue-700 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generating ? 'Gerando...' : 'Gerar PDF'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PdfReportModal;

