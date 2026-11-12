import { DadosRascunho } from './rascunho-pedido';
import {
  CatalogoDitado, Entendimento, RefEntendida, dataBr, escolherOpcao, mesmoItem, moeda, montarRespostas, paraRascunho, primeiraAba,
  reconhecimentoDisponivel, rotuloCategoria, semAcento,
} from './ditado-regra';

// Porta dos 15 testes de backend/src/test/js/ditado.test.js (mesmos casos e expectativas), mais casos de borda.

const CATALOGO: CatalogoDitado = {
  clientes: [{ id: 1, nome: 'João da Silva', telefone: '(31) 98888-7777' }, { id: 2, nome: 'João Pereira', telefone: null }],
  cabecotes: [{ id: 10, nome: 'AP 1.8', categoria: 'CABECOTE' }, { id: 11, nome: 'Fire 1.0', categoria: 'BLOCO' }],
};

function formularioVazio(): DadosRascunho {
  return {
    cliente: null, status: 'ABERTO', descricao: '', entrega: '', observacao: '', descontoTipo: '', descontoValor: '',
    categorias: [], componentes: [], servicos: [], pecas: [],
  };
}

const ok = (id: number, nome: string, extra?: Partial<RefEntendida>): RefEntendida =>
  ({ estado: 'OK', id, nome, categoria: null, opcoes: [], ouvido: null, ...extra });
const sem = (): RefEntendida => ({ estado: 'AUSENTE', id: null, nome: null, categoria: null, opcoes: [], ouvido: null });

function entendimento(extra?: Entendimento): Entendimento {
  return {
    cliente: sem(), componentes: [], servicos: [], pecas: [], valores: [], entregaData: null, entregaOuvido: null,
    status: null, descricao: null, observacao: null, descontoTipo: null, descontoValor: null, ...extra,
  };
}

describe('regra do ditado (ditado.js)', () => {
  it('preenche um pedido completo a partir do ditado', () => {
    const e = entendimento({
      cliente: ok(1, 'João da Silva'),
      componentes: [ok(10, 'AP 1.8', { categoria: 'CABECOTE' })],
      servicos: [{ estado: 'OK', id: 20, nome: 'Plainar cabeçote', categoria: 'CABECOTE', quantidade: null, opcoes: [] },
        { estado: 'LIVRE', id: null, nome: 'trocar guias', categoria: 'CABECOTE', quantidade: null, opcoes: [] }],
      pecas: [{ estado: 'OK', id: 30, nome: 'Válvula', categoria: 'CABECOTE', quantidade: 4, opcoes: [] }],
      valores: [{ categoria: 'CABECOTE', valorServicos: 150, valorPecas: 40 }],
      entregaData: '2026-10-23', descricao: 'Retífica completa', status: 'PRONTO', descontoTipo: 'PERCENTUAL', descontoValor: 10,
    });
    const { dados, pendencias, conflitos } = paraRascunho(e, formularioVazio(), CATALOGO);
    expect(dados.cliente).toEqual({ id: 1, nome: 'João da Silva', telefone: '(31) 98888-7777' });
    expect(dados.componentes).toEqual([{ id: 10, nome: 'AP 1.8' }]);
    expect(dados.servicos).toEqual([{ descricao: 'Plainar cabeçote', categoria: 'CABECOTE' },
      { descricao: 'trocar guias', categoria: 'CABECOTE' }]);
    expect(dados.pecas).toEqual([{ descricao: 'Válvula', categoria: 'CABECOTE', quantidade: 4 }]);
    expect(dados.categorias).toEqual([['CABECOTE', { valorServicos: 150, valorPecas: 40 }]]);
    expect(dados.entrega).toBe('2026-10-23');
    expect(dados.descricao).toBe('Retífica completa');
    expect(dados.status).toBe('PRONTO');
    expect(dados.descontoTipo).toBe('PERCENTUAL');
    expect(dados.descontoValor).toBe('10');
    expect(pendencias).toEqual([]);
    expect(conflitos).toEqual([]);
  });

  it('o que não foi dito vira pendência, com a aba onde resolver', () => {
    const { pendencias } = paraRascunho(entendimento(), formularioVazio(), CATALOGO);
    expect(pendencias.map(p => p.campo)).toEqual(['cliente', 'componentes', 'itens', 'entrega']);
    expect(pendencias.map(p => p.aba)).toEqual(['cliente', 'componentes', 'itens', 'pedido']);
  });

  it('cliente não encontrado vira pendência com ação de cadastrar e o nome ouvido', () => {
    const e = entendimento({ cliente: { estado: 'NAO_ENCONTRADO', id: null, nome: null, opcoes: [], ouvido: 'Carlos Novo' } });
    const { dados, pendencias } = paraRascunho(e, formularioVazio(), CATALOGO);
    expect(dados.cliente).toBeNull();
    const p = pendencias.find(x => x.campo === 'cliente')!;
    expect(p.acao).toBe('cadastrarCliente');
    expect(p.nome).toBe('Carlos Novo');
  });

  it('dúvida de cliente lista os nomes parecidos, e escolher uma opção resolve', () => {
    const duvida: RefEntendida = { estado: 'DUVIDA', id: null, nome: null, opcoes: [{ id: 1, nome: 'João da Silva' }, { id: 2, nome: 'João Pereira' }], ouvido: 'joão' };
    const { pendencias } = paraRascunho(entendimento({ cliente: duvida }), formularioVazio(), CATALOGO);
    expect(pendencias[0].texto).toMatch(/João da Silva, João Pereira/);

    const resolvido = escolherOpcao(duvida, 2);
    expect(resolvido.estado).toBe('OK');
    expect(resolvido.nome).toBe('João Pereira');
    const { dados } = paraRascunho(entendimento({ cliente: resolvido }), formularioVazio(), CATALOGO);
    expect(dados.cliente!.id).toBe(2);
    expect(escolherOpcao(duvida, 999)).toBe(duvida); // opção inexistente não muda nada
  });

  it('NUNCA troca o que já estava preenchido: vira conflito', () => {
    const atual = formularioVazio();
    atual.cliente = { id: 2, nome: 'João Pereira', telefone: null };
    atual.entrega = '2026-11-01';
    atual.descricao = 'Meu título';
    atual.observacao = 'Minha observação';
    atual.categorias = [['CABECOTE', { valorServicos: 100, valorPecas: 0 }]];
    atual.pecas = [{ descricao: 'Válvula', categoria: 'CABECOTE', quantidade: 2 }];
    atual.descontoTipo = 'VALOR';
    atual.descontoValor = '5';
    atual.status = 'EM_ANDAMENTO';
    const e = entendimento({
      cliente: ok(1, 'João da Silva'),
      pecas: [{ estado: 'OK', id: 30, nome: 'Valvula', categoria: 'CABECOTE', quantidade: 4, opcoes: [] }],
      valores: [{ categoria: 'CABECOTE', valorServicos: 150, valorPecas: 0 }],
      entregaData: '2026-10-23', descricao: 'Outro título', observacao: 'Outra', status: 'PRONTO',
      descontoTipo: 'PERCENTUAL', descontoValor: 10,
    });
    const { dados, conflitos } = paraRascunho(e, atual, CATALOGO);
    expect(dados.cliente!.id).toBe(2);
    expect(dados.entrega).toBe('2026-11-01');
    expect(dados.descricao).toBe('Meu título');
    expect(dados.observacao).toBe('Minha observação');
    expect(dados.categorias[0][1].valorServicos).toBe(100);
    expect(dados.pecas[0].quantidade).toBe(2);
    expect(dados.descontoTipo).toBe('VALOR');
    expect(dados.status).toBe('EM_ANDAMENTO');
    expect(conflitos.map(c => c.campo).sort()).toEqual(['cliente', 'desconto', 'descricao', 'entrega', 'itens', 'observacao', 'status', 'valores']);
  });

  it('o que já estava igual não vira conflito nem duplica', () => {
    const atual = formularioVazio();
    atual.cliente = { id: 1, nome: 'João da Silva', telefone: null };
    atual.entrega = '2026-10-23';
    atual.servicos = [{ descricao: 'Plainar cabeçote', categoria: 'CABECOTE' }];
    atual.componentes = [{ id: 10, nome: 'AP 1.8' }];
    atual.categorias = [['CABECOTE', { valorServicos: 150, valorPecas: 0 }]];
    const e = entendimento({
      cliente: ok(1, 'João da Silva'), componentes: [ok(10, 'AP 1.8', { categoria: 'CABECOTE' })],
      servicos: [{ estado: 'OK', id: 20, nome: 'PLAINAR CABECOTE', categoria: 'CABECOTE', quantidade: null, opcoes: [] }],
      valores: [{ categoria: 'CABECOTE', valorServicos: 150, valorPecas: 0 }], entregaData: '2026-10-23',
    });
    const { dados, conflitos } = paraRascunho(e, atual, CATALOGO);
    expect(conflitos).toEqual([]);
    expect(dados.servicos.length).toBe(1); // mesmo nome sem acento e sem diferença de maiúsculas não duplica
    expect(dados.componentes.length).toBe(1);
  });

  it('acrescenta aos itens que já existiam e marca a categoria dos componentes', () => {
    const atual = formularioVazio();
    atual.servicos = [{ descricao: 'Brunir', categoria: 'BLOCO' }];
    atual.categorias = [['BLOCO', { valorServicos: 80, valorPecas: 0 }]];
    const e = entendimento({ componentes: [ok(10, 'AP 1.8', { categoria: 'CABECOTE' })], servicos: [{ estado: 'LIVRE', nome: 'Plainar', categoria: null, opcoes: [] }] });
    const { dados } = paraRascunho(e, atual, CATALOGO);
    expect(dados.servicos.length).toBe(2);
    expect(dados.categorias.map(p => p[0])).toEqual(['BLOCO', 'CABECOTE']);
  });

  it('categoria sem valor vira pendência de valor', () => {
    const e = entendimento({ componentes: [ok(10, 'AP 1.8', { categoria: 'CABECOTE' })] });
    const { pendencias } = paraRascunho(e, formularioVazio(), CATALOGO);
    expect(pendencias.some(p => p.campo === 'valores' && /Cabeçote/.test(p.texto))).toBe(true);
  });

  it('não modifica o objeto recebido', () => {
    const atual = formularioVazio();
    const antes = JSON.stringify(atual);
    paraRascunho(entendimento({ cliente: ok(1, 'João da Silva'), servicos: [{ estado: 'LIVRE', nome: 'x', opcoes: [] }] }), atual, CATALOGO);
    expect(JSON.stringify(atual)).toBe(antes);
  });

  it('entendimento ausente ou parcial não quebra', () => {
    expect(() => paraRascunho(null, null, null)).not.toThrow();
    expect(() => paraRascunho({}, {}, {})).not.toThrow();
  });

  it('montarRespostas junta índice (botão) e texto (voz/digitado), ignorando o que não foi respondido', () => {
    const perguntas = [{ id: 'r1p1' }, { id: 'r1p2' }, { id: 'r1p3' }, { id: 'r1p4' }];
    const r = montarRespostas(perguntas, { r1p1: 1, r1p2: '  sexta que vem  ', r1p3: '   ' });
    expect(r).toEqual([{ perguntaId: 'r1p1', opcaoIndice: 1 }, { perguntaId: 'r1p2', texto: 'sexta que vem' }]);
    expect(montarRespostas(perguntas, { r1p1: 'x'.repeat(500) })[0].texto!.length).toBe(300);
    expect(montarRespostas(null, null)).toEqual([]);
  });

  it('primeiraAba escolhe a primeira etapa do formulário com pendência', () => {
    const ordem = ['cliente', 'pedido', 'componentes', 'itens'];
    expect(primeiraAba([{ aba: 'itens' }], [{ aba: 'pedido' }], ordem)).toBe('pedido');
    expect(primeiraAba([], [], ordem)).toBeNull();
  });

  it('reconhecimentoDisponivel acha a API com ou sem prefixo e devolve null sem ela', () => {
    const A = function () { /* construtor falso */ } as unknown as new () => unknown;
    const B = function () { /* construtor falso */ } as unknown as new () => unknown;
    expect(reconhecimentoDisponivel({ SpeechRecognition: A, webkitSpeechRecognition: B })).toBe(A);
    expect(reconhecimentoDisponivel({ webkitSpeechRecognition: B })).toBe(B);
    expect(reconhecimentoDisponivel({})).toBeNull();
    expect(reconhecimentoDisponivel(null)).toBeNull();
  });

  it('mesmoItem ignora acento e maiúsculas, e item antigo sem categoria casa com qualquer uma', () => {
    expect(mesmoItem({ descricao: 'Válvula', categoria: 'BLOCO' }, 'valvula', 'BLOCO')).toBe(true);
    expect(mesmoItem({ descricao: 'Válvula', categoria: null }, 'VALVULA', 'CABECOTE')).toBe(true);
    expect(mesmoItem({ descricao: 'Válvula', categoria: 'BLOCO' }, 'valvula', 'CABECOTE')).toBe(false);
    expect(mesmoItem({ descricao: 'Junta', categoria: null }, 'valvula', null)).toBe(false);
  });

  it('formatadores', () => {
    expect(dataBr('2026-10-23')).toBe('23/10/2026');
    expect(moeda(150)).toMatch(/150,00/);
    expect(rotuloCategoria('CABECOTE')).toBe('Cabeçote');
  });

  // ---- casos de borda além dos 15 originais ----

  describe('bordas', () => {
    it('dataBr devolve o texto como veio quando não é uma data ISO, e vazio para nulo', () => {
      expect(dataBr('amanhã')).toBe('amanhã');
      expect(dataBr(null)).toBe('');
      expect(dataBr(undefined)).toBe('');
    });

    it('rotuloCategoria devolve o próprio código se desconhecido e vazio sem categoria', () => {
      expect(rotuloCategoria('XYZ')).toBe('XYZ');
      expect(rotuloCategoria(null)).toBe('');
      expect(rotuloCategoria('OUTRO')).toBe('Outro');
    });

    it('semAcento tira acento, maiúsculas e espaços das pontas', () => {
      expect(semAcento('  Cabeçote  ')).toBe('cabecote');
      expect(semAcento(null)).toBe('');
    });

    it('moeda trata nulo como zero', () => {
      expect(moeda(null)).toMatch(/0,00/);
    });

    it('cliente já preenchido igual ao dito não vira conflito; o telefone vem do catálogo só se o formulário estava vazio', () => {
      const atual = formularioVazio();
      atual.cliente = { id: 1, nome: 'João da Silva', telefone: null };
      const { dados, conflitos } = paraRascunho(entendimento({ cliente: ok(1, 'João da Silva') }), atual, CATALOGO);
      expect(conflitos.filter(c => c.campo === 'cliente')).toEqual([]);
      expect(dados.cliente!.telefone).toBeNull();
    });

    it('cliente dito fora do catálogo do formulário fica com telefone nulo', () => {
      const { dados } = paraRascunho(entendimento({ cliente: ok(99, 'Fulano') }), formularioVazio(), CATALOGO);
      expect(dados.cliente).toEqual({ id: 99, nome: 'Fulano', telefone: null });
    });

    it('modelo em dúvida ou não encontrado vira pendência e não conta como "falta o modelo"', () => {
      const duvida: RefEntendida = { estado: 'DUVIDA', opcoes: [{ id: 10, nome: 'AP 1.8' }, { id: 12, nome: 'AP 2.0' }] };
      const naoAchou: RefEntendida = { estado: 'NAO_ENCONTRADO', ouvido: 'xyz' };
      const a = paraRascunho(entendimento({ componentes: [duvida] }), formularioVazio(), CATALOGO).pendencias.filter(p => p.campo === 'componentes');
      expect(a.map(p => p.texto)).toEqual(['Qual modelo? Parecidos: AP 1.8, AP 2.0.']);
      const b = paraRascunho(entendimento({ componentes: [naoAchou] }), formularioVazio(), CATALOGO).pendencias.filter(p => p.campo === 'componentes');
      expect(b.map(p => p.texto)).toEqual(['Modelo "xyz" não está no catálogo.']);
    });

    it('a categoria do catálogo do formulário vence a que a IA devolveu para o modelo', () => {
      const e = entendimento({ componentes: [ok(11, 'Fire 1.0', { categoria: 'CABECOTE' })] });
      const { dados } = paraRascunho(e, formularioVazio(), CATALOGO);
      expect(dados.categorias.map(p => p[0])).toEqual(['BLOCO']);
    });

    it('serviço ou peça em dúvida vira pendência com os nomes parecidos e não entra nos dados', () => {
      const duvida: RefEntendida = { estado: 'DUVIDA', opcoes: [{ id: 1, nome: 'Plainar cabeçote' }, { id: 2, nome: 'Plainar bloco' }] };
      const { dados, pendencias } = paraRascunho(entendimento({ servicos: [duvida], pecas: [duvida] }), formularioVazio(), CATALOGO);
      expect(dados.servicos).toEqual([]);
      expect(dados.pecas).toEqual([]);
      expect(pendencias.filter(p => p.campo === 'itens').map(p => p.texto))
        .toEqual(['Qual serviço? Parecidos: Plainar cabeçote, Plainar bloco.', 'Qual peça? Parecidos: Plainar cabeçote, Plainar bloco.']);
    });

    it('peça sem quantidade entra com 1; quantidade igual à do formulário não é conflito', () => {
      const atual = formularioVazio();
      atual.pecas = [{ descricao: 'Junta', categoria: null, quantidade: 3 }];
      const e = entendimento({ pecas: [
        { estado: 'LIVRE', nome: 'Retentor', categoria: null, quantidade: null },
        { estado: 'OK', id: 5, nome: 'Junta', categoria: null, quantidade: 3 },
      ] });
      const { dados, conflitos } = paraRascunho(e, atual, CATALOGO);
      expect(dados.pecas).toEqual([{ descricao: 'Junta', categoria: null, quantidade: 3 }, { descricao: 'Retentor', categoria: null, quantidade: 1 }]);
      expect(conflitos).toEqual([]);
    });

    it('item sem nome é ignorado', () => {
      const { dados } = paraRascunho(entendimento({ servicos: [{ estado: 'LIVRE', nome: '' }] }), formularioVazio(), CATALOGO);
      expect(dados.servicos).toEqual([]);
    });

    it('valor igual ao do formulário não é conflito; valor zero ou negativo é ignorado', () => {
      const atual = formularioVazio();
      atual.categorias = [['CABECOTE', { valorServicos: 150, valorPecas: 0 }]];
      const e = entendimento({ valores: [{ categoria: 'CABECOTE', valorServicos: 150, valorPecas: -5 }, { categoria: 'BLOCO', valorServicos: 0, valorPecas: 0 }] });
      const { dados, conflitos, pendencias } = paraRascunho(e, atual, CATALOGO);
      expect(conflitos).toEqual([]);
      expect(dados.categorias).toEqual([['CABECOTE', { valorServicos: 150, valorPecas: 0 }], ['BLOCO', { valorServicos: 0, valorPecas: 0 }]]);
      expect(pendencias.some(p => p.campo === 'valores' && /Bloco/.test(p.texto))).toBe(true);
    });

    it('situação do ditado vale quando o formulário está em Aberto, e conflita quando já foi mudada', () => {
      expect(paraRascunho(entendimento({ status: 'PRONTO' }), formularioVazio(), CATALOGO).dados.status).toBe('PRONTO');
      const atual = formularioVazio();
      atual.status = 'PRONTO';
      expect(paraRascunho(entendimento({ status: 'PRONTO' }), atual, CATALOGO).conflitos).toEqual([]);
    });

    it('desconto igual ao do formulário não é conflito; desconto sem valor positivo é ignorado', () => {
      const atual = formularioVazio();
      atual.descontoTipo = 'PERCENTUAL';
      atual.descontoValor = '10';
      expect(paraRascunho(entendimento({ descontoTipo: 'PERCENTUAL', descontoValor: 10 }), atual, CATALOGO).conflitos).toEqual([]);
      const r = paraRascunho(entendimento({ descontoTipo: 'VALOR', descontoValor: 0 }), formularioVazio(), CATALOGO);
      expect(r.dados.descontoTipo).toBe('');
    });

    it('descrição e observação iguais às do formulário não são conflito', () => {
      const atual = formularioVazio();
      atual.descricao = 'Retífica';
      expect(paraRascunho(entendimento({ descricao: 'Retífica' }), atual, CATALOGO).conflitos).toEqual([]);
    });

    it('cliente não encontrado com formulário que já tem cliente não vira pendência', () => {
      const atual = formularioVazio();
      atual.cliente = { id: 2, nome: 'João Pereira', telefone: null };
      const e = entendimento({ cliente: { estado: 'NAO_ENCONTRADO', ouvido: 'Carlos' } });
      expect(paraRascunho(e, atual, CATALOGO).pendencias.some(p => p.campo === 'cliente')).toBe(false);
    });

    it('primeiraAba considera conflitos e respeita a ordem do formulário, ignorando abas desconhecidas', () => {
      expect(primeiraAba([], [{ aba: 'itens' }], ['cliente', 'itens'])).toBe('itens');
      expect(primeiraAba([{ aba: 'outra' }], [], ['cliente', 'itens'])).toBeNull();
      expect(primeiraAba(null, null, null)).toBeNull();
    });

    it('montarRespostas: índice zero conta como resposta; texto vazio e valores nulos não', () => {
      expect(montarRespostas([{ id: 'a' }], { a: 0 })).toEqual([{ perguntaId: 'a', opcaoIndice: 0 }]);
    });
  });
});
