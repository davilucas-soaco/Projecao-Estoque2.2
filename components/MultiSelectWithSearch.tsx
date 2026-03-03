import React, { useState, useMemo } from 'react';
import { Search, ChevronDown } from 'lucide-react';

interface MultiSelectWithSearchProps {
  label: string;
  options: string[];
  selected: Set<string>;
  onSelectionChange: (selected: Set<string>) => void;
  placeholder?: string;
  emptyMessage?: string;
}

const MultiSelectWithSearch: React.FC<MultiSelectWithSearchProps> = ({
  label,
  options,
  selected,
  onSelectionChange,
  placeholder = 'Buscar...',
  emptyMessage = 'Nenhuma opção',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = React.useRef<HTMLDivElement>(null);

  const filteredOptions = useMemo(() => {
    if (!search.trim()) return options;
    const lower = search.toLowerCase();
    return options.filter((o) => o.toLowerCase().includes(lower));
  }, [options, search]);

  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggle = (opt: string) => {
    const next = new Set(selected);
    if (next.has(opt)) next.delete(opt);
    else next.add(opt);
    onSelectionChange(next);
  };

  const toggleAll = () => {
    if (selected.size === filteredOptions.length) {
      const next = new Set(selected);
      filteredOptions.forEach((o) => next.delete(o));
      onSelectionChange(next);
    } else {
      const next = new Set(selected);
      filteredOptions.forEach((o) => next.add(o));
      onSelectionChange(next);
    }
  };

  const badgeLabel = selected.size === 0 ? 'Todos' : `${selected.size} selecionado(s)`;

  return (
    <div ref={containerRef} className="relative">
      <label className="text-[10px] font-bold uppercase tracking-wider text-neutral block mb-1">{label}</label>
      <button
        type="button"
        onClick={() => setIsOpen((o) => !o)}
        className="inline-flex items-center gap-2 px-3 py-1.5 min-w-[140px] rounded-md border border-gray-300 dark:border-gray-600 text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
      >
        <span className="truncate flex-1 text-left">{badgeLabel}</span>
        <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <div className="absolute left-0 mt-1 z-[95] w-64 max-h-64 flex flex-col rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#252525] shadow-xl overflow-hidden">
          <div className="p-2 border-b border-gray-200 dark:border-gray-700">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={placeholder}
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-[#1f1f1f] text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-secondary"
              />
            </div>
          </div>
          <div className="p-1 border-b border-gray-100 dark:border-gray-700">
            <button
              type="button"
              onClick={toggleAll}
              className="w-full text-left px-2 py-1 text-[10px] font-bold text-secondary hover:bg-gray-50 dark:hover:bg-gray-700/30 rounded"
            >
              {selected.size === filteredOptions.length ? 'Desmarcar todas' : 'Selecionar todas'}
            </button>
          </div>
          <div className="overflow-auto flex-1 max-h-40 p-1">
            {filteredOptions.length === 0 ? (
              <p className="px-2 py-4 text-[11px] text-neutral">{emptyMessage}</p>
            ) : (
              filteredOptions.map((opt) => (
                <label
                  key={opt}
                  className="flex items-center gap-2 text-xs px-2 py-1.5 rounded hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(opt)}
                    onChange={() => toggle(opt)}
                    className="rounded"
                  />
                  <span className="truncate">{opt}</span>
                </label>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default MultiSelectWithSearch;
