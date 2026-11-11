import { Directive, ElementRef, effect, inject, input, model, OnInit } from '@angular/core';

/**
 * Campo de texto ligado a um texto da tela sem apagar o que a pessoa está digitando: só escreve no campo quando
 * o valor de fora é diferente do que o campo já mostra. (Com `[value]` um número no meio da digitação, como "1.",
 * que o navegador entrega como "", seria apagado do campo a cada tecla.)
 */
@Directive({
  selector: 'input[appModelo], textarea[appModelo]',
  host: { '(input)': 'aoDigitar()' },
})
export class ModeloEntrada {
  private readonly el = inject<ElementRef<HTMLInputElement | HTMLTextAreaElement>>(ElementRef).nativeElement;
  readonly appModelo = model('');

  constructor() {
    effect(() => {
      const v = this.appModelo();
      if (this.el.value !== v) this.el.value = v;
    });
  }

  protected aoDigitar(): void {
    this.appModelo.set(this.el.value);
  }
}

/**
 * Valor inicial de um campo que depois só é lido (o app.js cria o campo com o valor e nunca mais o reescreve).
 * Para recriar o campo com outro valor, a tela troca a chave do `@for`.
 */
@Directive({ selector: 'input[appValorInicial]' })
export class ValorInicial implements OnInit {
  private readonly el = inject<ElementRef<HTMLInputElement>>(ElementRef).nativeElement;
  readonly appValorInicial = input<string | number>('');

  ngOnInit(): void {
    this.el.value = String(this.appValorInicial() ?? '');
  }
}
