import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ApiService } from './api.service';
import { authInterceptor } from './auth.interceptor';
import { AuthService, CHAVE_AUTH, CHAVE_LOGO } from './auth.service';
import { DialogoService } from './dialogo.service';

describe('authInterceptor', () => {
  let api: ApiService;
  let http: HttpTestingController;
  let auth: AuthService;
  let dialogo: DialogoService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'login', children: [] }]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    api = TestBed.inject(ApiService);
    http = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
    dialogo = TestBed.inject(DialogoService);
    auth.gravar({ token: 'tk1', nome: 'Ana', empresaNome: 'E' });
  });

  afterEach(() => {
    http.verify();
    vi.unstubAllGlobals();
  });

  it('manda o token como Bearer', async () => {
    const p = api.get('/api/x');
    const req = http.expectOne('/api/x');
    expect(req.request.headers.get('Authorization')).toBe('Bearer tk1');
    req.flush({ ok: 1 });
    expect(await p).toEqual({ ok: 1 });
  });

  it('sem sessão não manda Authorization', async () => {
    auth.limpar();
    const p = api.get('/api/x');
    const req = http.expectOne('/api/x');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
    await p;
  });

  it('guarda o token renovado de X-Auth-Refresh, mantendo o resto da sessão', async () => {
    const p = api.get('/api/x');
    http.expectOne('/api/x').flush({}, { headers: { 'X-Auth-Refresh': 'tk2' } });
    await p;
    expect(JSON.parse(localStorage.getItem(CHAVE_AUTH)!)).toEqual({ token: 'tk2', nome: 'Ana', empresaNome: 'E' });
  });

  it('204 devolve null', async () => {
    const p = api.delete('/api/x/1');
    http.expectOne('/api/x/1').flush(null, { status: 204, statusText: 'No Content' });
    expect(await p).toBeNull();
  });

  it('401: limpa a sessão e a logo, não tenta entrar de novo, não repete a chamada e não gera toast', async () => {
    localStorage.setItem(CHAVE_LOGO, '{"versao":1,"dataUrl":"data:x"}');
    const fetchFalso = vi.fn();
    vi.stubGlobal('fetch', fetchFalso);

    const p = api.get('/api/x');
    p.catch(() => undefined);
    http.expectOne('/api/x').flush({}, { status: 401, statusText: 'Unauthorized' });

    await expect(p).rejects.toMatchObject({ status: 401 });
    expect(localStorage.getItem(CHAVE_LOGO)).toBeNull();
    expect(fetchFalso).not.toHaveBeenCalled();
    http.expectNone('/api/x');
    expect(dialogo.toastVisivel()).toBe(false);
  });

  it('sem conexão: toast "Sem conexão com o servidor."', async () => {
    const p = api.get('/api/x');
    p.catch(() => undefined);
    http.expectOne('/api/x').error(new ProgressEvent('error'));
    await expect(p).rejects.toMatchObject({ status: 0 });
    expect(dialogo.toastTexto()).toBe('Sem conexão com o servidor.');
    expect(dialogo.toastErro()).toBe(true);
  });

  it('erro HTTP: toast genérico e detalhe do corpo {"erro": ...}', async () => {
    const p = api.post('/api/x', { a: 1 });
    p.catch(() => undefined);
    http.expectOne('/api/x').flush({ erro: 'Cliente inválido' }, { status: 400, statusText: 'Bad Request' });
    await expect(p).rejects.toMatchObject({ status: 400, detalhe: 'Cliente inválido' });
    expect(dialogo.toastTexto()).toBe('Erro ao acessar /api/x (400)');
    expect(dialogo.toastErro()).toBe(true);
  });

  it('códigos da lista statusSemAviso não mostram o toast genérico (mas expõem o detalhe)', async () => {
    const p = api.get('/api/whatsapp/status', { statusSemAviso: [404, 500] });
    p.catch(() => undefined);
    http.expectOne('/api/whatsapp/status').flush({ erro: 'desligado' }, { status: 404, statusText: 'Not Found' });
    await expect(p).rejects.toMatchObject({ status: 404, detalhe: 'desligado' });
    expect(dialogo.toastVisivel()).toBe(false);
  });

  it('corpo sem JSON: detalhe indefinido', async () => {
    const p = api.get('/api/x');
    p.catch(() => undefined);
    http.expectOne('/api/x').flush('falhou', { status: 500, statusText: 'Server Error' });
    await expect(p).rejects.toMatchObject({ status: 500, detalhe: undefined });
  });
});
