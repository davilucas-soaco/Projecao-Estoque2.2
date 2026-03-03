import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, FileDown, CalendarDays, ChevronDown } from 'lucide-react';
import type { ProjecaoImportada } from '../types';
import { extractRotasFromProjection } from '../utils';
import MultiSelectWithSearch from './MultiSelectWithSearch';

interface DateOption {
  key: string;
  label: string;
}

interface ProjectionFiltersBarProps {
  projectionSource: ProjecaoImportada[];
  filterDescCod: string;
  onFilterDescCodChange: (v: string) => void;
  selectedRotas: Set<string>;
  onSelectedRotasChange: (v: Set<string>) => void;
  selectedSetores: Set<string>;
  onSelectedSetoresChange: (v: Set<string>) => void;
  dateOptions: DateOption[];
  selectedDateKeys: Set<string>;
  onSelectedDateKeysChange: (v: Set<string>) => void;
  onGeneratePdf: () => void;
}

const ProjectionFiltersBar: React.FC<ProjectionFiltersBarProps> = ({
  projectionSource,
  filterDescCod,
  onFilterDescCodChange,
  selectedRotas,
  onSelectedRotasChange,
  selectedSetores,
  onSelectedSetoresChange,
  dateOptions,
  selectedDateKeys,
  onSelectedDateKeysChange,
  onGeneratePdf,
}) => {
  const [localDescCod, setLocalDescCod] = useState(filterDescCod);
  const [dateSearch, setDateSearch] = useState('');
  const [showDateSelector, setShowDateSelector] = useState(false);
  const dateSelectorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLocalDescCod(filterDescCod);
  }, [filterDescCod]);

  useEffect(() => {
    const t = window.setTimeout(() => onFilterDescCodChange(localDescCod), 180);
    return () => window.clearTimeout(t);
  }, [localDescCod, onFilterDescCodChange]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (showDateSelector && dateSelectorRef.current && !dateSelectorRef.current.contains(e.target as Node)) {
        setShowDateSelector(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showDateSelector]);

  const rotasDisponiveis = React.useMemo(
    () => extractRotasFromProjection(projectionSource).map((r) => r.routeName),
    [projectionSource]
  );

  const setoresDisponiveis = React.useMemo(() => {
    const set = new Set<string>();
    projectionSource.forEach((r) => {
      const s = (r.setorProducao ?? '').trim();
      if (s) set.add(s);
    });
    return Array.from(set).sort();
  }, [projectionSource]);

  const filteredDateOptions = useMemo(() => {
    if (!dateSearch.trim()) return dateOptions;
    const lower = dateSearch.toLowerCase();
    return dateOptions.filter((d) => d.label.toLowerCase().includes(lower) || d.key.includes(lower));
  }, [dateOptions, dateSearch]);

  const selectedDateCount = selectedDateKeys.size;
  const dateButtonLabel = selectedDateCount === 0 ? 'Nenhum dia' : `${selectedDateCount} dia(s)`;

  return (
    <div className="flex flex-wrap items-end justify-between gap-4 p-4 mb-4 rounded-xl border border-[#cfd8ea] dark:border-gray-600 bg-white dark:bg-[#252525]">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-neutral block mb-1">
            Descrição / Cód. produto
          </label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              value={localDescCod}
              onChange={(e) => setLocalDescCod(e.target.value)}
              placeholder="Filtrar por código ou descrição..."
              className="pl-8 pr-3 py-1.5 min-w-[200px] rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-[#1f1f1f] text-sm font-medium text-gray-700 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-secondary"
            />
          </div>
        </div>
        {rotasDisponiveis.length > 0 && (
          <MultiSelectWithSearch
            label="Rota"
            options={rotasDisponiveis}
            selected={selectedRotas}
            onSelectionChange={onSelectedRotasChange}
            placeholder="Buscar rota..."
            emptyMessage="Nenhuma rota encontrada"
          />
        )}
        {setoresDisponiveis.length > 0 && (
          <MultiSelectWithSearch
            label="Setor de produção"
            options={setoresDisponiveis}
            selected={selectedSetores}
            onSelectionChange={onSelectedSetoresChange}
            placeholder="Buscar setor..."
            emptyMessage="Nenhum setor encontrado"
          />
        )}
      </div>
      <div className="flex items-end gap-3">
        <div className="relative" ref={dateSelectorRef}>
          <label className="text-[10px] font-bold uppercase tracking-wider text-neutral block mb-1">Datas visíveis</label>
          <button
            type="button"
            onClick={() => setShowDateSelector((prev) => !prev)}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-[#252525] text-sm font-semibold text-gray-700 dark:text-gray-200"
          >
            <CalendarDays className="w-4 h-4" />
            <span>{dateButtonLabel}</span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showDateSelector ? 'rotate-180' : ''}`} />
          </button>
          {showDateSelector && (
            <div className="absolute right-0 mt-2 z-[96] w-72 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#252525] shadow-xl overflow-hidden">
              <div className="p-2 border-b border-gray-200 dark:border-gray-700">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <input
                    type="text"
                    value={dateSearch}
                    onChange={(e) => setDateSearch(e.target.value)}
                    placeholder="Buscar data..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-[#1f1f1f] text-gray-800 dark:text-gray-200"
                  />
                </div>
              </div>
              <div className="p-2 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => onSelectedDateKeysChange(new Set(dateOptions.slice(0, 18).map((d) => d.key)))}
                  className="text-[10px] font-bold text-secondary hover:underline"
                >
                  Padrão 18 dias
                </button>
                <button
                  type="button"
                  onClick={() => onSelectedDateKeysChange(new Set(dateOptions.map((d) => d.key)))}
                  className="text-[10px] font-bold text-secondary hover:underline"
                >
                  Selecionar 60 dias
                </button>
              </div>
              <div className="max-h-64 overflow-auto p-1">
                {filteredDateOptions.map((opt) => (
                  <label
                    key={opt.key}
                    className="flex items-center gap-2 text-xs px-2 py-1.5 rounded hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedDateKeys.has(opt.key)}
                      onChange={(e) => {
                        const next = new Set(selectedDateKeys);
                        if (e.target.checked) next.add(opt.key);
                        else next.delete(opt.key);
                        onSelectedDateKeysChange(next);
                      }}
                    />
                    <span>{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
        <button
          onClick={onGeneratePdf}
          className="flex items-center gap-2 bg-secondary hover:bg-blue-700 px-4 py-2 rounded-lg font-semibold text-sm text-white transition-all active:scale-95 shadow-md"
        >
          <FileDown className="w-4 h-4" />
          Gerar PDF
        </button>
      </div>
    </div>
  );
};

export default React.memo(ProjectionFiltersBar);
