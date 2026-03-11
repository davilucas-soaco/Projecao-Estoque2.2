
export type UserProfile = 'ADMIN' | 'PCP' | 'CONSULTA';

export interface UserAccount {
  id: string;
  username: string;
  name: string;
  password: string;
  profile: UserProfile;
}

export interface Order {
  codigoRomaneio: string;
  observacoesRomaneio: string;
  dataEmissaoRomaneio: string;
  numeroPedido: string;
  cliente: string;
  dataEmissaoPedido: string;
  codigoProduto: string;
  descricao: string;
  um: string;
  qtdPedida: number;
  qtdVinculada: number;
  tipoProduto: string;
  precoUnitario: number;
  dataEntrega: string;
  municipio: string;
  uf: string;
  metodoEntrega: string;
  requisicaoLoja: boolean;
  // Novos campos para lógica G. Teresina
  localEntregaDif: number;
  municipioCliente: string;
  ufCliente: string;
  municipioEntrega: string;
  ufEntrega: string;
  endereco: string;
}

export interface ProjecaoImportada {
  idChave: string;
  observacoes: string;
  rm: string;
  pd: string;
  cliente: string;
  cod: string;
  descricaoProduto: string;
  setorProducao: string;
  status: string;
  requisicaoLojaGrupo: string;
  uf: string;
  municipioEntrega: string;
  qtdePendenteReal: number;
  tipoF: string;
  emissao: string;
  dataOriginal: string;
  previsaoAnterior: string;
  previsaoAtual: string;
}

export function projecaoImportadaToOrder(row: ProjecaoImportada): Order {
  const qtde = Number.isFinite(row.qtdePendenteReal) ? row.qtdePendenteReal : Number(row.qtdePendenteReal) || 0;
  const requisicaoLoja =
    typeof row.requisicaoLojaGrupo === 'string'
      ? row.requisicaoLojaGrupo.toLowerCase().includes('sim')
      : false;

  return {
    codigoRomaneio: row.rm ?? '',
    observacoesRomaneio: row.observacoes ?? '',
    dataEmissaoRomaneio: row.emissao ?? '',
    numeroPedido: row.pd ?? '',
    cliente: row.cliente ?? '',
    dataEmissaoPedido: row.dataOriginal ?? '',
    codigoProduto: row.cod ?? '',
    descricao: row.descricaoProduto ?? '',
    um: '',
    qtdPedida: qtde,
    qtdVinculada: qtde,
    tipoProduto: row.tipoF ?? '',
    precoUnitario: 0,
    dataEntrega: row.previsaoAtual ?? '',
    municipio: row.municipioEntrega ?? '',
    uf: row.uf ?? '',
    metodoEntrega: '',
    requisicaoLoja,
    localEntregaDif: 0,
    municipioCliente: row.municipioEntrega ?? '',
    ufCliente: row.uf ?? '',
    municipioEntrega: row.municipioEntrega ?? '',
    ufEntrega: row.uf ?? '',
    endereco: '',
  };
}

export function mapProjecaoImportadaToOrders(rows: ProjecaoImportada[]): Order[] {
  return rows.map(projecaoImportadaToOrder);
}

export interface StockItem {
  idProduto: number;
  codigo: string;
  idTipoProduto: number;
  setorEstoquePadrao: string;
  descricao: string;
  setorEstoque: string;
  saldoSetorFinal: number;
}

export interface Route {
  id: string;
  name: string;
  date: string;
  order: number;
}

export interface ShelfFicha {
  id?: string;
  codigoEstante: string;
  descEstante?: string;
  codColuna: string;
  descColuna: string;
  qtdColuna: number;
  codBandeja: string;
  descBandeja: string;
  qtdBandeja: number;
}

export interface DestinoBreakdown {
  destino: string;
  qty: number;
  numeroPedido?: string;
}

export interface RouteCellData {
  pedido: number;
  falta: number;
  breakdown?: DestinoBreakdown[];
  /** Destinos/pedidos que não puderam ser atendidos por falta de estoque (para tooltip da coluna F) */
  breakdownFalta?: DestinoBreakdown[];
}

export interface ComponentData {
  codigo: string;
  descricao: string;
  estoqueAtual: number;
  totalPedido: number;
  falta: number;
  routeData: Record<string, RouteCellData>;
}

export interface ProductConsolidated {
  codigo: string;
  descricao: string;
  estoqueAtual: number;
  totalPedido: number;
  pendenteProducao: number;
  routeData: Record<string, RouteCellData>;
  isShelf?: boolean;
  components?: ComponentData[];
}

/** Coluna de data na projeção (Atrasados ou data específica) */
export interface DateColumn {
  key: string;
  label: string;
  date: Date | null; // null para Atrasados
  isAtrasados: boolean;
}
