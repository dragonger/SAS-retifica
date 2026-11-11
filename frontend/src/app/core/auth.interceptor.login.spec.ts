import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { ApiService, ErroApi } from './api.service';
import { authInterceptor } from './auth.interceptor';
import { AuthService, CHAVE_AUTH } from './auth.service';
import { DialogoService } from './dialogo.service';
import { LOGIN_AUTOMATICO } from './login-automatico';

describe('authInterceptor: 401 com tratamento próprio e login automático desligado', () => {
  function preparar(loginAutomatico: boolean) {
    localStorage.clear();
    localStorage.setItem(CHAVE_AUTH, JSON.stringify({ token: 'tk' }));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: LOGIN_AUTOMATICO, useValue: loginAutomatico },
      ],
    });
    return { api: TestBed.inject(ApiService), http: TestBed.inject(HttpTestingController) };
  }

  afterEach(() => vi.unstubAllGlobals());

  it('erro401Proprio: devolve o ErroApi(401) sem limpar a sessão, sem login e sem toast', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    const { api, http } = preparar(true);
    const p = api.put('/api/usuario/senha', {}, { erro401Proprio: true });
    http.expectOne('/api/usuario/senha').flush({ erro: 'senha incorreta' }, { status: 401, statusText: 'Unauthorized' });
    await expect(p).rejects.toMatchObject({ status: 401, detalhe: 'senha incorreta' });
    expect(JSON.parse(localStorage.getItem(CHAVE_AUTH)!).token).toBe('tk');
    expect(f).not.toHaveBeenCalled();
    expect(TestBed.inject(DialogoService).toastVisivel()).toBe(false);
    http.verify();
  });

  it('login automático desligado: o 401 limpa a sessão, vai a #/login e não repete a chamada', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    const { api, http } = preparar(false);
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
