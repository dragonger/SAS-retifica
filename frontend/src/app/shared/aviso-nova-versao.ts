import { Component, inject } from '@angular/core';
import { NovaVersaoService } from '../core/nova-versao.service';

/** Faixa "Nova versão disponível" (mesmo visual do app atual); só aparece quando o service worker baixou uma versão nova. */
@Component({
  selector: 'app-aviso-nova-versao',
  host: { style: 'display: contents' },
  template: `
    @if (versao.disponivel()) {
      <button type="button" class="aviso-versao" (click)="versao.atualizar()">Nova versão disponível. Toque para atualizar</button>
    }
  `,
})
export class AvisoNovaVersao {
  protected readonly versao = inject(NovaVersaoService);
}
