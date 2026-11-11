import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { CacheService } from '../../core/cache.service';
import { DialogoService } from '../../core/dialogo.service';
import { digitar, esperar, provedoresDeTela } from '../../testing/ajuda';
import { Cabecotes } from './cabecotes';

const PATH = '/api/cabecotes';
const CATEGORIAS = [{ nome: 'CABECOTE', rotulo: 'Cabeçote' }, { nome: 'BLOCO', rotulo: 'Bloco' }];
const PRODUTOS = [
  { id: 1, categoria: 'CABECOTE', categoriaRotulo: 'Cabeçote', nome: 'AP 1.8', movelFaixa: '25,045-27,070', fixoFaixa: null },
  { id: 2, categoria: 'CABECOTE', categoriaRotulo: 'Cabeçote', nome: 'Fire 16V', movelFaixa: null, fixoFaixa: '29,990-30,015' },
  { id: 3, categoria: 'BLOCO', categoriaRotulo: 'Bloco', nome: 'OM 366', movelFaixa: null, fixoFaixa: null },
];

describe('Cabecotes (Produtos)', () => {
  let http: HttpTestingController;
  let dialogo: DialogoService;
  let cache: CacheService;

  async function criar(produtos: unknown[] = PRODUTOS) {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: provedoresDeTela() });
    http = TestBed.inject(HttpTestingController);
    dialogo = TestBed.inject(DialogoService);
    cache = TestBed.inject(CacheService);
    const fixture = TestBed.createComponent(Cabecotes);
    http.expectOne(PATH).flush(produtos);
    http.expectOne('/api/categorias').flush(CATEGORIAS);
    await esperar(fixture);
    return { fixture, html: fixture.nativeElement as HTMLElement };
  }

  const botao = (html: HTMLElement, texto: string) =>
    [...html.querySelectorAll('button')].find(b => b.textContent?.includes(texto)) as HTMLButtonElement;
  const enviar = (html: HTMLElement) => html.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
  const campo = (html: HTMLElement, placeholder: string) =>
    html.querySelector(`form input[placeholder^="${placeholder}"]`) as HTMLInputElement;

  afterEach(() => http.verify());

  it('lista agrupada por categoria com as faixas', async () => {
    const { html } = await criar();
    expect(html.querySelector('.titulo')?.textContent).toBe('Produtos');
    expect(html.querySelector('.subtitulo')?.textContent).toBe('Cabeçotes, blocos, bielas e virabrequins — 3 cadastrados');
    // ordenado por nome, agrupado na ordem em que a categoria aparece
    expect([...html.querySelectorAll('.grupo-categoria h3')].map(h => h.textContent)).toEqual(['Cabeçote', 'Bloco']);
    const primeira = html.querySelector('.grupo-categoria .linha')!;
    expect(primeira.querySelector('.linha-titulo')?.textContent).toBe('AP 1.8');
    expect(primeira.textContent).toContain('25,045-27,070 mm');
    expect(primeira.textContent).toContain('—');
  });

  it('lista vazia mostra a mensagem', async () => {
    const { html } = await criar([]);
    expect(html.querySelector('.empty')?.textContent).toBe('Nada cadastrado ainda.');
  });

  it('busca por palavras sem acento/maiúscula, com atraso', async () => {
    const { fixture, html } = await criar();
    const busca = html.querySelector('input[type=search]') as HTMLInputElement;
    digitar(busca, 'fire 16');
    await new Promise(r => setTimeout(r, 200));
    await esperar(fixture);
    expect(html.querySelectorAll('.grupo-categoria .linha').length).toBe(1);
    expect(html.textContent).toContain('Fire 16V');
    digitar(busca, 'xyz');
    await new Promise(r => setTimeout(r, 200));
    await esperar(fixture);
    expect(html.querySelector('.empty')?.textContent).toBe('Nenhum produto com esse nome.');
  });

  it('"Mostrar mais" acrescenta o próximo lote de 100', async () => {
    const muitos = Array.from({ length: 130 }, (_, i) => ({
      id: i + 1, categoria: 'CABECOTE', categoriaRotulo: 'Cabeçote', nome: 'Motor ' + String(i + 1).padStart(3, '0'),
    }));
    const { fixture, html } = await criar(muitos);
    expect(html.querySelectorAll('.grupo-categoria .linha').length).toBe(100);
    botao(html, 'Mostrar mais (30 restantes)').click();
    await esperar(fixture);
    expect(html.querySelectorAll('.grupo-categoria .linha').length).toBe(130);
    expect(botao(html, 'Mostrar mais')).toBeUndefined();
  });

  it('cadastrar manda POST com faixas nulas quando em branco, invalida o cache e recarrega', async () => {
    const { fixture, html } = await criar();
    const invalidar = vi.spyOn(cache, 'invalidar');
    botao(html, 'Novo produto').click();
    await esperar(fixture);
    digitar(html.querySelector('form select') as HTMLSelectElement, 'BLOCO');
    digitar(campo(html, 'Nome / Motor'), '  Gol 1.0 ');
    digitar(campo(html, 'Fixo'), ' 1,5-2 ');
    enviar(html);
    const req = http.expectOne(r => r.method === 'POST' && r.url === PATH);
    expect(req.request.body).toEqual({ categoria: 'BLOCO', nome: 'Gol 1.0', movelFaixa: null, fixoFaixa: '1,5-2' });
    req.flush({ id: 9 });
    await esperar(fixture, 2);
    expect(invalidar).toHaveBeenCalledWith(PATH);
    expect(dialogo.toastTexto()).toBe('Salvo.');
    http.expectOne(PATH).flush(PRODUTOS);
    await esperar(fixture);
  });

  it('editar abre preenchido e manda PUT', async () => {
    const { fixture, html } = await criar();
    (html.querySelector('.grupo-categoria .linha') as HTMLElement).click();
    await esperar(fixture);
    expect(html.querySelector('.caixa-form-titulo')?.textContent).toBe('Editar produto');
    expect(campo(html, 'Nome / Motor').value).toBe('AP 1.8');
    expect(campo(html, 'Móvel').value).toBe('25,045-27,070');
    digitar(campo(html, 'Fixo'), '30');
    enviar(html);
    const req = http.expectOne(r => r.method === 'PUT' && r.url === PATH + '/1');
    expect(req.request.body).toEqual({ categoria: 'CABECOTE', nome: 'AP 1.8', movelFaixa: '25,045-27,070', fixoFaixa: '30' });
    req.flush({});
    await esperar(fixture, 2);
    http.expectOne(PATH).flush(PRODUTOS);
  });

  it('sem nome não envia', async () => {
    const { fixture, html } = await criar();
    botao(html, 'Novo produto').click();
    await esperar(fixture);
    enviar(html);
    expect(dialogo.toastTexto()).toBe('Informe o nome.');
  });

  it('remover: confirma, DELETE e recarrega', async () => {
    const { fixture, html } = await criar();
    (html.querySelector('.grupo-categoria .linha') as HTMLElement).click();
    await esperar(fixture);
    botao(html, 'Remover').click();
    await esperar(fixture, 1);
    expect(dialogo.dialogos().at(-1)?.mensagem).toBe('Remover este produto?');
    dialogo.dialogos().at(-1)!.responder(true);
    await esperar(fixture, 1);
    http.expectOne(r => r.method === 'DELETE' && r.url === PATH + '/1').flush(null, { status: 204, statusText: 'No Content' });
    await esperar(fixture, 2);
    expect(dialogo.toastTexto()).toBe('Removido.');
    http.expectOne(PATH).flush(PRODUTOS.slice(1));
  });

  it('remover com 409 avisa que o modelo está em pedidos e mantém o formulário', async () => {
    const { fixture, html } = await criar();
    (html.querySelector('.grupo-categoria .linha') as HTMLElement).click();
    await esperar(fixture);
    botao(html, 'Remover').click();
    await esperar(fixture, 1);
    dialogo.dialogos().at(-1)!.responder(true);
    await esperar(fixture, 1);
    http.expectOne(r => r.method === 'DELETE').flush({ erro: 'em uso' }, { status: 409, statusText: 'Conflict' });
    await esperar(fixture, 2);
    expect(dialogo.toastTexto()).toBe('Não foi possível remover: esse modelo está em pedidos.');
    expect(dialogo.toastErro()).toBe(true);
    expect((html.querySelector('.caixa-form') as HTMLElement).hidden).toBe(false);
  });
});
