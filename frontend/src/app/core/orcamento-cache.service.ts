import { Injectable, inject } from '@angular/core';
import { AuthService } from './auth.service';

/** Validade do PDF preparado (o PDF leva data de emissão/validade e categorias do catálogo). */
export const ORCAMENTO_CACHE_MS = 10 * 60 * 1000;

/**
 * Orçamentos (PDF) já preparados por pedido (orcamentoCache + prepararOrcamento do app.js).
 *
 * Busca o PDF em segundo plano (chamar assim que a tela abre, bem antes do toque em "Gerar
 * orçamento"). No iOS/Safari o navigator.share() com arquivo só funciona se for chamado bem perto
 * do toque: pré-carregar o PDF evita que o fetch "gaste" essa janela de gesto. Memorizado por
 * pedido (~170KB cada); invalidado ao editar/finalizar/excluir. Validade de 10 min: o app fica
 * aberto dias no celular e o PDF leva a data de emissão/validade, então um PDF de ontem sairia
 * com a data errada. A logo faz parte do PDF: trocar a logo ou os dados da empresa invalida todos.
 */
@Injectable({ providedIn: 'root' })
export class OrcamentoCacheService {
  private readonly auth = inject(AuthService);

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

  /**
   * PDF do pedido: o guardado (se válido) ou um fetch novo. Usa fetch direto (não o HttpClient),
   * como o app.js: a resposta é um blob e o erro vira só "HTTP <status>".
   */
  preparar(id: number | string): Promise<Blob> {
    const guardado = this.obter(id);
    if (guardado) return guardado;
    const token = this.auth.lerAuth()?.token;
    const promessa = fetch('/api/pedidos/' + id + '/pdf', {
      headers: token ? { Authorization: 'Bearer ' + token } : {},
    }).then(r => (r.ok ? r.blob() : Promise.reject(new Error('HTTP ' + r.status))));
    this.guardar(id, promessa);
    // falhou: tira do cache pra próxima abertura tentar de novo (e evita "unhandled rejection" antes do clique)
    const chave = String(id);
    promessa.catch(() => { if (this.pdfs.get(chave) === promessa) this.pdfs.delete(chave); });
    return promessa;
  }

  invalidar(id: number | string): void {
    this.pdfs.delete(String(id));
  }

  invalidarTodos(): void {
    this.pdfs.clear();
    this.preparadoEm.clear();
  }
}
