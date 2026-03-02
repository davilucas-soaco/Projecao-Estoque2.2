import React, { useState, useMemo, useEffect } from 'react';
import { X, FileDown, SlidersHorizontal } from 'lucide-react';
import { ProductConsolidated, ComponentData, ProjecaoImportada } from '../types';
import {
  ROUTE_SO_MOVEIS,
  SUPERVISAO_SO_MOVEIS,
  SUPERVISAO_ENTREGA_GT,
  SUPERVISAO_RETIRADA,
  extractRotasFromProjection,
} from '../utils';
import { generateProjectionPdfV2, generateProjectionPdfV3, generateProjectionPdfV2Supervisao } from '../utils/pdfReport';

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
}) => {
  const [pdfVersion, setPdfVersion] = useState<'v1' | 'v2'>('v1');
  const [considerarRequisicoes, setConsiderarRequisicoes] = useState<boolean | null>(null);
  const [selectedColumnKeys, setSelectedColumnKeys] = useState<Set<string>>(new Set());
  const [showColumnFilter, setShowColumnFilter] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [relatorioSupervisao, setRelatorioSupervisao] = useState<boolean | null>(null);
  const [selectedSupervisaoKeys, setSelectedSupervisaoKeys] = useState<Set<string>>(new Set());
  const [colunaPrincipalSupervisao, setColunaPrincipalSupervisao] = useState<string>('');
  const [filtroResultadoSupervisao, setFiltroResultadoSupervisao] = useState<'faltantes' | 'estoque' | 'todos'>('todos');

  const rotasSupervisao = useMemo(() => extractRotasFromProjection(projection), [projection]);

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
    const base = considerarRequisicoes
      ? [{ key: ROUTE_SO_MOVEIS, label: 'Só Móveis', isSoMoveis: true }]
      : [];
    return [
      ...base,
      ...dateColumns.map((c) => ({ key: c.key, label: c.label, isSoMoveis: false })),
    ];
  }, [considerarRequisicoes, dateColumns]);

  const visibleColumns = useMemo(
    () => allColumns.filter((c) => selectedColumnKeys.has(c.key)),
    [allColumns, selectedColumnKeys]
  );

  const visibleSupervisaoColumns = useMemo(
    () => allSupervisaoColumns.filter((c) => selectedSupervisaoKeys.has(c.key)),
    [allSupervisaoColumns, selectedSupervisaoKeys]
  );

  const allColumnsSelected =
    selectedColumnKeys.size === allColumns.length && allColumns.length > 0;
  const selectedCountLabel = allColumnsSelected
    ? 'Todas as colunas selecionadas'
    : `${selectedColumnKeys.size} colunas selecionadas`;
  const allSupervisaoColumnsSelected =
    selectedSupervisaoKeys.size === allSupervisaoColumns.length && allSupervisaoColumns.length > 0;

  const isV2Supervisao = pdfVersion === 'v2' && relatorioSupervisao === true;

  useEffect(() => {
    if (considerarRequisicoes !== null && !isV2Supervisao) {
      setSelectedColumnKeys(new Set(allColumns.map((c) => c.key)));
    }
  }, [considerarRequisicoes, allColumns, isV2Supervisao]);

  useEffect(() => {
    if (relatorioSupervisao === true) {
      setConsiderarRequisicoes(true);
      setSelectedSupervisaoKeys(new Set(allSupervisaoColumns.map((c) => c.key)));
    }
  }, [relatorioSupervisao, allSupervisaoColumns]);

  useEffect(() => {
    if (pdfVersion !== 'v2') setRelatorioSupervisao(null);
  }, [pdfVersion]);

  const handleGenerate = async () => {
    if (isV2Supervisao) {
      if (visibleSupervisaoColumns.length === 0) {
        setErrorMsg('Selecione pelo menos uma categoria para incluir no relatório.');
        return;
      }
      if (!colunaPrincipalSupervisao) {
        setErrorMsg('O campo "Coluna Principal (base para status)" não foi preenchido. Selecione uma opção.');
        return;
      }
    } else {
      if (considerarRequisicoes === null) {
        setErrorMsg('Selecione se deseja considerar requisições na projeção.');
        return;
      }
      if (visibleColumns.length === 0) {
        setErrorMsg('Selecione pelo menos uma coluna para incluir no relatório.');
        return;
      }
    }

    setGenerating(true);
    setErrorMsg('');
    try {
      const data = getDataForPdf(considerarRequisicoes ?? true);
      if (isV2Supervisao) {
        const colOpts = visibleSupervisaoColumns.map((c) => ({ key: c.key, label: c.label }));
        await generateProjectionPdfV2Supervisao({
          data,
          visibleColumns: colOpts,
          colunaPrincipal: colunaPrincipalSupervisao,
          filtroResultado: filtroResultadoSupervisao,
          horizonLabel,
          todayStart,
          companyLogo,
          currentUserName,
          reportTitle,
          orientation: 'l',
          dateColumns,
        });
      } else {
        const colOpts = visibleColumns.map((c) => ({ key: c.key, label: c.label, isSoMoveis: c.isSoMoveis }));
        if (pdfVersion === 'v1') {
          await generateProjectionPdfV2({
            data,
            visibleColumns: colOpts,
            horizonLabel,
            companyLogo,
            currentUserName,
            reportTitle,
          });
        } else {
          await generateProjectionPdfV3({
            data,
            visibleColumns: colOpts,
            horizonLabel,
            companyLogo,
            currentUserName,
            reportTitle,
            orientation: 'l',
          });
        }
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
              Versão do PDF
            </p>
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="pdfVersion"
                  checked={pdfVersion === 'v1'}
                  onChange={() => setPdfVersion('v1')}
                />
                <span className="text-sm">V.1 — Formato vertical agrupado por nome de coluna</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="pdfVersion"
                  checked={pdfVersion === 'v2'}
                  onChange={() => setPdfVersion('v2')}
                />
                <span className="text-sm">V.2 — Formato Horizontal + Visão Gestor</span>
              </label>
            </div>
          </div>

          {pdfVersion === 'v2' && (
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
          )}

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

              {visibleSupervisaoColumns.length > 0 && (
                <>
                  <div>
                    <p className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-2">
                      Coluna Principal (base para status)
                    </p>
                    <select
                      value={colunaPrincipalSupervisao}
                      onChange={(e) => setColunaPrincipalSupervisao(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-[#1f1f1f] text-sm font-semibold text-gray-800 dark:text-gray-200"
                    >
                      <option value="">Selecione a coluna principal...</option>
                      {visibleSupervisaoColumns.map((c) => (
                        <option key={c.key} value={c.key}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <p className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-2">
                      Tipo de resultado a imprimir
                    </p>
                    <div className="flex flex-col gap-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="filtroResultado"
                          checked={filtroResultadoSupervisao === 'faltantes'}
                          onChange={() => setFiltroResultadoSupervisao('faltantes')}
                        />
                        <span className="text-sm">Apenas os faltantes</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="filtroResultado"
                          checked={filtroResultadoSupervisao === 'estoque'}
                          onChange={() => setFiltroResultadoSupervisao('estoque')}
                        />
                        <span className="text-sm">Apenas os em estoque</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="filtroResultado"
                          checked={filtroResultadoSupervisao === 'todos'}
                          onChange={() => setFiltroResultadoSupervisao('todos')}
                        />
                        <span className="text-sm">Todos os resultados</span>
                      </label>
                    </div>
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              <div>
                <p className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-3">
                  Considerar Requisições na projeção?
                </p>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="requisicoes"
                      checked={considerarRequisicoes === true}
                      onChange={() => setConsiderarRequisicoes(true)}
                    />
                    <span className="text-sm">Sim</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="requisicoes"
                      checked={considerarRequisicoes === false}
                      onChange={() => setConsiderarRequisicoes(false)}
                    />
                    <span className="text-sm">Não</span>
                  </label>
                </div>
                {considerarRequisicoes === false && (
                  <p className="text-[11px] text-neutral mt-1">
                    A coluna &quot;Só Móveis&quot; não será exibida no relatório.
                  </p>
                )}
              </div>

              {considerarRequisicoes !== null && (
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
            </>
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
              (pdfVersion === 'v2' && relatorioSupervisao === null) ||
              (isV2Supervisao
                ? visibleSupervisaoColumns.length === 0
                : considerarRequisicoes === null || visibleColumns.length === 0)
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
