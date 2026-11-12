import { Injectable, computed, signal } from '@angular/core';

/** Chaves do localStorage (as mesmas do app antigo em JavaScript puro, para não perder sessão nem rascunhos). */
export const CHAVE_AUTH = 'retifica_auth';
export const CHAVE_LOGO = 'retifica_logo';
export const CHAVE_RASCUNHOS = 'retifica_rascunhos';
export const CHAVE_CLIENTES_RECENTES = 'retifica_clientes_recentes';
export const CHAVE_DITADO_AVISO = 'retifica_ditado_aviso';

/** Formato gravado em `retifica_auth` (resposta de /api/auth/login ou /api/auth/demo). */
export interface SessaoAuth {
  token: string;
  nome?: string;
  empresaNome?: string;
  [outro: string]: unknown;
}

export interface ClaimsToken {
  usuarioId?: number | string;
  empresaId?: number | string;
  /** Sessão de demonstração (dados fictícios, apagada no fim do prazo). */
  demo?: boolean;
  /** Fim da validade, em segundos desde 1970 (padrão do JWT). */
  exp?: number;
  [outro: string]: unknown;
}

/** Resultado de abrir a demonstração. */
export type ResultadoDemo = 'ok' | 'limite' | 'indisponivel' | 'semConexao';

/** Lê as claims de um JWT (sem validar a assinatura: só leitura do que o servidor já emitiu). */
export function claimsDoToken(token: string | undefined | null): ClaimsToken | null {
  try {
    if (!token) return null;
    const partes = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(partes), c => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as ClaimsToken;
  } catch {
    return null;
  }
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  /** Sessão atual (espelho reativo do localStorage). */
  readonly sessao = signal<SessaoAuth | null>(this.lerAuth());

  /** Fim da demonstração, se a sessão atual for de demonstração; null numa sessão normal. */
  readonly demoExpiraEm = computed<Date | null>(() => {
    const c = claimsDoToken(this.sessao()?.token);
    return c?.demo && typeof c.exp === 'number' ? new Date(c.exp * 1000) : null;
  });

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
   * Tela de login: fetch direto, sem o interceptor — um 401 aqui é "senha errada", não sessão
   * vencida. Grava a sessão se entrou.
   */
  async entrar(email: string, senha: string): Promise<'ok' | 'invalido' | 'semConexao'> {
    let resp: Response;
    try {
      resp = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, senha }),
      });
    } catch {
      return 'semConexao';
    }
    if (!resp.ok) return 'invalido';
    this.gravar((await resp.json()) as SessaoAuth);
    return 'ok';
  }

  /**
   * Abre uma demonstração: o servidor cria uma empresa isolada com dados fictícios e devolve uma
   * sessão que vale 2 horas. 429 = muitas demonstrações agora; 503 = desligada.
   */
  async entrarDemo(): Promise<ResultadoDemo> {
    let resp: Response;
    try {
      resp = await fetch('/api/auth/demo', { method: 'POST' });
    } catch {
      return 'semConexao';
    }
    if (resp.status === 429) return 'limite';
    if (!resp.ok) return 'indisponivel';
    this.gravar((await resp.json()) as SessaoAuth);
    return 'ok';
  }

  /** Claims do JWT da sessão (sem validar assinatura: só leitura do que o servidor já emitiu). */
  claims(): ClaimsToken | null {
    return claimsDoToken(this.lerAuth()?.token);
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
