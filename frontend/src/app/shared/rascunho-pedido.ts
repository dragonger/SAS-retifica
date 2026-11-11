import { CategoriaMarcada, ClienteEscolhido, ComponentePedido, ItemPedido } from './modelos';

/** Etapas do formulário do pedido, na ordem do assistente (ORDEM_PASSOS do app.js). */
export const ORDEM_ABAS = ['cliente', 'pedido', 'componentes', 'itens'] as const;
export type Aba = (typeof ORDEM_ABAS)[number];

export const STATUS_OPCOES: readonly (readonly [string, string])[] = [['ABERTO', 'Aberto'], ['EM_ANDAMENTO', 'Em andamento'], ['PRONTO', 'Pronto']];

/** O que o usuário preencheu no formulário do pedido (o que vai para o rascunho, menos a etapa). */
export interface PartesDoFormulario {
  cliente: ClienteEscolhido | null;
  status: string;
  descricao: string;
  entrega: string;
  observacao: string;
  descontoTipo: string;
  descontoValor: string;
  categorias: CategoriaMarcada[];
  componentes: ComponentePedido[];
  servicos: ItemPedido[];
  pecas: ItemPedido[];
}

/**
 * Formato do rascunho em `retifica_rascunhos` (dadosDoRascunho do app.js). É o MESMO do app atual: um rascunho
 * feito num abre no outro. `aba` só serve para voltar de onde parou e não conta como alteração.
 */
export interface DadosRascunho extends PartesDoFormulario {
  aba?: string;
}

/** dadosDoRascunho do app.js: a ordem das chaves é a do app atual (a "fotografia" compara texto). */
export function dadosDoRascunho(p: PartesDoFormulario, aba?: string): DadosRascunho {
  const d: DadosRascunho = {
    cliente: p.cliente,
    status: p.status,
    descricao: p.descricao,
    entrega: p.entrega,
    observacao: p.observacao,
    descontoTipo: p.descontoTipo,
    descontoValor: p.descontoValor,
    categorias: p.categorias,
    componentes: p.componentes,
    servicos: p.servicos,
    pecas: p.pecas,
  };
  if (aba !== undefined) d.aba = aba;
  return d;
}

/**
 * "Fotografia" do formulário (JSON dos dados, sem a etapa): igual à tirada ao abrir = nada mudou = o rascunho
 * é removido em vez de gravado.
 */
export function fotografiaDoRascunho(p: PartesDoFormulario): string {
  return JSON.stringify(dadosDoRascunho(p));
}

/** Linha do cartão "Pedido incompleto": cliente e, se houver, a descrição. */
export function tituloDoRascunho(cliente: ClienteEscolhido | null, descricao: string): string {
  const nome = cliente ? cliente.nome : 'Sem cliente';
  const d = descricao.trim();
  return d ? nome + ' · ' + d : nome;
}

/** Lê um rascunho (possivelmente feito pelo app atual) de volta para os campos (parte de aplicarRascunho do app.js). */
export function partesDoRascunho(d: Partial<DadosRascunho>, statusAtual: string): PartesDoFormulario {
  return {
    cliente: d.cliente || null,
    status: d.status || statusAtual,
    descricao: d.descricao || '',
    entrega: d.entrega || '',
    observacao: d.observacao || '',
    descontoTipo: d.descontoTipo || '',
    descontoValor: d.descontoValor != null ? String(d.descontoValor) : '',
    categorias: (d.categorias || []).map(([cat, v]) => [cat, {
      valorServicos: (v && v.valorServicos) || 0,
      valorPecas: (v && v.valorPecas) || 0,
    }] as CategoriaMarcada),
    componentes: d.componentes || [],
    servicos: d.servicos || [],
    pecas: d.pecas || [],
  };
}

/** Chave do rascunho no localStorage: "novo" ou "pedido:<id>". */
export function chaveDoRascunho(id: string | number | null | undefined): string {
  return id ? 'pedido:' + id : 'novo';
}

/** Rota (sem o "#") para onde o cartão "Continuar" leva. */
export function rotaDoRascunho(chave: string): string {
  return chave === 'novo' ? '/pedidos/novo' : '/pedidos/' + chave.slice('pedido:'.length) + '/editar';
}

/** "agora há pouco" / "há 5 min" / "há 3 h" / "há 2 dias". */
export function haQuanto(ms: number, agora = Date.now()): string {
  const min = Math.max(0, Math.round((agora - ms) / 60000));
  if (min < 1) return 'agora há pouco';
  if (min < 60) return 'há ' + min + ' min';
  const h = Math.round(min / 60);
  if (h < 24) return 'há ' + h + ' h';
  const d = Math.round(h / 24);
  return 'há ' + d + (d === 1 ? ' dia' : ' dias');
}
