import React, { useState } from 'react';
import { X, Upload, CheckCircle, AlertCircle } from 'lucide-react';
import * as XLSX from 'xlsx';
import { ProjecaoImportada } from '../types';

interface Props {
  onClose: () => void;
  onImportSimulation: (rows: ProjecaoImportada[], considerarRequisicoes: boolean) => void | Promise<void>;
}

const ImportSimulationModal: React.FC<Props> = ({ onClose, onImportSimulation }) => {
  const [considerarRequisicoes, setConsiderarRequisicoes] = useState<boolean | null>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const parseFile = async (file: File) => {
    if (considerarRequisicoes === null) {
      setErrorMsg('Selecione se deseja considerar requisições antes de importar.');
      return;
    }

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
          throw new Error('O arquivo parece estar vazio.');
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

            const qtdeRaw = get([
              'qtdepententereal',
              'qtdepentendereall',
              'qtdepentendere',
              'qtdpendente',
              'qtdpendentereal',
              'qtdependentereal',
              'qtdependentereal',
            ]);
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

        await Promise.resolve(onImportSimulation(mappedProjection, considerarRequisicoes));
        setSuccessMsg(
          `Simulação importada: ${mappedProjection.length} registros. Requisições: ${considerarRequisicoes ? 'Sim' : 'Não'}.`
        );

        setTimeout(() => {
          setSuccessMsg('');
          onClose();
        }, 2000);
      } catch (err: unknown) {
        setErrorMsg(`Erro ao processar: ${err instanceof Error ? err.message : 'Erro desconhecido'}`);
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
    if (loading) return;
    const file = e.dataTransfer.files[0];
    if (file) parseFile(file);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-[#252525] w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="bg-primary p-4 text-white flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-lg">
              <Upload className="w-5 h-5 text-highlight" />
            </div>
            <h2 className="text-xl font-bold">Importar Simulação</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5">
          {/* Pergunta obrigatória */}
          <div className="mb-4 p-4 rounded-xl border-2 border-secondary/30 bg-blue-50/50 dark:bg-blue-900/10">
            <p className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-3">
              Deseja considerar requisições?
            </p>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="considerarRequisicoes"
                  checked={considerarRequisicoes === true}
                  onChange={() => setConsiderarRequisicoes(true)}
                  disabled={loading}
                />
                <span className="text-sm font-medium">Sim</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="considerarRequisicoes"
                  checked={considerarRequisicoes === false}
                  onChange={() => setConsiderarRequisicoes(false)}
                  disabled={loading}
                />
                <span className="text-sm font-medium">Não</span>
              </label>
            </div>
            <p className="mt-2 text-[11px] text-neutral">
              Se <strong>Não</strong>, a coluna &quot;Só Móveis&quot; não será exibida e seus dados serão ignorados nos cálculos.
            </p>
          </div>

          {/* Área de upload */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer relative ${
              dragging ? 'border-secondary bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700 hover:border-neutral'
            } ${loading ? 'opacity-50 cursor-wait' : ''}`}
          >
            {loading ? (
              <div className="flex flex-col items-center gap-3">
                <div className="w-10 h-10 border-4 border-secondary border-t-transparent rounded-full animate-spin"></div>
                <p className="text-sm font-medium">Importando simulação...</p>
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
            ) : (
              <>
                <div className="bg-gray-100 dark:bg-[#2a2a2a] w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Upload className="w-8 h-8 text-neutral" />
                </div>
                <h3 className="font-bold text-lg mb-2">Arraste seu arquivo aqui</h3>
                <p className="text-sm text-neutral mb-2">ou clique na área para selecionar</p>
                <p className="text-[11px] text-neutral mb-4 max-w-xs mx-auto">
                  Mesmo layout da projeção oficial (idChave, Observações, RM, PD, Cliente, Cod, Qtde Pendente Real, Previsão Atual, etc.).
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

          <p className="mt-4 text-[11px] text-neutral italic">
            Os dados da simulação ficam apenas no seu navegador (LocalStorage) e não afetam a projeção oficial.
          </p>
        </div>
      </div>
    </div>
  );
};

export default ImportSimulationModal;
