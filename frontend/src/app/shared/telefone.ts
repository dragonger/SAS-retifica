export function soDigitos(v: string | null | undefined): string {
  return (v || '').replace(/\D/g, '');
}

/** (31) 98556-5586 / (31) 3333-4444 — também serve pra formatar enquanto digita. */
export function formatarTelefone(v: string | null | undefined): string {
  const d = soDigitos(v).slice(0, 11);
  if (!d) return '';
  if (d.length <= 2) return '(' + d;
  if (d.length <= 6) return '(' + d.slice(0, 2) + ') ' + d.slice(2);
  if (d.length <= 10) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
  return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
}

/** Pra exibir o que já está gravado: formata só telefone brasileiro com DDD (10/11 dígitos); o resto como foi digitado. */
export function telefoneExibicao(v: string | null | undefined): string {
  const n = soDigitos(v).length;
  return n === 10 || n === 11 ? formatarTelefone(v) : (v || '');
}

/** Busca por telefone ignorando a formatação ("3199" acha "(31) 99901-5257"). */
export function telefoneCombina(telefone: string | null | undefined, termo: string): boolean {
  if (/[a-zà-ú]/i.test(termo || '')) return false; // "rua 12" é busca por nome, não telefone
  const d = soDigitos(termo);
  return d.length > 0 && soDigitos(telefone).includes(d);
}

/**
 * Máscara ao digitar (evento `input`). Só reformata ao inserir: ao apagar,
 * reformatar devolveria o "-"/")" na hora e a pessoa não conseguiria apagar.
 * Escreve no campo e devolve o valor final.
 */
export function mascararAoDigitar(ev: Event): string {
  const campo = ev.target as HTMLInputElement;
  const tipo = (ev as InputEvent).inputType;
  if (!(tipo && tipo.startsWith('delete'))) campo.value = formatarTelefone(campo.value);
  return campo.value;
}

/** Ao sair do campo (evento `blur`): mostra no formato de exibição. */
export function exibirAoSair(ev: Event): string {
  const campo = ev.target as HTMLInputElement;
  campo.value = telefoneExibicao(campo.value);
  return campo.value;
}
