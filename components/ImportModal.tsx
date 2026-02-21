import React, { useState, useRef, useEffect } from 'react';
import { X, Upload, CheckCircle, Package, Database, AlertCircle, RefreshCw, FileSpreadsheet, PackageCheck } from 'lucide-react';
import * as XLSX from 'xlsx';
import { ShelfFicha, Order, StockItem } from '../types';
import { replaceRomaneio, replaceEstoque } from '../supabaseClient';

type TabType = 'FICHA' | 'ROMANEIO' | 'ESTOQUE' | 'SYNC';

function toNum(v: unknown): number {
  if (v == null || v === '') return 0;
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
}

function parseDate(v: unknown): string {
  if (v == null || v === '') return '';
  if (typeof v === 'number' && !Number.isNaN(v)) return new Date((v - 25569) * 86400 * 1000).toISOString().slice(0, 19).replace('T', ' ');
  if (v instanceof Date) return v.toISOString().slice(0, 19).replace('T', ' ');
  const s = String(v).trim();
  if (!s) return '';
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 19).replace('T', ' ');
  const parts = s.split(/[/\-.]/);
  if (parts.length >= 3) {
    const y = parseInt(parts[2], 10);
    const m = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[0], 10);
    const d2 = new Date(y, m, day);
    if (!Number.isNaN(d2.getTime())) return d2.toISOString().slice(0, 19).replace('T', ' ');
  }
  return s;
}

function parseDateOnly(v: unknown): string {
  if (v == null || v === '') return '';
  if (typeof v === 'number' && !Number.isNaN(v)) return new Date((v - 25569) * 86400 * 1000).toISOString().slice(0, 10);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  if (!s) return '';
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  const parts = s.split(/[/\-.]/);
  if (parts.length >= 3) {
    const y = parseInt(parts[2], 10);
    const m = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[0], 10);
    const d2 = new Date(y, m, day);
    if (!Number.isNaN(d2.getTime())) return d2.toISOString().slice(0, 10);
  }
  return s;
}

interface Props {
  onClose: () => void;
  onImportShelfFicha: (ficha: ShelfFicha[]) => void;
  onSyncServer?: () => void;
  onImportedRomaneio?: () => void;
  onImportedEstoque?: () => void;
  /** Importar romaneio para overlay (quando não usa Supabase). */
  onImportOrders?: (orders: Order[]) => void;
  /** Importar estoque para overlay (quando não usa Supabase). */
  onImportStock?: (stock: StockItem[]) => void;
  shelfFicha: ShelfFicha[];
  isOrdersLoading?: boolean;
  isStockLoading?: boolean;
  ordersError?: Error | null;
  stockError?: Error | null;
  /** Quando true, persiste Romaneio/Estoque no Supabase; senão usa overlay (Excel em memória). */
  useSupabaseOrdersStock?: boolean;
}

const ImportModal: React.FC<Props> = ({
  onClose,
  onImportShelfFicha,
  onSyncServer,
  onImportedRomaneio,
  onImportedEstoque,
  onImportOrders,
  onImportStock,
  shelfFicha,
  isOrdersLoading = false,
  isStockLoading = false,
  ordersError = null,
  stockError = null,
  useSupabaseOrdersStock = false,
}) => {
  const [activeType, setActiveType] = useState<TabType>('FICHA');
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

        if (activeType === 'ROMANEIO') {
          const rowKeys = Object.keys(json[0] || {});
          const getVal = (row: Record<string, unknown>, keys: string[]) => {
            for (const k of keys) {
              const found = rowKeys.find(rk => rk.trim().toLowerCase().replace(/\s/g, '_') === k.trim().toLowerCase());
              if (found && row[found] !== undefined) return row[found];
            }
            return undefined;
          };
          const orders: Order[] = (json as Record<string, unknown>[]).map(row => {
            const g = (keys: string[]) => getVal(row, keys);
            const req = String(g(['Requisicao_de_Loja_do_grupo', 'Requisicao de Loja do grupo', 'requisicao_loja']) || '').toLowerCase();
            return {
              codigoRomaneio: String(g(['Codigo_Romaneio', 'Codigo Romaneio']) ?? '').trim(),
              observacoesRomaneio: String(g(['observacoes_Romaneio', 'observacoes Romaneio']) ?? '').trim(),
              dataEmissaoRomaneio: parseDate(g(['dataEmissao_Romaneio', 'data_emissao_romaneio', 'Data Emissao Romaneio'])),
              numeroPedido: String(g(['N_Pedido', 'N Pedido', 'numero_pedido']) ?? '').trim(),
              cliente: String(g(['Cliente', 'cliente']) ?? '').trim(),
              dataEmissaoPedido: parseDateOnly(g(['Data_Emissao_Pedido', 'Data Emissao Pedido', 'data_emissao_pedido'])),
              codigoProduto: String(g(['Cod_Produto', 'Cod Produto', 'cod_produto']) ?? '').trim(),
              descricao: String(g(['descricao', 'Descricao']) ?? '').trim(),
              um: String(g(['U.M', 'UM', 'um']) ?? '').trim(),
              qtdPedida: toNum(g(['Qtd_Pedida', 'Qtd Pedida', 'qtd_pedida'])),
              qtdVinculada: toNum(g(['Qtd_Vinculada_no_Romaneio', 'Qtd Vinculada no Romaneio', 'qtd_vinculada'])),
              tipoProduto: String(g(['Tipo_de_produto_do_item_de_pedido_de_venda', 'Tipo de produto']) ?? '').trim(),
              precoUnitario: toNum(g(['Preco_Unitario', 'Preco Unitario', 'preco_unitario'])),
              dataEntrega: parseDate(g(['Data_de_Entrega', 'Data de Entrega', 'data_de_entrega'])),
              municipio: String(g(['Municipio', 'municipio']) ?? '').trim(),
              uf: String(g(['UF', 'uf']) ?? '').trim(),
              endereco: String(g(['Endereco', 'Endereco', 'endereco']) ?? '').trim(),
              metodoEntrega: String(g(['Metodo_de_entrega', 'Metodo de entrega', 'metodo_entrega']) ?? '').trim(),
              requisicaoLoja: req.includes('sim'),
              localEntregaDif: 0,
              municipioCliente: String(g(['Municipio', 'municipio']) ?? '').trim(),
              ufCliente: String(g(['UF', 'uf']) ?? '').trim(),
              municipioEntrega: String(g(['Municipio', 'municipio']) ?? '').trim(),
              ufEntrega: String(g(['UF', 'uf']) ?? '').trim(),
            };
          });
          if (useSupabaseOrdersStock) {
            await replaceRomaneio(orders);
            onImportedRomaneio?.();
            setSuccessMsg(`Romaneio importado: ${orders.length} registros salvos no Supabase.`);
          } else {
            onImportOrders?.(orders);
            setSuccessMsg(`Romaneio importado: ${orders.length} registros (uso em memória).`);
          }
        }

        if (activeType === 'ESTOQUE') {
          const rowKeys = Object.keys(json[0] || {});
          const getVal = (row: Record<string, unknown>, keys: string[]) => {
            for (const k of keys) {
              const found = rowKeys.find(rk => rk.trim().toLowerCase().replace(/\s/g, '_') === k.trim().toLowerCase());
              if (found && row[found] !== undefined) return row[found];
            }
            return undefined;
          };
          const stock: StockItem[] = (json as Record<string, unknown>[]).map(row => {
            const g = (keys: string[]) => getVal(row, keys);
            return {
              idProduto: toNum(g(['idProduto', 'id_produto', 'Id Produto'])),
              codigo: String(g(['Codigo', 'codigo', 'Codigo']) ?? '').trim(),
              idTipoProduto: toNum(g(['idTipoProduto', 'id_tipo_produto', 'Id Tipo Produto'])),
              setorEstoquePadrao: String(g(['SetorEstoquePadrao', 'Setor Estoque Padrao', 'setor_estoque_padrao']) ?? '').trim(),
              descricao: String(g(['Descricao', 'descricao']) ?? '').trim(),
              setorEstoque: String(g(['setorEstoque', 'setor_estoque', 'Setor Estoque']) ?? '').trim(),
              saldoSetorFinal: toNum(g(['saldoSetorFinal', 'saldo_setor_final', 'Saldo Setor Final'])),
            };
          });
          if (useSupabaseOrdersStock) {
            await replaceEstoque(stock);
            onImportedEstoque?.();
            setSuccessMsg(`Estoque importado: ${stock.length} registros salvos no Supabase.`);
          } else {
            onImportStock?.(stock);
            setSuccessMsg(`Estoque importado: ${stock.length} registros (uso em memória).`);
          }
        }

        if (activeType === 'FICHA' || activeType === 'ROMANEIO' || activeType === 'ESTOQUE') {
          setTimeout(() => {
            setSuccessMsg('');
            onClose();
          }, 2000);
        }
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
            <h2 className="text-xl font-bold">Atualizações</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-8">
          <div className="flex flex-wrap gap-2 mb-6 bg-gray-100 dark:bg-[#1a1a1a] p-1 rounded-xl">
            <button disabled={loading} onClick={() => setActiveType('FICHA')} className={`flex-1 min-w-0 flex items-center justify-center gap-2 py-3 rounded-lg text-[10px] font-bold transition-all ${activeType === 'FICHA' ? 'bg-white dark:bg-darkBg shadow-sm text-secondary' : 'text-neutral opacity-60'}`}>
              <Package className="w-4 h-4 shrink-0" /> Ficha Estantes
            </button>
            {useSupabaseOrdersStock && (
              <>
                <button disabled={loading} onClick={() => setActiveType('ROMANEIO')} className={`flex-1 min-w-0 flex items-center justify-center gap-2 py-3 rounded-lg text-[10px] font-bold transition-all ${activeType === 'ROMANEIO' ? 'bg-white dark:bg-darkBg shadow-sm text-secondary' : 'text-neutral opacity-60'}`}>
                  <FileSpreadsheet className="w-4 h-4 shrink-0" /> Romaneio
                </button>
                <button disabled={loading} onClick={() => setActiveType('ESTOQUE')} className={`flex-1 min-w-0 flex items-center justify-center gap-2 py-3 rounded-lg text-[10px] font-bold transition-all ${activeType === 'ESTOQUE' ? 'bg-white dark:bg-darkBg shadow-sm text-secondary' : 'text-neutral opacity-60'}`}>
                  <PackageCheck className="w-4 h-4 shrink-0" /> Estoque
                </button>
              </>
            )}
            <button disabled={loading} onClick={() => setActiveType('SYNC')} className={`flex-1 min-w-0 flex items-center justify-center gap-2 py-3 rounded-lg text-[10px] font-bold transition-all ${activeType === 'SYNC' ? 'bg-white dark:bg-darkBg shadow-sm text-secondary' : 'text-neutral opacity-60'}`}>
              <RefreshCw className="w-4 h-4 shrink-0" /> Sincronizar
            </button>
          </div>

          {activeType === 'SYNC' && (
            <div className="mb-6 flex flex-col items-center justify-center gap-6 py-8 px-4">
              <button
                type="button"
                onClick={() => { wasLoadingRef.current = false; onSyncServer?.(); setErrorMsg(''); }}
                disabled={isSyncing}
                className={`rounded-full flex items-center justify-center shadow-xl transition-all duration-300 ease-out min-w-[5rem] min-h-[5rem] w-24 h-24 sm:w-28 sm:h-28 ${syncSuccess ? 'bg-green-500 text-white scale-105' : isSyncing ? 'bg-gray-300 dark:bg-gray-600 cursor-not-allowed' : 'bg-secondary hover:bg-blue-700 text-white hover:scale-105 active:scale-95'}`}
                title="Sincronizar com o banco"
              >
                {syncSuccess ? (
                  <CheckCircle className="w-12 h-12 sm:w-14 sm:h-14" aria-hidden />
                ) : (
                  <RefreshCw
                    className={`w-10 h-10 sm:w-12 sm:h-12 ${isSyncing ? 'animate-spin' : ''}`}
                    aria-hidden
                  />
                )}
              </button>
              {(ordersError || stockError) && (
                <p className="text-[11px] text-red-600 dark:text-red-400 text-center max-w-xs">{(ordersError || stockError)?.message}</p>
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

          {(activeType === 'FICHA' || activeType === 'ROMANEIO' || activeType === 'ESTOQUE') && (
          <div 
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-2xl p-12 text-center transition-all cursor-pointer relative ${dragging ? 'border-secondary bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700 hover:border-neutral'} ${loading ? 'opacity-50 cursor-wait' : ''}`}
          >
            {loading ? (
              <div className="flex flex-col items-center gap-3">
                <div className="w-10 h-10 border-4 border-secondary border-t-transparent rounded-full animate-spin"></div>
                <p className="text-sm font-medium">{activeType === 'FICHA' ? 'Sincronizando banco de dados...' : 'Importando e salvando no Supabase...'}</p>
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

          <div className="mt-6 p-4 bg-gray-100 dark:bg-[#1a1a1a] rounded-xl flex gap-3 border border-gray-200 dark:border-gray-700">
            {activeType === 'FICHA' && (
              <>
                <Package className="w-5 h-5 text-secondary shrink-0 mt-0.5" />
                <div className="text-[11px] text-gray-700 dark:text-gray-300 leading-relaxed">
                  <strong>Ficha Estantes:</strong> Arraste ou selecione um arquivo Excel/CSV com as colunas da mini ficha (codigo_estante, cod_coluna, desc_coluna, qtd_coluna, cod_bandeja, desc_bandeja, qtd_bandeja). Inclua <em>desc_estante</em> para preencher a descrição da estante no banco.
                </div>
              </>
            )}
            {activeType === 'ROMANEIO' && (
              <>
                <FileSpreadsheet className="w-5 h-5 text-secondary shrink-0 mt-0.5" />
                <div className="text-[11px] text-gray-700 dark:text-gray-300 leading-relaxed">
                  <strong>Romaneio:</strong> Envie um Excel/CSV com as colunas do romaneio (Codigo_Romaneio, N_Pedido, Cliente, Cod_Produto, descricao, Qtd_Pedida, Qtd_Vinculada_no_Romaneio, Data_de_Entrega, etc.). {useSupabaseOrdersStock ? 'Os dados substituirão os atuais no Supabase.' : 'Os dados serão usados em memória até a próxima sincronização.'}
                </div>
              </>
            )}
            {activeType === 'ESTOQUE' && (
              <>
                <PackageCheck className="w-5 h-5 text-secondary shrink-0 mt-0.5" />
                <div className="text-[11px] text-gray-700 dark:text-gray-300 leading-relaxed">
                  <strong>Estoque:</strong> Envie um Excel/CSV com as colunas de estoque (idProduto, Codigo, Descricao, setorEstoque, saldoSetorFinal, etc.). {useSupabaseOrdersStock ? 'Os dados substituirão os atuais no Supabase.' : 'Os dados serão usados em memória até a próxima sincronização.'}
                </div>
              </>
            )}
            {activeType === 'SYNC' && (
              <>
                <RefreshCw className="w-5 h-5 text-secondary shrink-0 mt-0.5" />
                <div className="text-[11px] text-gray-700 dark:text-gray-300 leading-relaxed">
                  <strong>Sincronizar:</strong> {useSupabaseOrdersStock ? 'Recarrega os dados de romaneio e estoque do Supabase.' : 'Clique no botão acima para atualizar estoque e romaneio a partir da API.'}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ImportModal;
