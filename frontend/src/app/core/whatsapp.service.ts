import { Injectable, inject } from '@angular/core';
import { ApiService } from './api.service';

/** Códigos que o fluxo de envio trata com mensagem própria (sem o toast genérico). */
export const STATUS_ENVIO_WHATSAPP = [422, 429, 502, 503, 413, 400] as const;

/**
 * Envio automático do orçamento pela API do WhatsApp Business, quando o servidor tem a API
 * configurada (backend/WHATSAPP-API.md). whatsAppApiHabilitada do app.js.
 */
@Injectable({ providedIn: 'root' })
export class WhatsAppService {
  private readonly api = inject(ApiService);

  private status: Promise<boolean> | null = null;

  /** Consultado uma vez por sessão (recarregar o app pega uma configuração nova). */
  apiHabilitada(): Promise<boolean> {
    if (!this.status) {
      this.status = this.api.get<{ habilitado?: boolean } | null>('/api/whatsapp/status', { statusSemAviso: [404, 500, 502, 503] })
        .then(r => !!(r && r.habilitado))
        .catch(() => { this.status = null; return false; });
    }
    return this.status;
  }

  /** POST multipart: o PDF deste aparelho (com a foto, se tiver); sem ele o servidor gera o padrão. */
  enviar(pedidoId: number | string, pdf: Blob | null, nomeArquivo: string): Promise<unknown> {
    const dados = new FormData();
    if (pdf) dados.append('pdf', pdf, nomeArquivo);
    return this.api.post('/api/pedidos/' + pedidoId + '/whatsapp', dados, { statusSemAviso: STATUS_ENVIO_WHATSAPP });
  }
}
