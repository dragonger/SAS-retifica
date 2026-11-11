import { Injectable } from '@angular/core';

/** Parte da API do pdf-lib (vendor/pdf-lib.min.js) que o app usa. */
export interface PdfLib {
  PDFDocument: {
    load(bytes: ArrayBuffer): Promise<PdfDoc>;
  };
  StandardFonts: { Helvetica: string };
  rgb(r: number, g: number, b: number): unknown;
}

export interface PdfDoc {
  embedJpg(bytes: Uint8Array): Promise<unknown>;
  embedFont(fonte: string): Promise<unknown>;
  getPage(i: number): { getSize(): { width: number; height: number } };
  addPage(tamanho: [number, number]): PdfPagina;
  save(): Promise<Uint8Array>;
}

export interface PdfPagina {
  drawRectangle(o: Record<string, unknown>): void;
  drawText(texto: string, o: Record<string, unknown>): void;
  drawImage(img: unknown, o: Record<string, unknown>): void;
}

export interface FotoReduzida {
  bytes: Uint8Array;
  largura: number;
  altura: number;
}

/** Maior lado da foto depois de reduzida e qualidade do JPEG. */
export const FOTO_LADO_MAXIMO = 1600;
export const FOTO_QUALIDADE = 0.8;

/**
 * Foto do componente que vai como última página do PDF do orçamento (reduzirFoto, pdfComFoto e
 * carregarPdfLib do app.js). Tudo no celular: a foto nunca vai pro servidor.
 */
@Injectable({ providedIn: 'root' })
export class FotoOrcamentoService {
  private pdfLibPromise: Promise<PdfLib> | null = null;

  /** pdf-lib (vendor/, MIT) só é baixada quando há foto pra juntar ao PDF. Relativa ao baseHref (/novo/). */
  carregarPdfLib(): Promise<PdfLib> {
    const global = window as unknown as { PDFLib?: PdfLib };
    if (global.PDFLib) return Promise.resolve(global.PDFLib);
    if (!this.pdfLibPromise) {
      this.pdfLibPromise = new Promise<PdfLib>((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'vendor/pdf-lib.min.js';
        s.onload = () => (global.PDFLib ? resolve(global.PDFLib) : reject(new Error('pdf-lib')));
        s.onerror = () => { this.pdfLibPromise = null; s.remove(); reject(new Error('pdf-lib')); };
        document.head.appendChild(s);
      });
    }
    return this.pdfLibPromise;
  }

  /** Foto da câmera tem vários MB: reduz pra no máximo 1600px, JPEG 80%. */
  async reduzirFoto(foto: Blob): Promise<FotoReduzida> {
    let origem: { width: number; height: number; close?: () => void } & CanvasImageSource;
    if ((window as { createImageBitmap?: unknown }).createImageBitmap) {
      origem = await createImageBitmap(foto, { imageOrientation: 'from-image' });
    } else {
      origem = await new Promise<HTMLImageElement>((res, rej) => {
        const img = new Image();
        img.onload = () => res(img);
        img.onerror = rej;
        img.src = URL.createObjectURL(foto);
      });
    }
    const w = origem.width, h = origem.height;
    const escala = Math.min(1, FOTO_LADO_MAXIMO / Math.max(w, h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * escala);
    canvas.height = Math.round(h * escala);
    canvas.getContext('2d')!.drawImage(origem, 0, 0, canvas.width, canvas.height);
    origem.close?.();
    const blob = await new Promise<Blob>((res, rej) =>
      canvas.toBlob(b => (b ? res(b) : rej(new Error('toBlob'))), 'image/jpeg', FOTO_QUALIDADE));
    return { bytes: new Uint8Array(await blob.arrayBuffer()), largura: canvas.width, altura: canvas.height };
  }

  /**
   * Põe a foto como última página do PDF do orçamento. Um arquivo só: PDF + JPG separados no mesmo
   * share() fazem o WhatsApp do Android descartar tudo.
   */
  async pdfComFoto(pdfPromise: Promise<Blob>, foto: Blob): Promise<Blob> {
    const [pdfBlob, PDFLib, img] = await Promise.all([pdfPromise, this.carregarPdfLib(), this.reduzirFoto(foto)]);
    const doc = await PDFLib.PDFDocument.load(await pdfBlob.arrayBuffer());
    const jpg = await doc.embedJpg(img.bytes);
    const { width: largura, height: altura } = doc.getPage(0).getSize();
    const pagina = doc.addPage([largura, altura]);
    const fonte = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
    const margem = 40, faixaTitulo = 40;
    // mesmo fundo cinza-claro (#f2f2f3) das páginas do orçamento
    pagina.drawRectangle({ x: 0, y: 0, width: largura, height: altura, color: PDFLib.rgb(0.949, 0.949, 0.953) });
    pagina.drawText('Foto anexada ao orçamento', { x: margem, y: altura - margem - 12, size: 12, font: fonte });
    const areaL = largura - 2 * margem, areaA = altura - 2 * margem - faixaTitulo;
    const esc = Math.min(areaL / img.largura, areaA / img.altura);
    const fw = img.largura * esc, fh = img.altura * esc;
    pagina.drawImage(jpg, { x: (largura - fw) / 2, y: margem + (areaA - fh) / 2, width: fw, height: fh });
    return new Blob([await doc.save() as BlobPart], { type: 'application/pdf' });
  }
}
