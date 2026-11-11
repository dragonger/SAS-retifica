import { Injectable, inject } from '@angular/core';
import { ApiService } from './api.service';
import { AlvoDitado, CallbacksVoz, DitadoVoz, criarDitadoVoz, ditadoNativo } from './ditado-voz';
import { DialogoService } from './dialogo.service';
import { Entendimento, Pergunta, RespostaDitado, reconhecimentoDisponivel } from '../shared/ditado-regra';

/** Chave do localStorage que guarda que o aviso de privacidade já foi aceito (a mesma do app atual). */
export const DITADO_AVISO_CHAVE = 'retifica_ditado_aviso';

/** Respostas que o painel trata com mensagem própria (sem o toast genérico do interceptor). */
export const STATUS_DITADO_SEM_AVISO = [400, 404, 409, 429, 502, 503] as const;
const STATUS_SEM_AVISO_STATUS = [404, 500, 502, 503] as const;

/** Resposta de POST /api/ditado e de POST /api/ditado/{id}/respostas. */
export interface ResultadoDitado {
  sessaoId: string;
  rodada: number;
  maxRodadas: number;
  situacao: 'PERGUNTAS' | 'PRONTO';
  perguntas?: Pergunta[];
  entendimento: Entendimento;
  avisos?: string[];
  usosRestantesHoje?: number;
}

/**
 * Ditar o pedido (ver backend/DITADO.md): status da IA, aviso de privacidade, chamadas ao servidor e o
 * reconhecimento de voz. A regra pura fica em shared/ditado-regra.ts e a tela em telas/pedido-form/ditado-overlay.ts.
 */
@Injectable({ providedIn: 'root' })
export class DitadoService {
  private readonly api = inject(ApiService);
  private readonly dialogo = inject(DialogoService);

  private statusEmCache: Promise<boolean> | null = null;

  /**
   * GET /api/ditado/status, guardado enquanto o app está aberto (ditadoHabilitado do app.js). Qualquer falha vale
   * como "desligado" e não fica guardada: a próxima abertura do formulário pergunta de novo.
   */
  habilitado(): Promise<boolean> {
    if (!this.statusEmCache) {
      this.statusEmCache = this.api.get<{ habilitado?: boolean } | null>('/api/ditado/status', { statusSemAviso: STATUS_SEM_AVISO_STATUS })
        .then(r => !!(r && r.habilitado))
        .catch(() => { this.statusEmCache = null; return false; });
    }
    return this.statusEmCache;
  }

  /** POST /api/ditado: o servidor entende o texto com a IA (e pode perguntar). */
  iniciar(texto: string): Promise<ResultadoDitado> {
    return this.api.post<ResultadoDitado>('/api/ditado', { texto }, { statusSemAviso: STATUS_DITADO_SEM_AVISO });
  }

  /** POST /api/ditado/{id}/respostas: 404 = a conversa expirou no servidor (o painel recomeça). */
  responder(sessaoId: string, respostas: RespostaDitado[]): Promise<ResultadoDitado> {
    return this.api.post<ResultadoDitado>('/api/ditado/' + encodeURIComponent(sessaoId) + '/respostas', { respostas },
      { statusSemAviso: STATUS_DITADO_SEM_AVISO });
  }

  /** Aviso da primeira vez (ditadoAvisoDePrivacidade): true = pode seguir. Uma vez aceito, não pergunta mais. */
  async avisoDePrivacidade(): Promise<boolean> {
    let visto = false;
    try { visto = localStorage.getItem(DITADO_AVISO_CHAVE) === '1'; } catch { /* sem armazenamento: pergunta toda vez */ }
    if (visto) return true;
    const resposta = await this.dialogo.escolher<boolean>(
      'O áudio é transcrito pelo navegador (no Chrome, pelo Google). O texto, junto com os nomes de clientes e do catálogo da empresa, '
      + 'vai para a IA da Anthropic montar o pedido. Nada é salvo sozinho: você confere antes de preencher.',
      [{ rotulo: 'Cancelar', valor: false }, { rotulo: 'Continuar', valor: true, estilo: 'btn-primary' }]);
    if (resposta) { try { localStorage.setItem(DITADO_AVISO_CHAVE, '1'); } catch { /* ignora */ } }
    return !!resposta;
  }

  /** Há como ouvir (plugin do APK ou Web Speech API)? Senão o painel mostra só a caixa de texto. */
  vozDisponivel(): boolean {
    return !!(ditadoNativo() || reconhecimentoDisponivel(window));
  }

  /** Cria o reconhecedor de voz que escreve em `alvo`, ou null sem reconhecimento (ditadoVoz do app.js). */
  criarVoz(alvo: AlvoDitado, cb: CallbacksVoz): DitadoVoz | null {
    return criarDitadoVoz(window, alvo, cb, (msg, erro) => this.dialogo.toast(msg, erro));
  }
}
