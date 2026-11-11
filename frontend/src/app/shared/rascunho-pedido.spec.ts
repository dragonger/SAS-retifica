import {
  PartesDoFormulario, chaveDoRascunho, dadosDoRascunho, fotografiaDoRascunho, haQuanto, partesDoRascunho, rotaDoRascunho, tituloDoRascunho,
} from './rascunho-pedido';

const PARTES: PartesDoFormulario = {
  cliente: { id: 3, nome: 'Maria', telefone: '31985565586' }, status: 'ABERTO', descricao: 'Retífica', entrega: '2026-12-01', observacao: 'x',
  descontoTipo: 'VALOR', descontoValor: '10', categorias: [['CABECOTE', { valorServicos: 100, valorPecas: 50 }]],
  componentes: [{ id: 5, nome: 'Fiat Uno' }], servicos: [{ descricao: 'Plainar', categoria: 'CABECOTE' }],
  pecas: [{ descricao: 'Junta', categoria: 'CABECOTE', quantidade: 2 }],
};

describe('rascunho do pedido (funções puras)', () => {
  it('dadosDoRascunho tem as chaves do app atual, na mesma ordem, e a etapa só quando pedida', () => {
    expect(Object.keys(dadosDoRascunho(PARTES))).toEqual([
      'cliente', 'status', 'descricao', 'entrega', 'observacao', 'descontoTipo', 'descontoValor',
      'categorias', 'componentes', 'servicos', 'pecas',
    ]);
    expect(Object.keys(dadosDoRascunho(PARTES, 'itens')).at(-1)).toBe('aba');
    expect(dadosDoRascunho(PARTES, 'itens').aba).toBe('itens');
  });

  it('a fotografia ignora a etapa e muda quando qualquer campo muda', () => {
    const base = fotografiaDoRascunho(PARTES);
    expect(base).toBe(JSON.stringify(dadosDoRascunho(PARTES)));
    expect(fotografiaDoRascunho({ ...PARTES })).toBe(base);
    expect(fotografiaDoRascunho({ ...PARTES, descricao: 'Outra' })).not.toBe(base);
    expect(fotografiaDoRascunho({ ...PARTES, pecas: [] })).not.toBe(base);
    expect(fotografiaDoRascunho({ ...PARTES, categorias: [['CABECOTE', { valorServicos: 101, valorPecas: 50 }]] })).not.toBe(base);
  });

  it('título: cliente e descrição; sem cliente "Sem cliente"', () => {
    expect(tituloDoRascunho(PARTES.cliente, ' Retífica ')).toBe('Maria · Retífica');
    expect(tituloDoRascunho(PARTES.cliente, '  ')).toBe('Maria');
    expect(tituloDoRascunho(null, '')).toBe('Sem cliente');
  });

  it('partesDoRascunho lê um rascunho incompleto ou antigo sem quebrar', () => {
    const p = partesDoRascunho({}, 'PRONTO');
    expect(p).toEqual({
      cliente: null, status: 'PRONTO', descricao: '', entrega: '', observacao: '', descontoTipo: '', descontoValor: '',
      categorias: [], componentes: [], servicos: [], pecas: [],
    });
    const q = partesDoRascunho({ ...PARTES, categorias: [['BLOCO', null as never], ['BIELA', { valorServicos: 5 } as never]] }, 'ABERTO');
    expect(q.categorias).toEqual([['BLOCO', { valorServicos: 0, valorPecas: 0 }], ['BIELA', { valorServicos: 5, valorPecas: 0 }]]);
    expect(q.status).toBe('ABERTO');
  });

  it('chave e rota: "novo" ou "pedido:<id>"', () => {
    expect(chaveDoRascunho(null)).toBe('novo');
    expect(chaveDoRascunho('12')).toBe('pedido:12');
    expect(rotaDoRascunho('novo')).toBe('/pedidos/novo');
    expect(rotaDoRascunho('pedido:12')).toBe('/pedidos/12/editar');
  });

  it('haQuanto: agora, minutos, horas, dias', () => {
    const agora = 1_000_000_000_000;
    const min = 60_000;
    expect(haQuanto(agora - 20_000, agora)).toBe('agora há pouco');
    expect(haQuanto(agora - 5 * min, agora)).toBe('há 5 min');
    expect(haQuanto(agora - 59 * min, agora)).toBe('há 59 min');
    expect(haQuanto(agora - 3 * 60 * min, agora)).toBe('há 3 h');
    expect(haQuanto(agora - 24 * 60 * min, agora)).toBe('há 1 dia');
    expect(haQuanto(agora - 3 * 24 * 60 * min, agora)).toBe('há 3 dias');
    expect(haQuanto(agora + 5 * min, agora)).toBe('agora há pouco'); // relógio adiantado
  });
});
