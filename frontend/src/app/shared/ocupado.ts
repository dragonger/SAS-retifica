import { WritableSignal } from '@angular/core';

/**
 * Equivale ao comBotaoOcupado do app.js: liga `ocupado` (o botão fica
 * desabilitado e com o texto "Salvando…") enquanto `acao` roda, evitando envio
 * duplicado. Erros da `acao` são engolidos aqui: o interceptor já mostrou o
 * toast; quem precisa de mensagem específica trata dentro da própria `acao`.
 * Devolve undefined se já estava ocupado ou se falhou.
 */
export async function comOcupado<T>(ocupado: WritableSignal<boolean>, acao: () => Promise<T>): Promise<T | undefined> {
  if (ocupado()) return undefined;
  ocupado.set(true);
  try {
    return await acao();
  } catch {
    return undefined;
  } finally {
    ocupado.set(false);
  }
}
