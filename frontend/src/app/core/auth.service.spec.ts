import { TestBed } from '@angular/core/testing';
import { AuthService, CHAVE_AUTH } from './auth.service';

/** JWT de teste (a assinatura não é conferida pelo front). */
function jwt(claims: object): string {
  const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return b64({ alg: 'HS256' }) + '.' + b64(claims) + '.assinatura';
}

describe('AuthService', () => {
  let auth: AuthService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    auth = TestBed.inject(AuthService);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('lê e grava retifica_auth no mesmo formato do app atual', () => {
    expect(auth.lerAuth()).toBeNull();
    auth.gravar({ token: 'abc', nome: 'Ana', empresaNome: 'Retífica X' });
    expect(JSON.parse(localStorage.getItem(CHAVE_AUTH)!)).toEqual({ token: 'abc', nome: 'Ana', empresaNome: 'Retífica X' });
    expect(auth.lerAuth()?.token).toBe('abc');
    expect(auth.sessao()?.empresaNome).toBe('Retífica X');
  });

  it('lê um retifica_auth gravado pelo app atual', () => {
    localStorage.setItem(CHAVE_AUTH, JSON.stringify({ token: 't', nome: 'N', empresaNome: 'E' }));
    expect(auth.lerAuth()).toEqual({ token: 't', nome: 'N', empresaNome: 'E' });
  });

  it('trata JSON inválido como sem sessão', () => {
    localStorage.setItem(CHAVE_AUTH, '{quebrado');
    expect(auth.lerAuth()).toBeNull();
  });

  it('gravarToken troca só o token e limpar apaga a sessão', () => {
    auth.gravar({ token: 'velho', nome: 'Ana', empresaNome: 'E' });
    auth.gravarToken('novo');
    expect(auth.lerAuth()).toEqual({ token: 'novo', nome: 'Ana', empresaNome: 'E' });
    auth.limpar();
    expect(localStorage.getItem(CHAVE_AUTH)).toBeNull();
    expect(auth.sessao()).toBeNull();
  });

  it('gravarToken sem sessão não cria nada', () => {
    auth.gravarToken('x');
    expect(localStorage.getItem(CHAVE_AUTH)).toBeNull();
  });

  it('decodifica usuarioId e empresaId do JWT e monta o dono dos rascunhos', () => {
    auth.gravar({ token: jwt({ usuarioId: 7, empresaId: 3 }) });
    expect(auth.usuarioId()).toBe(7);
    expect(auth.empresaId()).toBe(3);
    expect(auth.donoDosRascunhos()).toBe('7|3');
  });

  it('sem token válido o dono dos rascunhos é "anonimo"', () => {
    expect(auth.donoDosRascunhos()).toBe('anonimo');
    auth.gravar({ token: 'nao-e-jwt' });
    expect(auth.claims()).toBeNull();
    expect(auth.donoDosRascunhos()).toBe('anonimo');
  });

  it('garantirAutoLogin grava a sessão devolvida pelo servidor', async () => {
    const fetchFalso = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ token: 'auto', nome: 'Auto', empresaNome: 'E' }) });
    vi.stubGlobal('fetch', fetchFalso);
    expect(await auth.garantirAutoLogin()).toBe(true);
    expect(fetchFalso).toHaveBeenCalledWith('/api/auth/auto-login', { method: 'POST' });
    expect(auth.lerAuth()?.token).toBe('auto');
  });

  it('garantirAutoLogin não chama o servidor se já há sessão', async () => {
    auth.gravar({ token: 'ja' });
    const fetchFalso = vi.fn();
    vi.stubGlobal('fetch', fetchFalso);
    expect(await auth.garantirAutoLogin()).toBe(true);
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it('garantirAutoLogin devolve false sem conexão ou com resposta de erro', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    expect(await auth.garantirAutoLogin()).toBe(false);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    expect(await auth.garantirAutoLogin()).toBe(false);
    expect(auth.lerAuth()).toBeNull();
  });

  it('chamadas simultâneas de garantirAutoLogin compartilham uma só requisição', async () => {
    const fetchFalso = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ token: 'um' }) });
    vi.stubGlobal('fetch', fetchFalso);
    await Promise.all([auth.garantirAutoLogin(), auth.garantirAutoLogin()]);
    expect(fetchFalso).toHaveBeenCalledTimes(1);
  });
});
