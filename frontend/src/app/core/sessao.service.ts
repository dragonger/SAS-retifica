import { Injectable, InjectionToken, inject } from '@angular/core';
import { AuthService, ResultadoDemo } from './auth.service';
import { IdentidadeService } from './identidade.service';

/**
 * Leva o app para `hash` recarregando a página. Usado ao entrar e ao sair: a recarga zera tudo o que
 * ficou na memória (caches de listas, orçamentos preparados), para os dados de uma sessão nunca
 * aparecerem na outra (ex.: sair da demonstração e entrar com a conta da retífica). Os testes trocam.
 */
export const RECARREGAR = new InjectionToken<(hash: string) => void>('RECARREGAR', {
  providedIn: 'root',
  factory: () => (hash: string) => {
    location.hash = hash;
    location.reload();
  },
});

/** Entrar, abrir a demonstração e sair. */
@Injectable({ providedIn: 'root' })
export class SessaoService {
  private readonly auth = inject(AuthService);
  private readonly identidade = inject(IdentidadeService);
  private readonly recarregar = inject(RECARREGAR);

  async entrar(email: string, senha: string): Promise<'ok' | 'invalido' | 'semConexao'> {
    const r = await this.auth.entrar(email, senha);
    if (r === 'ok') this.recarregar('#/inicio');
    return r;
  }

  async abrirDemonstracao(): Promise<ResultadoDemo> {
    const r = await this.auth.entrarDemo();
    if (r === 'ok') this.recarregar('#/inicio');
    return r;
  }

  sair(): void {
    this.auth.limpar();
    this.identidade.limpar();
    this.recarregar('#/login');
  }
}
