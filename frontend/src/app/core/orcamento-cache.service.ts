import { Injectable } from '@angular/core';

/** Validade do PDF preparado (o PDF leva data de emissão/validade e categorias do catálogo). */
export const ORCAMENTO_CACHE_MS = 10 * 60 * 1000;

/**
 * Orçamentos (PDF) já preparados por pedido (orcamentoCache do app.js).
 * Aqui só a guarda e a invalidação; a fase dos pedidos acrescenta a busca do PDF.
 * A logo faz parte do PDF: trocar a logo ou os dados da empresa invalida todos.
 */
@Injectable({ providedIn: 'root' })
export class OrcamentoCacheService {
  private readonly pdfs = new Map<string, Promise<Blob>>();
  private readonly preparadoEm = new Map<string, number>();

  /** PDF ainda válido (menos de 10 min), ou undefined. */
  obter(id: number | string): Promise<Blob> | undefined {
    const chave = String(id);
    const quando = this.preparadoEm.get(chave);
    return quando !== undefined && Date.now() - quando < ORCAMENTO_CACHE_MS ? this.pdfs.get(chave) : undefined;
  }

  guardar(id: number | string, pdf: Promise<Blob>): void {
    const chave = String(id);
    this.preparadoEm.set(chave, Date.now());
    this.pdfs.set(chave, pdf);
  }

  invalidar(id: number | string): void {
    this.pdfs.delete(String(id));
  }

  invalidarTodos(): void {
    this.pdfs.clear();
    this.preparadoEm.clear();
  }
}
