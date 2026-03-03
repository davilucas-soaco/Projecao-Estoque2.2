import React from 'react';
import { Search, FileDown } from 'lucide-react';
import type { ProjecaoImportada } from '../types';
import { extractRotasFromProjection } from '../utils';
import MultiSelectWithSearch from './MultiSelectWithSearch';

interface ProjectionFiltersBarProps {
  projectionSource: ProjecaoImportada[];
  filterDescCod: string;
  onFilterDescCodChange: (v: string) => void;
  selectedRotas: Set<string>;
  onSelectedRotasChange: (v: Set<string>) => void;
  selectedSetores: Set<string>;
  onSelectedSetoresChange: (v: Set<string>) => void;
  horizonDays: 15 | 30 | 45 | 60;
  onHorizonDaysChange: (v: 15 | 30 | 45 | 60) => void;
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
  horizonDays,
  onHorizonDaysChange,
  onGeneratePdf,
}) => {
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
              value={filterDescCod}
              onChange={(e) => onFilterDescCodChange(e.target.value)}
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
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-neutral block mb-1">Horizonte</label>
          <select
            value={horizonDays}
            onChange={(e) => onHorizonDaysChange(Number(e.target.value) as 15 | 30 | 45 | 60)}
            className="px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-[#252525] text-sm font-semibold text-gray-700 dark:text-gray-200"
          >
            <option value={15}>15 dias</option>
            <option value={30}>30 dias</option>
            <option value={45}>45 dias</option>
            <option value={60}>60 dias</option>
          </select>
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

export default ProjectionFiltersBar;
