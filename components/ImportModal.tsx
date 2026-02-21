import React, { useState, useRef, useEffect } from 'react';
import { X, Upload, CheckCircle, Package, Database, AlertCircle, RefreshCw } from 'lucide-react';
import * as XLSX from 'xlsx';
import { ShelfFicha } from '../types';

interface Props {
  onClose: () => void;
  onImportShelfFicha: (ficha: ShelfFicha[]) => void;
  onSyncServer?: () => void;
  shelfFicha: ShelfFicha[];
  isOrdersLoading?: boolean;
  isStockLoading?: boolean;
  ordersError?: Error | null;
  stockError?: Error | null;
}

const ImportModal: React.FC<Props> = ({
  onClose,
  onImportShelfFicha,
  onSyncServer,
  shelfFicha,
  isOrdersLoading = false,
  isStockLoading = false,
  ordersError = null,
  stockError = null,
}) => {
  const [activeType, setActiveType] = useState<'FICHA' | 'SYNC'>('FICHA');
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [syncSuccess, setSyncSuccess] = useState(false);
  const [toast, setToast] = useState('');
  const wasLoadingRef = useRef(false);

  const isSyncing = isOrdersLoading || isStockLoading;
  useEffect(() => {
    if (isSyncing) wasLoadingRef.current = true;
    if (wasLoadingRef.current && !isSyncing && activeType === 'SYNC') {
      setSyncSuccess(true);
      setToast('Sincronização completa');
      wasLoadingRef.current = false;
      const t = setTimeout(() => { setToast(''); setSyncSuccess(false); }, 2500);
      return () => clearTimeout(t);
    }
  }, [isSyncing, activeType]);

  const parseFile = async (file: File) => {
    setLoading(true);
    setErrorMsg('');
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const json = XLSX.utils.sheet_to_json(worksheet) as any[];

        if (json.length === 0) {
          throw new Error("O arquivo parece estar vazio.");
        }

        if (activeType === 'FICHA') {
          const mappedFicha: ShelfFicha[] = json.map(row => {
            const rowKeys = Object.keys(row);
            const get = (keys: string[]) => {
              for (const k of keys) {
                const foundKey = rowKeys.find(rk => rk.trim().toLowerCase() === k.trim().toLowerCase());
                if (foundKey && row[foundKey] !== undefined) return row[foundKey];
              }
              return '';
            };
            
            return {
              codigoEstante: String(get(['codigo_estante', 'codigoEstante', 'Codigo Estante', 'CODIGO_ESTANTE', 'codigo']) || '').trim(),
              descEstante: String(get(['desc_estante', 'descricao estante', 'descEstante', 'DESC_ESTANTE']) || '').trim() || undefined,
              codColuna: String(get(['cod_coluna', 'codColuna', 'Cod Coluna', 'COD_COLUNA']) || '').trim(),
              descColuna: String(get(['desc_coluna', 'descColuna', 'Desc Coluna', 'DESC_COLUNA']) || '').trim(),
              qtdColuna: Number(get(['qtd_coluna', 'qtdColuna', 'Qtd Coluna', 'QTD_COLUNA']) || 0),
              codBandeja: String(get(['cod_bandeja', 'codBandeja', 'Cod Bandeja', 'COD_BANDEJA']) || '').trim(),
              descBandeja: String(get(['desc_bandeja', 'descBandeja', 'Desc Bandeja', 'DESC_BANDEJA']) || '').trim(),
              qtdBandeja: Number(get(['qtd_bandeja', 'qtdBandeja', 'Qtd Bandeja', 'QTD_BANDEJA']) || 0)
            };
          }).filter(f => f.codigoEstante);

          await Promise.resolve(onImportShelfFicha(mappedFicha));
          setSuccessMsg(`Ficha Técnica atualizada: ${mappedFicha.length} estantes mapeadas.`);
        }

        setTimeout(() => {
          setSuccessMsg('');
          onClose();
        }, 2000);
      } catch (err: any) {
        setErrorMsg(`Erro ao processar: ${err.message}`);
      } finally {
        setLoading(false);
      }
    };

    reader.onerror = () => { setErrorMsg("Erro na leitura do arquivo."); setLoading(false); };
    reader.readAsArrayBuffer(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (loading) return;
    const file = e.dataTransfer.files[0];
    if (file) parseFile(file);
  };

  const handleExportFicha = () => {
    if (shelfFicha.length === 0) {
      alert("Não há dados de ficha técnica para exportar.");
      return;
    }
    const ws = XLSX.utils.json_to_sheet(shelfFicha);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Ficha Técnica");
    XLSX.writeFile(wb, "ficha_tecnica_estantes.xlsx");
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-[#252525] w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="bg-primary p-6 text-white flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-lg">
              <Upload className="w-5 h-5 text-highlight" />
            </div>
            <h2 className="text-xl font-bold">Importar Dados</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-8">
          <div className="flex gap-2 mb-6 bg-gray-100 dark:bg-[#1a1a1a] p-1 rounded-xl">
            <button disabled={loading} onClick={() => setActiveType('FICHA')} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-[10px] font-bold transition-all ${activeType === 'FICHA' ? 'bg-white dark:bg-darkBg shadow-sm text-secondary' : 'text-neutral opacity-60'}`}>
              <Package className="w-4 h-4" /> Ficha Estantes
            </button>
            <button disabled={loading} onClick={() => setActiveType('SYNC')} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-[10px] font-bold transition-all ${activeType === 'SYNC' ? 'bg-white dark:bg-darkBg shadow-sm text-secondary' : 'text-neutral opacity-60'}`}>
              <RefreshCw className="w-4 h-4" /> Sincronizar com o banco
            </button>
          </div>

          {activeType === 'SYNC' && (
            <div className="mb-6 flex flex-col items-center gap-4 py-6">
              <p className="text-sm text-neutral text-center">Atualize estoque e romaneio a partir do banco de dados.</p>
              <button
                type="button"
                onClick={() => { wasLoadingRef.current = false; onSyncServer?.(); setErrorMsg(''); }}
                disabled={isSyncing}
                className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-all duration-300 ${syncSuccess ? 'bg-green-500 text-white' : isSyncing ? 'bg-gray-300 dark:bg-gray-600 cursor-not-allowed' : 'bg-secondary hover:bg-blue-700 text-white'}`}
                title="Sincronizar"
              >
                <RefreshCw className={`w-7 h-7 ${isSyncing ? 'animate-spin' : ''}`} />
              </button>
              {(ordersError || stockError) && (
                <span className="text-[10px] text-red-600 dark:text-red-400 text-center">Erro: {(ordersError || stockError)?.message}</span>
              )}
            </div>
          )}

          {activeType === 'FICHA' && shelfFicha.length > 0 && (
            <div className="mb-4 flex justify-end">
              <button 
                onClick={handleExportFicha}
                className="text-[10px] font-bold flex items-center gap-2 bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-700 px-3 py-1.5 rounded hover:bg-gray-50 dark:hover:bg-[#333] transition-colors shadow-sm"
              >
                <Database className="w-3 h-3" /> Exportar Ficha Atual
              </button>
            </div>
          )}

          {activeType === 'SYNC' && (
            <div className="rounded-2xl p-6 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#1a1a1a] min-h-[200px] flex items-center justify-center">
              <span className="text-[11px] text-neutral">Selecione a guia &quot;Sincronizar com o banco&quot; e use o botão acima para atualizar.</span>
            </div>
          )}

          {activeType === 'FICHA' && (
          <div 
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-2xl p-12 text-center transition-all cursor-pointer relative ${dragging ? 'border-secondary bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700 hover:border-neutral'} ${loading ? 'opacity-50 cursor-wait' : ''}`}
          >
            {loading ? (
              <div className="flex flex-col items-center gap-3">
                <div className="w-10 h-10 border-4 border-secondary border-t-transparent rounded-full animate-spin"></div>
                <p className="text-sm font-medium">Sincronizando banco de dados...</p>
              </div>
            ) : successMsg ? (
              <div className="flex flex-col items-center gap-3 text-green-500 animate-in zoom-in duration-300">
                <CheckCircle className="w-16 h-16" />
                <p className="font-bold text-sm">{successMsg}</p>
              </div>
            ) : errorMsg ? (
              <div className="flex flex-col items-center gap-3 text-red-500 animate-in shake">
                <AlertCircle className="w-12 h-12" />
                <p className="text-xs font-bold leading-tight">{errorMsg}</p>
                <button onClick={() => setErrorMsg('')} className="mt-2 text-[10px] underline uppercase tracking-widest">Tentar novamente</button>
              </div>
            ) : (
              <>
                <div className="bg-gray-100 dark:bg-[#2a2a2a] w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Upload className="w-8 h-8 text-neutral" />
                </div>
                <h3 className="font-bold text-lg mb-2">Arraste seu arquivo aqui</h3>
                <p className="text-sm text-neutral mb-4">ou clique para selecionar</p>
                <input type="file" disabled={loading} className="absolute inset-0 opacity-0 cursor-pointer" accept=".xlsx, .xls, .csv" onChange={(e) => e.target.files && parseFile(e.target.files[0])} />
                <div className="flex items-center justify-center gap-4 text-[10px] text-neutral font-bold tracking-widest uppercase">
                  <span>Excel</span><span className="w-1 h-1 rounded-full bg-neutral"></span><span>CSV</span>
                </div>
              </>
            )}
          </div>
          )}

          {toast && (
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[110] px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-semibold shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-300">
              {toast}
            </div>
          )}

          <div className="mt-6 p-4 bg-orange-50 dark:bg-orange-900/10 rounded-xl flex gap-3 border border-orange-100 dark:border-orange-800">
            <RefreshCw className="w-5 h-5 text-orange-500 shrink-0" />
            <div className="text-[11px] text-orange-700 dark:text-orange-300 leading-relaxed">
              <strong>Ficha Estantes:</strong> Ao importar, o sistema enviará os dados para o Supabase (ou substituirá os locais). Inclua a coluna <em>desc_estante</em> no Excel para preencher a descrição da estante.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ImportModal;
