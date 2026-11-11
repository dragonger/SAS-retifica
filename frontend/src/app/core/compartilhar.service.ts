import { Injectable, inject } from '@angular/core';
import { DialogoService } from './dialogo.service';

/** 'compartilhado' | 'cancelado' | 'fallback' | 'erro' (retorno de compartilharOrcamento do app.js). */
export type ResultadoCompartilhar = 'compartilhado' | 'cancelado' | 'fallback' | 'erro';

/** Tempo mínimo de menu aberto para um AbortError valer como "o usuário cancelou". */
export const ABORT_MINIMO_MS = 400;

interface NavegadorShare {
  share?: (dados: ShareData) => Promise<void>;
  canShare?: (dados: ShareData) => boolean;
}

const nomeDoErro = (e: unknown): string | undefined => (e as { name?: string } | null)?.name;

/**
 * Compartilhamento (menu nativo do celular) e saída de arquivos do app: tudo o que o app.js faz com
 * navigator.share, download por <a> e abertura de links.
 *
 * ATENÇÃO À ORDEM: estes métodos são chamados direto do toque. O navigator.share() só funciona
 * dentro da janela do gesto do usuário, então NADA assíncrono de rede pode vir antes dele (o PDF
 * já vem pré-carregado) e window.open() não pode ser chamado antes quando o share vai ser tentado.
 */
@Injectable({ providedIn: 'root' })
export class CompartilharService {
  private readonly dialogo = inject(DialogoService);

  private emAndamento = false;

  /**
   * Checagem síncrona (canShare() não é assíncrono) se dá pra tentar compartilhar arquivo. Usa um
   * File vazio só pra testar o tipo: não precisa do PDF de verdade ainda.
   */
  temSuporteACompartilharArquivo(): boolean {
    const nav = navigator as unknown as NavegadorShare;
    if (!nav.share || !nav.canShare) return false;
    try {
      return nav.canShare({ files: [new File([], 'x.pdf', { type: 'application/pdf' })] });
    } catch {
      return false;
    }
  }

  /**
   * Compartilha o PDF já pré-carregado pelo menu nativo do celular (WhatsApp, e-mail...); sem
   * suporte, abre o PDF numa aba. Só o PDF, nunca junto com a foto: PDF + JPG no mesmo share()
   * vira um envio múltiplo de tipos mistos, e o WhatsApp no Android descarta tudo e abre a conversa
   * vazia. A foto vai num segundo compartilhamento (compartilharFoto).
   */
  async compartilharOrcamento(pdfPromise: Promise<Blob>, nomeArquivo: string, novaAba: Window | null): Promise<ResultadoCompartilhar> {
    if (this.emAndamento) {
      novaAba?.close();
      return 'cancelado'; // já tem um compartilhamento em andamento (ex.: duplo toque): ignora
    }
    this.emAndamento = true;
    try {
      return await this.compartilharOrcamentoInterno(pdfPromise, nomeArquivo, novaAba);
    } finally {
      this.emAndamento = false;
    }
  }

  /**
   * Plano B (se não der pra juntar a foto no PDF): foto num segundo compartilhamento. Chamar direto
   * no toque, senão o navegador recusa por falta de gesto. A foto também não passa pelo servidor.
   */
  async compartilharFoto(foto: File): Promise<boolean> {
    if (this.emAndamento) return false;
    this.emAndamento = true;
    try {
      await (navigator as unknown as NavegadorShare).share!({ files: [foto] });
      return true;
    } catch (e) {
      if (nomeDoErro(e) !== 'AbortError') this.dialogo.toast('Não foi possível compartilhar a foto (' + nomeDoErro(e) + ').', true);
      return false;
    } finally {
      this.emAndamento = false;
    }
  }

  /** Baixa o arquivo pelo navegador (link temporário com `download`). */
  baixarArquivo(blob: Blob, nomeArquivo: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nomeArquivo;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  /** Abre o link em outra aba pelo toque (um <a> clicado, que o navegador trata como gesto do usuário). */
  abrirLink(href: string): void {
    const a = document.createElement('a');
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  private async compartilharOrcamentoInterno(pdfPromise: Promise<Blob>, nomeArquivo: string, novaAba: Window | null): Promise<ResultadoCompartilhar> {
    let blob: Blob;
    try {
      blob = await pdfPromise;
    } catch {
      novaAba?.close();
      this.dialogo.toast('Não foi possível gerar o orçamento.', true);
      return 'erro';
    }

    const nav = navigator as unknown as NavegadorShare;
    let motivoFallback: string | null = null;
    if (!nav.share) {
      motivoFallback = 'Este navegador não tem a opção de compartilhar arquivos.';
    } else if (!nav.canShare) {
      motivoFallback = 'Este navegador não sabe verificar se pode compartilhar arquivos.';
    } else {
      const arquivos = [new File([blob], nomeArquivo, { type: 'application/pdf' })];
      try {
        if (nav.canShare({ files: arquivos })) {
          novaAba?.close();
          const inicioShare = Date.now();
          try {
            // Sem "text"/"title" de propósito: alguns apps (WhatsApp no Android, principalmente)
            // priorizam o texto e descartam o arquivo quando os dois vêm juntos no share(). O nome
            // do arquivo já diz o que é.
            await nav.share({ files: arquivos });
            return 'compartilhado';
          } catch (e) {
            const duracaoMs = Date.now() - inicioShare;
            // AbortError pode ser o usuário cancelando o menu de verdade (demora: viu o menu,
            // decidiu, fechou) ou o navegador recusando antes de mostrar o menu (instantâneo: sinal
            // de problema de gesto/timing, não de escolha). Só vale como cancelamento se demorou.
            if (nomeDoErro(e) === 'AbortError' && duracaoMs > ABORT_MINIMO_MS) return 'cancelado';
            motivoFallback = nomeDoErro(e) === 'AbortError'
              ? 'O navegador recusou compartilhar antes de abrir o menu (' + duracaoMs + 'ms).'
              : 'Falha ao abrir o menu de compartilhar (' + nomeDoErro(e) + ').';
          }
        } else {
          motivoFallback = 'Este navegador não aceita compartilhar arquivo PDF.';
        }
      } catch (e) {
        motivoFallback = 'Erro ao verificar compartilhamento (' + (e as { message?: string } | null)?.message + ').';
      }
    }

    // Fallback (desktop / navegadores sem Web Share de arquivos, ou que recusaram o PDF): abre o PDF
    // na aba já criada e avisa o motivo, pra dar pra reportar.
    if (motivoFallback) this.dialogo.toast(motivoFallback + ' Abrindo o PDF direto.', true);
    const url = URL.createObjectURL(blob);
    if (novaAba) novaAba.location.href = url;
    else window.open(url, '_blank');
    return 'fallback';
  }
}
