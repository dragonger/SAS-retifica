import { Injectable, inject } from '@angular/core';
import { ApiService } from './api.service';

export const ALTO_OS = '/api/alto-medidas/os';
export const ALTO_RESUMO = '/api/alto-medidas/resumo';

/** Códigos que o app trata em silêncio (a integração é opcional: sem ela o resto da tela segue normal). */
const SEM_AVISO = [403, 404, 500, 502, 503] as const;

/** Resposta de GET /api/alto-medidas/resumo (campos usados pelo Início). */
export interface ResumoAltoMedidas {
  devidoAoDaniel: number;
  quantidadeDevida: number;
}

/** Integração com o Alto Medidas (Virabrequins do Daniel). */
@Injectable({ providedIn: 'root' })
export class AltoMedidasService {
  private readonly api = inject(ApiService);

  private status: Promise<boolean> | null = null;

  /** A integração só vale para a empresa dona dela (a DIH): consultado uma vez por sessão. */
  habilitado(): Promise<boolean> {
    if (!this.status) {
      this.status = this.api.get<{ habilitado?: boolean } | null>('/api/alto-medidas/status', { statusSemAviso: SEM_AVISO })
        .then(r => !!(r && r.habilitado))
        .catch(() => { this.status = null; return false; });
    }
    return this.status;
  }

  /** Resumo do que se deve ao Daniel; null se a integração está desligada. */
  async resumo(): Promise<ResumoAltoMedidas | null> {
    if (!(await this.habilitado())) return null;
    return this.api.get<ResumoAltoMedidas | null>(ALTO_RESUMO, { statusSemAviso: SEM_AVISO });
  }
}
