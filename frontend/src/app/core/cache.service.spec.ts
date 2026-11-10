import { TestBed } from '@angular/core/testing';
import { ApiService } from './api.service';
import { CacheService } from './cache.service';

interface Pendente {
  path: string;
  resolver: (v: unknown) => void;
  rejeitar: (e: unknown) => void;
}

describe('CacheService', () => {
  let cache: CacheService;
  let pendentes: Pendente[];

  beforeEach(() => {
    pendentes = [];
    const apiFalsa = {
      get: (path: string) => new Promise((resolver, rejeitar) => pendentes.push({ path, resolver, rejeitar })),
    };
    TestBed.configureTestingModule({ providers: [{ provide: ApiService, useValue: apiFalsa }] });
    cache = TestBed.inject(CacheService);
  });

  const ultimo = () => pendentes[pendentes.length - 1];

  it('sem cache: só renderiza quando a rede responde', async () => {
    const render = vi.fn();
    const p = cache.comCache<number>('/api/a', render);
    expect(render).not.toHaveBeenCalled();
    ultimo().resolver(1);
    await p;
    expect(render).toHaveBeenCalledExactlyOnceWith(1);
  });

  it('com cache: mostra o guardado na hora e redesenha com o fresco se mudou', async () => {
    const primeiro = cache.comCache<number>('/api/a', () => undefined);
    ultimo().resolver(1);
    await primeiro;

    const render = vi.fn();
    const p = cache.comCache<number>('/api/a', render);
    expect(render).toHaveBeenCalledExactlyOnceWith(1); // antes da rede
    ultimo().resolver(2);
    await p;
    expect(render).toHaveBeenCalledTimes(2);
    expect(render).toHaveBeenLastCalledWith(2);
    expect(cache.ler('/api/a')).toBe(2);
  });

  it('com cache igual ao fresco: não redesenha (tela quieta)', async () => {
    const primeiro = cache.comCache<object>('/api/a', () => undefined);
    ultimo().resolver({ x: 1 });
    await primeiro;

    const render = vi.fn();
    const p = cache.comCache<object>('/api/a', render);
    ultimo().resolver({ x: 1 });
    await p;
    expect(render).toHaveBeenCalledTimes(1);
  });

  it('descarta a resposta atrasada quando o usuário já foi para outra tela', async () => {
    const render = vi.fn();
    const p = cache.comCache<number>('/api/a', render);
    cache.novaGeracao(); // navegou
    ultimo().resolver(1);
    await p;
    expect(render).not.toHaveBeenCalled();
    expect(cache.ler('/api/a')).toBe(1); // mas o cache é atualizado para a próxima visita
  });

  it('invalidar apaga o guardado', async () => {
    const p = cache.buscarECachear<number>('/api/a');
    ultimo().resolver(1);
    await p;
    expect(cache.tem('/api/a')).toBe(true);
    cache.invalidar('/api/a');
    expect(cache.tem('/api/a')).toBe(false);
  });

  it('resposta que chega depois de invalidar não volta para o cache', async () => {
    const p = cache.buscarECachear<number>('/api/a');
    cache.invalidar('/api/a'); // cadastro/edição enquanto a lista velha estava no ar
    ultimo().resolver(1);
    expect(await p).toBe(1);
    expect(cache.tem('/api/a')).toBe(false);
  });

  it('carregarComCache: sem cache espera a rede de todos os caminhos', async () => {
    const p = cache.carregarComCache<[number, string]>(['/api/a', '/api/b']);
    pendentes[0].resolver(1);
    pendentes[1].resolver('b');
    expect(await p).toEqual([1, 'b']);
  });

  it('carregarComCache: com tudo em cache devolve na hora e revalida por trás', async () => {
    const inicial = cache.carregarComCache<[number]>(['/api/a']);
    pendentes[0].resolver(1);
    await inicial;

    const p = cache.carregarComCache<[number]>(['/api/a']);
    expect(await p).toEqual([1]); // resolveu sem a rede responder
    expect(pendentes).toHaveLength(2); // revalidação disparada
    pendentes[1].resolver(2);
    await Promise.resolve();
    await Promise.resolve();
    expect(cache.ler('/api/a')).toBe(2);
  });

  it('carregarComCache: falha na revalidação por trás não vira erro não tratado', async () => {
    const inicial = cache.carregarComCache<[number]>(['/api/a']);
    pendentes[0].resolver(1);
    await inicial;
    await cache.carregarComCache<[number]>(['/api/a']);
    pendentes[1].rejeitar(new Error('offline'));
    await Promise.resolve();
    expect(cache.ler('/api/a')).toBe(1);
  });
});
