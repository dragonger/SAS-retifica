import { Component, input } from '@angular/core';

/** Cartão de número do Dashboard (statCard do app.js, sem ícone nem clique). */
@Component({
  selector: 'app-stat-card',
  host: { style: 'display: contents' },
  template: `
    <div [class]="'stat-card elev-md blueprint stat-card-' + variante()">
      <i class="corner tl"></i><i class="corner tr"></i><i class="corner bl"></i><i class="corner br"></i>
      <div class="stat-card-topo"><div class="stat-kicker">{{ kicker() }}</div></div>
      <div class="stat-value">{{ valor() }}</div>
      <div class="stat-sub">{{ sub() }}</div>
    </div>
  `,
})
export class StatCard {
  readonly kicker = input.required<string>();
  readonly valor = input.required<string>();
  readonly sub = input.required<string>();
  readonly variante = input<'accent' | 'neutral' | 'accent-2' | 'danger'>('accent');
}
