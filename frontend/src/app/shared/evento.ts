/** Valor atual do campo que disparou o evento (input/select/textarea). */
export function valorDe(ev: Event): string {
  return (ev.target as HTMLInputElement).value;
}
