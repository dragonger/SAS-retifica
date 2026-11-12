import { reconhecimentoDisponivel } from '../shared/ditado-regra';

/*
 * Reconhecimento de voz do ditado (ditadoVoz, ditadoVozNativa e ditadoNativo do app.js), com a mesma lógica:
 * dois adaptadores (Web Speech API do navegador e o plugin DitadoVoz do APK) atrás da mesma interface, escrevendo
 * numa caixa de texto. Ficam fora de componente porque mexem direto no campo (`alvo.value`) e nos eventos dele.
 */

/** Caixa onde o texto reconhecido é escrito. */
export type AlvoDitado = HTMLInputElement | HTMLTextAreaElement;

export interface DitadoVoz {
  /** Liga o microfone. Devolve false se o navegador recusou (a escuta não começou). */
  iniciar(): boolean;
  parar(): void;
  ativo(): boolean;
  /** Solta tudo (microfone, ouvintes do campo): o adaptador não serve mais. */
  encerrar(): void;
}

export interface CallbacksVoz {
  /** O texto do campo mudou (para atualizar o botão, as respostas...). */
  aoMudar: () => void;
  /** A escuta terminou de vez (parou, deu erro ou o navegador não conseguiu religar). */
  aoParar: () => void;
  /**
   * false enquanto o microfone (re)liga, true quando ele de fato voltou a ouvir. O Chrome do Android encerra a
   * escuta sozinho; o que se fala nesse intervalo se perde, então o app avisa quando voltou.
   */
  aoPronto?: (pronto: boolean) => void;
}

/** Mostra uma mensagem ao usuário (toast; `erro` = true pinta de vermelho). */
export type Avisar = (mensagem: string, erro: boolean) => void;

/** Limite do texto ditado (o servidor aceita 2000 caracteres). */
export const LIMITE_TEXTO_DITADO = 2000;

/** Duração da vibração que avisa que o microfone ligou, em ms. */
export const VIBRACAO_PRONTO_MS = 40;

// ---------- plugin nativo (APK Capacitor) ----------

interface OuvinteNativo { remove(): unknown }

/** Plugin `DitadoVoz` do APK (android-app/): eventos "resultado" {texto}, "estado" {pronto}, "erro" {codigo}. */
export interface PluginDitadoVoz {
  iniciar(opcoes: { idioma: string }): Promise<unknown>;
  parar(): unknown;
  encerrar(): unknown;
  addListener(evento: string, fn: (ev: Record<string, unknown>) => void): Promise<OuvinteNativo | undefined> | OuvinteNativo | undefined;
}

interface PonteCapacitor {
  isNativePlatform?: () => boolean;
  Plugins?: { DitadoVoz?: PluginDitadoVoz };
}

/** O plugin nativo de voz, quando o app roda dentro do APK (Capacitor); senão null. */
export function ditadoNativo(win: unknown = window): PluginDitadoVoz | null {
  try {
    const cap = (win as { Capacitor?: PonteCapacitor }).Capacitor;
    if (cap && cap.isNativePlatform && cap.isNativePlatform() && cap.Plugins && cap.Plugins.DitadoVoz) return cap.Plugins.DitadoVoz;
  } catch { /* sem ponte nativa */ }
  return null;
}

const MSG_PERMISSAO_NATIVA = 'Sem permissão para o microfone. Libere nas configurações do app, ou escreva o pedido.';

function vibrar(): void {
  try { if (navigator.vibrate) navigator.vibrate(VIBRACAO_PRONTO_MS); } catch { /* sem vibração */ }
}

/**
 * Dentro do APK o plugin DitadoVoz usa o reconhecimento de voz do Android, que no Android 13+ mantém o microfone
 * aberto entre as pausas. Cada evento "resultado" traz o texto da sessão inteira: reescreve o campo do zero.
 */
export function criarVozNativa(plugin: PluginDitadoVoz, alvo: AlvoDitado, cb: CallbacksVoz, avisar: Avisar): DitadoVoz {
  const { aoMudar, aoParar, aoPronto } = cb;
  let ativo = false; let base = ''; let escrevendo = false; let ouvintes: OuvinteNativo[] = [];
  const fixarBase = () => { base = alvo.value.trim() ? alvo.value.trim() + ' ' : ''; };
  const aoEditar = () => { if (ativo && !escrevendo) fixarBase(); };
  alvo.addEventListener('input', aoEditar);
  const soltar = () => { ouvintes.forEach(h => { try { h.remove(); } catch { /* já removido */ } }); ouvintes = []; };
  const ligar = (nome: string, fn: (ev: Record<string, unknown>) => void) => {
    Promise.resolve(plugin.addListener(nome, fn)).then(h => { if (h) ouvintes.push(h); }).catch(() => { /* sem ouvinte */ });
  };
  ligar('resultado', ev => {
    if (!ativo) return;
    escrevendo = true;
    alvo.value = (base + String(ev['texto'] || '').trim()).slice(0, LIMITE_TEXTO_DITADO);
    aoMudar();
    escrevendo = false;
  });
  ligar('estado', ev => {
    if (aoPronto && ativo) aoPronto(!!ev['pronto']);
    if (ev['pronto'] && ativo) vibrar();
  });
  ligar('erro', ev => {
    ativo = false;
    const msg = ({
      permissao: MSG_PERMISSAO_NATIVA,
      rede: 'O reconhecimento de voz precisou de internet e falhou. Escreva o pedido.',
      microfone: 'Não achei o microfone. Escreva o pedido.',
      ocupado: 'O reconhecimento de voz está ocupado. Tente de novo.',
    } as Record<string, string>)[String(ev['codigo'])] || 'O reconhecimento de voz falhou. Escreva o pedido.';
    avisar(msg, true);
    aoParar();
  });
  return {
    iniciar() {
      fixarBase(); ativo = true; if (aoPronto) aoPronto(false);
      Promise.resolve(plugin.iniciar({ idioma: 'pt-BR' })).catch((e: unknown) => {
        ativo = false;
        const detalhe = String(e && ((e as { message?: string }).message || e));
        avisar(detalhe.includes('permissao') ? MSG_PERMISSAO_NATIVA : 'Não consegui ligar o microfone. Escreva o pedido.', true);
        aoParar();
      });
      return true;
    },
    parar() { ativo = false; try { plugin.parar(); } catch { /* já parado */ } setTimeout(aoParar, 0); },
    ativo() { return ativo; },
    encerrar() { ativo = false; alvo.removeEventListener('input', aoEditar); soltar(); try { plugin.encerrar(); } catch { /* já parado */ } },
  };
}

// ---------- navegador (Web Speech API) ----------

interface ResultadoReconhecido { 0: { transcript: string } }
interface EventoResultado { results: ArrayLike<ResultadoReconhecido> }
interface EventoErroReconhecimento { error: string }

/** O pedaço da Web Speech API que o ditado usa. */
export interface ReconhecimentoVoz {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onaudiostart: (() => void) | null;
  onresult: ((ev: EventoResultado) => void) | null;
  onerror: ((ev: EventoErroReconhecimento) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

/**
 * Reconhecimento de voz em pt-BR escrevendo numa caixa de texto. Reinicia sozinho quando o navegador para por silêncio.
 */
export function criarVozNavegador(SR: new () => ReconhecimentoVoz, alvo: AlvoDitado, cb: CallbacksVoz, avisar: Avisar): DitadoVoz {
  const { aoMudar, aoParar, aoPronto } = cb;
  const rec = new SR();
  rec.lang = 'pt-BR'; rec.interimResults = true; rec.continuous = true;
  let ativo = false; let base = '';
  let escrevendo = false;
  const fixarBase = () => { base = alvo.value.trim() ? alvo.value.trim() + ' ' : ''; };
  // só edição de verdade (teclado) muda a base; o que o próprio reconhecimento escreve é ignorado
  const aoEditar = () => { if (ativo && !escrevendo) fixarBase(); };
  alvo.addEventListener('input', aoEditar);
  rec.onaudiostart = () => {
    if (!ativo) return;
    if (aoPronto) aoPronto(true);
    vibrar();
  };
  rec.onresult = ev => {
    // monta o texto da sessão inteira do zero a cada evento: o Chrome do Android repete resultados finais
    // e o resultIndex não é confiável, então acumular por evento duplicava o que era falado
    // Android: cada hipótese parcial ("pedido", "pedido do", "pedido do Joao"...) chega como um resultado
    // separado. Um resultado que continua o anterior o substitui; só um trecho novo é acrescentado.
    const partes: string[] = [];
    for (let i = 0; i < ev.results.length; i++) {
      const t = ev.results[i][0].transcript.trim();
      if (!t) continue;
      const ant = partes.length ? partes[partes.length - 1] : '';
      if (ant && (t.toLowerCase().startsWith(ant.toLowerCase()) || ant.toLowerCase().startsWith(t.toLowerCase()))) {
        partes[partes.length - 1] = t.length >= ant.length ? t : ant;
      } else partes.push(t);
    }
    escrevendo = true;
    alvo.value = (base + partes.filter(Boolean).join(' ')).slice(0, LIMITE_TEXTO_DITADO);
    aoMudar();
    escrevendo = false;
  };
  rec.onerror = ev => {
    if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
      avisar('Sem permissão para o microfone. Escreva o pedido, ou libere o microfone para este site.', true); ativo = false;
    } else if (ev.error === 'network') {
      avisar('O reconhecimento de voz precisa de internet. Escreva o pedido.', true); ativo = false;
    } else if (ev.error === 'audio-capture') {
      avisar('Não achei o microfone. Escreva o pedido.', true); ativo = false;
    }
  };
  rec.onend = () => {
    if (ativo) { fixarBase(); if (aoPronto) aoPronto(false); try { rec.start(); return; } catch { ativo = false; } }
    aoParar();
  };
  return {
    iniciar() { fixarBase(); ativo = true; if (aoPronto) aoPronto(false); try { rec.start(); } catch { ativo = false; } return ativo; },
    parar() { ativo = false; try { rec.stop(); } catch { /* já parado */ } },
    ativo() { return ativo; },
    encerrar() { ativo = false; alvo.removeEventListener('input', aoEditar); try { rec.abort(); } catch { /* já parado */ } },
  };
}

/**
 * ditadoVoz do app.js: o adaptador nativo dentro do APK, senão o do navegador, senão null (sem reconhecimento:
 * a caixa de texto continua servindo, e o microfone do teclado do celular também).
 */
export function criarDitadoVoz(win: unknown, alvo: AlvoDitado, cb: CallbacksVoz, avisar: Avisar): DitadoVoz | null {
  const nat = ditadoNativo(win);
  if (nat) return criarVozNativa(nat, alvo, cb, avisar);
  const SR = reconhecimentoDisponivel(win);
  if (!SR) return null;
  return criarVozNavegador(SR as new () => ReconhecimentoVoz, alvo, cb, avisar);
}
