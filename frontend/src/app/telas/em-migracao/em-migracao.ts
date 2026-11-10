import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';
import { TopoService } from '../../core/topo.service';

/**
 * Tela provisória das rotas que ainda não foram migradas: aponta para a mesma
 * tela no app atual (raiz do site, mesmo hash).
 */
@Component({
  selector: 'app-em-migracao',
  template: `
    <div class="empty">
      <p>Tela em migração</p>
      <p><a [href]="linkAntigo()">Abrir no app atual</a></p>
    </div>
  `,
})
export class EmMigracao {
  private readonly router = inject(Router);

  private readonly url = toSignal(
    this.router.events.pipe(filter(e => e instanceof NavigationEnd), map(() => this.router.url)),
    { initialValue: this.router.url },
  );

  constructor() {
    inject(TopoService).definirTitulo('Retífica');
  }

  /** "/#" + hash do app novo: os hashes são os mesmos nos dois apps. */
  protected linkAntigo(): string {
    return '/#' + this.url();
  }
}
