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

/** Data ISO completa (com hora) ou só a data -> "dd/mm/aaaa" local; vazio se não houver (textoDataIso do app.js). */
export function textoDataIso(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? String(iso).slice(0, 10) : d.toLocaleDateString('pt-BR');
}

/** "2026-10" -> "Outubro de 2026" (rotuloMes do app.js). */
export function rotuloMes(aaaamm: string): string {
  const [ano, mes] = String(aaaamm).split('-').map(Number);
  if (!ano || !mes) return aaaamm;
  const t = new Date(ano, mes - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return t.charAt(0).toUpperCase() + t.slice(1);
}
