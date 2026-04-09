import React, { useState } from 'react';
import { X, Upload, CheckCircle, Package, Database, AlertCircle, Info } from 'lucide-react';
import * as XLSX from 'xlsx';
import { ShelfFicha, ProjecaoImportada } from '../types';
import { validateRmPrevisaoUnica } from '../utils';

interface Props {
  onClose: () => void;
  onImportProjection: (rows: ProjecaoImportada[]) => void | Promise<void>;
  shelfFicha: ShelfFicha[];
  lastProjectionUploadAt?: string | null;
  lastProjectionUploadUser?: string | null;
}

/** Linhas no mesmo layout da planilha / colunas da query ERP (snake_case). */
function shelfFichaToSpreadsheetRows(rows: ShelfFicha[]) {
  return rows.map((f) => ({
    codigo_estante: f.codigoEstante,
    desc_estante: f.descEstante ?? '',
    cod_coluna: f.codColuna,
    desc_coluna: f.descColuna,
    qtd_coluna: f.qtdColuna,
    cod_bandeja: f.codBandeja,
    desc_bandeja: f.descBandeja,
    qtd_bandeja: f.qtdBandeja,
  }));
}

const ImportModal: React.FC<Props> = ({
  onClose,
  onImportProjection,
  shelfFicha,
  lastProjectionUploadAt,
  lastProjectionUploadUser,
}) => {
  const [activeType, setActiveType] = useState<'PROJECAO' | 'FICHA'>('PROJECAO');
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const fichaImportDisabled = activeType === 'FICHA';

  const parseFile = async (file: File) => {
    if (fichaImportDisabled) return;
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

        const normalize = (str: string) =>
          str
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '')
            .trim();

        const mappedProjection: ProjecaoImportada[] = json
          .map((row) => {
            const rowEntries = Object.entries(row);
            const get = (keys: string[]) => {
              const targets = keys.map((k) => normalize(k));
              for (const [rk, value] of rowEntries) {
                if (targets.includes(normalize(rk)) && value !== undefined) return value;
              }
              return '';
            };

            const idChave = String(get(['idchave', 'id_chave', 'id chave']) || '').trim();
            if (!idChave) return null;

            const qtdeRaw = get(['qtdepententereal', 'qtdepentendereall', 'qtdepentendere', 'qtdpendente', 'qtdpendentereal', 'qtdependentereal', 'qtdependentereal']);
            const qtde = Number(qtdeRaw || 0);

            return {
              idChave,
              observacoes: String(get(['observacoes', 'observacao']) || '').trim(),
              rm: String(get(['rm']) || '').trim(),
              pd: String(get(['pd', 'pedido']) || '').trim(),
              cliente: String(get(['cliente']) || '').trim(),
              cod: String(get(['cod', 'codigo', 'codigo_produto']) || '').trim(),
              descricaoProduto: String(get(['descricaodoproduto', 'descricao', 'descricao_produto']) || '').trim(),
              setorProducao: String(get(['setordeproducao', 'setorproducao']) || '').trim(),
              status: String(get(['status', 'stauts']) || '').trim(),
              requisicaoLojaGrupo: String(get(['requisicaodelojadogrupo', 'requisicaodelojadogrupo?']) || '').trim(),
              uf: String(get(['uf']) || '').trim(),
              municipioEntrega: String(get(['municipiodeentrega', 'municipioentrega']) || '').trim(),
              qtdePendenteReal: Number.isFinite(qtde) ? qtde : 0,
              tipoF: String(get(['tipof']) || '').trim(),
              emissao: String(get(['emissao']) || '').trim(),
              dataOriginal: String(get(['dataoriginal']) || '').trim(),
              previsaoAnterior: String(get(['previsaoanterior']) || '').trim(),
              previsaoAtual: String(get(['previsaoatual']) || '').trim(),
            };
          })
          .filter((r): r is ProjecaoImportada => r !== null);

        if (mappedProjection.length === 0) {
          throw new Error('Nenhuma linha válida encontrada (verifique a coluna idChave).');
        }

        const rmError = validateRmPrevisaoUnica(mappedProjection);
        if (rmError) throw new Error(rmError);

        await Promise.resolve(onImportProjection(mappedProjection));
        setSuccessMsg(`Projeção importada: ${mappedProjection.length} registros processados.`);

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

    reader.onerror = () => {
      setErrorMsg('Erro na leitura do arquivo.');
      setLoading(false);
    };
    reader.readAsArrayBuffer(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (loading || fichaImportDisabled) return;
    const file = e.dataTransfer.files[0];
    if (file) parseFile(file);
  };

  const handleExportFicha = () => {
    if (shelfFicha.length === 0) {
      alert('Não há dados de ficha técnica para exportar (verifique a conexão com a API / ERP).');
      return;
    }
    const ws = XLSX.utils.json_to_sheet(shelfFichaToSpreadsheetRows(shelfFicha));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Ficha Técnica');
    XLSX.writeFile(wb, 'ficha_tecnica_estantes.xlsx');
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-[#252525] w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="bg-primary p-4 text-white flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-lg">
              <Upload className="w-5 h-5 text-highlight" />
            </div>
            <h2 className="text-xl font-bold">Importações</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5">
          <div className="flex gap-2 mb-4 bg-gray-100 dark:bg-[#1a1a1a] p-1 rounded-xl">
            <button
              disabled={loading}
              onClick={() => setActiveType('PROJECAO')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-[10px] font-bold transition-all ${
                activeType === 'PROJECAO' ? 'bg-white dark:bg-darkBg shadow-sm text-secondary' : 'text-neutral opacity-60'
              }`}
            >
              <Upload className="w-4 h-4" /> Importar planilha de Projeção
            </button>
            <button
              disabled={loading}
              onClick={() => setActiveType('FICHA')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-[10px] font-bold transition-all ${
                activeType === 'FICHA' ? 'bg-white dark:bg-darkBg shadow-sm text-secondary' : 'text-neutral opacity-60'
              }`}
            >
              <Package className="w-4 h-4" /> Ficha Estantes
            </button>
          </div>

          {activeType === 'FICHA' && (
            <div className="mb-4 flex justify-end">
              <button
                type="button"
                onClick={handleExportFicha}
                className="text-[10px] font-bold flex items-center gap-2 bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-700 px-3 py-1.5 rounded hover:bg-gray-50 dark:hover:bg-[#333] transition-colors shadow-sm"
              >
                <Database className="w-3 h-3" /> Exportar Ficha Atual (ERP)
              </button>
            </div>
          )}

          <div
            onDragOver={(e) => {
              if (fichaImportDisabled) return;
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => !fichaImportDisabled && setDragging(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-all relative ${
              fichaImportDisabled
                ? 'border-gray-300 dark:border-gray-600 bg-gray-100/80 dark:bg-[#1a1a1a] cursor-not-allowed opacity-70 pointer-events-none'
                : dragging
                  ? 'border-secondary bg-blue-50 dark:bg-blue-900/20 cursor-pointer'
                  : 'border-gray-200 dark:border-gray-700 hover:border-neutral cursor-pointer'
            } ${loading ? 'opacity-50 cursor-wait' : ''}`}
          >
            {loading ? (
              <div className="flex flex-col items-center gap-3">
                <div className="w-10 h-10 border-4 border-secondary border-t-transparent rounded-full animate-spin"></div>
                <p className="text-sm font-medium">Importando projeção...</p>
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
                <button
                  onClick={() => setErrorMsg('')}
                  className="mt-2 text-[10px] underline uppercase tracking-widest"
                >
                  Tentar novamente
                </button>
              </div>
            ) : fichaImportDisabled ? (
              <>
                <div className="bg-gray-200 dark:bg-[#2a2a2a] w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Package className="w-8 h-8 text-neutral opacity-50" />
                </div>
                <h3 className="font-bold text-lg mb-2 text-neutral">Importação por planilha desativada</h3>
                <p className="text-sm text-neutral mb-2 max-w-xs mx-auto">
                  A ficha técnica de estantes é carregada automaticamente do ERP (API). Use &quot;Exportar&quot; acima para
                  gerar uma planilha com os dados atuais.
                </p>
              </>
            ) : (
              <>
                <div className="bg-gray-100 dark:bg-[#2a2a2a] w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Upload className="w-8 h-8 text-neutral" />
                </div>
                <h3 className="font-bold text-lg mb-2">Arraste seu arquivo aqui</h3>
                <p className="text-sm text-neutral mb-2">ou clique na área para selecionar</p>
                <p className="text-[11px] text-neutral mb-4 max-w-xs mx-auto">
                  Importe a planilha de projeção (Base teste projeção.xlsx) com colunas como idChave, Observações, RM, PD,
                  Cliente, Cod, Qtde Pendente Real, Emissão e Previsões.
                </p>
                <input
                  type="file"
                  disabled={loading}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                  accept=".xlsx, .xls, .csv"
                  onChange={(e) => e.target.files && parseFile(e.target.files[0])}
                />
                <div className="flex items-center justify-center gap-4 text-[10px] text-neutral font-bold tracking-widest uppercase">
                  <span>Excel</span>
                  <span className="w-1 h-1 rounded-full bg-neutral"></span>
                  <span>CSV</span>
                </div>
              </>
            )}
          </div>

          {lastProjectionUploadAt && (
            <div className="mt-4 p-3 bg-gray-50 dark:bg-[#1f2933] rounded-xl flex gap-3 border border-gray-200 dark:border-gray-700">
              <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
              <p className="text-[11px] text-gray-700 dark:text-gray-200 leading-relaxed">
                <strong>Último upload de projeção:</strong>{' '}
                {lastProjectionUploadAt}
                {lastProjectionUploadUser ? ` por ${lastProjectionUploadUser}` : ''}
              </p>
            </div>
          )}

          {activeType === 'FICHA' && (
            <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/10 rounded-xl flex gap-3 border border-blue-100 dark:border-blue-800">
              <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
              <p className="text-[11px] text-blue-700 dark:text-blue-300 leading-relaxed">
                <strong>Ficha Estantes:</strong> Os dados vêm do ERP via API (mesmas colunas de antes: <em>codigo_estante</em>,{' '}
                <em>desc_estante</em>, <em>cod_coluna</em>, <em>desc_coluna</em>, <em>qtd_coluna</em>, <em>cod_bandeja</em>,{' '}
                <em>desc_bandeja</em>, <em>qtd_bandeja</em>). A exportação gera a planilha nesse formato.
              </p>
            </div>
          )}

          {activeType === 'PROJECAO' && (
            <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/10 rounded-xl flex gap-3 border border-blue-100 dark:border-blue-800">
              <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
              <p className="text-[11px] text-blue-700 dark:text-blue-300 leading-relaxed">
                <strong>Importar projeção:</strong> Use esta aba para carregar a planilha de projeção de pedidos vinda do ERP.
                Os dados serão sincronizados com o Supabase e compartilhados entre todas as máquinas.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ImportModal;
