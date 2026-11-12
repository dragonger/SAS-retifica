import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { ApiService, ErroApi } from './api.service';
import { authInterceptor } from './auth.interceptor';
import { AuthService, CHAVE_AUTH } from './auth.service';
import { DialogoService } from './dialogo.service';

describe('authInterceptor: 401', () => {
  function preparar() {
    localStorage.clear();
    localStorage.setItem(CHAVE_AUTH, JSON.stringify({ token: 'tk' }));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    return { api: TestBed.inject(ApiService), http: TestBed.inject(HttpTestingController) };
  }

  afterEach(() => vi.unstubAllGlobals());

  it('erro401Proprio: devolve o ErroApi(401) sem limpar a sessão, sem ir ao login e sem toast', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    const { api, http } = preparar();
    const p = api.put('/api/usuario/senha', {}, { erro401Proprio: true });
    http.expectOne('/api/usuario/senha').flush({ erro: 'senha incorreta' }, { status: 401, statusText: 'Unauthorized' });
    await expect(p).rejects.toMatchObject({ status: 401, detalhe: 'senha incorreta' });
    expect(JSON.parse(localStorage.getItem(CHAVE_AUTH)!).token).toBe('tk');
    expect(f).not.toHaveBeenCalled();
    expect(TestBed.inject(DialogoService).toastVisivel()).toBe(false);
    http.verify();
  });

  it('sessão vencida (ou demonstração no fim do prazo): o 401 limpa a sessão, vai a #/login e não repete a chamada', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    const { api, http } = preparar();
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const p = api.get('/api/x');
    http.expectOne('/api/x').flush({}, { status: 401, statusText: 'Unauthorized' });
    await expect(p).rejects.toBeInstanceOf(ErroApi);
    expect(TestBed.inject(AuthService).lerAuth()).toBeNull();
    expect(navegar).toHaveBeenCalledWith('/login');
    expect(f).not.toHaveBeenCalled();
    http.verify();
  });
});
