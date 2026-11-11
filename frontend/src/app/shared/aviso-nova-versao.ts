import { Component, inject } from '@angular/core';
import { NovaVersaoService } from '../core/nova-versao.service';

/** Faixa "Nova versão disponível" (mesmo visual do app atual); só aparece quando o service worker baixou uma versão nova. */
@Component({
  selector: 'app-aviso-nova-versao',
  host: { style: 'display: contents' },
  template: `
    @if (versao.disponivel()) {
      <button type="button"
              style="position:fixed;left:50%;transform:translateX(-50%);bottom:calc(140px + env(safe-area-inset-bottom));width:calc(100% - 32px);max-width:688px;z-index:20;border:none;cursor:pointer;padding:12px 16px;font:inherit;font-size:14px;background:var(--color-text);color:var(--color-bg);box-shadow:var(--shadow-md)"
              (click)="versao.atualizar()">Nova versão disponível — toque para atualizar</button>
    }
  `,
})
export class AvisoNovaVersao {
  protected readonly versao = inject(NovaVersaoService);
}
