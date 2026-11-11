import { chaveNome } from './texto';
import { CategoriaMarcada, ItemCatalogo, ItemPedido } from './modelos';

/** Categorias com componente técnico (o seletor de modelos só aparece com uma delas marcada). */
export const CATEGORIAS_COMPONENTE = ['CABECOTE', 'BLOCO', 'BIELA', 'VIRABREQUIM'];

/**
 * Mesmo serviço/peça no pedido: mesmo nome e mesma categoria. Item antigo (gravado antes de guardar a
 * categoria) casa com qualquer categoria (mesmoItem do app.js).
 */
export function mesmoItem(entrada: Pick<ItemPedido, 'descricao' | 'categoria'>, nome: string, categoria?: string | null): boolean {
  return chaveNome(entrada.descricao) === chaveNome(nome)
    && (!entrada.categoria || !categoria || entrada.categoria === categoria);
}

/** Cópia do item como vem do servidor (clonarItem do app.js; a ordem das chaves é a do envio). */
export function clonarItem(i: ItemPedido): ItemPedido {
  return { descricao: i.descricao, quantidade: i.quantidade, categoria: i.categoria || null };
}

/** Só o catálogo das categorias marcadas (sem nenhuma marcada, o catálogo todo). */
export function catalogoDasCategorias(catalogo: ItemCatalogo[], marcadas: readonly CategoriaMarcada[]): ItemCatalogo[] {
  if (marcadas.length === 0) return catalogo;
  const nomes = new Set(marcadas.map(([nome]) => nome));
  return catalogo.filter(item => nomes.has(item.categoria));
}

/** Itens do catálogo que ainda não estão no pedido (os já adicionados somem da lista de escolha). */
export function itensDisponiveis(catalogo: ItemCatalogo[], marcadas: readonly CategoriaMarcada[], lista: readonly ItemPedido[]): ItemCatalogo[] {
  return catalogoDasCategorias(catalogo, marcadas).filter(item => !lista.some(i => mesmoItem(i, item.nome, item.categoria)));
}

/** Texto da linha do pedido: o nome (e a categoria quando o mesmo nome aparece mais de uma vez) e a quantidade das peças. */
export function rotuloDoItem(lista: readonly ItemPedido[], idx: number, rotuloCategoria: (nome: string) => string, comQuantidade: boolean): string {
  const item = lista[idx];
  // mesmo nome em dois componentes (ex.: Plainar do Bloco e do Cabeçote): mostra de qual é cada um
  const ambiguo = lista.some((o, j) => j !== idx && chaveNome(o.descricao) === chaveNome(item.descricao));
  const rotulo = item.descricao + (ambiguo && item.categoria ? ' · ' + rotuloCategoria(item.categoria) : '');
  return comQuantidade ? rotulo + ' ×' + item.quantidade : rotulo;
}
