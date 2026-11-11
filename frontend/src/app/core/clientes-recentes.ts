import { CHAVE_CLIENTES_RECENTES } from './auth.service';

export const CLIENTES_RECENTES_MAX = 6;

/** Ids dos clientes dos últimos pedidos salvos neste aparelho (agiliza escolher o cliente no pedido). */
export function clientesRecentesIds(): number[] {
  try {
    const lista = JSON.parse(localStorage.getItem(CHAVE_CLIENTES_RECENTES) || '[]');
    return Array.isArray(lista) ? lista : [];
  } catch {
    return [];
  }
}

/** Põe o cliente no começo da lista (sem repetir), no máximo 6. */
export function registrarClienteRecente(id: number): void {
  const atuais = clientesRecentesIds().filter(x => x !== id);
  atuais.unshift(id);
  try {
    localStorage.setItem(CHAVE_CLIENTES_RECENTES, JSON.stringify(atuais.slice(0, CLIENTES_RECENTES_MAX)));
  } catch { /* sem espaço/modo privado: segue sem recentes */ }
}
