
import React, { useState } from 'react';
import { X, Upload, CheckCircle, FileText, Package, Database, Info, AlertCircle, RefreshCw } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Order, StockItem } from '../types';

interface Props {
  onClose: () => void;
  onImportOrders: (orders: Order[]) => void;
  onImportStock: (stock: StockItem[]) => void;
}

const ImportModal: React.FC<Props> = ({ onClose, onImportOrders, onImportStock }) => {
  const [activeType, setActiveType] = useState<'ROMANEIO' | 'ESTOQUE'>('ROMANEIO');
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const parseFile = async (file: File) => {
    setLoading(true);
    setErrorMsg('');
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const json = XLSX.utils.sheet_to_json(worksheet) as any[];

        if (json.length === 0) {
          throw new Error("O arquivo parece estar vazio.");
        }

        if (activeType === 'ROMANEIO') {
          const mappedOrders: Order[] = json.map((row) => {
            const get = (keys: string[]) => {
              for (const k of keys) if (row[k] !== undefined) return row[k];
              return '';
            };

            return {
              codigoRomaneio: String(get(['Codigo Romaneio', 'Codigo_Romaneio', 'Cod. Romaneio']) || ''),
              observacoesRomaneio: String(get(['observacoes Romaneio', 'observacoes_Romaneio', 'Observações']) || ''),
              dataEmissaoRomaneio: String(get(['dataEmissao Romaneio', 'dataEmissao_Romaneio']) || ''),
              numeroPedido: String(get(['N° Pedido', 'N_Pedido', 'Pedido']) || ''),
              cliente: String(get(['Cliente']) || ''),
              dataEmissaoPedido: String(get(['Data Emissao Pedido', 'Data_Emissao_Pedido']) || ''),
              codigoProduto: String(get(['Cod.Produto', 'Cod_Produto', 'Codigo Produto']) || ''),
              descricao: String(get(['descricao', 'Descricao']) || ''),
              um: String(get(['U.M', 'UM']) || ''),
              qtdPedida: Number(get(['Qtd Pedida', 'Qtd_Pedida']) || 0),
              qtdVinculada: Number(get(['Qtd Vinculada no Romaneio', 'Qtd_Vinculada_no_Romaneio']) || 0),
              tipoProduto: String(get(['Tipo de produto do item de pedido de venda', 'Tipo Produto']) || ''),
              precoUnitario: Number(get(['Preço Unitario', 'Preco_Unitario']) || 0),
              dataEntrega: String(get(['Data de Entrega', 'Data_de_Entrega']) || ''),
              municipio: String(get(['Municipio']) || ''),
              uf: String(get(['UF']) || ''),
              metodoEntrega: String(get(['Metodo_de_entrega', 'Método de entrega', 'Metodo Entrega']) || ''),
              requisicaoLoja: String(get(['Requisicao de Loja do grupo ?'])).toLowerCase().includes('sim'),
              // Novos mapeamentos de localização
              localEntregaDif: Number(get(['localEntregaDifEnderecoDestinatario', 'Local Entrega Dif']) || 0),
              municipioCliente: String(get(['Municipio_Cliente', 'Municipio Cliente']) || ''),
              ufCliente: String(get(['UF_Cliente', 'UF Cliente']) || ''),
              municipioEntrega: String(get(['Municipio_Entrega', 'Municipio Entrega']) || ''),
              ufEntrega: String(get(['UF_Entrega', 'UF Entrega']) || '')
            };
          });

          onImportOrders(mappedOrders);
          setSuccessMsg(`Sincronização concluída: ${mappedOrders.length} pedidos ativos.`);
        } else {
          const mappedStock: StockItem[] = json.map(row => ({
            idProduto: Number(row['idProduto'] || 0),
            codigo: String(row['Codigo'] || row['codigo'] || ''),
            idTipoProduto: Number(row['idTipoProduto'] || 0),
            setorEstoquePadrao: String(row['SetorEstoquePadrao'] || ''),
            descricao: String(row['Descricao'] || row['descricao'] || ''),
            setorEstoque: String(row['setorEstoque'] || ''),
            saldoSetorFinal: Number(row['saldoSetorFinal'] || 0)
          }));

          onImportStock(mappedStock);
          setSuccessMsg(`Estoque atualizado: ${mappedStock.length} saldos sincronizados.`);
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
          <div className="flex gap-2 mb-8 bg-gray-100 dark:bg-[#1a1a1a] p-1 rounded-xl">
            <button disabled={loading} onClick={() => setActiveType('ROMANEIO')} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-bold transition-all ${activeType === 'ROMANEIO' ? 'bg-white dark:bg-darkBg shadow-sm text-secondary' : 'text-neutral opacity-60'}`}>
              <FileText className="w-4 h-4" /> Romaneio / Pedidos
            </button>
            <button disabled={loading} onClick={() => setActiveType('ESTOQUE')} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-bold transition-all ${activeType === 'ESTOQUE' ? 'bg-white dark:bg-darkBg shadow-sm text-secondary' : 'text-neutral opacity-60'}`}>
              <Database className="w-4 h-4" /> Estoque Atual
            </button>
          </div>

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

          <div className="mt-6 p-4 bg-orange-50 dark:bg-orange-900/10 rounded-xl flex gap-3 border border-orange-100 dark:border-orange-800">
            <RefreshCw className="w-5 h-5 text-orange-500 shrink-0" />
            <div className="text-[11px] text-orange-700 dark:text-orange-300 leading-relaxed">
              <strong>Atenção (Modo Sincronização):</strong> Ao importar, o sistema substituirá os dados atuais pelos deste arquivo. Pedidos que não constarem no arquivo serão removidos do sistema.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ImportModal;
