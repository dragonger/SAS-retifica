import { Injectable, inject } from '@angular/core';
import { DadosRascunho } from '../shared/rascunho-pedido';
import { AuthService, CHAVE_RASCUNHOS } from './auth.service';

export const RASCUNHOS_MAX = 5;
export const RASCUNHO_VALIDADE_MS = 14 * 24 * 60 * 60 * 1000;

/** Como cada rascunho fica gravado: `{ "<usuarioId>|<empresaId>": { "novo" | "pedido:<id>": { quando, titulo, dados } } }`. */
export interface RascunhoGuardado {
  quando: number;
  titulo: string;
  dados: DadosRascunho;
}

export interface Rascunho extends RascunhoGuardado {
  chave: string;
}

/**
 * Rascunhos do pedido (rascunhos do pedido em app.js). O que foi digitado num pedido novo (ou na edição de um
 * pedido) fica guardado neste aparelho e dá pra voltar a ele depois. Separado por usuário/empresa (lidos do JWT) e
 * mantido mesmo se o token expirar no meio da edição. No máximo 5 por dono, válidos por 14 dias.
 */
@Injectable({ providedIn: 'root' })
export class RascunhoService {
  private readonly auth = inject(AuthService);

  /** Chave do rascunho que a pessoa mandou continuar (cartão "Pedido incompleto"): o formulário não pergunta de novo. */
  private chaveARetomar: string | null = null;

  private lerTodos(): Record<string, Record<string, RascunhoGuardado>> {
    try {
      return JSON.parse(localStorage.getItem(CHAVE_RASCUNHOS) || '{}') || {};
    } catch {
      return {};
    }
  }

  private gravarTodos(todos: Record<string, Record<string, RascunhoGuardado>>): void {
    try {
      localStorage.setItem(CHAVE_RASCUNHOS, JSON.stringify(todos));
    } catch { /* sem espaço/modo privado: segue sem rascunho */ }
  }

  /** Rascunhos do dono atual, sem os vencidos, do mais recente para o mais antigo. */
  listar(): Rascunho[] {
    const meus = this.lerTodos()[this.auth.donoDosRascunhos()] || {};
    const agora = Date.now();
    return Object.entries(meus)
      .filter(([, r]) => r && agora - r.quando < RASCUNHO_VALIDADE_MS)
      .map(([chave, r]) => ({ chave, ...r }))
      .sort((a, b) => b.quando - a.quando);
  }

  ler(chave: string): Rascunho | null {
    return this.listar().find(r => r.chave === chave) || null;
  }

  gravar(chave: string, titulo: string, dados: DadosRascunho): void {
    const todos = this.lerTodos();
    const dono = this.auth.donoDosRascunhos();
    if (dono === 'anonimo') return; // sem sessão não há de quem guardar (evita rascunho órfão)
    const meus = { ...(todos[dono] || {}), [chave]: { quando: Date.now(), titulo, dados } };
    const maisRecentes = Object.entries(meus).sort((a, b) => b[1].quando - a[1].quando).slice(0, RASCUNHOS_MAX);
    todos[dono] = Object.fromEntries(maisRecentes);
    this.gravarTodos(todos);
  }

  remover(chave: string): void {
    const todos = this.lerTodos();
    const dono = this.auth.donoDosRascunhos();
    if (todos[dono] && chave in todos[dono]) {
      delete todos[dono][chave];
      this.gravarTodos(todos);
    }
  }

  /** O cartão "Continuar" marca o rascunho para o formulário abrir direto nele. */
  marcarParaRetomar(chave: string): void {
    this.chaveARetomar = chave;
  }

  /** Lê e zera a marca: true se o formulário desta `chave` deve aplicar o rascunho sem perguntar. */
  consumirRetomada(chave: string): boolean {
    const usar = this.chaveARetomar === chave;
    this.chaveARetomar = null;
    return usar;
  }
}
