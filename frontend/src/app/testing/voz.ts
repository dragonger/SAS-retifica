import { ReconhecimentoVoz } from '../core/ditado-voz';

/** Reconhecimento de voz falso: guarda a instância e deixa o teste disparar os eventos do navegador. */
export class ReconhecimentoFalso implements ReconhecimentoVoz {
  static instancias: ReconhecimentoFalso[] = [];
  lang = ''; interimResults = false; continuous = false;
  onaudiostart: (() => void) | null = null;
  onresult: ((ev: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null = null;
  onerror: ((ev: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  iniciou = 0; parou = 0; abortou = 0;
  falharNoStart = false;
  constructor() { ReconhecimentoFalso.instancias.push(this); }
  start() { if (this.falharNoStart) throw new Error('InvalidStateError'); this.iniciou++; }
  stop() { this.parou++; }
  abort() { this.abortou++; }
  /** Um evento `result` com a lista inteira de resultados da sessão (cada texto é um resultado, como no Chrome do Android). */
  resultados(...textos: string[]) { this.onresult!({ results: textos.map(t => ({ 0: { transcript: t } })) }); }
}
