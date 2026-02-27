import React, { useState, useMemo } from 'react';
import { X, FileDown, SlidersHorizontal } from 'lucide-react';
import { ProductConsolidated, ComponentData } from '../types';
import { ROUTE_SO_MOVEIS } from '../utils';
import { generateProjectionPdf, generateProjectionPdfV2 } from '../utils/pdfReport';

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

interface Props {
  onClose: () => void;
  getDataForPdf: (considerarRequisicoes: boolean) => ProductConsolidated[];
  dateColumns: DateColumn[];
  horizonLabel: string;
  companyLogo: string | null;
  currentUserName: string;
  reportTitle?: string;
}

const PdfReportModal: React.FC<Props> = ({
  onClose,
  getDataForPdf,
  dateColumns,
  horizonLabel,
  companyLogo,
  currentUserName,
  reportTitle = 'Relatório de Projeção de Estoque',
}) => {
  const [pdfVersion, setPdfVersion] = useState<'v1' | 'v2'>('v1');
  const [considerarRequisicoes, setConsiderarRequisicoes] = useState<boolean | null>(null);
  const [selectedColumnKeys, setSelectedColumnKeys] = useState<Set<string>>(new Set());
  const [orientation, setOrientation] = useState<'p' | 'l'>('l');
  const [showColumnFilter, setShowColumnFilter] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

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

  const allColumnsSelected =
    selectedColumnKeys.size === allColumns.length && allColumns.length > 0;
  const selectedCountLabel = allColumnsSelected
    ? 'Todas as colunas selecionadas'
    : `${selectedColumnKeys.size} colunas selecionadas`;

  React.useEffect(() => {
    if (considerarRequisicoes !== null) {
      setSelectedColumnKeys(new Set(allColumns.map((c) => c.key)));
    }
  }, [considerarRequisicoes, allColumns]);

  const handleGenerate = async () => {
    if (considerarRequisicoes === null) {
      setErrorMsg('Selecione se deseja considerar requisições na projeção.');
      return;
    }
    if (visibleColumns.length === 0) {
      setErrorMsg('Selecione pelo menos uma coluna para incluir no relatório.');
      return;
    }

    setGenerating(true);
    setErrorMsg('');
    try {
      const data = getDataForPdf(considerarRequisicoes);
      const colOpts = visibleColumns.map((c) => ({ key: c.key, label: c.label, isSoMoveis: c.isSoMoveis }));
      if (pdfVersion === 'v2') {
        await generateProjectionPdfV2({
          data,
          visibleColumns: colOpts,
          horizonLabel,
          companyLogo,
          currentUserName,
          reportTitle,
        });
      } else {
        await generateProjectionPdf({
          data,
          visibleColumns: colOpts,
          horizonLabel,
          companyLogo,
          currentUserName,
          reportTitle,
          orientation,
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
                <span className="text-sm">V.1 — Formato horizontal (datas em colunas)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="pdfVersion"
                  checked={pdfVersion === 'v2'}
                  onChange={() => setPdfVersion('v2')}
                />
                <span className="text-sm">V.2 — Formato vertical por data (compacto, retrato A4)</span>
              </label>
            </div>
          </div>

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
              {pdfVersion === 'v1' && (
                <div>
                  <p className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-2">
                    Orientação do relatório
                  </p>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="orientation"
                        checked={orientation === 'l'}
                        onChange={() => setOrientation('l')}
                      />
                      <span className="text-sm">Paisagem</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="orientation"
                        checked={orientation === 'p'}
                        onChange={() => setOrientation('p')}
                      />
                      <span className="text-sm">Retrato</span>
                    </label>
                  </div>
                </div>
              )}

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
            disabled={considerarRequisicoes === null || generating}
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
