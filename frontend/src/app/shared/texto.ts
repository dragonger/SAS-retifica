/** Comparação de nomes de itens (serviço/peça) sem diferenciar maiúsculas/espaços. */
export function chaveNome(nome: string | null | undefined): string {
  return (nome || '').trim().toLowerCase();
}

// Busca no catálogo (centenas de motores): o nome sem acento é calculado uma
// vez por nome, e a ordenação usa um Collator reaproveitado.
const colecaoNomes = new Intl.Collator('pt-BR', { numeric: true });
const semAcentoCache = new Map<string, string>();

export function semAcentoBusca(v: string | null | undefined): string {
  const texto = v || '';
  let r = semAcentoCache.get(texto);
  if (r === undefined) {
    r = chaveNome(texto).normalize('NFD').replace(/[̀-ͯ]/g, '');
    semAcentoCache.set(texto, r);
  }
  return r;
}

/** Cada palavra do termo precisa aparecer no nome (sem acento/maiúscula); devolve ordenado por nome. */
export function filtrarPorPalavras<T extends { nome?: string | null }>(lista: T[], termo: string): T[] {
  const palavras = semAcentoBusca(termo).split(/\s+/).filter(Boolean);
  return lista
    .filter(c => { const n = semAcentoBusca(c.nome); return palavras.every(pal => n.includes(pal)); })
    .sort((a, b) => colecaoNomes.compare(a.nome || '', b.nome || ''));
}

export function cadastrados(n: number): string {
  return n + (n === 1 ? ' cadastrado' : ' cadastrados');
}
