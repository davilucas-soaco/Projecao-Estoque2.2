
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
  codigoEstante: string;
  codColuna: string;
  descColuna: string;
  qtdColuna: number;
  codBandeja: string;
  descBandeja: string;
  qtdBandeja: number;
}

export interface ComponentData {
  codigo: string;
  descricao: string;
  estoqueAtual: number;
  totalPedido: number;
  falta: number;
  routeData: Record<string, { pedido: number; falta: number }>;
}

export interface ProductConsolidated {
  codigo: string;
  descricao: string;
  estoqueAtual: number;
  totalPedido: number;
  pendenteProducao: number;
  routeData: Record<string, { pedido: number; falta: number }>;
  isShelf?: boolean;
  components?: ComponentData[];
}
