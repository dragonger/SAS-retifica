import { TestBed } from '@angular/core/testing';
import { ApiService } from '../../core/api.service';
import { AuthService, CHAVE_RASCUNHOS } from '../../core/auth.service';
import { GuardaSaidaService } from '../../core/guarda-saida.service';
import { RASCUNHOS_MAX, RASCUNHO_VALIDADE_MS, RascunhoService } from '../../core/rascunho.service';
import { digitar, esperar } from '../../testing/ajuda';
import { Formulario, abaVisivel, botao, esperarRascunho, montarFormulario, painel, textoDe } from '../../testing/pedido-form';

/** Rascunho do pedido gravado pelo app atual (static/app.js), no formato exato dele. */
const DADOS_ANTIGOS = {
  cliente: { id: 3, nome: 'Maria Souza', telefone: '31985565586' },
  status: 'ABERTO',
  descricao: 'Retífica',
  entrega: '2026-12-01',
  observacao: 'Obs',
  descontoTipo: 'VALOR',
  descontoValor: '30',
  categorias: [['CABECOTE', { valorServicos: 500, valorPecas: 100 }]],
  componentes: [{ id: 1, nome: 'Fiat Uno' }],
  servicos: [{ descricao: 'Plainar', categoria: 'CABECOTE' }],
  pecas: [{ descricao: 'Junta', categoria: 'CABECOTE', quantidade: 2 }],
  aba: 'itens',
};

const MIN = 60_000;

/** Grava um rascunho como o app atual faz: { "<dono>": { "<chave>": { quando, titulo, dados } } }. */
function gravarAntigo(chave: string, opcoes: { dono?: string; quando?: number; titulo?: string; dados?: object } = {}): void {
  const todos = JSON.parse(localStorage.getItem(CHAVE_RASCUNHOS) || '{}');
  const dono = opcoes.dono ?? '7|3';
  todos[dono] = {
    ...(todos[dono] || {}),
    [chave]: { quando: opcoes.quando ?? Date.now() - 5 * MIN, titulo: opcoes.titulo ?? 'Maria Souza · Retífica', dados: opcoes.dados ?? DADOS_ANTIGOS },
  };
  localStorage.setItem(CHAVE_RASCUNHOS, JSON.stringify(todos));
}

const guardado = () => JSON.parse(localStorage.getItem(CHAVE_RASCUNHOS) || '{}');
const meus = () => guardado()['7|3'] ?? {};

describe('PedidoForm: rascunhos', () => {
  let f: Formulario;

  const clicar = async (el: Element) => { (el as HTMLElement).click(); await esperar(f.fixture); };
  const digitando = async (campo: HTMLInputElement | HTMLSelectElement, valor: string) => { digitar(campo, valor); await esperar(f.fixture); };
  const escolherCliente = async (nome: string) =>
    clicar([...f.html.querySelectorAll('.lista-escolha button')].find(b => b.textContent!.includes(nome))!);
  const descricao = () => painel(f.html, 'pedido').querySelector('input') as HTMLInputElement;
  const mensagem = () => f.dialogo.dialogos().at(-1)!;
  const barra = () => [...f.html.querySelectorAll('.barra-total-form span')].map(e => e.textContent).join(' ');

  afterEach(() => { f.http.verify(); vi.unstubAllGlobals(); });

  describe('guardar enquanto digita', () => {
    beforeEach(async () => { f = await montarFormulario(); });

    it('guarda 400 ms depois da alteração, na chave "novo", com título, quando e dados no formato do app atual', async () => {
      await escolherCliente('Maria');
      await clicar(botao(f.html, 'Avançar'));
      await digitando(descricao(), 'Retífica');
      expect(meus().novo).toBeUndefined(); // ainda não passou o atraso
      await esperarRascunho(f.fixture);
      const r = meus().novo;
      expect(r.titulo).toBe('Maria Souza · Retífica');
      expect(Math.abs(Date.now() - r.quando)).toBeLessThan(5000);
      expect(r.dados).toEqual({
        cliente: { id: 3, nome: 'Maria Souza', telefone: '31985565586' }, status: 'ABERTO', descricao: 'Retífica', entrega: '', observacao: '',
        descontoTipo: '', descontoValor: '', categorias: [], componentes: [], servicos: [], pecas: [], aba: 'pedido',
      });
      expect(Object.keys(r.dados)).toEqual([
        'cliente', 'status', 'descricao', 'entrega', 'observacao', 'descontoTipo', 'descontoValor',
        'categorias', 'componentes', 'servicos', 'pecas', 'aba',
      ]);
    });

    it('um rascunho gravado aqui tem a mesma forma de um gravado pelo app atual', async () => {
      await escolherCliente('Maria');
      await esperarRascunho(f.fixture);
      const aqui = meus().novo;
      gravarAntigo('pedido:1');
      const antigo = meus()['pedido:1'];
      expect(Object.keys(aqui).sort()).toEqual(Object.keys(antigo).sort());
      expect(Object.keys(aqui.dados)).toEqual(Object.keys(antigo.dados));
    });

    it('várias alterações seguidas viram uma gravação só (o atraso recomeça a cada alteração)', async () => {
      await escolherCliente('Maria');
      const gravar = vi.spyOn(Storage.prototype, 'setItem');
      await clicar(botao(f.html, 'Avançar'));
      for (const texto of ['R', 'Re', 'Ret']) await digitando(descricao(), texto);
      await esperarRascunho(f.fixture);
      const gravacoes = gravar.mock.calls.filter(c => c[0] === CHAVE_RASCUNHOS);
      expect(gravacoes.length).toBe(1);
      expect(meus().novo.dados.descricao).toBe('Ret');
    });

    it('formulário igual ao de quando abriu não deixa rascunho', async () => {
      await clicar(botao(f.html, 'Voltar').hidden ? f.html.querySelector('.lista-escolha button')! : botao(f.html, 'Voltar'));
      await esperarRascunho(f.fixture);
      expect(meus().novo).toBeDefined(); // escolher um cliente já é alteração
      await clicar(botao(f.html, 'Trocar'));
      await esperarRascunho(f.fixture);
      expect(meus().novo).toBeUndefined(); // voltou ao que era: a "fotografia" é igual e o rascunho é removido
    });

    it('só mexer de etapa (sem alterar nada) não cria rascunho', async () => {
      await escolherCliente('Maria');
      await clicar(botao(f.html, 'Trocar'));
      await esperarRascunho(f.fixture);
      expect(meus().novo).toBeUndefined();
    });

    it('trocar de etapa depois de alterar atualiza a etapa guardada, sem contar como alteração', async () => {
      await escolherCliente('Maria');
      await clicar(botao(f.html, 'Avançar'));
      await esperarRascunho(f.fixture);
      expect(meus().novo.dados.aba).toBe('pedido');
      await clicar(botao(f.html, 'Avançar'));
      await esperarRascunho(f.fixture);
      expect(meus().novo.dados.aba).toBe('componentes');
    });

    it('sem sessão não guarda nada', async () => {
      await f.fixture.destroy();
      TestBed.resetTestingModule();
      f = await montarFormulario({ sessao: false });
      await escolherCliente('Maria');
      await esperarRascunho(f.fixture);
      expect(localStorage.getItem(CHAVE_RASCUNHOS)).toBeNull();
    });

    it('cadastro rápido de cliente também conta como alteração', async () => {
      await clicar(botao(f.html, 'Novo cliente'));
      await digitando(f.html.querySelector<HTMLInputElement>('.caixa-form input')!, 'Oficina Nova');
      await clicar(botao(f.html, 'Salvar cliente'));
      f.http.expectOne('/api/clientes').flush({ id: 9, nome: 'Oficina Nova', telefone: null });
      await esperarRascunho(f.fixture);
      expect(meus().novo.dados.cliente).toEqual({ id: 9, nome: 'Oficina Nova', telefone: null });
      expect(meus().novo.titulo).toBe('Oficina Nova');
    });

    it('mantém no máximo 5 rascunhos: guardar o sexto apaga o mais antigo', async () => {
      for (let i = 1; i <= RASCUNHOS_MAX; i++) gravarAntigo('pedido:' + i, { quando: Date.now() - (60 - i) * MIN });
      await escolherCliente('Maria');
      await esperarRascunho(f.fixture);
      expect(Object.keys(meus()).sort()).toEqual(['novo', 'pedido:2', 'pedido:3', 'pedido:4', 'pedido:5']);
    });
  });

  describe('retomar o rascunho ao abrir', () => {
    it('pedido novo: pergunta com o texto do app atual e as duas opções', async () => {
      f = await montarFormulario({ antes: () => gravarAntigo('novo') });
      const d = mensagem();
      expect(d.mensagem).toBe('Você tem um pedido incompleto, guardado há 5 min neste aparelho (Maria Souza · Retífica).');
      expect(d.opcoes.map(o => [o.rotulo, o.valor, o.estilo])).toEqual([
        ['Continuar pedido incompleto', 'continuar', 'btn-primary'],
        ['Começar um novo (descarta o rascunho)', 'descartar', 'btn-danger'],
      ]);
    });

    it('sem título no rascunho, o texto não leva parênteses', async () => {
      f = await montarFormulario({ antes: () => gravarAntigo('novo', { titulo: '', quando: Date.now() - 3 * 60 * MIN }) });
      expect(mensagem().mensagem).toBe('Você tem um pedido incompleto, guardado há 3 h neste aparelho.');
    });

    it('Continuar aplica o rascunho do app atual: cliente, campos, categorias, itens, desconto e etapa', async () => {
      f = await montarFormulario({ antes: () => gravarAntigo('novo') });
      mensagem().responder('continuar');
      await esperar(f.fixture);
      expect(f.dialogo.dialogos().length).toBe(0); // o aviso fechou
      expect(abaVisivel(f.html)).toEqual(['itens']);
      expect(textoDe(f.html.querySelector('.cliente-selecionado'))).toContain('Maria Souza');
      expect(descricao().value).toBe('Retífica');
      expect(painel(f.html, 'pedido').querySelectorAll('input')[1].value).toBe('2026-12-01');
      expect(painel(f.html, 'pedido').querySelector('textarea')!.value).toBe('Obs');
      expect(barra()).toContain('Subtotal R$ 600,00');
      expect(barra()).toContain('- R$ 30,00');
      expect(barra()).toContain('Total R$ 570,00');
      expect(textoDe(painel(f.html, 'componentes'))).toContain('Fiat Uno');
      expect(f.html.querySelector('button.chip[data-categoria=CABECOTE]')!.classList.contains('active')).toBe(true);
      const valores = painel(f.html, 'componentes').querySelectorAll<HTMLInputElement>('input[type=number]');
      expect([valores[0].value, valores[1].value]).toEqual(['500', '100']);
      expect([...painel(f.html, 'itens').querySelectorAll('app-seletor-itens')].map(s => [...s.querySelectorAll('.item-linha')]
        .filter(l => !l.closest('label')).map(l => textoDe(l.querySelector('span'))))).toEqual([['Plainar'], ['Junta ×2']]);
    });

    it('depois de continuar o formulário conta como alterado (guarda de saída) e o rascunho segue guardado', async () => {
      f = await montarFormulario({ antes: () => gravarAntigo('novo') });
      mensagem().responder('continuar');
      await esperar(f.fixture);
      const guarda = f.componente.guardaSaida()!;
      expect(guarda.tipo).toBe('pedido');
      expect(guarda.sujo()).toBe(true);
      expect(meus().novo).toBeDefined();
    });

    it('Começar um novo descarta o rascunho e abre o formulário em branco', async () => {
      f = await montarFormulario({ antes: () => gravarAntigo('novo') });
      mensagem().responder('descartar');
      await esperar(f.fixture);
      expect(meus().novo).toBeUndefined();
      expect(f.html.querySelector('.cliente-selecionado')).toBeNull();
      expect(abaVisivel(f.html)).toEqual(['cliente']);
      expect(f.componente.guardaSaida()!.sujo()).toBe(false);
    });

    it('Esc ou toque fora escolhem a primeira opção (continuar)', async () => {
      f = await montarFormulario({ antes: () => gravarAntigo('novo') });
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      await esperar(f.fixture);
      expect(textoDe(f.html.querySelector('.cliente-selecionado'))).toContain('Maria Souza');
    });

    it('edição: pergunta com o texto próprio e a chave é "pedido:<id>"', async () => {
      f = await montarFormulario({ id: '12', antes: () => gravarAntigo('pedido:12', { dados: { ...DADOS_ANTIGOS, descricao: 'Mudei' }, quando: Date.now() - 2 * 24 * 60 * MIN }) });
      const d = mensagem();
      expect(d.mensagem).toBe('Há alterações não salvas deste pedido, guardadas há 2 dias neste aparelho.');
      expect(d.opcoes.map(o => [o.rotulo, o.valor, o.estilo])).toEqual([
        ['Continuar de onde parei', 'continuar', 'btn-primary'],
        ['Descartar e usar o pedido salvo', 'descartar', 'btn-danger'],
      ]);
      d.responder('continuar');
      await esperar(f.fixture);
      expect(descricao().value).toBe('Mudei');
    });

    it('edição: descartar volta ao pedido salvo e remove o rascunho', async () => {
      f = await montarFormulario({ id: '12', antes: () => gravarAntigo('pedido:12') });
      mensagem().responder('descartar');
      await esperar(f.fixture);
      expect(meus()['pedido:12']).toBeUndefined();
      expect(descricao().value).toBe('Retífica completa'); // o do pedido salvo
    });

    it('o rascunho do pedido novo não aparece ao editar um pedido (chaves diferentes)', async () => {
      f = await montarFormulario({ id: '12', antes: () => gravarAntigo('novo') });
      expect(f.dialogo.dialogos().length).toBe(0);
    });

    it('vindo do cartão "Continuar" aplica direto, sem perguntar', async () => {
      f = await montarFormulario({
        antes: () => gravarAntigo('novo'),
        preparar: () => TestBed.inject(RascunhoService).marcarParaRetomar('novo'),
      });
      expect(f.dialogo.dialogos().length).toBe(0);
      expect(textoDe(f.html.querySelector('.cliente-selecionado'))).toContain('Maria Souza');
      expect(abaVisivel(f.html)).toEqual(['itens']);
    });

    it('a marca do cartão vale uma vez: na abertura seguinte volta a perguntar', async () => {
      f = await montarFormulario({
        antes: () => gravarAntigo('novo'),
        preparar: () => TestBed.inject(RascunhoService).marcarParaRetomar('novo'),
      });
      expect(f.dialogo.dialogos().length).toBe(0);
      expect(TestBed.inject(RascunhoService).consumirRetomada('novo')).toBe(false);
    });

    it('a marca de outro rascunho não pula a pergunta deste', async () => {
      f = await montarFormulario({
        antes: () => gravarAntigo('novo'),
        preparar: () => TestBed.inject(RascunhoService).marcarParaRetomar('pedido:99'),
      });
      expect(f.dialogo.dialogos().length).toBe(1);
    });

    it('rascunho de outro usuário ou outra empresa não aparece', async () => {
      f = await montarFormulario({ antes: () => { gravarAntigo('novo', { dono: '8|3' }); gravarAntigo('novo', { dono: '7|4' }); } });
      expect(f.dialogo.dialogos().length).toBe(0);
      await escolherCliente('Maria');
      await esperarRascunho(f.fixture);
      expect(Object.keys(guardado()).sort()).toEqual(['7|3', '7|4', '8|3']); // cada dono guarda o seu
      expect(guardado()['8|3'].novo.titulo).toBe('Maria Souza · Retífica');
    });

    it('rascunho com 14 dias ou mais não é oferecido', async () => {
      f = await montarFormulario({ antes: () => gravarAntigo('novo', { quando: Date.now() - RASCUNHO_VALIDADE_MS - MIN }) });
      expect(f.dialogo.dialogos().length).toBe(0);
    });

    it('rascunho de menos de 14 dias ainda é oferecido ("há 13 dias")', async () => {
      f = await montarFormulario({ antes: () => gravarAntigo('novo', { quando: Date.now() - 13 * 24 * 60 * MIN }) });
      expect(mensagem().mensagem).toContain('guardado há 13 dias');
    });

    it('rascunho de um pedido mais antigo que o formulário conhece (sem campos novos) abre sem quebrar', async () => {
      f = await montarFormulario({ antes: () => gravarAntigo('novo', { dados: { cliente: null, aba: 'cliente' } }) });
      mensagem().responder('continuar');
      await esperar(f.fixture);
      expect(abaVisivel(f.html)).toEqual(['cliente']);
      expect(f.html.querySelector('.cliente-selecionado')).toBeNull();
    });
  });

  describe('guarda de saída e fim do rascunho', () => {
    beforeEach(async () => { f = await montarFormulario(); });

    it('formulário limpo: nada a perder; com alteração: sujo', async () => {
      expect(f.componente.guardaSaida()!.sujo()).toBe(false);
      await escolherCliente('Maria');
      expect(f.componente.guardaSaida()!.sujo()).toBe(true);
      await clicar(botao(f.html, 'Trocar'));
      expect(f.componente.guardaSaida()!.sujo()).toBe(false);
    });

    it('Sair e guardar rascunho: grava na hora (sem esperar o atraso)', async () => {
      await escolherCliente('Maria');
      const guarda = TestBed.inject(GuardaSaidaService);
      const saida = guarda.perguntarSaida(f.componente.guardaSaida()!);
      await esperar(f.fixture);
      expect(f.dialogo.dialogos().at(-1)!.opcoes.map(o => o.rotulo)).toEqual(['Continuar editando', 'Sair e guardar rascunho', 'Descartar']);
      f.dialogo.dialogos().at(-1)!.responder('guardar');
      expect(await saida).toBe(true);
      expect(meus().novo.dados.cliente.id).toBe(3);
    });

    it('Descartar: apaga o rascunho e o formulário deixa de contar como alterado', async () => {
      await escolherCliente('Maria');
      await esperarRascunho(f.fixture);
      expect(meus().novo).toBeDefined();
      const saida = TestBed.inject(GuardaSaidaService).perguntarSaida(f.componente.guardaSaida()!);
      await esperar(f.fixture);
      f.dialogo.dialogos().at(-1)!.responder('descartar');
      expect(await saida).toBe(true);
      expect(meus().novo).toBeUndefined();
      expect(f.componente.guardaSaida()!.sujo()).toBe(false);
      await esperarRascunho(f.fixture); // nenhum temporizador ressuscita o rascunho
      expect(meus().novo).toBeUndefined();
    });

    it('Continuar editando fica na tela e não mexe no rascunho', async () => {
      await escolherCliente('Maria');
      const saida = TestBed.inject(GuardaSaidaService).perguntarSaida(f.componente.guardaSaida()!);
      await esperar(f.fixture);
      f.dialogo.dialogos().at(-1)!.responder('ficar');
      expect(await saida).toBe(false);
    });

    it('depois de salvar o pedido o rascunho some e a saída não pergunta', async () => {
      await escolherCliente('Maria');
      await esperarRascunho(f.fixture);
      expect(meus().novo).toBeDefined();
      for (let i = 0; i < 3; i++) await clicar(botao(f.html, 'Avançar'));
      await clicar(botao(f.html, 'Salvar'));
      f.http.expectOne({ method: 'POST', url: '/api/pedidos' }).flush({ id: 70 });
      await esperar(f.fixture);
      expect(meus().novo).toBeUndefined();
      expect(f.componente.guardaSaida()!.sujo()).toBe(false);
      await esperarRascunho(f.fixture);
      expect(meus().novo).toBeUndefined();
    });

    it('se o salvamento falha o rascunho continua guardado', async () => {
      await escolherCliente('Maria');
      for (let i = 0; i < 3; i++) await clicar(botao(f.html, 'Avançar'));
      await clicar(botao(f.html, 'Salvar'));
      f.http.expectOne('/api/pedidos').flush({}, { status: 500, statusText: 'x' });
      await esperarRascunho(f.fixture);
      expect(meus().novo).toBeDefined();
      expect(f.componente.guardaSaida()!.sujo()).toBe(true);
    });

    it('fechar ou recarregar a aba (beforeunload/pagehide) grava o rascunho na hora', async () => {
      await escolherCliente('Maria');
      TestBed.inject(GuardaSaidaService).registrar(f.componente);
      window.dispatchEvent(new Event('pagehide'));
      expect(meus().novo.dados.cliente.id).toBe(3);
    });
  });

  describe('401 no meio da edição', () => {
    beforeEach(async () => { f = await montarFormulario(); });

    it('o interceptor grava o rascunho antes de limpar a sessão, no dono certo', async () => {
      await escolherCliente('Maria');
      TestBed.inject(GuardaSaidaService).registrar(f.componente);
      const chamada = TestBed.inject(ApiService).get('/api/qualquer').catch(() => 'falhou');
      f.http.expectOne('/api/qualquer').flush({}, { status: 401, statusText: 'x' });
      expect(await chamada).toBe('falhou');
      expect(TestBed.inject(AuthService).lerAuth()).toBeNull(); // a sessão foi limpa
      expect(guardado()['7|3'].novo.dados.cliente.id).toBe(3); // e o rascunho ficou guardado, antes disso
      expect(Object.keys(guardado())).toEqual(['7|3']);
    });

    it('formulário sem alterações: o 401 não grava nada', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('sem rede')));
      TestBed.inject(GuardaSaidaService).registrar(f.componente);
      const chamada = TestBed.inject(ApiService).get('/api/qualquer').catch(() => 'falhou');
      f.http.expectOne('/api/qualquer').flush({}, { status: 401, statusText: 'x' });
      await chamada;
      expect(localStorage.getItem(CHAVE_RASCUNHOS)).toBeNull();
    });
  });

  describe('edição: o ponto de partida é o pedido carregado', () => {
    beforeEach(async () => { f = await montarFormulario({ id: '12' }); });

    it('sem alterar nada não guarda rascunho', async () => {
      await clicar(botao(f.html, 'Avançar'));
      await esperarRascunho(f.fixture);
      expect(localStorage.getItem(CHAVE_RASCUNHOS)).toBeNull();
      expect(f.componente.guardaSaida()!.sujo()).toBe(false);
    });

    it('alterar guarda em "pedido:12" (e o título leva a descrição)', async () => {
      await clicar(botao(f.html, 'Avançar'));
      await digitando(descricao(), 'Retífica completa e montagem');
      await esperarRascunho(f.fixture);
      expect(meus()['pedido:12'].titulo).toBe('Maria Souza · Retífica completa e montagem');
      expect(meus().novo).toBeUndefined();
      await digitando(descricao(), 'Retífica completa');
      await esperarRascunho(f.fixture);
      expect(meus()['pedido:12']).toBeUndefined(); // voltou ao pedido salvo
    });

    it('salvar a edição remove o rascunho do pedido', async () => {
      await clicar(botao(f.html, 'Avançar'));
      await digitando(descricao(), 'Mudou');
      await esperarRascunho(f.fixture);
      expect(meus()['pedido:12']).toBeDefined();
      for (let i = 0; i < 2; i++) await clicar(botao(f.html, 'Avançar'));
      await clicar(botao(f.html, 'Salvar'));
      f.http.expectOne({ method: 'PUT', url: '/api/pedidos/12' }).flush({ id: 12 });
      await esperar(f.fixture);
      expect(meus()['pedido:12']).toBeUndefined();
    });
  });
});
