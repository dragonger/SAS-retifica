/**
 * Total do pedido: MESMA fórmula do backend (PedidoModel.getSubtotal / getValorDesconto / recalcularTotal),
 * para a barra do formulário nunca mostrar um número que o servidor depois recalcula diferente.
 *
 * - subtotal = soma de (serviços + peças) de cada categoria marcada;
 * - desconto VALOR = o valor digitado; PERCENTUAL = subtotal x % / 100, arredondado em 2 casas (meio para cima),
 *   com a % limitada a 100;
 * - desconto ausente, zero ou negativo não abate; o desconto nunca passa do subtotal (o total nunca fica negativo).
 *
 * A conta é feita em centavos inteiros (e a % em centésimos) para não herdar o erro de ponto flutuante
 * (0,1 + 0,2) que o BigDecimal do servidor não tem.
 */
export interface ValoresDaCategoria {
  valorServicos?: number | string | null;
  valorPecas?: number | string | null;
}

export interface TotaisPedido {
  subtotal: number;
  desconto: number;
  total: number;
}

/** Valor em reais -> centavos inteiros (nulo, vazio e não numérico valem 0). */
function centavos(v: number | string | null | undefined): number {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/** PedidoCategoriaModel.getValorTotal: serviços + peças, ignorando nulos. */
export function valorTotalDaCategoria(valores: ValoresDaCategoria): number {
  return (centavos(valores.valorServicos) + centavos(valores.valorPecas)) / 100;
}

/** PedidoModel.getSubtotal: soma de todas as categorias (zero sem nenhuma). */
export function subtotalDasCategorias(categorias: readonly ValoresDaCategoria[]): number {
  return subtotalEmCentavos(categorias) / 100;
}

function subtotalEmCentavos(categorias: readonly ValoresDaCategoria[]): number {
  let total = 0;
  for (const c of categorias) total += centavos(c.valorServicos) + centavos(c.valorPecas);
  return total;
}

function descontoEmCentavos(subtotal: number, tipo: string | null | undefined, valor: number | string | null | undefined): number {
  if (!tipo || valor === null || valor === undefined || valor === '') return 0;
  const digitado = Number(valor);
  if (!Number.isFinite(digitado) || digitado <= 0) return 0;
  let desconto: number;
  if (tipo === 'PERCENTUAL') {
    const centesimos = Math.min(Math.round(Math.min(digitado, 100) * 100), 10000); // % em centésimos, no máximo 100%
    // subtotal x % / 100, meio para cima: (2 x num + den) / (2 x den), com divisão inteira
    desconto = Math.floor((subtotal * centesimos * 2 + 10000) / 20000);
  } else if (tipo === 'VALOR') {
    desconto = centavos(digitado);
  } else {
    return 0;
  }
  return Math.min(desconto, subtotal);
}

/** PedidoModel.getValorDesconto: desconto efetivo em R$ já resolvido. */
export function valorDoDesconto(subtotal: number, tipo: string | null | undefined, valor: number | string | null | undefined): number {
  return descontoEmCentavos(centavos(subtotal), tipo, valor) / 100;
}

/** Subtotal, desconto e total (PedidoModel.recalcularTotal). */
export function totaisDoPedido(
  categorias: readonly ValoresDaCategoria[],
  tipo: string | null | undefined,
  valor: number | string | null | undefined,
): TotaisPedido {
  const sub = subtotalEmCentavos(categorias);
  const desc = descontoEmCentavos(sub, tipo, valor);
  return { subtotal: sub / 100, desconto: desc / 100, total: (sub - desc) / 100 };
}
