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
  categoriaRotulo?: string | null;
  valorTotal?: number | string | null;
  valorServicos?: number | string | null;
  valorPecas?: number | string | null;
}

/** Pedido completo (GET /api/pedidos/{id}). */
export interface PedidoDetalhe {
  id: number;
  cliente?: Cliente | null;
  componentes?: { nome: string; categoriaRotulo?: string | null }[] | null;
  pedidoDescricao?: string | null;
  datCriacao?: string | null;
  datEntregaEstimada?: string | null;
  situacao: string;
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
