import { Injectable, signal } from '@angular/core';

export interface OpcaoDialogo<T = unknown> {
  rotulo: string;
  valor: T;
  /** Classe do botão além de "btn" (padrão "btn-secondary"). */
  estilo?: string;
}

export interface OpcoesEscolher {
  /** Índice do botão que recebe o foco (padrão 0). */
  foco?: number;
  /** Botões lado a lado (2 opções curtas) em vez de empilhados. */
  linha?: boolean;
}

export interface DialogoAberto {
  mensagem: string;
  opcoes: OpcaoDialogo[];
  foco: number;
  linha: boolean;
  responder: (valor: unknown) => void;
}

export const DURACAO_TOAST_MS = 3200;

/**
 * Toast e diálogos no visual do app (o confirm() nativo destoa e, no Android,
 * mostra o domínio do site no título). Equivale a toast/escolher/confirmar do app.js.
 */
@Injectable({ providedIn: 'root' })
export class DialogoService {
  readonly toastTexto = signal('');
  readonly toastErro = signal(false);
  readonly toastVisivel = signal(false);

  /** Pilha de diálogos abertos; o shell desenha o do topo. */
  readonly dialogos = signal<DialogoAberto[]>([]);

  private temporizadorToast: ReturnType<typeof setTimeout> | undefined;

  toast(msg: string, erro = false): void {
    this.toastTexto.set(msg);
    this.toastErro.set(!!erro);
    this.toastVisivel.set(true);
    clearTimeout(this.temporizadorToast);
    this.temporizadorToast = setTimeout(() => this.toastVisivel.set(false), DURACAO_TOAST_MS);
  }

  /**
   * Resolve com o `valor` da opção tocada; Esc ou toque fora escolhem a
   * PRIMEIRA opção, que deve ser sempre a segura.
   */
  escolher<T>(mensagem: string, opcoes: OpcaoDialogo<T>[], { foco = 0, linha = false }: OpcoesEscolher = {}): Promise<T> {
    return new Promise<T>(resolve => {
      const teclado = (ev: KeyboardEvent) => {
        // só o diálogo do topo reage ao Esc
        if (ev.key === 'Escape' && this.dialogos().at(-1) === dialogo) dialogo.responder(opcoes[0].valor);
      };
      const dialogo: DialogoAberto = {
        mensagem, opcoes, foco, linha,
        responder: (valor: unknown) => {
          document.removeEventListener('keydown', teclado);
          this.dialogos.update(lista => lista.filter(d => d !== dialogo));
          resolve(valor as T);
        },
      };
      document.addEventListener('keydown', teclado);
      this.dialogos.update(lista => [...lista, dialogo]);
    });
  }

  /** Confirmação sim/não. Resolve true/false. */
  confirmar(mensagem: string, rotuloConfirmar?: string, perigoso?: boolean): Promise<boolean> {
    return this.escolher<boolean>(mensagem, [
      { rotulo: 'Cancelar', valor: false },
      { rotulo: rotuloConfirmar || 'Confirmar', valor: true, estilo: perigoso ? 'btn-danger' : 'btn-primary' },
    ], { linha: true, foco: perigoso ? 0 : 1 }); // ação destrutiva: Enter cancela em vez de apagar
  }
}
