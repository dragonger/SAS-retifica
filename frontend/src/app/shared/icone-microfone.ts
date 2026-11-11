import { Component } from '@angular/core';

/** Ícone do microfone (ICONE_MICROFONE do app.js), 16 px, na cor do texto. */
@Component({
  selector: 'app-icone-microfone',
  host: { style: 'display: contents' },
  template: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="flex:none" aria-hidden="true"><path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z"></path><path d="M19 11a7 7 0 0 1-14 0"></path><path d="M12 18v3"></path></svg>`,
})
export class IconeMicrofone {}
