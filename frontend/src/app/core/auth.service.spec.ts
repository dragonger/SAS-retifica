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

  it('entrarDemo grava a sessão de demonstração devolvida pelo servidor', async () => {
    const token = jwt({ usuarioId: 90, empresaId: 80, demo: true, exp: 1794500000 });
    const fetchFalso = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ token, nome: 'Visitante', empresaNome: 'Retífica Demonstração' }) });
    vi.stubGlobal('fetch', fetchFalso);
    expect(await auth.entrarDemo()).toBe('ok');
    expect(fetchFalso).toHaveBeenCalledWith('/api/auth/demo', { method: 'POST' });
    expect(auth.lerAuth()?.empresaNome).toBe('Retífica Demonstração');
    expect(auth.demoExpiraEm()?.getTime()).toBe(1794500000 * 1000);
  });

  it('entrarDemo: 429 vira "limite", outro erro "indisponivel", sem rede "semConexao", e nada é gravado', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429 }));
    expect(await auth.entrarDemo()).toBe('limite');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    expect(await auth.entrarDemo()).toBe('indisponivel');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    expect(await auth.entrarDemo()).toBe('semConexao');
    expect(auth.lerAuth()).toBeNull();
  });

  it('demoExpiraEm é null numa sessão normal e sem sessão', () => {
    expect(auth.demoExpiraEm()).toBeNull();
    auth.gravar({ token: jwt({ usuarioId: 1, empresaId: 1, exp: 1794500000 }) });
    expect(auth.demoExpiraEm()).toBeNull();
    auth.limpar();
    expect(auth.demoExpiraEm()).toBeNull();
  });

  describe('gravarToken não troca por token mais velho', () => {
    const tokenAtual = () => auth.lerAuth()?.token;

    it('sv menor não substitui', () => {
      const atual = jwt({ usuarioId: 1, sv: 2, iat: 100 });
      auth.gravar({ token: atual });
      auth.gravarToken(jwt({ usuarioId: 1, sv: 1, iat: 999 }));
      expect(tokenAtual()).toBe(atual);
    });

    it('sv ausente conta como 0', () => {
      const atual = jwt({ usuarioId: 1, sv: 1, iat: 100 });
      auth.gravar({ token: atual });
      auth.gravarToken(jwt({ usuarioId: 1, iat: 999 }));
      expect(tokenAtual()).toBe(atual);
    });

    it('sv igual e iat menor não substitui', () => {
      const atual = jwt({ usuarioId: 1, sv: 1, iat: 200 });
      auth.gravar({ token: atual });
      auth.gravarToken(jwt({ usuarioId: 1, sv: 1, iat: 100 }));
      expect(tokenAtual()).toBe(atual);
    });

    it('sv igual e iat maior ou igual substitui', () => {
      auth.gravar({ token: jwt({ usuarioId: 1, sv: 1, iat: 100 }) });
      const novo = jwt({ usuarioId: 1, sv: 1, iat: 200 });
      auth.gravarToken(novo);
      expect(tokenAtual()).toBe(novo);
    });

    it('sv maior substitui, mesmo com iat menor', () => {
      auth.gravar({ token: jwt({ usuarioId: 1, sv: 1, iat: 500 }) });
      const novo = jwt({ usuarioId: 1, sv: 2, iat: 100 });
      auth.gravarToken(novo);
      expect(tokenAtual()).toBe(novo);
    });

    it('token não decodificável substitui como antes', () => {
      auth.gravar({ token: jwt({ usuarioId: 1, sv: 5, iat: 500 }) });
      auth.gravarToken('tk-novo');
      expect(tokenAtual()).toBe('tk-novo');
    });
  });
});
