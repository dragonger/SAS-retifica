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
