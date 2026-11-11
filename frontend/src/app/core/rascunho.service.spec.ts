import { TestBed } from '@angular/core/testing';
import { DadosRascunho } from '../shared/rascunho-pedido';
import { tokenDeTeste } from '../testing/ajuda';
import { AuthService, CHAVE_AUTH, CHAVE_RASCUNHOS } from './auth.service';
import { RASCUNHOS_MAX, RASCUNHO_VALIDADE_MS, RascunhoService } from './rascunho.service';

const DADOS: DadosRascunho = {
  cliente: { id: 3, nome: 'Maria', telefone: '31985565586' }, status: 'ABERTO', descricao: 'Retífica', entrega: '', observacao: '',
  descontoTipo: '', descontoValor: '', categorias: [], componentes: [], servicos: [], pecas: [],
};

describe('RascunhoService', () => {
  let servico: RascunhoService;
  let auth: AuthService;

  const entrar = (usuarioId: number, empresaId: number) => auth.gravar({ token: tokenDeTeste({ usuarioId, empresaId }) });
  const bruto = () => JSON.parse(localStorage.getItem(CHAVE_RASCUNHOS) || '{}');

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    servico = TestBed.inject(RascunhoService);
    auth = TestBed.inject(AuthService);
    entrar(7, 3);
  });

  afterEach(() => vi.useRealTimers());

  it('grava no formato do app atual: { "<usuarioId>|<empresaId>": { chave: { quando, titulo, dados } } }', () => {
    servico.gravar('novo', 'Maria · Retífica', DADOS);
    const todos = bruto();
    expect(Object.keys(todos)).toEqual(['7|3']);
    expect(Object.keys(todos['7|3'])).toEqual(['novo']);
    expect(Object.keys(todos['7|3'].novo).sort()).toEqual(['dados', 'quando', 'titulo']);
    expect(todos['7|3'].novo.titulo).toBe('Maria · Retífica');
    expect(todos['7|3'].novo.dados).toEqual(DADOS);
    expect(typeof todos['7|3'].novo.quando).toBe('number');
  });

  it('lê um rascunho gravado pelo app atual (objeto escrito no formato antigo)', () => {
    const quando = Date.now() - 60_000;
    localStorage.setItem(CHAVE_RASCUNHOS, JSON.stringify({
      '7|3': { 'pedido:12': { quando, titulo: 'Oficina Silva', dados: { ...DADOS, aba: 'itens' } } },
    }));
    const r = servico.ler('pedido:12');
    expect(r).toMatchObject({ chave: 'pedido:12', quando, titulo: 'Oficina Silva' });
    expect(r?.dados.aba).toBe('itens');
    expect(servico.listar().map(x => x.chave)).toEqual(['pedido:12']);
  });

  it('o que este grava o app atual lê: mesma estrutura depois de um ciclo de gravar e ler', () => {
    servico.gravar('novo', 'T', DADOS);
    const lido = JSON.parse(JSON.stringify(bruto()))['7|3'].novo;
    expect(lido.dados).toEqual(DADOS);
  });

  it('isola por usuário|empresa', () => {
    servico.gravar('novo', 'do 7|3', DADOS);
    entrar(8, 3);
    expect(servico.listar()).toEqual([]);
    servico.gravar('novo', 'do 8|3', DADOS);
    entrar(7, 4);
    expect(servico.listar()).toEqual([]);
    entrar(7, 3);
    expect(servico.listar().map(r => r.titulo)).toEqual(['do 7|3']);
    entrar(8, 3);
    expect(servico.listar().map(r => r.titulo)).toEqual(['do 8|3']);
  });

  it('sem sessão (anonimo) não grava nada', () => {
    auth.limpar();
    servico.gravar('novo', 'T', DADOS);
    expect(localStorage.getItem(CHAVE_RASCUNHOS)).toBeNull();
    expect(localStorage.getItem(CHAVE_AUTH)).toBeNull();
  });

  it('mantém só os 5 mais recentes', () => {
    vi.useFakeTimers();
    for (let i = 1; i <= RASCUNHOS_MAX + 2; i++) {
      vi.setSystemTime(new Date(2026, 10, 1, 10, i));
      servico.gravar('pedido:' + i, 'P' + i, DADOS);
    }
    expect(servico.listar().map(r => r.chave)).toEqual(['pedido:7', 'pedido:6', 'pedido:5', 'pedido:4', 'pedido:3']);
  });

  it('regravar a mesma chave atualiza em vez de duplicar e sobe para o topo', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 1, 10, 0));
    servico.gravar('novo', 'A', DADOS);
    vi.setSystemTime(new Date(2026, 10, 1, 10, 1));
    servico.gravar('pedido:5', 'B', DADOS);
    vi.setSystemTime(new Date(2026, 10, 1, 10, 2));
    servico.gravar('novo', 'A2', DADOS);
    expect(servico.listar().map(r => [r.chave, r.titulo])).toEqual([['novo', 'A2'], ['pedido:5', 'B']]);
  });

  it('rascunho com 14 dias ou mais some da lista; com menos de 14 dias continua', () => {
    const agora = Date.now();
    localStorage.setItem(CHAVE_RASCUNHOS, JSON.stringify({
      '7|3': {
        velho: { quando: agora - RASCUNHO_VALIDADE_MS - 1000, titulo: 'velho', dados: DADOS },
        quase: { quando: agora - RASCUNHO_VALIDADE_MS + 60_000, titulo: 'quase', dados: DADOS },
      },
    }));
    expect(servico.listar().map(r => r.chave)).toEqual(['quase']);
    expect(servico.ler('velho')).toBeNull();
  });

  it('entradas inválidas no localStorage não quebram', () => {
    localStorage.setItem(CHAVE_RASCUNHOS, '{nao é json');
    expect(servico.listar()).toEqual([]);
    servico.gravar('novo', 'T', DADOS); // recomeça do zero
    expect(servico.listar().length).toBe(1);
    localStorage.setItem(CHAVE_RASCUNHOS, JSON.stringify({ '7|3': { novo: null } }));
    expect(servico.listar()).toEqual([]);
  });

  it('remover tira só a chave pedida e ignora chave inexistente', () => {
    servico.gravar('novo', 'A', DADOS);
    servico.gravar('pedido:2', 'B', DADOS);
    servico.remover('naoexiste');
    servico.remover('novo');
    expect(servico.listar().map(r => r.chave)).toEqual(['pedido:2']);
  });

  it('retomar: a marca vale uma vez e só para a chave marcada', () => {
    servico.marcarParaRetomar('novo');
    expect(servico.consumirRetomada('pedido:3')).toBe(false);
    expect(servico.consumirRetomada('novo')).toBe(false); // a marca foi zerada, como no app atual
    servico.marcarParaRetomar('novo');
    expect(servico.consumirRetomada('novo')).toBe(true);
    expect(servico.consumirRetomada('novo')).toBe(false);
  });
});
