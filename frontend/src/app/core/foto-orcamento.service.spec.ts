import { TestBed } from '@angular/core/testing';
import { FOTO_LADO_MAXIMO, FOTO_QUALIDADE, FotoOrcamentoService, PdfLib } from './foto-orcamento.service';

type Janela = { PDFLib?: PdfLib };

/** Blob com arrayBuffer (o jsdom pode não ter). */
function blobComBytes(bytes: number[], tipo: string): Blob {
  const b = new Blob([new Uint8Array(bytes)], { type: tipo });
  if (typeof b.arrayBuffer !== 'function') {
    (b as { arrayBuffer: () => Promise<ArrayBuffer> }).arrayBuffer = () => Promise.resolve(new Uint8Array(bytes).buffer);
  }
  return b;
}

describe('FotoOrcamentoService', () => {
  let servico: FotoOrcamentoService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    servico = TestBed.inject(FotoOrcamentoService);
  });

  afterEach(() => {
    delete (window as unknown as Janela).PDFLib;
    document.head.querySelectorAll('script[src*="pdf-lib"]').forEach(s => s.remove());
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('carregarPdfLib', () => {
    it('com window.PDFLib já carregada, devolve ela sem injetar script', async () => {
      const falsa = {} as PdfLib;
      (window as unknown as Janela).PDFLib = falsa;
      expect(await servico.carregarPdfLib()).toBe(falsa);
      expect(document.head.querySelector('script[src*="pdf-lib"]')).toBeNull();
    });

    it('injeta vendor/pdf-lib.min.js uma vez e resolve no load', async () => {
      const p1 = servico.carregarPdfLib();
      const p2 = servico.carregarPdfLib();
      const scripts = document.head.querySelectorAll('script[src*="pdf-lib"]');
      expect(scripts.length).toBe(1);
      expect(scripts[0].getAttribute('src')).toBe('vendor/pdf-lib.min.js');
      const falsa = {} as PdfLib;
      (window as unknown as Janela).PDFLib = falsa;
      scripts[0].dispatchEvent(new Event('load'));
      expect(await p1).toBe(falsa);
      expect(await p2).toBe(falsa);
    });

    it('script que carrega mas não define PDFLib rejeita', async () => {
      const p = servico.carregarPdfLib();
      document.head.querySelector('script[src*="pdf-lib"]')!.dispatchEvent(new Event('load'));
      await expect(p).rejects.toThrow('pdf-lib');
    });

    it('erro de rede remove o script e permite tentar de novo', async () => {
      const p = servico.carregarPdfLib();
      document.head.querySelector('script[src*="pdf-lib"]')!.dispatchEvent(new Event('error'));
      await expect(p).rejects.toThrow('pdf-lib');
      expect(document.head.querySelector('script[src*="pdf-lib"]')).toBeNull();
      void servico.carregarPdfLib();
      expect(document.head.querySelectorAll('script[src*="pdf-lib"]').length).toBe(1);
    });
  });

  describe('reduzirFoto', () => {
    let desenhar: ReturnType<typeof vi.fn>;
    let paraBlob: ReturnType<typeof vi.fn>;
    let tamanhos: { largura: number; altura: number }[];

    function mockarCanvas(jpeg: Blob | null = blobComBytes([1, 2, 3], 'image/jpeg')) {
      tamanhos = [];
      desenhar = vi.fn();
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
        tamanhos.push({ largura: this.width, altura: this.height });
        return { drawImage: desenhar } as never;
      });
      paraBlob = vi.fn((cb: BlobCallback) => cb(jpeg));
      vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(paraBlob as never);
    }

    it('foto grande: reduz o maior lado para 1600px, mantém a proporção, JPEG 80%', async () => {
      mockarCanvas();
      const fechar = vi.fn();
      const bitmap = { width: 4000, height: 3000, close: fechar };
      const criar = vi.fn().mockResolvedValue(bitmap);
      vi.stubGlobal('createImageBitmap', criar);
      const foto = new File(['x'], 'f.jpg', { type: 'image/jpeg' });

      const r = await servico.reduzirFoto(foto);

      expect(criar).toHaveBeenCalledWith(foto, { imageOrientation: 'from-image' });
      expect(r.largura).toBe(FOTO_LADO_MAXIMO);
      expect(r.altura).toBe(1200);
      expect(desenhar).toHaveBeenCalledWith(bitmap, 0, 0, 1600, 1200);
      expect(paraBlob.mock.calls[0][1]).toBe('image/jpeg');
      expect(paraBlob.mock.calls[0][2]).toBe(FOTO_QUALIDADE);
      expect([...r.bytes]).toEqual([1, 2, 3]);
      expect(fechar).toHaveBeenCalled();
    });

    it('foto vertical: o lado maior (altura) é que vai a 1600', async () => {
      mockarCanvas();
      vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 3000, height: 4000 }));
      const r = await servico.reduzirFoto(new File(['x'], 'f.jpg'));
      expect([r.largura, r.altura]).toEqual([1200, 1600]);
    });

    it('foto pequena não é ampliada', async () => {
      mockarCanvas();
      vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 800, height: 600 }));
      const r = await servico.reduzirFoto(new File(['x'], 'f.jpg'));
      expect([r.largura, r.altura]).toEqual([800, 600]);
    });

    it('sem createImageBitmap lê a foto por <img>', async () => {
      mockarCanvas();
      vi.stubGlobal('createImageBitmap', undefined);
      Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:foto') });
      class ImagemFalsa {
        width = 2000; height = 1000; onload: (() => void) | null = null; onerror: (() => void) | null = null;
        set src(_: string) { queueMicrotask(() => this.onload?.()); }
      }
      vi.stubGlobal('Image', ImagemFalsa);
      try {
        const r = await servico.reduzirFoto(new File(['x'], 'f.jpg'));
        expect([r.largura, r.altura]).toEqual([1600, 800]);
      } finally {
        delete (URL as unknown as Record<string, unknown>)['createObjectURL'];
      }
    });

    it('canvas sem blob (toBlob nulo) rejeita', async () => {
      mockarCanvas(null);
      vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 10, height: 10 }));
      await expect(servico.reduzirFoto(new File(['x'], 'f.jpg'))).rejects.toThrow('toBlob');
    });
  });

  describe('pdfComFoto', () => {
    let ordem: string[];
    let pagina: { drawRectangle: ReturnType<typeof vi.fn>; drawText: ReturnType<typeof vi.fn>; drawImage: ReturnType<typeof vi.fn> };
    let carregou: ArrayBuffer | null;

    beforeEach(() => {
      ordem = [];
      carregou = null;
      pagina = {
        drawRectangle: vi.fn(() => ordem.push('retangulo')),
        drawText: vi.fn(() => ordem.push('texto')),
        drawImage: vi.fn(() => ordem.push('imagem')),
      };
      const doc = {
        embedJpg: vi.fn(async () => { ordem.push('embedJpg'); return 'JPG'; }),
        embedFont: vi.fn(async () => { ordem.push('embedFont'); return 'FONTE'; }),
        getPage: vi.fn(() => ({ getSize: () => ({ width: 595, height: 842 }) })),
        addPage: vi.fn(() => { ordem.push('addPage'); return pagina; }),
        save: vi.fn(async () => { ordem.push('save'); return new Uint8Array([9, 9]); }),
      };
      (window as unknown as Janela).PDFLib = {
        PDFDocument: { load: vi.fn(async (b: ArrayBuffer) => { ordem.push('load'); carregou = b; return doc; }) },
        StandardFonts: { Helvetica: 'Helvetica' },
        rgb: (r: number, g: number, b: number) => ({ r, g, b }),
      } as unknown as PdfLib;
      vi.spyOn(servico, 'reduzirFoto').mockImplementation(async () => {
        ordem.push('reduzir');
        return { bytes: new Uint8Array([7]), largura: 1600, altura: 1200 };
      });
    });

    it('junta a foto como última página: carrega o PDF, embute o JPG, cria página do mesmo tamanho e desenha', async () => {
      const original = blobComBytes([1, 2, 3, 4], 'application/pdf');
      const resultado = await servico.pdfComFoto(Promise.resolve(original), new File(['x'], 'f.jpg'));

      expect(new Uint8Array(carregou!)).toEqual(new Uint8Array([1, 2, 3, 4]));
      // a redução da foto começa junto (em paralelo) com a espera do PDF; o resto segue em ordem
      expect(ordem.filter(o => o !== 'reduzir')).toEqual(['load', 'embedJpg', 'addPage', 'embedFont', 'retangulo', 'texto', 'imagem', 'save']);
      expect(ordem).toContain('reduzir');
      expect(ordem.indexOf('reduzir')).toBeLessThan(ordem.indexOf('load'));

      expect(pagina.drawRectangle).toHaveBeenCalledWith({
        x: 0, y: 0, width: 595, height: 842, color: { r: 0.949, g: 0.949, b: 0.953 },
      });
      expect(pagina.drawText).toHaveBeenCalledWith('Foto anexada ao orçamento', { x: 40, y: 842 - 40 - 12, size: 12, font: 'FONTE' });
      // área útil 515 x 722: a foto 1600x1200 encosta na largura (515) e centraliza na altura
      const args = pagina.drawImage.mock.calls[0];
      expect(args[0]).toBe('JPG');
      expect(args[1].width).toBeCloseTo(515);
      expect(args[1].height).toBeCloseTo(386.25);
      expect(args[1].x).toBeCloseTo(40);
      expect(args[1].y).toBeCloseTo(40 + (722 - 386.25) / 2);

      expect(resultado.type).toBe('application/pdf');
      expect(resultado.size).toBe(2);
    });

    it('se o PDF base falhar, a promessa rejeita (o chamador manda só o orçamento)', async () => {
      await expect(servico.pdfComFoto(Promise.reject(new Error('HTTP 500')), new File(['x'], 'f.jpg'))).rejects.toThrow('HTTP 500');
    });
  });
});
