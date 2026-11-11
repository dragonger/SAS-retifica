/** Categoria do catálogo (GET /api/categorias). */
export interface Categoria {
  nome: string;
  rotulo: string;
}

/** Produto (GET /api/cabecotes). */
export interface Cabecote {
  id: number;
  categoria: string;
  categoriaRotulo?: string | null;
  nome: string;
  movelFaixa?: string | null;
  fixoFaixa?: string | null;
}

/** Serviço ou peça do catálogo (GET /api/servicos-catalogo, /api/pecas-catalogo). */
export interface ItemCatalogo {
  id: number;
  categoria: string;
  categoriaRotulo?: string | null;
  nome: string;
  valor?: number | null;
}

/** Cliente (GET /api/clientes). */
export interface Cliente {
  id: number;
  nome: string;
  telefone?: string | null;
  rua?: string | null;
  numero?: string | null;
  bairro?: string | null;
  cep?: string | null;
  municipio?: string | null;
  uf?: string | null;
}

/** Pedido das listas (GET /api/pedidos?abertos=true e /encerrados): campos que a lista usa além da linha. */
export interface PedidoLista {
  id: number;
  clienteId?: number | null;
  clienteNome?: string | null;
  situacao: string;
  status?: string | null;
  atrasado?: boolean;
  componentesResumo?: string | null;
  dataEntrega?: string | null;
  totalGeral?: number | string | null;
  finalizado?: boolean;
}

/** Item de serviço ou peça do pedido (GET /api/pedidos/{id}). */
export interface ItemPedido {
  descricao: string;
  categoria?: string | null;
  quantidade?: number;
}

export interface CategoriaValor {
  categoria?: string | null;
  categoriaRotulo?: string | null;
  valorTotal?: number | string | null;
  valorServicos?: number | string | null;
  valorPecas?: number | string | null;
}

/** Pedido completo (GET /api/pedidos/{id}). */
export interface PedidoDetalhe {
  id: number;
  cliente?: Cliente | null;
  componentes?: { id?: number; nome: string; categoriaRotulo?: string | null }[] | null;
  pedidoDescricao?: string | null;
  datCriacao?: string | null;
  datEntregaEstimada?: string | null;
  situacao: string;
  /** ABERTO | EM_ANDAMENTO | PRONTO (o formulário de edição escolhe entre estes). */
  status?: string | null;
  finalizado?: boolean;
  servicos?: ItemPedido[] | null;
  pecas?: ItemPedido[] | null;
  categoriaValores?: CategoriaValor[] | null;
  observacao?: string | null;
  descontoTipo?: string | null;
  descontoValor?: number | null;
  subtotal?: number | null;
  totalGeral?: number | null;
}

/** Cliente escolhido no formulário do pedido (também é o que vai para o rascunho). */
export interface ClienteEscolhido {
  id: number;
  nome: string;
  telefone?: string | null;
}

/** Modelo (cabeçote, bloco...) já adicionado ao pedido. */
export interface ComponentePedido {
  id: number;
  nome: string;
}

/** Valor de serviços e de peças de uma categoria marcada no pedido. */
export interface ValoresCategoria {
  valorServicos: number;
  valorPecas: number;
}

/** Categoria marcada + valores, na ordem em que foi marcada (o app.js guarda num Map). */
export type CategoriaMarcada = [string, ValoresCategoria];
