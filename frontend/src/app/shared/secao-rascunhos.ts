import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { DialogoService } from '../core/dialogo.service';
import { Rascunho, RascunhoService } from '../core/rascunho.service';
import { haQuanto, rotaDoRascunho } from './rascunho-pedido';

/**
 * Cartões "Pedido incompleto" (Início e Pedidos): um por rascunho guardado neste aparelho (secaoRascunhos do app.js).
 * "Continuar" abre o formulário já no rascunho, sem perguntar de novo; "Descartar" apaga depois de confirmar.
 */
@Component({
  selector: 'app-secao-rascunhos',
  host: { style: 'display: contents' },
  template: `
    @if (lista().length) {
      <div class="rascunhos-lista">
        @for (r of lista(); track r.chave) {
          <div class="card-destaque elev-md blueprint">
            <i class="corner tl"></i><i class="corner tr"></i><i class="corner bl"></i><i class="corner br"></i>
            <div class="card-destaque-titulo card-devido-titulo">{{ titulo(r) }}</div>
            <div class="rascunho-cliente">{{ r.titulo || 'Sem cliente' }}</div>
            <div class="rascunho-quando">{{ 'Guardado ' + haQuanto(r.quando) + ' neste aparelho' }}</div>
            <div class="btn-group btn-group-colado">
              <button type="button" class="btn btn-primary" (click)="continuar(r)">Continuar</button>
              <button type="button" class="btn btn-secondary" (click)="descartar(r)">Descartar</button>
            </div>
          </div>
        }
      </div>
    }
  `,
})
export class SecaoRascunhos {
  private readonly rascunhos = inject(RascunhoService);
  private readonly dialogo = inject(DialogoService);
  private readonly router = inject(Router);

  protected readonly lista = signal<Rascunho[]>(this.rascunhos.listar());
  protected readonly haQuanto = haQuanto;

  protected titulo(r: Rascunho): string {
    return r.chave !== 'novo' ? 'Alterações não salvas, pedido #' + r.chave.slice('pedido:'.length) : 'Pedido incompleto';
  }

  protected continuar(r: Rascunho): void {
    this.rascunhos.marcarParaRetomar(r.chave);
    void this.router.navigateByUrl(rotaDoRascunho(r.chave));
  }

  protected async descartar(r: Rascunho): Promise<void> {
    if (!(await this.dialogo.confirmar('Descartar este rascunho? O que foi digitado será perdido.', 'Descartar', true))) return;
    this.rascunhos.remover(r.chave);
    this.lista.set(this.rascunhos.listar());
  }
}
