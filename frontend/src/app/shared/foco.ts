import { Directive, ElementRef, afterNextRender, inject, input } from '@angular/core';

/** Dá o foco ao elemento depois da primeira renderização, quando `appFoco` for verdadeiro. */
@Directive({ selector: '[appFoco]' })
export class Foco {
  readonly appFoco = input(false);

  constructor() {
    const el = inject<ElementRef<HTMLElement>>(ElementRef);
    afterNextRender(() => { if (this.appFoco()) el.nativeElement.focus(); });
  }
}
