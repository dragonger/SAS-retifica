import { Component, ElementRef, Injector, afterNextRender, inject, input, output, signal, viewChild } from '@angular/core';
import { DialogoService } from '../core/dialogo.service';
import { GuardaSaida } from '../core/guarda-saida.service';

/**
 * Formulário recolhido atrás de "Novo …" (formularioRecolhivel do app.js).
 * Tocar num item da lista chama `abrir(item)`: o formulário abre já preenchido
 * (modo edição) e a tela rola até ele — quem rola é o <main>, por isso scrollIntoView.
 *
 * O conteúdo projetado é o `<form>`. A tela guarda os campos em signals e
 * informa `fotografia` (os valores juntos); alterações não salvas = fotografia
 * diferente da que havia ao abrir. `preencher`/`limpar` são emitidos de forma
 * síncrona, então a fotografia tirada logo depois já enxerga os valores novos.
 */
@Component({
  selector: 'app-formulario-recolhivel',
  template: `
    <div style="margin-bottom:8px">
      <button type="button" class="btn btn-secondary btn-block" style="gap:8px" [hidden]="aberto()" (click)="abrir(null)">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="flex:none"><path d="M12 5v14"></path><path d="M5 12h14"></path></svg>{{ rotuloNovo() }}
      </button>
      <div #caixa class="caixa-form elev-sm blueprint" [hidden]="!aberto()">
        <i class="corner tl"></i><i class="corner tr"></i><i class="corner bl"></i><i class="corner br"></i>
        <div class="caixa-form-titulo">{{ emEdicao() ? tituloEditar() : tituloNovo() }}</div>
        <ng-content />
      </div>
    </div>
  `,
})
export class FormularioRecolhivel<T = unknown> {
  private readonly dialogo = inject(DialogoService);
  private readonly injector = inject(Injector);

  readonly rotuloNovo = input.required<string>();
  readonly tituloNovo = input.required<string>();
  readonly tituloEditar = input.required<string>();
  /** Valores atuais dos campos, juntos num texto (para detectar alterações não salvas). */
  readonly fotografia = input.required<() => string>();

  readonly preencher = output<T>();
  readonly limpar = output<void>();

  readonly aberto = signal(false);
  readonly emEdicao = signal(false);

  private readonly caixa = viewChild.required<ElementRef<HTMLElement>>('caixa');
  private linhaBase = '';

  sujo(): boolean {
    return this.aberto() && this.fotografia()() !== this.linhaBase;
  }

  /** Guarda de saída da tela (dados não salvos): a tela devolve isto no `guardaSaida()` dela. */
  guardaSaida(): GuardaSaida {
    return { tipo: 'formulario', sujo: () => this.sujo() };
  }

  /** true = pode seguir (nada a perder, ou a pessoa aceitou descartar). */
  private async podeDescartar(): Promise<boolean> {
    if (!this.sujo()) return true;
    return this.dialogo.escolher<boolean>('Você tem alterações que ainda não foram salvas neste formulário. Se continuar, elas serão perdidas.', [
      { rotulo: 'Continuar editando', valor: false, estilo: 'btn-primary' },
      { rotulo: 'Descartar alterações', valor: true, estilo: 'btn-danger' },
    ]);
  }

  async abrir(item: T | null): Promise<void> {
    if (!(await this.podeDescartar())) return;
    if (item) this.preencher.emit(item);
    else this.limpar.emit();
    this.emEdicao.set(!!item);
    this.aberto.set(true);
    this.linhaBase = this.fotografia()();
    afterNextRender(() => this.caixa().nativeElement.scrollIntoView?.({ block: 'start', behavior: 'smooth' }), { injector: this.injector });
  }

  fechar(): void {
    this.limpar.emit();
    this.aberto.set(false);
  }

  /** Botão "Cancelar": pergunta antes de jogar fora o que foi digitado. */
  async cancelar(): Promise<void> {
    if (await this.podeDescartar()) this.fechar();
  }
}
