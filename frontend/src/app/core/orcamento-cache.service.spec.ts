import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth.service';
import { ORCAMENTO_CACHE_MS, OrcamentoCacheService } from './orcamento-cache.service';

describe('OrcamentoCacheService', () => {
  let servico: OrcamentoCacheService;
  let fetchFalso: ReturnType<typeof vi.fn>;

  const pdf = () => new Blob(['%PDF'], { type: 'application/pdf' });
  const ok = () => Promise.resolve({ ok: true, status: 200, blob: () => Promise.resolve(pdf()) });

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    TestBed.inject(AuthService).gravar({ token: 'tk9' });
    servico = TestBed.inject(OrcamentoCacheService);
    fetchFalso = vi.fn(ok);
    vi.stubGlobal('fetch', fetchFalso);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('busca o PDF com o token da sessão no cabeçalho Authorization', async () => {
    const blob = await servico.preparar(137);
    expect(blob).toBeInstanceOf(Blob);
    expect(fetchFalso).toHaveBeenCalledWith('/api/pedidos/137/pdf', { headers: { Authorization: 'Bearer tk9' } });
  });

  it('sem sessão manda sem Authorization', async () => {
    TestBed.inject(AuthService).limpar();
    await servico.preparar(1);
    expect(fetchFalso).toHaveBeenCalledWith('/api/pedidos/1/pdf', { headers: {} });
  });

  it('guarda por pedido: a segunda chamada devolve a mesma promessa, sem novo fetch', async () => {
    const a = servico.preparar(5);
    const b = servico.preparar('5');
    expect(b).toBe(a);
    await a;
    expect(fetchFalso).toHaveBeenCalledTimes(1);
    await servico.preparar(6);
    expect(fetchFalso).toHaveBeenCalledTimes(2);
  });

  it('vale por 10 minutos: depois disso busca de novo', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-01T10:00:00'));
    await servico.preparar(7);
    vi.setSystemTime(Date.now() + ORCAMENTO_CACHE_MS - 1000);
    expect(servico.obter(7)).toBeDefined();
    await servico.preparar(7);
    expect(fetchFalso).toHaveBeenCalledTimes(1);
    vi.setSystemTime(Date.now() + 2000);
    expect(servico.obter(7)).toBeUndefined();
    await servico.preparar(7);
    expect(fetchFalso).toHaveBeenCalledTimes(2);
  });

  it('invalidar(id) descarta só aquele pedido', async () => {
    await servico.preparar(1);
    await servico.preparar(2);
    servico.invalidar(1);
    expect(servico.obter(1)).toBeUndefined();
    expect(servico.obter(2)).toBeDefined();
    await servico.preparar(1);
    expect(fetchFalso).toHaveBeenCalledTimes(3);
  });

  it('invalidarTodos descarta todos (trocar logo/dados da empresa)', async () => {
    await servico.preparar(1);
    await servico.preparar(2);
    servico.invalidarTodos();
    expect(servico.obter(1)).toBeUndefined();
    expect(servico.obter(2)).toBeUndefined();
  });

  it('erro HTTP rejeita com "HTTP <status>" e sai do cache para a próxima tentar de novo', async () => {
    fetchFalso.mockResolvedValueOnce({ ok: false, status: 500, blob: () => Promise.resolve(pdf()) });
    await expect(servico.preparar(8)).rejects.toThrow('HTTP 500');
    await Promise.resolve();
    expect(servico.obter(8)).toBeUndefined();
    await servico.preparar(8);
    expect(fetchFalso).toHaveBeenCalledTimes(2);
  });

  it('falha de rede também sai do cache', async () => {
    fetchFalso.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(servico.preparar(9)).rejects.toThrow('Failed to fetch');
    await Promise.resolve();
    expect(servico.obter(9)).toBeUndefined();
  });
});
