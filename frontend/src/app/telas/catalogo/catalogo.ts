import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AltoMedidasService } from '../../core/alto-medidas.service';
import { AuthService } from '../../core/auth.service';
import { SessaoService } from '../../core/sessao.service';
import { TopoService } from '../../core/topo.service';
import { MenuCard } from '../../shared/menu-card';

/** Menu do Catálogo (telaCatalogoMenu do app.js): Clientes, Serviços, Peças, Minha empresa e, só para a empresa com a integração, o Daniel. */
@Component({
  selector: 'app-catalogo',
  imports: [MenuCard, RouterLink],
  template: `
    <div class="subtitulo">Clientes, serviços e peças usados nos orçamentos</div>
    <div class="grupo-linhas catalogo-menu">
      <app-menu-card nome="Clientes" rota="/clientes">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
      </app-menu-card>
      <app-menu-card nome="Serviços" rota="/servicos">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94z"></path></svg>
      </app-menu-card>
      <app-menu-card nome="Peças" rota="/pecas">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"></path><path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"></path></svg>
      </app-menu-card>
      @if (daniel()) {
        <app-menu-card nome="Virabrequins do Daniel" rota="/alto-medidas">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"></path><path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"></path></svg>
        </app-menu-card>
      }
      <app-menu-card nome="Minha empresa" rota="/empresa">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 21h18"></path><path d="M5 21V7l7-4 7 4v14"></path><path d="M9 9h1"></path><path d="M14 9h1"></path><path d="M9 13h1"></path><path d="M14 13h1"></path><path d="M10 21v-4h4v4"></path></svg>
      </app-menu-card>
    </div>

    <h3 class="secao secao-grupo">Conta</h3>
    <div class="grupo-linhas conta">
      @if (!auth.demoExpiraEm()) {
        <a class="linha-menu" routerLink="/trocar-senha">
          <span class="linha-menu-icone"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"></rect><path d="M8 11V7a4 4 0 0 1 8 0v4"></path></svg></span>
          <span class="menu-card-titulo">Trocar senha</span>
        </a>
      }
      <button type="button" class="linha-menu" (click)="sessao.sair()">
        <span class="linha-menu-icone"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><path d="M16 17l5-5-5-5"></path><path d="M21 12H9"></path></svg></span>
        <span class="menu-card-titulo">Sair</span>
      </button>
    </div>
  `,
})
export class Catalogo {
  private readonly altoMedidas = inject(AltoMedidasService);
  protected readonly auth = inject(AuthService);
  protected readonly sessao = inject(SessaoService);

  /** Só aparece para a empresa com a integração do Alto Medidas. */
  protected readonly daniel = signal(false);

  constructor() {
    inject(TopoService).definirTitulo('Catálogo');
    void this.altoMedidas.habilitado().then(ok => this.daniel.set(ok));
  }
}
