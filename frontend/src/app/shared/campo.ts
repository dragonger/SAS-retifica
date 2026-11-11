import { Component, input } from '@angular/core';

/** Rótulo + campo (campo() do app.js): o próprio elemento é o `.field`, para os seletores `.row > .field` do CSS valerem. */
@Component({
  selector: 'app-campo',
  host: { class: 'field', style: 'display: block' },
  template: `<label>{{ rotulo() }}</label><ng-content />`,
})
export class Campo {
  readonly rotulo = input.required<string>();
}
