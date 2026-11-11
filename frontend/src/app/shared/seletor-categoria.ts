import { Component, input, model } from '@angular/core';
import { Categoria } from './modelos';

/** Select de categorias (nome como valor, rótulo como texto) dos cadastros de produto, serviço e peça. */
@Component({
  selector: 'app-seletor-categoria',
  host: { style: 'display: block' },
  template: `
    <select class="input" (change)="valor.set($any($event.target).value)">
      @for (c of categorias(); track c.nome) {
        <option [value]="c.nome" [selected]="c.nome === valor()">{{ c.rotulo }}</option>
      }
    </select>
  `,
})
export class SeletorCategoria {
  readonly categorias = input.required<Categoria[]>();
  readonly valor = model('');
}
