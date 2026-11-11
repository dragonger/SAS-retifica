// R$ 4.760,00 — com separador de milhar, igual ao PDF do orçamento.
const FORMATO_MOEDA = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function moeda(v: number | string | null | undefined): string {
  return 'R$ ' + FORMATO_MOEDA.format(Number(v || 0));
}

export function textoQuantidade(n: number): string {
  return n + (n === 1 ? ' virabrequim' : ' virabrequins');
}

/** "2026-10-31" -> "31/10/2026". */
export function formatarDataBr(iso: string): string {
  const [ano, mes, dia] = iso.split('-');
  return dia + '/' + mes + '/' + ano;
}
