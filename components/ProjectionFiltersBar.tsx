import React, { useEffect, useMemo, useState } from 'react';
import { FileDown, ChevronsUpDown, Filter, Trash2 } from 'lucide-react';
import type { ProjecaoImportada } from '../types';
import {
  extractRotasFromProjection,
  CATEGORY_REQUISICAO,
  CATEGORY_ENTREGA_GT,
} from '../utils';
import MultiSelectWithSearch, { MultiSelectOption } from './MultiSelectWithSearch';

interface DateOption {
  key: string;
  label: string;
}

interface ProjectionFiltersBarProps {
  projectionSource: ProjecaoImportada[];
  selectedRotas: Set<string>;
  onSelectedRotasChange: (v: Set<string>) => void;
  selectedSetores: Set<string>;
  onSelectedSetoresChange: (v: Set<string>) => void;
  dateOptions: DateOption[];
  selectedDateKeys: Set<string>;
  onSelectedDateKeysChange: (v: Set<string>) => void;
  ignorePreviousConsumptions: boolean;
  onIgnorePreviousConsumptionsChange: (value: boolean) => void;
  onClearTableFilters?: () => void;
  onGeneratePdf: () => void;
  /** Ref do container fullscreen — usado para renderizar dropdowns dentro dele (filtros funcionam em tela cheia) */
  portalContainerRef?: React.RefObject<HTMLDivElement | null>;
}

const ProjectionFiltersBar: React.FC<ProjectionFiltersBarProps> = ({
  projectionSource,
  selectedRotas,
  onSelectedRotasChange,
  selectedSetores,
  onSelectedSetoresChange,
  dateOptions,
  selectedDateKeys,
  onSelectedDateKeysChange,
  ignorePreviousConsumptions,
  onIgnorePreviousConsumptionsChange,
  onClearTableFilters,
  onGeneratePdf,
  portalContainerRef,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const [showIgnorePrompt, setShowIgnorePrompt] = useState(false);
  const [pendingIgnoreChoice, setPendingIgnoreChoice] = useState(false);

  // Draft state – só aplica ao clicar em "Aplicar Filtro" (código/descrição vem da tabela)
  const [draftRotas, setDraftRotas] = useState<Set<string>>(new Set(selectedRotas));
  const [draftSetores, setDraftSetores] = useState<Set<string>>(new Set(selectedSetores));
  const [draftDateKeys, setDraftDateKeys] = useState<Set<string>>(new Set(selectedDateKeys));
  const [draftIgnore, setDraftIgnore] = useState(ignorePreviousConsumptions);

  // Sincroniza draft quando os props (estado aplicado) mudam externamente
  useEffect(() => {
    setDraftRotas(new Set(selectedRotas));
    setDraftSetores(new Set(selectedSetores));
    setDraftDateKeys(new Set(selectedDateKeys));
    setDraftIgnore(ignorePreviousConsumptions);
  }, [selectedRotas, selectedSetores, selectedDateKeys, ignorePreviousConsumptions]);

  const applyFilters = () => {
    onSelectedRotasChange(new Set(draftRotas));
    onSelectedSetoresChange(new Set(draftSetores));
    onSelectedDateKeysChange(new Set(draftDateKeys));
    onIgnorePreviousConsumptionsChange(draftIgnore);
  };

  const openApplyPrompt = () => {
    setPendingIgnoreChoice(draftIgnore);
    setShowIgnorePrompt(true);
  };

  const confirmApplyFilters = () => {
    setDraftIgnore(pendingIgnoreChoice);
    onSelectedRotasChange(new Set(draftRotas));
    onSelectedSetoresChange(new Set(draftSetores));
    onSelectedDateKeysChange(new Set(draftDateKeys));
    onIgnorePreviousConsumptionsChange(pendingIgnoreChoice);
    setShowIgnorePrompt(false);
  };

  const clearFilters = () => {
    setDraftRotas(new Set());
    setDraftSetores(new Set());
    setDraftDateKeys(new Set(dateOptions.map((d) => d.key)));
    setDraftIgnore(false);
    onSelectedRotasChange(new Set());
    onSelectedSetoresChange(new Set());
    onSelectedDateKeysChange(new Set(dateOptions.map((d) => d.key)));
    onIgnorePreviousConsumptionsChange(false);
    onClearTableFilters?.();
  };

  const rotasDisponiveis = React.useMemo<MultiSelectOption[]>(() => {
    const fixed: MultiSelectOption[] = [
      { value: 'Retirada na So Aço', label: '1-Retirada na So Aço' },
      { value: 'Retirada na So Moveis', label: '2-Retirada na So Moveis' },
      { value: CATEGORY_ENTREGA_GT, label: '3-Entrega em Grande Teresina' },
      { value: CATEGORY_REQUISICAO, label: '5-Requisicao' },
    ];
    const excludeInserirRomaneio = (name: string) =>
      !/inserir\s*em\s*romaneio/i.test(name);
    const dynamic = extractRotasFromProjection(projectionSource)
      .map((r) => r.routeName)
      .filter(excludeInserirRomaneio)
      .sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }))
      .map((name) => ({ value: name, label: name }));
    return [...fixed, ...dynamic];
  }, [projectionSource]);

  const setoresDisponiveis = React.useMemo(() => {
    const set = new Set<string>();
    projectionSource.forEach((r) => {
      const s = (r.setorProducao ?? '').trim();
      if (s) set.add(s);
    });
    return Array.from(set).sort();
  }, [projectionSource]);

  const dateOptionsForMultiSelect = useMemo<MultiSelectOption[]>(
    () => dateOptions.map((d) => ({ value: d.key, label: d.label })),
    [dateOptions]
  );

  return (
    <div className="mb-4 w-full max-w-full min-w-0 space-y-2">
      {/* Container dos filtros — ocupa toda a largura disponível, cabeçalho centralizado, filtros abaixo */}
      <div className="flex w-full max-w-full min-w-0 flex-col rounded-xl border border-[#cfd8ea] dark:border-gray-600 bg-white dark:bg-[#252525] overflow-hidden">
        <div className="flex items-center justify-center border-b border-gray-200 dark:border-gray-600 bg-gray-50/50 dark:bg-[#1f1f1f] px-3 py-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-neutral">
            Filtros da projeção
          </span>
        </div>
        <div className="flex w-full flex-nowrap items-end gap-2 overflow-x-auto p-2">
          {!collapsed ? (
            <>
              {rotasDisponiveis.length > 0 && (
                <div className="shrink-0 min-w-[120px] max-w-[180px] flex-1">
                  <MultiSelectWithSearch
                    label="Rota"
                    options={rotasDisponiveis}
                    selected={draftRotas}
                    onSelectionChange={setDraftRotas}
                    placeholder="Buscar rota..."
                    emptyMessage="Nenhuma rota encontrada"
                    portalContainerRef={portalContainerRef}
                  />
                </div>
              )}
              {setoresDisponiveis.length > 0 && (
                <div className="shrink-0 min-w-[120px] max-w-[180px] flex-1">
                  <MultiSelectWithSearch
                    label="Setor de produção"
                    options={setoresDisponiveis}
                    selected={draftSetores}
                    onSelectionChange={setDraftSetores}
                    placeholder="Buscar setor..."
                    emptyMessage="Nenhum setor encontrado"
                    portalContainerRef={portalContainerRef}
                  />
                </div>
              )}
              {dateOptionsForMultiSelect.length > 0 && (
                <div className="shrink-0 min-w-[120px] max-w-[180px] flex-1">
                  <MultiSelectWithSearch
                    label="Colunas visíveis"
                    options={dateOptionsForMultiSelect}
                    selected={draftDateKeys}
                    onSelectionChange={setDraftDateKeys}
                    placeholder="Buscar coluna..."
                    emptyMessage="Nenhuma coluna encontrada"
                    portalContainerRef={portalContainerRef}
                  />
                </div>
              )}
              <button
                type="button"
                onClick={() => setCollapsed(true)}
                className="ml-auto shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-md border border-gray-300 dark:border-gray-600 text-[10px] font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/30"
              >
                <ChevronsUpDown className="w-3 h-3" />
                Esconder filtros
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setCollapsed(false)}
              className="ml-auto shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-md border border-gray-300 dark:border-gray-600 text-[10px] font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/30"
            >
              <ChevronsUpDown className="w-3 h-3" />
              Mostrar filtros
            </button>
          )}
        </div>
      </div>

      {/* Botões de ação — abaixo do container */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={openApplyPrompt}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm bg-secondary hover:bg-blue-700 text-white transition-all active:scale-95 shadow-md"
        >
          <Filter className="w-4 h-4" />
          Aplicar Filtro
        </button>
        <button
          type="button"
          onClick={clearFilters}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-all active:scale-95"
        >
          <Trash2 className="w-4 h-4" />
          Limpar filtros
        </button>
        <button
          onClick={onGeneratePdf}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm bg-secondary hover:bg-blue-700 text-white transition-all active:scale-95 shadow-md"
        >
          <FileDown className="w-4 h-4" />
          Gerar PDF
        </button>
      </div>

      {showIgnorePrompt && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#252525] shadow-2xl p-4">
            <p className="text-sm font-bold text-gray-800 dark:text-gray-100 mb-3">
              Deseja Desconsiderar consumos anteriores ?
            </p>
            <div className="flex gap-4 mb-4">
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input
                  type="radio"
                  name="ignore-consumos"
                  checked={pendingIgnoreChoice === true}
                  onChange={() => setPendingIgnoreChoice(true)}
                />
                <span>Sim</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input
                  type="radio"
                  name="ignore-consumos"
                  checked={pendingIgnoreChoice === false}
                  onChange={() => setPendingIgnoreChoice(false)}
                />
                <span>Não</span>
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowIgnorePrompt(false)}
                className="px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/30"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmApplyFilters}
                className="px-3 py-1.5 rounded-md bg-secondary hover:bg-blue-700 text-white text-sm font-semibold"
              >
                Aplicar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(ProjectionFiltersBar);
