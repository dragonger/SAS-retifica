import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { CacheService } from '../../core/cache.service';
import { clientesRecentesIds } from '../../core/clientes-recentes';
import { DialogoService } from '../../core/dialogo.service';
import { OrcamentoCacheService } from '../../core/orcamento-cache.service';
import { TopoService } from '../../core/topo.service';
import { digitar, esperar, provedoresDeTela } from '../../testing/ajuda';
import { CATALOGO_PATHS, PedidoForm } from './pedido-form';
import { Formulario, PEDIDO_12, abaVisivel, botao, montarFormulario, painel, textoDe } from '../../testing/pedido-form';

/**
 * Formulário do pedido (telaFormPedido do app.js): etapas, cliente, componentes, serviços/peças, total e envio.
 * Os rascunhos têm o próprio arquivo (rascunho-form.spec.ts).
 */
describe('PedidoForm', () => {
  let f: Formulario;

  const toast = () => TestBed.inject(DialogoService).toastTexto();
  const toastErro = () => TestBed.inject(DialogoService).toastErro();
  const clicar = async (el: Element) => { (el as HTMLElement).click(); await esperar(f.fixture); };
  const digitando = async (campo: HTMLInputElement | HTMLSelectElement, valor: string) => { digitar(campo, valor); await esperar(f.fixture); };
  const enviar = () => f.html.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
  const avancar = async (vezes = 1) => { for (let i = 0; i < vezes; i++) await clicar(botao(f.html, 'Avançar')); };
  const escolherCliente = async (nome: string) =>
    clicar([...f.html.querySelectorAll('.lista-escolha button')].find(b => b.textContent!.includes(nome))!);
  const chip = (cat: string) => f.html.querySelector(`button.chip[data-categoria="${cat}"]`) as HTMLButtonElement;
  const barra = () => [...f.html.querySelectorAll('.barra-total-form span')].map(e => e.textContent).join(' ');
  const valores = (n: number, tipo: 'servicos' | 'pecas') => f.html.querySelectorAll<HTMLInputElement>(`input[data-valor="${tipo}"]`)[n];
  const seletores = () => f.html.querySelectorAll<HTMLElement>('app-seletor-itens');
  const checks = (seletor: HTMLElement) => [...seletor.querySelectorAll<HTMLInputElement>('input[type=checkbox]')];
  const nomesDisponiveis = (seletor: HTMLElement) => [...seletor.querySelectorAll('label.item-linha span')].map(s => s.textContent);
  const linhasDoPedido = (seletor: HTMLElement) => [...seletor.querySelectorAll('.item-linha')]
    .filter(l => !l.closest('label')).map(l => textoDe(l.querySelector('span')));
  const select = (rotulo: string) => f.html.querySelector(`select[aria-label="${rotulo}"]`) as HTMLSelectElement;

  afterEach(() => f.http.verify());

  describe('etapas', () => {
    beforeEach(async () => { f = await montarFormulario(); });

    it('abre na etapa Cliente, com a dica e sem o botão Voltar', () => {
      expect(textoDe(f.html.querySelector('form'))).toContain('Só o cliente é obrigatório — dá pra completar o resto depois.');
      expect(abaVisivel(f.html)).toEqual(['cliente']);
      expect(botao(f.html, 'Voltar').hidden).toBe(true);
      expect(botao(f.html, 'Avançar')).toBeTruthy();
      expect(botao(f.html, 'Cancelar')).toBeTruthy();
    });

    it('sem cliente escolhido, Avançar avisa e fica na etapa', async () => {
      await avancar();
      expect(toast()).toBe('Selecione ou cadastre um cliente.');
      expect(toastErro()).toBe(true);
      expect(abaVisivel(f.html)).toEqual(['cliente']);
    });

    it('percorre Cliente, Pedido, Componentes e Itens; o botão vira Salvar na última e Voltar volta', async () => {
      await escolherCliente('Maria');
      await avancar();
      expect(abaVisivel(f.html)).toEqual(['pedido']);
      expect(botao(f.html, 'Voltar').hidden).toBe(false);
      await avancar();
      expect(abaVisivel(f.html)).toEqual(['componentes']);
      await avancar();
      expect(abaVisivel(f.html)).toEqual(['itens']);
      expect(botao(f.html, 'Avançar')).toBeUndefined();
      expect(botao(f.html, 'Salvar')).toBeTruthy();
      await clicar(botao(f.html, 'Voltar'));
      expect(abaVisivel(f.html)).toEqual(['componentes']);
    });

    it('as quatro etapas ficam montadas o tempo todo (só alternam o hidden)', () => {
      expect(f.html.querySelectorAll('[data-aba]').length).toBe(4);
      expect(f.html.querySelector('app-aba-itens')).toBeTruthy();
    });

    it('a etapa Pedido de um pedido novo não pergunta a situação', async () => {
      await escolherCliente('Maria');
      await avancar();
      expect(textoDe(painel(f.html, 'pedido'))).not.toContain('Situação');
      expect([...painel(f.html, 'pedido').querySelectorAll('label')].map(l => l.textContent)).toEqual(['Descrição', 'Entrega estimada', 'Observação']);
    });

    it('Cancelar volta à lista de pedidos', async () => {
      await clicar(botao(f.html, 'Cancelar'));
      expect(f.navegar).toHaveBeenCalledWith(['/pedidos']);
    });

    it('o título do topo é "Novo pedido"', () => {
      expect(TestBed.inject(TopoService).titulo()).toBe('Novo pedido');
    });
  });

  describe('cliente', () => {
    beforeEach(async () => { f = await montarFormulario(); });

    it('lista os clientes e busca por nome ou por telefone sem a formatação', async () => {
      const lista = () => [...f.html.querySelectorAll('.lista-escolha button')].map(b => textoDe(b));
      expect(lista()).toEqual(['Maria Souza — (31) 98556-5586', 'João da Silva']);
      const busca = f.html.querySelector('input[type=search]') as HTMLInputElement;
      await digitando(busca, 'joão');
      expect(lista()).toEqual(['João da Silva']);
      await digitando(busca, '9855');
      expect(lista()).toEqual(['Maria Souza — (31) 98556-5586']);
      await digitando(busca, 'xyz');
      expect(f.html.querySelector('.lista-escolha-vazia')?.textContent).toBe('Nenhum cliente encontrado');
    });

    it('escolher mostra o cartão do cliente e Trocar volta à busca', async () => {
      await escolherCliente('Maria');
      const cartao = f.html.querySelector('.cliente-selecionado')!;
      expect(textoDe(cartao)).toContain('Maria Souza');
      expect(textoDe(cartao)).toContain('(31) 98556-5586');
      expect(botao(f.html, 'Novo cliente').hidden).toBe(true);
      await clicar(botao(f.html, 'Trocar'));
      expect(f.html.querySelector('.cliente-selecionado')).toBeNull();
      expect(botao(f.html, 'Novo cliente').hidden).toBe(false);
    });

    it('mostra até 5 clientes recentes (retifica_clientes_recentes) como chips', async () => {
      await f.fixture.destroy();
      TestBed.resetTestingModule();
      f = await montarFormulario({ antes: () => localStorage.setItem('retifica_clientes_recentes', '[4,99,3]') });
      const chips = [...f.html.querySelectorAll('.chip-outline')].map(c => c.textContent);
      expect(chips).toEqual(['João da Silva', 'Maria Souza']); // o id 99 não existe mais
      await clicar(f.html.querySelector('.chip-outline')!);
      expect(textoDe(f.html.querySelector('.cliente-selecionado'))).toContain('João da Silva');
    });

    it('cadastro rápido: valida o nome, faz POST /api/clientes, seleciona o novo e invalida o cache', async () => {
      const cache = TestBed.inject(CacheService);
      await clicar(botao(f.html, 'Novo cliente'));
      await clicar(botao(f.html, 'Salvar cliente'));
      expect(toast()).toBe('Informe o nome.');

      const [nome, tel] = [...f.html.querySelectorAll<HTMLInputElement>('.caixa-form input')];
      await digitando(nome, '  Oficina Nova ');
      await digitando(tel, '31985565586');
      expect(tel.value).toBe('(31) 98556-5586');
      expect(cache.tem('/api/clientes')).toBe(true); // a carga guardou a lista
      await clicar(botao(f.html, 'Salvar cliente'));
      const req = f.http.expectOne({ method: 'POST', url: '/api/clientes' });
      expect(req.request.body).toEqual({ nome: 'Oficina Nova', telefone: '(31) 98556-5586' });
      expect(botao(f.html, 'Salvando…').disabled).toBe(true);
      req.flush({ id: 9, nome: 'Oficina Nova', telefone: '(31) 98556-5586' });
      await esperar(f.fixture);
      expect(toast()).toBe('Cliente cadastrado.');
      expect(textoDe(f.html.querySelector('.cliente-selecionado'))).toContain('Oficina Nova');
      expect(cache.tem('/api/clientes')).toBe(false);
      // o novo cliente entrou no catálogo do formulário
      await clicar(botao(f.html, 'Trocar'));
      expect([...f.html.querySelectorAll('.lista-escolha button')].map(b => b.textContent)).toContain('Oficina Nova — (31) 98556-5586');
    });

    it('cadastro rápido sem telefone manda telefone nulo', async () => {
      await clicar(botao(f.html, 'Novo cliente'));
      const [nome] = [...f.html.querySelectorAll<HTMLInputElement>('.caixa-form input')];
      await digitando(nome, 'Sem Fone');
      await clicar(botao(f.html, 'Salvar cliente'));
      const req = f.http.expectOne({ method: 'POST', url: '/api/clientes' });
      expect(req.request.body).toEqual({ nome: 'Sem Fone', telefone: null });
      req.flush({ id: 10, nome: 'Sem Fone', telefone: null });
      await esperar(f.fixture);
    });
  });

  describe('criar pedido', () => {
    beforeEach(async () => { f = await montarFormulario(); });

    it('só com o cliente: envia o corpo mínimo, invalida as listas, guarda o recente e abre o pedido', async () => {
      const cache = TestBed.inject(CacheService);
      const orcamentos = TestBed.inject(OrcamentoCacheService);
      const invalidar = vi.spyOn(cache, 'invalidarPedidos');
      const orcInvalidar = vi.spyOn(orcamentos, 'invalidar');
      await escolherCliente('Maria');
      await avancar(3);
      await clicar(botao(f.html, 'Salvar'));
      const req = f.http.expectOne({ method: 'POST', url: '/api/pedidos' });
      expect(req.request.body).toEqual({
        componenteIds: [], clienteId: 3, categoriaValores: [], status: 'ABERTO', pedidoDescricao: null, observacao: null,
        datEntregaEstimada: null, servicos: [], pecas: [], descontoTipo: null, descontoValor: null,
      });
      expect(Object.keys(req.request.body)).toEqual([
        'componenteIds', 'clienteId', 'categoriaValores', 'status', 'pedidoDescricao', 'observacao',
        'datEntregaEstimada', 'servicos', 'pecas', 'descontoTipo', 'descontoValor',
      ]);
      expect(botao(f.html, 'Salvando…').disabled).toBe(true); // travado: um segundo toque não duplica o pedido
      req.flush({ id: 55 });
      await esperar(f.fixture);
      expect(invalidar).toHaveBeenCalled();
      expect(orcInvalidar).toHaveBeenCalledWith(55);
      expect(clientesRecentesIds()).toEqual([3]);
      expect(toast()).toBe('Pedido salvo.');
      expect(f.navegar).toHaveBeenCalledWith(['/pedidos', 55]);
    });

    it('as listas de pedidos abertos, dashboard e encerrados são invalidadas de verdade', async () => {
      const cache = TestBed.inject(CacheService);
      for (const p of ['/api/pedidos?abertos=true', '/api/pedidos/dashboard', '/api/pedidos/encerrados']) {
        cache.comCache(p, () => undefined).catch(() => undefined);
        f.http.expectOne(p).flush([]);
      }
      await esperar(f.fixture);
      expect(cache.tem('/api/pedidos?abertos=true')).toBe(true);
      await escolherCliente('Maria');
      await avancar(3);
      await clicar(botao(f.html, 'Salvar'));
      f.http.expectOne({ method: 'POST', url: '/api/pedidos' }).flush({ id: 56 });
      await esperar(f.fixture);
      for (const p of ['/api/pedidos?abertos=true', '/api/pedidos/dashboard', '/api/pedidos/encerrados']) expect(cache.tem(p)).toBe(false);
    });

    it('enviar o formulário sem cliente avisa e leva à etapa Cliente', async () => {
      await escolherCliente('Maria');
      await avancar(2);
      await clicar(botao(f.html, 'Trocar')); // volta a não ter cliente (o botão está na etapa escondida)
      enviar();
      await esperar(f.fixture);
      expect(toast()).toBe('Selecione ou cadastre um cliente.');
      expect(abaVisivel(f.html)).toEqual(['cliente']);
    });

    it('se o servidor recusa, o botão volta ao normal e nada é invalidado nem aberto', async () => {
      await escolherCliente('Maria');
      await avancar(3);
      await clicar(botao(f.html, 'Salvar'));
      f.http.expectOne('/api/pedidos').flush({ erro: 'x' }, { status: 500, statusText: 'x' });
      await esperar(f.fixture);
      expect(botao(f.html, 'Salvar').disabled).toBe(false);
      expect(f.navegar).not.toHaveBeenCalled();
      expect(clientesRecentesIds()).toEqual([]);
    });

    it('corpo completo: igual ao que o app.js envia', async () => {
      await escolherCliente('Maria');
      await avancar();
      // etapa Pedido
      const [descricao, entrega] = [...painel(f.html, 'pedido').querySelectorAll<HTMLInputElement>('input')];
      const observacao = painel(f.html, 'pedido').querySelector('textarea') as unknown as HTMLInputElement;
      await digitando(descricao, '  Retífica completa ');
      await digitando(entrega, '2026-12-01');
      await digitando(observacao, ' Entregar à tarde ');
      await avancar();
      // etapa Componentes
      await clicar(chip('CABECOTE'));
      await clicar(chip('BLOCO'));
      await digitando(valores(0, 'servicos'), '800');
      await digitando(valores(0, 'pecas'), '200.5');
      await digitando(valores(1, 'servicos'), '100');
      await digitando(select('Modelo'), '2'); // Gol
      await clicar(botao(f.html, 'Adicionar modelo'));
      await avancar();
      // etapa Itens: serviços (Plainar do cabeçote) e peças (Junta x3)
      const [servicos, pecas] = [...seletores()];
      await clicar(checks(servicos)[0]);
      await clicar(botao(servicos, 'Adicionar selecionados'));
      await clicar(botao(f.html, 'Peças'));
      const chkJunta = checks(pecas)[0];
      await clicar(chkJunta);
      await digitando(pecas.querySelector<HTMLInputElement>('input[type=number]')!, '3');
      await clicar(botao(pecas, 'Adicionar selecionados'));
      const [tipo, valor] = [f.html.querySelector('.barra-total-form select') as HTMLSelectElement, f.html.querySelector('.barra-total-form input') as HTMLInputElement];
      await digitando(tipo, 'PERCENTUAL');
      await digitando(valor, '10');
      await clicar(botao(f.html, 'Salvar'));

      const req = f.http.expectOne({ method: 'POST', url: '/api/pedidos' });
      expect(req.request.body).toEqual({
        componenteIds: [2],
        clienteId: 3,
        categoriaValores: [
          { categoria: 'CABECOTE', valorServicos: 800, valorPecas: 200.5 },
          { categoria: 'BLOCO', valorServicos: 100, valorPecas: 0 },
        ],
        status: 'ABERTO',
        pedidoDescricao: 'Retífica completa',
        observacao: 'Entregar à tarde',
        datEntregaEstimada: '2026-12-01',
        servicos: [{ descricao: 'Plainar', categoria: 'CABECOTE' }],
        pecas: [{ descricao: 'Junta', categoria: 'CABECOTE', quantidade: 3 }],
        descontoTipo: 'PERCENTUAL',
        descontoValor: 10,
      });
      req.flush({ id: 60 });
      await esperar(f.fixture);
    });
  });

  describe('componentes', () => {
    beforeEach(async () => {
      f = await montarFormulario();
      await escolherCliente('Maria');
      await avancar(2);
    });

    it('sem categoria marcada mostra a mensagem em vez do seletor de modelos', () => {
      const aba = painel(f.html, 'componentes');
      const mensagem = [...aba.querySelectorAll<HTMLElement>('.empty')].find(e => e.textContent!.includes('Marque uma categoria'))!;
      expect(mensagem.hidden).toBe(false);
      expect(select('Modelo').closest('[hidden]')).toBeTruthy();
    });

    it('só as categorias com componente viram chips (montagem fica de fora) e marcar mostra o cartão de valores', async () => {
      expect([...f.html.querySelectorAll('button.chip')].map(c => c.textContent)).toEqual(['Cabeçote', 'Bloco', 'Biela', 'Virabrequim']);
      await clicar(chip('BLOCO'));
      expect(chip('BLOCO').classList.contains('active')).toBe(true);
      const cartoes = painel(f.html, 'componentes').querySelectorAll('.card-destaque-titulo');
      expect([...cartoes].map(c => c.textContent)).toEqual(['Bloco']);
      await clicar(chip('CABECOTE'));
      expect([...painel(f.html, 'componentes').querySelectorAll('.card-destaque-titulo')].map(c => c.textContent)).toEqual(['Cabeçote', 'Bloco']); // na ordem fixa
      await clicar(chip('BLOCO'));
      expect([...painel(f.html, 'componentes').querySelectorAll('.card-destaque-titulo')].map(c => c.textContent)).toEqual(['Cabeçote']);
    });

    it('o seletor de modelos só traz as categorias marcadas e a busca filtra sem acento', async () => {
      await clicar(chip('CABECOTE'));
      const opcoes = () => [...select('Modelo').querySelectorAll('option')].map(o => o.textContent);
      expect(opcoes()).toEqual(['Selecione', 'Fiat Uno', 'Gol']);
      await clicar(chip('BLOCO'));
      expect(opcoes()).toEqual(['Selecione', 'Fiat Uno', 'Gol', 'Scania']);
      const busca = f.html.querySelector('input[aria-label="Buscar modelo"]') as HTMLInputElement;
      await digitando(busca, 'scâ');
      await new Promise(r => setTimeout(r, 160)); // a lista só filtra depois da digitação parar
      await esperar(f.fixture);
      expect(opcoes()).toEqual(['1 modelo encontrado', 'Scania']);
      expect(select('Modelo').value).toBe('3'); // um resultado só já fica selecionado
      await digitando(busca, 'zzz');
      await new Promise(r => setTimeout(r, 160));
      await esperar(f.fixture);
      expect(opcoes()).toEqual(['Nenhum modelo com esse nome']);
    });

    it('adicionar modelo: exige escolha, não repete e limpa a busca', async () => {
      await clicar(chip('CABECOTE'));
      await clicar(botao(f.html, 'Adicionar modelo'));
      expect(toast()).toBe('Selecione um modelo.');
      await digitando(select('Modelo'), '1');
      await clicar(botao(f.html, 'Adicionar modelo'));
      expect(textoDe(painel(f.html, 'componentes'))).toContain('Fiat Uno');
      await digitando(select('Modelo'), '1');
      await clicar(botao(f.html, 'Adicionar modelo'));
      expect(toast()).toBe('Esse modelo já foi adicionado.');
      expect(painel(f.html, 'componentes').querySelectorAll('.item-linha').length).toBe(1);
    });

    it('remover (✕) tira o modelo da lista', async () => {
      await clicar(chip('CABECOTE'));
      await digitando(select('Modelo'), '1');
      await clicar(botao(f.html, 'Adicionar modelo'));
      await clicar(painel(f.html, 'componentes').querySelector('.item-linha button')!);
      expect(textoDe(painel(f.html, 'componentes'))).toContain('Nenhum modelo adicionado ainda');
    });

    it('novo modelo: valida o nome, faz POST /api/cabecotes, adiciona ao pedido e invalida o cache', async () => {
      const cache = TestBed.inject(CacheService);
      await clicar(chip('BLOCO'));
      await clicar(botao(f.html, 'Novo modelo'));
      await clicar(botao(f.html, 'Salvar modelo'));
      expect(toast()).toBe('Informe o nome.');
      const caixa = painel(f.html, 'componentes').querySelector('.caixa-form')!;
      const [nome, movel, fixo] = [...caixa.querySelectorAll<HTMLInputElement>('input')];
      await digitando(nome, ' Motor X ');
      await digitando(movel, '25,045-27,070');
      await digitando(fixo, '');
      await clicar(botao(f.html, 'Salvar modelo'));
      const req = f.http.expectOne({ method: 'POST', url: '/api/cabecotes' });
      expect(req.request.body).toEqual({ categoria: 'BLOCO', nome: 'Motor X', movelFaixa: '25,045-27,070', fixoFaixa: null });
      req.flush({ id: 77, categoria: 'BLOCO', categoriaRotulo: 'Bloco', nome: 'Motor X' });
      await esperar(f.fixture);
      expect(toast()).toBe('Modelo cadastrado.');
      expect(cache.tem('/api/cabecotes')).toBe(false);
      expect(textoDe(painel(f.html, 'componentes').querySelector('.item-linha'))).toContain('Motor X');
      expect([...select('Modelo').querySelectorAll('option')].map(o => o.textContent)).toContain('Motor X');
      expect((caixa as HTMLElement).hidden).toBe(true);
    });

    it('a categoria do novo modelo é uma das marcadas, na ordem de CABECOTE, BLOCO...', async () => {
      await clicar(chip('BLOCO'));
      await clicar(chip('CABECOTE'));
      const opcoes = [...painel(f.html, 'componentes').querySelectorAll('.caixa-form select option')].map(o => o.textContent);
      expect(opcoes).toEqual(['Cabeçote', 'Bloco']);
    });
  });

  describe('serviços e peças', () => {
    beforeEach(async () => {
      f = await montarFormulario();
      await escolherCliente('Maria');
      await avancar(3);
    });

    it('sem categoria marcada oferece o catálogo todo, agrupado por categoria', () => {
      const [servicos, pecas] = [...seletores()];
      expect([...servicos.querySelectorAll('.grupo-categoria h3')].map(h => h.textContent)).toEqual(['Cabeçote', 'Bloco']);
      expect(nomesDisponiveis(servicos)).toEqual(['Plainar', 'Plainar', 'Brunir']);
      expect(nomesDisponiveis(pecas)).toEqual(['Junta', 'Pistão']);
    });

    it('as categorias marcadas filtram o que é oferecido', async () => {
      await clicar(botao(f.html, 'Voltar'));
      await clicar(chip('BLOCO'));
      await avancar();
      expect(nomesDisponiveis(seletores()[0])).toEqual(['Plainar', 'Brunir']);
      expect(nomesDisponiveis(seletores()[1])).toEqual(['Pistão']);
    });

    it('sem marcar nada, "Adicionar selecionados" avisa', async () => {
      await clicar(botao(seletores()[0], 'Adicionar selecionados'));
      expect(toast()).toBe('Selecione pelo menos um item.');
      expect(toastErro()).toBe(true);
    });

    it('o item adicionado some da lista de escolha e aparece nas linhas do pedido; o ✕ devolve', async () => {
      const servicos = seletores()[0];
      await clicar(checks(servicos)[2]); // Brunir (bloco)
      await clicar(botao(servicos, 'Adicionar selecionados'));
      expect(nomesDisponiveis(servicos)).toEqual(['Plainar', 'Plainar']);
      expect(linhasDoPedido(servicos)).toEqual(['Brunir']);
      expect(checks(servicos).every(c => !c.checked)).toBe(true); // o seletor recomeça sem nada marcado
      await clicar(servicos.querySelector('.item-linha button')!);
      expect(nomesDisponiveis(servicos)).toEqual(['Plainar', 'Plainar', 'Brunir']);
      expect(linhasDoPedido(servicos)).toEqual([]);
      expect(textoDe(servicos)).toContain('Nenhum item adicionado ainda');
    });

    it('esconde só o item da mesma categoria: Plainar do bloco some, o do cabeçote continua', async () => {
      const servicos = seletores()[0];
      await clicar(checks(servicos)[1]); // Plainar (bloco)
      await clicar(botao(servicos, 'Adicionar selecionados'));
      expect(nomesDisponiveis(servicos)).toEqual(['Plainar', 'Brunir']);
      expect([...servicos.querySelectorAll('.grupo-categoria h3')].map(h => h.textContent)).toEqual(['Cabeçote', 'Bloco']);
      // o mesmo nome em duas categorias mostra de qual é cada um
      await clicar(checks(servicos)[0]);
      await clicar(botao(servicos, 'Adicionar selecionados'));
      expect(linhasDoPedido(servicos)).toEqual(['Plainar · Bloco', 'Plainar · Cabeçote']);
    });

    it('peça: a quantidade só aparece ao marcar, vale no mínimo 1 e entra como "× n"', async () => {
      await clicar(botao(f.html, 'Peças'));
      const pecas = seletores()[1];
      const qtd = pecas.querySelector<HTMLInputElement>('label input.input')!;
      expect(qtd.hidden).toBe(true);
      await clicar(checks(pecas)[0]);
      expect(qtd.hidden).toBe(false);
      expect(qtd.value).toBe('1');
      await digitando(qtd, '0');
      await clicar(botao(pecas, 'Adicionar selecionados'));
      expect(linhasDoPedido(pecas)).toEqual(['Junta ×1']);
      await clicar(checks(pecas)[0]); // Pistão
      await digitando(pecas.querySelector<HTMLInputElement>('label input.input')!, '4');
      await clicar(botao(pecas, 'Adicionar selecionados'));
      expect(linhasDoPedido(pecas)).toEqual(['Junta ×1', 'Pistão ×4']);
      expect(textoDe(pecas)).toContain('Nenhum item disponível pra adicionar.');
    });

    it('o alternador Serviços/Peças mostra um seletor de cada vez e guarda o que foi marcado', async () => {
      const [servicos, pecas] = [...seletores()];
      await clicar(checks(servicos)[0]);
      expect(servicos.parentElement!.hidden).toBe(false);
      expect(pecas.parentElement!.hidden).toBe(true);
      await clicar(botao(f.html, 'Peças'));
      expect(servicos.parentElement!.hidden).toBe(true);
      expect(pecas.parentElement!.hidden).toBe(false);
      await clicar(botao(f.html, 'Serviços'));
      expect(checks(servicos)[0].checked).toBe(true);
    });

    describe('Novo serviço / Nova peça', () => {
      const caixa = (seletor: HTMLElement) => seletor.querySelector('.caixa-form') as HTMLElement;

      it('serviço novo: POST no catálogo com valor 0, entra no pedido e invalida o cache', async () => {
        const cache = TestBed.inject(CacheService);
        const servicos = seletores()[0];
        await clicar(botao(servicos, 'Novo serviço'));
        expect(caixa(servicos).hidden).toBe(false);
        await clicar(botao(servicos, 'Salvar serviço'));
        expect(toast()).toBe('Informe o nome.');
        await digitando(caixa(servicos).querySelector('input')!, '  Soldar ');
        await digitando(caixa(servicos).querySelector('select')!, 'BLOCO');
        await clicar(botao(servicos, 'Salvar serviço'));
        const req = f.http.expectOne({ method: 'POST', url: '/api/servicos-catalogo' });
        expect(req.request.body).toEqual({ categoria: 'BLOCO', nome: 'Soldar', valor: 0 });
        req.flush({ id: 90, categoria: 'BLOCO', categoriaRotulo: 'Bloco', nome: 'Soldar', valor: 0 });
        await esperar(f.fixture);
        expect(toast()).toBe('Serviço adicionado: Soldar');
        expect(cache.tem('/api/servicos-catalogo')).toBe(false);
        expect(linhasDoPedido(servicos)).toEqual(['Soldar']);
        expect(caixa(servicos).hidden).toBe(true);
        expect(nomesDisponiveis(servicos)).not.toContain('Soldar'); // já está no pedido
      });

      it('serviço com nome que já existe no catálogo: só adiciona, sem POST nem duplicar', async () => {
        const servicos = seletores()[0];
        await clicar(botao(servicos, 'Novo serviço'));
        await digitando(caixa(servicos).querySelector('select')!, 'BLOCO');
        await digitando(caixa(servicos).querySelector('input')!, 'brunir');
        await clicar(botao(servicos, 'Salvar serviço'));
        expect(linhasDoPedido(servicos)).toEqual(['Brunir']); // o nome do catálogo, não o digitado
        expect(toast()).toBe('Serviço adicionado: Brunir');
      });

      it('serviço que já está no pedido: avisa', async () => {
        const servicos = seletores()[0];
        await clicar(checks(servicos)[2]);
        await clicar(botao(servicos, 'Adicionar selecionados'));
        await clicar(botao(servicos, 'Novo serviço'));
        await digitando(caixa(servicos).querySelector('select')!, 'BLOCO');
        await digitando(caixa(servicos).querySelector('input')!, 'Brunir');
        await clicar(botao(servicos, 'Salvar serviço'));
        expect(toast()).toBe('Esse serviço já está no pedido.');
        expect(linhasDoPedido(servicos)).toEqual(['Brunir']);
      });

      it('peça nova: pergunta a quantidade, usa o artigo feminino e faz POST em /api/pecas-catalogo', async () => {
        await clicar(botao(f.html, 'Peças'));
        const pecas = seletores()[1];
        await clicar(botao(pecas, 'Nova peça'));
        expect(textoDe(caixa(pecas))).toContain('Quantidade');
        expect(caixa(pecas).querySelector<HTMLInputElement>('input[type=text]')!.placeholder).toBe('Nome da peça');
        const [nome, qtd] = [...caixa(pecas).querySelectorAll<HTMLInputElement>('input')];
        await digitando(nome, 'Anel');
        await digitando(qtd, '6');
        await clicar(botao(pecas, 'Salvar peça'));
        const req = f.http.expectOne({ method: 'POST', url: '/api/pecas-catalogo' });
        expect(req.request.body).toEqual({ categoria: 'CABECOTE', nome: 'Anel', valor: 0 });
        req.flush({ id: 91, categoria: 'CABECOTE', categoriaRotulo: 'Cabeçote', nome: 'Anel', valor: 0 });
        await esperar(f.fixture);
        expect(toast()).toBe('Peça adicionada: Anel');
        expect(linhasDoPedido(pecas)).toEqual(['Anel ×6']);
        expect(qtd.value).toBe('1');
      });

      it('as categorias oferecidas são as marcadas no pedido; sem nenhuma, todas', async () => {
        const servicos = seletores()[0];
        const opcoes = () => [...caixa(servicos).querySelectorAll('select option')].map(o => o.textContent);
        expect(opcoes()).toEqual(['Cabeçote', 'Bloco', 'Biela', 'Virabrequim', 'Montagem']);
        await clicar(botao(f.html, 'Voltar'));
        await clicar(chip('BIELA'));
        await avancar();
        expect(opcoes()).toEqual(['Biela']);
      });
    });
  });

  describe('barra do total', () => {
    beforeEach(async () => {
      f = await montarFormulario();
      await escolherCliente('Maria');
      await avancar(1);
      await avancar(1);
      await clicar(chip('CABECOTE'));
      await clicar(chip('BLOCO'));
    });

    const irParaItens = () => avancar();
    const tipoDesconto = () => f.html.querySelector('.barra-total-form select') as HTMLSelectElement;
    const valorDesconto = () => f.html.querySelector('.barra-total-form input') as HTMLInputElement;

    it('começa zerada, com as três linhas e o seletor de desconto', async () => {
      await irParaItens();
      expect(barra()).toContain('Subtotal R$ 0,00');
      expect(barra()).toContain('Total R$ 0,00');
      expect([...tipoDesconto().options].map(o => o.textContent)).toEqual(['Sem desconto', 'Valor (R$)', 'Percentual (%)']);
    });

    it('soma os valores de serviços e peças de cada categoria ao vivo', async () => {
      await digitando(valores(0, 'servicos'), '800');
      await digitando(valores(0, 'pecas'), '200');
      await digitando(valores(1, 'servicos'), '1000.5');
      await irParaItens();
      expect(barra()).toContain('Subtotal R$ 2.000,50');
      expect(barra()).toContain('Total R$ 2.000,50');
    });

    it('desconto em valor: mostra "- R$", abate e nunca passa do subtotal', async () => {
      await digitando(valores(0, 'servicos'), '100');
      await irParaItens();
      await digitando(tipoDesconto(), 'VALOR');
      await digitando(valorDesconto(), '30');
      expect(barra()).toContain('- R$ 30,00');
      expect(barra()).toContain('Total R$ 70,00');
      await digitando(valorDesconto(), '999');
      expect(barra()).toContain('- R$ 100,00');
      expect(barra()).toContain('Total R$ 0,00');
    });

    it('desconto percentual: arredonda em 2 casas e limita a 100%', async () => {
      await digitando(valores(0, 'servicos'), '10.01');
      await irParaItens();
      await digitando(tipoDesconto(), 'PERCENTUAL');
      await digitando(valorDesconto(), '12.5');
      expect(barra()).toContain('- R$ 1,25');
      expect(barra()).toContain('Total R$ 8,76');
      await digitando(valorDesconto(), '150');
      expect(barra()).toContain('Total R$ 0,00');
    });

    it('sem desconto (tipo vazio) ou com valor vazio não mostra o "-"', async () => {
      await digitando(valores(0, 'servicos'), '100');
      await irParaItens();
      await digitando(valorDesconto(), '20');
      expect(barra()).not.toContain('- R$');
      await digitando(tipoDesconto(), 'VALOR');
      expect(barra()).toContain('- R$ 20,00');
      await digitando(valorDesconto(), '');
      expect(barra()).toContain('Total R$ 100,00');
    });

    it('desmarcar a categoria tira o valor dela do subtotal', async () => {
      await digitando(valores(0, 'servicos'), '100');
      await digitando(valores(1, 'servicos'), '50');
      await clicar(chip('BLOCO'));
      await irParaItens();
      expect(barra()).toContain('Subtotal R$ 100,00');
    });

    it('digitar valor com casas ("1.05") não é apagado a cada tecla', async () => {
      const campo = valores(0, 'servicos');
      for (const parcial of ['1', '1.', '1.0', '1.05']) {
        campo.value = parcial;
        campo.dispatchEvent(new Event('input'));
        await esperar(f.fixture, 1);
      }
      expect(campo.value).toBe('1.05');
      await irParaItens();
      expect(barra()).toContain('Subtotal R$ 1,05');
    });
  });

  describe('validação ao salvar', () => {
    beforeEach(async () => {
      f = await montarFormulario();
      await escolherCliente('Maria');
      await avancar(2);
      await clicar(chip('CABECOTE'));
    });

    it('valor negativo numa etapa escondida: leva à etapa do campo, avisa e não envia', async () => {
      await digitando(valores(0, 'servicos'), '-5');
      await avancar();
      expect(abaVisivel(f.html)).toEqual(['itens']);
      enviar();
      await esperar(f.fixture);
      expect(toast()).toBe('Tem um campo com valor inválido (ex.: número negativo). Confira o campo destacado.');
      expect(toastErro()).toBe(true);
      expect(abaVisivel(f.html)).toEqual(['componentes']);
      f.http.expectNone('/api/pedidos');
    });

    it('desconto negativo também é recusado', async () => {
      await avancar();
      await digitando(f.html.querySelector('.barra-total-form input') as HTMLInputElement, '-1');
      enviar();
      await esperar(f.fixture);
      expect(toast()).toContain('valor inválido');
      f.http.expectNone('/api/pedidos');
    });
  });

  describe('pedido finalizado', () => {
    it('não abre o formulário: mostra que não pode ser editado (o servidor também recusa)', async () => {
      f = await montarFormulario({ id: '12', pedido: { ...PEDIDO_12, finalizado: true } });
      expect(f.html.querySelector('form')).toBeNull();
      expect(textoDe(f.html)).toContain('Este pedido já foi finalizado e não pode mais ser editado.');
    });

    it('finalizado em outro aparelho durante a edição: o 409 mostra a mensagem do servidor e não sai da tela', async () => {
      f = await montarFormulario({ id: '12' });
      await avancar(3);
      await clicar(botao(f.html, 'Salvar'));
      f.http.expectOne({ method: 'PUT', url: '/api/pedidos/12' })
        .flush({ erro: 'Este pedido já foi finalizado e não pode mais ser editado.' }, { status: 409, statusText: 'Conflict' });
      await esperar(f.fixture);
      expect(toast()).toBe('Este pedido já foi finalizado e não pode mais ser editado.');
      expect(toastErro()).toBe(true);
      expect(f.navegar).not.toHaveBeenCalled();
      expect(botao(f.html, 'Salvar').disabled).toBe(false);
    });
  });

  describe('editar pedido', () => {
    beforeEach(async () => { f = await montarFormulario({ id: '12' }); });

    it('carrega GET /api/pedidos/12 e preenche tudo', async () => {
      expect(textoDe(f.html.querySelector('.cliente-selecionado'))).toContain('Maria Souza');
      await avancar();
      expect(botao(f.html, 'Voltar').hidden).toBe(false);
      const aba = painel(f.html, 'pedido');
      const select = aba.querySelector('select') as HTMLSelectElement;
      expect([...select.options].map(o => o.textContent)).toEqual(['Aberto', 'Em andamento', 'Pronto']);
      expect(select.value).toBe('PRONTO');
      const [descricao, entrega] = aba.querySelectorAll<HTMLInputElement>('input');
      expect(descricao.value).toBe('Retífica completa');
      expect(entrega.value).toBe('2026-10-20');
      expect(aba.querySelector('textarea')!.value).toBe('Entregar à tarde');
      await avancar();
      expect(chip('CABECOTE').classList.contains('active')).toBe(true);
      expect(chip('BLOCO').classList.contains('active')).toBe(false);
      expect(valores(0, 'servicos').value).toBe('800');
      expect(valores(0, 'pecas').value).toBe('200');
      expect(textoDe(painel(f.html, 'componentes'))).toContain('Fiat Uno');
      await avancar();
      expect(linhasDoPedido(seletores()[0])).toEqual(['Plainar']);
      expect(linhasDoPedido(seletores()[1])).toEqual(['Junta ×2']);
      expect(barra()).toContain('Subtotal R$ 1.000,00');
      expect(barra()).toContain('- R$ 100,00');
      expect(barra()).toContain('Total R$ 900,00');
    });

    it('Salvar faz PUT /api/pedidos/12 com o corpo do pedido e abre o pedido', async () => {
      await avancar(3);
      await clicar(botao(f.html, 'Salvar'));
      const req = f.http.expectOne({ method: 'PUT', url: '/api/pedidos/12' });
      expect(req.request.body).toEqual({
        componenteIds: [1],
        clienteId: 3,
        categoriaValores: [{ categoria: 'CABECOTE', valorServicos: 800, valorPecas: 200 }],
        status: 'PRONTO',
        pedidoDescricao: 'Retífica completa',
        observacao: 'Entregar à tarde',
        datEntregaEstimada: '2026-10-20',
        servicos: [{ descricao: 'Plainar', quantidade: 1, categoria: 'CABECOTE' }],
        pecas: [{ descricao: 'Junta', quantidade: 2, categoria: 'CABECOTE' }],
        descontoTipo: 'PERCENTUAL',
        descontoValor: 10,
      });
      req.flush({ id: 12 });
      await esperar(f.fixture);
      expect(f.navegar).toHaveBeenCalledWith(['/pedidos', 12]);
    });

    it('Cancelar volta ao pedido, não à lista', async () => {
      await clicar(botao(f.html, 'Cancelar'));
      expect(f.navegar).toHaveBeenCalledWith(['/pedidos', '12']);
    });

    it('a categoria de um componente já vinculado aparece marcada mesmo sem valor gravado', async () => {
      await f.fixture.destroy();
      TestBed.resetTestingModule();
      f = await montarFormulario({ id: '12', pedido: { ...PEDIDO_12, categoriaValores: [], componentes: [{ id: 3, nome: 'Scania' }] } });
      await avancar(2);
      expect(chip('BLOCO').classList.contains('active')).toBe(true);
      expect(valores(0, 'servicos').value).toBe('');
    });

    it('pedido sem desconto edita sem desconto; status fora das opções cai em "Aberto"', async () => {
      await f.fixture.destroy();
      TestBed.resetTestingModule();
      f = await montarFormulario({ id: '12', pedido: { ...PEDIDO_12, descontoTipo: null, descontoValor: null, status: 'ATRASADO', observacao: null } });
      await avancar(3);
      expect(barra()).toContain('Total R$ 1.000,00');
      await clicar(botao(f.html, 'Salvar'));
      const req = f.http.expectOne({ method: 'PUT', url: '/api/pedidos/12' });
      expect(req.request.body).toMatchObject({ status: 'ABERTO', observacao: null, descontoTipo: null, descontoValor: null });
      req.flush({ id: 12 });
      await esperar(f.fixture);
    });

    it('um pedido que não existe mais não abre o formulário', async () => {
      await f.fixture.destroy();
      TestBed.resetTestingModule();
      f = await montarFormulario({ id: '12', pedido: null });
      expect(f.html.textContent).toContain('Pedido não encontrado.');
      expect(f.html.querySelector('form')).toBeNull();
    });
  });

  describe('carga', () => {
    it('mostra "Carregando..." até as respostas chegarem e pede os 5 catálogos de uma vez', async () => {
      localStorage.clear();
      TestBed.configureTestingModule({
        providers: [...provedoresDeTela(), { provide: ActivatedRoute, useValue: { paramMap: new BehaviorSubject(convertToParamMap({})) } }],
      });
      const http = TestBed.inject(HttpTestingController);
      const fixture = TestBed.createComponent(PedidoForm);
      await fixture.whenStable();
      expect(textoDe(fixture.nativeElement)).toBe('Carregando...');
      const pedidos = http.match(() => true);
      expect(pedidos.map(r => r.request.url)).toEqual(CATALOGO_PATHS);
      pedidos.forEach(r => r.flush([]));
      await esperar(fixture);
      expect(fixture.nativeElement.querySelector('form')).toBeTruthy();
    });

    it('o título do topo da edição é "Editar pedido #12"', async () => {
      f = await montarFormulario({ id: '12' });
      expect(TestBed.inject(TopoService).titulo()).toBe('Editar pedido #12');
    });

    it('trocar o id da rota (mesmo componente) recarrega o outro pedido', async () => {
      f = await montarFormulario({ id: '12' });
      f.parametros.next(convertToParamMap({ id: '13' }));
      await f.fixture.whenStable();
      f.http.match(() => true).forEach(r => {
        if (r.request.url === '/api/pedidos/13') r.flush({ ...PEDIDO_12, id: 13, pedidoDescricao: 'Outro' });
        else r.flush([]);
      });
      await esperar(f.fixture);
      await avancar();
      expect((painel(f.html, 'pedido').querySelectorAll('input')[0]).value).toBe('Outro');
    });
  });

  describe('API para o ditado (fase 4)', () => {
    beforeEach(async () => { f = await montarFormulario(); });

    it('ordemAbas, irParaAba e obterAtual', async () => {
      expect(f.componente.ordemAbas).toEqual(['cliente', 'pedido', 'componentes', 'itens']);
      f.componente.irParaAba('itens');
      await esperar(f.fixture);
      expect(abaVisivel(f.html)).toEqual(['itens']);
      f.componente.irParaAba('inexistente');
      expect(abaVisivel(f.html)).toEqual(['itens']);
      const atual = f.componente.obterAtual();
      expect(atual.cliente).toBeNull();
      expect('aba' in atual).toBe(false);
      expect(f.componente.catalogo().clientes.length).toBe(2);
    });

    it('aplicar preenche o formulário (como aplicarRascunho) e guarda o rascunho na hora', async () => {
      f.componente.aplicar({
        cliente: { id: 4, nome: 'João da Silva', telefone: null }, descricao: 'Ditado', categorias: [['BLOCO', { valorServicos: 10, valorPecas: 5 }]],
        componentes: [{ id: 3, nome: 'Scania' }], aba: 'componentes',
      });
      await esperar(f.fixture);
      expect(textoDe(f.html.querySelector('.cliente-selecionado'))).toContain('João da Silva');
      expect(abaVisivel(f.html)).toEqual(['componentes']);
      expect(valores(0, 'servicos').value).toBe('10');
      expect(JSON.parse(localStorage.getItem('retifica_rascunhos')!)['7|3'].novo.titulo).toBe('João da Silva · Ditado');
    });

    it('cadastrarCliente abre o cadastro rápido com o nome', async () => {
      f.componente.cadastrarCliente('Fulano Novo');
      await esperar(f.fixture);
      const caixa = f.html.querySelector('[data-aba=cliente] .caixa-form') as HTMLElement;
      expect(caixa.hidden).toBe(false);
      expect(caixa.querySelector('input')!.value).toBe('Fulano Novo');
    });
  });
});
