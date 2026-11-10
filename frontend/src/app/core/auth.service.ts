import { Injectable, signal } from '@angular/core';

/** Chaves do localStorage compartilhadas com o app atual (static/app.js). */
export const CHAVE_AUTH = 'retifica_auth';
export const CHAVE_LOGO = 'retifica_logo';
export const CHAVE_RASCUNHOS = 'retifica_rascunhos';
export const CHAVE_CLIENTES_RECENTES = 'retifica_clientes_recentes';
export const CHAVE_DITADO_AVISO = 'retifica_ditado_aviso';

/** Formato gravado em `retifica_auth` (resposta de /api/auth/auto-login). */
export interface SessaoAuth {
  token: string;
  nome?: string;
  empresaNome?: string;
  [outro: string]: unknown;
}

export interface ClaimsToken {
  usuarioId?: number | string;
  empresaId?: number | string;
  [outro: string]: unknown;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  /** Sessão atual (espelho reativo do localStorage). */
  readonly sessao = signal<SessaoAuth | null>(this.lerAuth());

  private autoLoginEmAndamento: Promise<boolean> | null = null;

  lerAuth(): SessaoAuth | null {
    try {
      const bruto = JSON.parse(localStorage.getItem(CHAVE_AUTH) || 'null');
      return bruto && typeof bruto === 'object' ? (bruto as SessaoAuth) : null;
    } catch {
      return null;
    }
  }

  gravar(auth: SessaoAuth): void {
    localStorage.setItem(CHAVE_AUTH, JSON.stringify(auth));
    this.sessao.set(auth);
  }

  /** Troca só o token (cabeçalho X-Auth-Refresh), mantendo o resto da sessão. */
  gravarToken(token: string): void {
    const auth = this.lerAuth();
    if (auth) this.gravar({ ...auth, token });
  }

  /** Atualiza o nome da empresa guardado na sessão (vem de GET /api/empresa). */
  gravarEmpresaNome(empresaNome: string): void {
    const auth = this.lerAuth();
    if (auth && auth.empresaNome !== empresaNome) this.gravar({ ...auth, empresaNome });
  }

  /** Apaga só a sessão. A logo guardada é apagada pelo IdentidadeService. */
  limpar(): void {
    localStorage.removeItem(CHAVE_AUTH);
    this.sessao.set(null);
  }

  /**
   * Login desativado no app atual: sem sessão salva, autentica sozinho via
   * /api/auth/auto-login. Usa fetch direto (como o app.js) para não passar
   * pelo interceptor, que também chama este método no 401.
   * Resolve true se há sessão ao final.
   */
  garantirAutoLogin(): Promise<boolean> {
    if (this.lerAuth()) return Promise.resolve(true);
    if (!this.autoLoginEmAndamento) {
      this.autoLoginEmAndamento = this.autoLogin().finally(() => { this.autoLoginEmAndamento = null; });
    }
    return this.autoLoginEmAndamento;
  }

  /** Força um novo auto-login (usado depois de um 401, quando a sessão já foi limpa). */
  private async autoLogin(): Promise<boolean> {
    try {
      const resp = await fetch('/api/auth/auto-login', { method: 'POST' });
      if (!resp.ok) return false;
      const dados = (await resp.json()) as SessaoAuth;
      this.gravar(dados);
      return true;
    } catch {
      // sem conexão: a próxima navegação tenta de novo
      return false;
    }
  }

  /** Claims do JWT (sem validar assinatura: só leitura do que o servidor já emitiu). */
  claims(): ClaimsToken | null {
    try {
      const token = this.lerAuth()?.token;
      if (!token) return null;
      const partes = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const bytes = Uint8Array.from(atob(partes), c => c.charCodeAt(0));
      return JSON.parse(new TextDecoder().decode(bytes)) as ClaimsToken;
    } catch {
      return null;
    }
  }

  usuarioId(): number | string | null {
    return this.claims()?.usuarioId ?? null;
  }

  empresaId(): number | string | null {
    return this.claims()?.empresaId ?? null;
  }

  /** Dono dos rascunhos no localStorage: "usuarioId|empresaId" ou "anonimo" (igual ao app.js). */
  donoDosRascunhos(): string {
    const c = this.claims();
    return c ? c.usuarioId + '|' + c.empresaId : 'anonimo';
  }
}
