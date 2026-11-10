import { Injectable, signal } from '@angular/core';

/** Título mostrado na barra do topo (cada tela define o seu, como o tituloTopo do app.js). */
@Injectable({ providedIn: 'root' })
export class TopoService {
  readonly titulo = signal('Retífica');

  definirTitulo(titulo: string): void {
    this.titulo.set(titulo);
  }
}
