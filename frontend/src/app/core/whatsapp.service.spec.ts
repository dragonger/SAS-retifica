import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provedoresDeTela } from '../testing/ajuda';
import { ErroApi } from './api.service';
import { DialogoService } from './dialogo.service';
import { WhatsAppService } from './whatsapp.service';

describe('WhatsAppService', () => {
  let servico: WhatsAppService;
  let http: HttpTestingController;
  let dialogo: DialogoService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: provedoresDeTela() });
    servico = TestBed.inject(WhatsAppService);
    http = TestBed.inject(HttpTestingController);
    dialogo = TestBed.inject(DialogoService);
  });

  afterEach(() => http.verify());

  describe('apiHabilitada', () => {
    it('consulta o status uma vez por sessão e devolve true quando habilitado', async () => {
      const a = servico.apiHabilitada();
      const b = servico.apiHabilitada();
      http.expectOne('/api/whatsapp/status').flush({ habilitado: true });
      expect(await a).toBe(true);
      expect(await b).toBe(true);
      expect(await servico.apiHabilitada()).toBe(true);
      http.expectNone('/api/whatsapp/status');
    });

    it('habilitado false ou corpo vazio = false (e não consulta de novo)', async () => {
      const p = servico.apiHabilitada();
      http.expectOne('/api/whatsapp/status').flush({ habilitado: false });
      expect(await p).toBe(false);
      expect(await servico.apiHabilitada()).toBe(false);
      http.expectNone('/api/whatsapp/status');
    });

    for (const status of [404, 500, 502, 503]) {
      it(`status ${status} = false, sem toast, e a próxima chamada tenta de novo`, async () => {
        const p = servico.apiHabilitada();
        http.expectOne('/api/whatsapp/status').flush({}, { status, statusText: 'x' });
        expect(await p).toBe(false);
        expect(dialogo.toastVisivel()).toBe(false);
        const segunda = servico.apiHabilitada();
        http.expectOne('/api/whatsapp/status').flush({ habilitado: true });
        expect(await segunda).toBe(true);
      });
    }
  });

  describe('enviar', () => {
    it('manda multipart (POST) com o PDF no campo "pdf" e o nome do arquivo', async () => {
      const pdf = new Blob(['%PDF'], { type: 'application/pdf' });
      const p = servico.enviar(137, pdf, 'orcamento-0137.pdf');
      const req = http.expectOne('/api/pedidos/137/whatsapp');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toBeInstanceOf(FormData);
      const arquivo = (req.request.body as FormData).get('pdf') as File;
      expect(arquivo.name).toBe('orcamento-0137.pdf');
      expect(arquivo.size).toBe(4);
      req.flush({ ok: true });
      await p;
    });

    it('sem PDF manda o multipart vazio (o servidor gera o padrão)', async () => {
      const p = servico.enviar(5, null, 'x.pdf');
      const req = http.expectOne('/api/pedidos/5/whatsapp');
      expect((req.request.body as FormData).has('pdf')).toBe(false);
      req.flush({});
      await p;
    });

    for (const status of [400, 413, 422, 429, 502, 503]) {
      it(`status ${status} chega como ErroApi com o detalhe do servidor, sem o toast genérico`, async () => {
        const p = servico.enviar(1, null, 'x.pdf');
        http.expectOne('/api/pedidos/1/whatsapp').flush({ erro: 'Mensagem do servidor' }, { status, statusText: 'x' });
        const e = await p.catch(x => x);
        expect(e).toBeInstanceOf(ErroApi);
        expect((e as ErroApi).status).toBe(status);
        expect((e as ErroApi).detalhe).toBe('Mensagem do servidor');
        expect(dialogo.toastVisivel()).toBe(false);
      });
    }

    it('status fora da lista (500) mostra o toast genérico', async () => {
      const p = servico.enviar(1, null, 'x.pdf');
      http.expectOne('/api/pedidos/1/whatsapp').flush({}, { status: 500, statusText: 'x' });
      await p.catch(() => undefined);
      expect(dialogo.toastTexto()).toBe('Erro ao acessar /api/pedidos/1/whatsapp (500)');
    });
  });
});
