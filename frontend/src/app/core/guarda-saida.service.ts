import { Injectable, inject } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';
import { DialogoService } from './dialogo.service';

/**
 * Guarda de saída (dados não salvos). Cada tela com formulário devolve uma
 * destas; qualquer mudança de rota (abas, logo, voltar, botão voltar do
 * aparelho) passa por aqui antes de largar o que ainda não foi salvo.
 */
export interface GuardaSaida {
  sujo(): boolean;
  tipo: 'pedido' | 'formulario';
  /** Texto do aviso para tipo "formulario" (padrão: alterações perdidas). */
  mensagem?: string;
  /** Rótulo do botão de sair para tipo "formulario" (padrão "Sair sem salvar"). */
  rotuloSair?: string;
  aoGuardar?(): void;
  aoDescartar?(): void;
}

/** Interface que os componentes com formulário implementam. */
export interface ComGuardaSaida {
  guardaSaida(): GuardaSaida | null;
}

const MSG_PEDIDO =
  'Este pedido ainda não foi salvo. Se sair, suas alterações ficam guardadas como rascunho neste aparelho, e você volta a ele pelo aviso "Pedido incompleto" na tela inicial.';
const MSG_FORMULARIO = 'Você tem alterações que ainda não foram salvas. Se sair agora, elas serão perdidas.';

@Injectable({ providedIn: 'root' })
export class GuardaSaidaService {
  private readonly dialogo = inject(DialogoService);

  /** Componente da rota ativa (registrado pelo (activate) do router-outlet). */
  private componente: Partial<ComGuardaSaida> | null = null;
  private perguntando = false;

  constructor() {
    // Fechar/recarregar a aba: pedido já vira rascunho (grava na hora); os
    // outros formulários mostram o aviso nativo do navegador.
    window.addEventListener('beforeunload', ev => this.aoSairDaPagina(ev));
    window.addEventListener('pagehide', ev => this.aoSairDaPagina(ev));
  }

  registrar(componente: unknown): void {
    this.componente = (componente ?? null) as Partial<ComGuardaSaida> | null;
  }

  desregistrar(): void {
    this.componente = null;
  }

  /** Guarda atual (da tela ativa), ou null. */
  atual(): GuardaSaida | null {
    return this.doComponente(this.componente);
  }

  doComponente(componente: Partial<ComGuardaSaida> | null | undefined): GuardaSaida | null {
    try {
      return componente?.guardaSaida?.() ?? null;
    } catch {
      return null;
    }
  }

  sujo(g: GuardaSaida | null = this.atual()): boolean {
    try {
      return !!(g && g.sujo());
    } catch {
      return false;
    }
  }

  /** 401: grava o rascunho do pedido ANTES de limpar a sessão (ela diz de quem é o rascunho). */
  guardarSeSujo(): void {
    const g = this.atual();
    if (this.sujo(g) && g?.aoGuardar) g.aoGuardar();
  }

  /** Pergunta ao usuário; resolve true se a navegação pode seguir. */
  async perguntarSaida(g: GuardaSaida): Promise<boolean> {
    if (this.perguntando) return false;
    this.perguntando = true;
    const ehPedido = g.tipo === 'pedido';
    try {
      const resposta = await this.dialogo.escolher<'ficar' | 'guardar' | 'descartar'>(
        ehPedido ? MSG_PEDIDO : (g.mensagem || MSG_FORMULARIO),
        ehPedido
          ? [
            { rotulo: 'Continuar editando', valor: 'ficar', estilo: 'btn-primary' },
            { rotulo: 'Sair e guardar rascunho', valor: 'guardar' },
            { rotulo: 'Descartar', valor: 'descartar', estilo: 'btn-danger' },
          ]
          : [
            { rotulo: 'Continuar editando', valor: 'ficar', estilo: 'btn-primary' },
            { rotulo: g.rotuloSair || 'Sair sem salvar', valor: 'descartar', estilo: 'btn-danger' },
          ]);
      if (resposta === 'ficar') return false;
      if (resposta === 'guardar' && g.aoGuardar) g.aoGuardar();
      if (resposta === 'descartar' && g.aoDescartar) g.aoDescartar();
      return true;
    } finally {
      this.perguntando = false;
    }
  }

  private aoSairDaPagina(ev: Event): void {
    const g = this.atual();
    if (!this.sujo(g) || !g) return;
    if (g.tipo === 'pedido') {
      if (g.aoGuardar) g.aoGuardar();
    } else if (ev.type === 'beforeunload') {
      ev.preventDefault();
      (ev as BeforeUnloadEvent).returnValue = '';
    }
  }
}

/** CanDeactivate das rotas com formulário: pergunta antes de largar alterações. */
export const guardaDeSaida: CanDeactivateFn<Partial<ComGuardaSaida>> = (componente) => {
  const servico = inject(GuardaSaidaService);
  const g = servico.doComponente(componente);
  if (!g || !servico.sujo(g)) return true;
  return servico.perguntarSaida(g);
};
