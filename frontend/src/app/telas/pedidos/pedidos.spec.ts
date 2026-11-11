import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { CHAVE_AUTH } from '../../core/auth.service';
import { DialogoService } from '../../core/dialogo.service';
import { digitar, esperar, provedoresDeTela, tokenDeTeste } from '../../testing/ajuda';
import { gravarRascunhosDeTeste } from '../../testing/rascunhos';
import { PedidoLista } from '../../shared/modelos';
import { dataHojeBr, Pedidos } from './pedidos';

const pedido = (id: number, cliente: string, resumo: string, extra: Partial<PedidoLista> = {}): PedidoLista => ({
  id, clienteId: id * 10, clienteNome: cliente, situacao: 'Aberto', status: 'ABERTO', atrasado: false,
  componentesResumo: resumo, dataEntrega: '01/12/2030', totalGeral: 100, finalizado: false, ...extra,
});

const hoje = dataHojeBr();
const ABERTOS: PedidoLista[] = [
  pedido(1, 'João da Silva', 'Cabeçote Fiat Uno', { dataEntrega: hoje }),
  pedido(2, 'Maria Souza', 'Bloco Gol', { status: 'PRONTO', situacao: 'Pronto' }),
  pedido(137, 'Ônibus Ltda', 'Virabrequim Scania', { atrasado: true, situacao: 'Atrasado' }),
];
const CLIENTES = [
  { id: 20, nome: 'Maria Souza' },
  { id: 10, nome: 'João da Silva' },
  { id: 1370, nome: 'Ônibus Ltda' },
];
const ENCERRADOS = [
  { mes: 'Outubro de 2026', quantidade: 2, total: 200, porCliente: [], porCategoria: [], pedidos: [
    pedido(90, 'João da Silva', 'Cabeçote antigo', { finalizado: true, situacao: 'Finalizado', clienteId: 10 }),
    pedido(91, 'Outro Cliente', 'Biela', { finalizado: true, situacao: 'Finalizado', clienteId: 999 }),
  ] },
];

describe('Pedidos', () => {
  let http: HttpTestingController;
  let query: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let navegar: ReturnType<typeof vi.fn>;

  async function criar(params: Record<string, string> = {}, antes?: () => void) {
    localStorage.clear();
    antes?.();
    query = new BehaviorSubject(convertToParamMap(params));
    TestBed.configureTestingModule({
      providers: [...provedoresDeTela(), { provide: ActivatedRoute, useValue: { queryParamMap: query } }],
    });
    http = TestBed.inject(HttpTestingController);
    navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true) as never;
    const fixture = TestBed.createComponent(Pedidos);
    await fixture.whenStable();
    http.expectOne('/api/clientes').flush(CLIENTES);
    http.expectOne('/api/pedidos?abertos=true').flush(ABERTOS);
    await esperar(fixture);
    return { fixture, html: fixture.nativeElement as HTMLElement };
  }

  const nomes = (html: HTMLElement) => [...html.querySelectorAll('.linha-titulo')].map(e => e.textContent);
  const botao = (html: HTMLElement, texto: string) =>
    [...html.querySelectorAll('button')].find(b => b.textContent?.includes(texto)) as HTMLButtonElement;
  const busca = (html: HTMLElement) => html.querySelector('input[type=search]') as HTMLInputElement;
  const seletor = (html: HTMLElement) => html.querySelector('select') as HTMLSelectElement;

  afterEach(() => http.verify());

  it('sem filtro lista os abertos, mostra o total e os botões Ver finalizados e novo pedido', async () => {
    const { html } = await criar();
    expect(html.querySelector('.subtitulo')?.textContent).toBe('3 em aberto');
    expect(nomes(html)).toEqual(['João da Silva', 'Maria Souza', 'Ônibus Ltda']);
    expect(botao(html, 'Ver todos os pedidos')).toBeUndefined();
    expect(botao(html, 'Ver finalizados')).toBeDefined();
    expect(html.querySelector('.btn-fab')?.getAttribute('aria-label')).toBe('Novo pedido');
  });

  it('enquanto carrega mostra "Carregando..."', async () => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: provedoresDeTela() });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(Pedidos);
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Carregando...');
    http.expectOne('/api/clientes').flush([]);
    http.expectOne('/api/pedidos?abertos=true').flush([]);
    await esperar(fixture);
    expect((fixture.nativeElement as HTMLElement).querySelector('.empty')?.textContent).toBe('Nenhum pedido em aberto.');
  });

  it('?filtro=prontos mostra só os prontos, com rótulo e botão Ver todos os pedidos (sem Ver finalizados)', async () => {
    const { html } = await criar({ filtro: 'prontos' });
    expect(html.querySelector('.subtitulo')?.textContent).toBe('Prontos — 1');
    expect(nomes(html)).toEqual(['Maria Souza']);
    expect(botao(html, 'Ver todos os pedidos')).toBeDefined();
    expect(botao(html, 'Ver finalizados')).toBeUndefined();
    botao(html, 'Ver todos os pedidos').click();
    expect(navegar).toHaveBeenCalledWith(['/pedidos']);
  });

  it('?filtro=hoje, atrasados e abertos', async () => {
    let r = await criar({ filtro: 'hoje' });
    expect(nomes(r.html)).toEqual(['João da Silva']);
    expect(r.html.querySelector('.subtitulo')?.textContent).toBe('Entregas hoje — 1');
    TestBed.resetTestingModule();
    r = await criar({ filtro: 'atrasados' });
    expect(nomes(r.html)).toEqual(['Ônibus Ltda']);
    expect(r.html.querySelector('.subtitulo')?.textContent).toBe('Atrasados — 1');
    TestBed.resetTestingModule();
    r = await criar({ filtro: 'abertos' });
    expect(r.html.querySelector('.subtitulo')?.textContent).toBe('Em aberto — 3');
  });

  it('filtro desconhecido é ignorado (lista tudo, sem botão Ver todos)', async () => {
    const { html } = await criar({ filtro: 'xyz' });
    expect(nomes(html).length).toBe(3);
    expect(html.querySelector('.subtitulo')?.textContent).toBe('3 em aberto');
    expect(botao(html, 'Ver todos os pedidos')).toBeUndefined();
  });

  it('filtro sem resultado mostra "Nenhum pedido nessa situação."', async () => {
    localStorage.clear();
    query = new BehaviorSubject(convertToParamMap({ filtro: 'hoje' }));
    TestBed.configureTestingModule({ providers: [...provedoresDeTela(), { provide: ActivatedRoute, useValue: { queryParamMap: query } }] });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(Pedidos);
    await fixture.whenStable();
    http.expectOne('/api/clientes').flush([]);
    http.expectOne('/api/pedidos?abertos=true').flush([pedido(5, 'X', 'Y')]);
    await esperar(fixture);
    expect((fixture.nativeElement as HTMLElement).querySelector('.empty')?.textContent).toBe('Nenhum pedido nessa situação.');
  });

  it('busca sem acento e sem maiúscula (cabecote acha Cabeçote) e também nos encerrados', async () => {
    const { fixture, html } = await criar();
    digitar(busca(html), 'cabecote');
    await esperar(fixture);
    http.expectOne('/api/pedidos/encerrados').flush(ENCERRADOS);
    await esperar(fixture);
    expect(html.querySelector('.subtitulo')?.textContent).toBe('1 em aberto encontrado');
    expect(html.querySelector('h2.secao')?.textContent).toBe('Finalizados');
    expect(nomes(html)).toEqual(['João da Silva', 'João da Silva']);
    expect(html.textContent).toContain('Cabeçote antigo');
    expect(html.textContent).not.toContain('Biela');
  });

  it('busca pelo nome do cliente (onibus acha Ônibus) e pelo nº do pedido (#0137)', async () => {
    const { fixture, html } = await criar();
    digitar(busca(html), 'onibus');
    await esperar(fixture);
    http.expectOne('/api/pedidos/encerrados').flush(ENCERRADOS);
    await esperar(fixture);
    expect(nomes(html)).toEqual(['Ônibus Ltda']);
    digitar(busca(html), '#0137');
    await esperar(fixture);
    expect(nomes(html)).toEqual(['Ônibus Ltda']);
    digitar(busca(html), 'zzz');
    await esperar(fixture);
    expect(html.querySelector('.subtitulo')?.textContent).toBe('0 em aberto encontrados');
    expect(html.querySelector('.empty')?.textContent).toBe('Nenhum pedido em aberto encontrado.');
  });

  it('os encerrados são buscados uma vez só, mesmo digitando mais', async () => {
    const { fixture, html } = await criar();
    digitar(busca(html), 'a');
    await esperar(fixture);
    digitar(busca(html), 'ab');
    await esperar(fixture);
    http.expectOne('/api/pedidos/encerrados').flush(ENCERRADOS);
    await esperar(fixture);
    digitar(busca(html), 'abc');
    await esperar(fixture);
    http.expectNone('/api/pedidos/encerrados');
  });

  it('apagar a busca volta ao subtítulo e à lista completa', async () => {
    const { fixture, html } = await criar();
    digitar(busca(html), 'maria');
    await esperar(fixture);
    http.expectOne('/api/pedidos/encerrados').flush([]);
    await esperar(fixture);
    expect(nomes(html)).toEqual(['Maria Souza']);
    digitar(busca(html), '');
    await esperar(fixture);
    expect(html.querySelector('.subtitulo')?.textContent).toBe('3 em aberto');
    expect(nomes(html).length).toBe(3);
  });

  it('?cliente=ID filtra pelo cliente, busca os encerrados dele e o select vem sem "Carregando..." depois dos clientes', async () => {
    const { fixture, html } = await criar({ cliente: '10' });
    http.expectOne('/api/pedidos/encerrados').flush(ENCERRADOS);
    await esperar(fixture);
    expect(seletor(html).value).toBe('10');
    expect([...seletor(html).options].map(o => o.textContent)).toEqual(['Todos os clientes', 'João da Silva', 'Maria Souza', 'Ônibus Ltda']);
    expect(html.querySelector('.subtitulo')?.textContent).toBe('1 em aberto encontrado');
    expect(nomes(html)).toEqual(['João da Silva', 'João da Silva']); // 1 aberto + 1 finalizado dele
    expect(html.querySelectorAll('h2.secao').length).toBe(1);
  });

  it('trocar o select de cliente filtra; "Todos os clientes" volta à lista', async () => {
    const { fixture, html } = await criar();
    const sel = seletor(html);
    digitar(sel, '20');
    await esperar(fixture);
    http.expectOne('/api/pedidos/encerrados').flush([]);
    await esperar(fixture);
    expect(nomes(html)).toEqual(['Maria Souza']);
    digitar(sel, '');
    await esperar(fixture);
    expect(nomes(html).length).toBe(3);
  });

  it('cliente da URL que não existe mais cai em "Todos os clientes"', async () => {
    const { html } = await criar({ cliente: '777' });
    http.match('/api/pedidos/encerrados').forEach(r => r.flush([])); // pode ter disparado com o id antigo, conforme a ordem das respostas
    expect(seletor(html).value).toBe('');
  });

  it('?cliente tem prioridade e ignora ?filtro (um por vez, como o regex do app atual)', async () => {
    const { fixture, html } = await criar({ cliente: '20', filtro: 'atrasados' });
    http.expectOne('/api/pedidos/encerrados').flush([]);
    await esperar(fixture);
    expect(nomes(html)).toEqual(['Maria Souza']);
    expect(botao(html, 'Ver todos os pedidos')).toBeUndefined();
  });

  it('trocar a query (Ver todos) refaz o estado: limpa busca e cliente', async () => {
    const { fixture, html } = await criar({ filtro: 'prontos' });
    digitar(busca(html), 'maria');
    await esperar(fixture);
    http.expectOne('/api/pedidos/encerrados').flush([]);
    query.next(convertToParamMap({}));
    await esperar(fixture);
    expect(busca(html).value).toBe('');
    expect(html.querySelector('.subtitulo')?.textContent).toBe('3 em aberto');
  });

  it('navegação: clicar numa linha abre o pedido; Ver finalizados e o + levam às telas certas', async () => {
    const { html } = await criar();
    (html.querySelector('.linha') as HTMLElement).click();
    expect(navegar).toHaveBeenCalledWith(['/pedidos', 1]);
    botao(html, 'Ver finalizados').click();
    expect(navegar).toHaveBeenCalledWith(['/encerrados']);
    (html.querySelector('.btn-fab') as HTMLElement).click();
    expect(navegar).toHaveBeenCalledWith(['/pedidos/novo']);
  });

  describe('rascunhos do pedido ("Pedido incompleto")', () => {
    const comRascunhos = () => {
      localStorage.setItem(CHAVE_AUTH, JSON.stringify({ token: tokenDeTeste({ usuarioId: 7, empresaId: 3 }) }));
      gravarRascunhosDeTeste({
        novo: { quando: Date.now() - 5 * 60_000, titulo: 'Maria · Retífica' },
        'pedido:2': { quando: Date.now() - 30 * 60_000, titulo: 'Maria Souza' },
      });
    };

    it('mostra os cartões depois do título e antes da busca', async () => {
      const { html } = await criar({}, comRascunhos);
      const cartoes = [...html.querySelectorAll('.card-destaque')];
      expect(cartoes.map(c => c.querySelector('.card-destaque-titulo')!.textContent)).toEqual(['Pedido incompleto', 'Alterações não salvas · pedido #2']);
      expect(html.querySelector('.subtitulo')!.compareDocumentPosition(cartoes[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(cartoes[0].compareDocumentPosition(busca(html)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('com filtro na URL os cartões continuam aparecendo (abaixo do "Ver todos os pedidos")', async () => {
      const { html } = await criar({ filtro: 'prontos' }, comRascunhos);
      expect(html.querySelectorAll('.card-destaque').length).toBe(2);
      expect(botao(html, 'Ver todos os pedidos').compareDocumentPosition(html.querySelector('.card-destaque')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('sem rascunhos não aparece nada', async () => {
      const { html } = await criar();
      expect(html.querySelector('.card-destaque')).toBeNull();
    });

    it('Continuar leva ao formulário e Descartar pede confirmação', async () => {
      const { fixture, html } = await criar({}, comRascunhos);
      const ir = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
      botao(html, 'Continuar').click();
      expect(ir).toHaveBeenCalledWith('/pedidos/novo');
      botao(html, 'Descartar').click();
      await esperar(fixture);
      expect(TestBed.inject(DialogoService).dialogos().at(-1)!.mensagem).toBe('Descartar este rascunho? O que foi digitado será perdido.');
    });
  });
});
