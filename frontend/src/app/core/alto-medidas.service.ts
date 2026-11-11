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

/** Uma OS (virabrequim) finalizada no Alto Medidas, como a lista do servidor devolve. */
export interface OsAltoMedidas {
  id: number;
  numero?: number | string | null;
  cliente?: string | null;
  modelo?: string | null;
  medidas?: string | null;
  valorTotal: number | string;
  polir?: boolean;
  pago: boolean;
  pagoEm?: string | null;
  repassadoEm?: string | null;
  finalizadoEm?: string | null;
  /** false = a marcação ainda não chegou ao Alto Medidas (o servidor repete sozinho). */
  pagoSincronizado?: boolean;
}

export interface GrupoOsAltoMedidas {
  total: number | string;
  itens: OsAltoMedidas[];
}

/** Resposta de GET /api/alto-medidas/os?mes=AAAA-MM|todos. */
export interface ListaAltoMedidas extends ResumoAltoMedidas {
  mes: string;
  meses?: { mes: string; quantidade: number }[];
  devidoNoPeriodo: number | string;
  quantidadeDevidaNoPeriodo: number;
  aRepassar: GrupoOsAltoMedidas;
  aguardando: GrupoOsAltoMedidas;
  repassado: GrupoOsAltoMedidas;
}

/** Integração com o Alto Medidas (Virabrequins do Daniel). */
@Injectable({ providedIn: 'root' })
export class AltoMedidasService {
  private readonly api = inject(ApiService);

  private status: Promise<boolean> | null = null;

  /** Mês escolhido na tela (AAAA-MM ou "todos"); null = o servidor escolhe. Dura a sessão, como no app.js. */
  mesEscolhido: string | null = null;
  /** Todos os caminhos de lista já pedidos (um por mês): todos ficam velhos depois de um pagamento. */
  readonly caminhosVisitados = new Set<string>([ALTO_OS]);

  /** Caminho da lista do mês escolhido (e o registra para a invalidação). */
  caminhoDaLista(): string {
    const c = this.mesEscolhido ? ALTO_OS + '?mes=' + this.mesEscolhido : ALTO_OS;
    this.caminhosVisitados.add(c);
    return c;
  }

  /** PUT .../pagamento: marca/desfaz "cliente pagou". 404 e 409 voltam como ErroApi sem toast genérico. */
  marcarPagamento(id: number, pago: boolean): Promise<unknown> {
    return this.api.put(ALTO_OS + '/' + id + '/pagamento', { pago }, { statusSemAviso: [404, 409] });
  }

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
