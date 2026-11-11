import { Component, input, output } from '@angular/core';

/** Salvar / Cancelar / Remover dos cadastros (botoesCadastro do app.js). O Salvar é o submit do formulário em volta. */
@Component({
  selector: 'app-botoes-cadastro',
  host: { style: 'display: contents' },
  template: `
    <div class="btn-group">
      <button type="submit" class="btn btn-primary" [disabled]="salvando()">{{ salvando() ? 'Salvando…' : 'Salvar' }}</button>
      <button type="button" class="btn btn-secondary" (click)="cancelar.emit()">Cancelar</button>
      <button type="button" class="btn btn-danger" [hidden]="!editando()" [disabled]="removendo()" (click)="remover.emit()">{{ removendo() ? 'Removendo…' : 'Remover' }}</button>
    </div>
  `,
})
export class BotoesCadastro {
  readonly salvando = input(false);
  readonly removendo = input(false);
  /** Só na edição o botão Remover aparece. */
  readonly editando = input(false);
  readonly cancelar = output<void>();
  readonly remover = output<void>();
}
