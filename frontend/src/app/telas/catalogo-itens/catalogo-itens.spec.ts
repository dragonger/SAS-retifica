import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { CacheService } from '../../core/cache.service';
import { DialogoService } from '../../core/dialogo.service';
import { digitar, esperar, provedoresDeTela } from '../../testing/ajuda';
import { CatalogoItens } from './catalogo-itens';

const CATEGORIAS = [{ nome: 'CABECOTE', rotulo: 'Cabeçote' }, { nome: 'BLOCO', rotulo: 'Bloco' }];
const SERVICOS = [
  { id: 1, categoria: 'CABECOTE', categoriaRotulo: 'Cabeçote', nome: 'Retífica de sede', valor: 120 },
  { id: 2, categoria: 'BLOCO', categoriaRotulo: 'Bloco', nome: 'Brunimento', valor: 80.5 },
];

describe('CatalogoItens', () => {
  let http: HttpTestingController;
  let dialogo: DialogoService;
  let cache: CacheService;

  async function criar(tipo: 'servicos' | 'pecas' = 'servicos') {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [...provedoresDeTela(), { provide: ActivatedRoute, useValue: { snapshot: { data: { tipo } } } }],
    });
    http = TestBed.inject(HttpTestingController);
    dialogo = TestBed.inject(DialogoService);
    cache = TestBed.inject(CacheService);
    const base = tipo === 'servicos' ? '/api/servicos-catalogo' : '/api/pecas-catalogo';
    const fixture = TestBed.createComponent(CatalogoItens);
    http.expectOne(base).flush(tipo === 'servicos' ? SERVICOS : []);
    http.expectOne('/api/categorias').flush(CATEGORIAS);
    await esperar(fixture);
    return { fixture, html: fixture.nativeElement as HTMLElement, base };
  }

  const botao = (html: HTMLElement, texto: string) =>
    [...html.querySelectorAll('button')].find(b => b.textContent?.includes(texto)) as HTMLButtonElement;

  async function abrirNovo(fixture: Awaited<ReturnType<typeof criar>>['fixture'], html: HTMLElement, rotulo: string) {
    botao(html, rotulo).click();
    await esperar(fixture);
  }

  const campos = (html: HTMLElement) => ({
    categoria: html.querySelector('form select') as HTMLSelectElement,
    nome: html.querySelector('form input[type=text]') as HTMLInputElement,
    valor: html.querySelector('form input[type=number]') as HTMLInputElement,
    form: html.querySelector('form') as HTMLFormElement,
  });

  const enviar = (form: HTMLFormElement) => form.dispatchEvent(new Event('submit', { cancelable: true }));

  afterEach(() => http.verify());

  it('mostra a lista agrupada por categoria com o valor', async () => {
    const { html } = await criar();
    expect(html.querySelector('.titulo')?.textContent).toBe('Serviços');
    expect(html.querySelector('.subtitulo')?.textContent).toBe('2 cadastrados');
    expect([...html.querySelectorAll('.grupo-categoria h3')].map(h => h.textContent)).toEqual(['Cabeçote', 'Bloco']);
    expect(html.querySelectorAll('.grupo-categoria .linha').length).toBe(2);
    expect(html.textContent).toContain('Retífica de sede');
    expect(html.textContent).toContain('R$ 80,50');
  });

  it('peças: título, lista vazia e mensagem', async () => {
    const { html } = await criar('pecas');
    expect(html.querySelector('.titulo')?.textContent).toBe('Peças');
    expect(html.querySelector('.empty')?.textContent).toBe('Nada cadastrado ainda.');
    expect(botao(html, 'Nova peça')).toBeTruthy();
  });

  it('cadastrar manda POST com o mesmo corpo do app atual, invalida o cache e recarrega', async () => {
    const { fixture, html, base } = await criar();
    const invalidar = vi.spyOn(cache, 'invalidar');
    await abrirNovo(fixture, html, 'Novo serviço');
    const c = campos(html);
    expect(html.querySelector('.caixa-form-titulo')?.textContent).toBe('Novo serviço');
    digitar(c.categoria, 'BLOCO');
    digitar(c.nome, '  Plainar bloco ');
    digitar(c.valor, '150.5');
    enviar(c.form);
    const req = http.expectOne(r => r.method === 'POST' && r.url === base);
    expect(req.request.body).toEqual({ categoria: 'BLOCO', nome: 'Plainar bloco', valor: 150.5 });
    req.flush({ id: 3 });
    await esperar(fixture, 2);
    expect(invalidar).toHaveBeenCalledWith(base);
    expect(dialogo.toastTexto()).toBe('Salvo.');
    http.expectOne(base).flush([...SERVICOS, { id: 3, categoria: 'BLOCO', categoriaRotulo: 'Bloco', nome: 'Plainar bloco', valor: 150.5 }]);
    await esperar(fixture);
    expect(html.querySelector('.subtitulo')?.textContent).toBe('3 cadastrados');
    expect((html.querySelector('.caixa-form') as HTMLElement).hidden).toBe(true);
  });

  it('valor em branco vai como 0', async () => {
    const { fixture, html, base } = await criar();
    await abrirNovo(fixture, html, 'Novo serviço');
    const c = campos(html);
    digitar(c.nome, 'Teste');
    enviar(c.form);
    const req = http.expectOne(r => r.method === 'POST' && r.url === base);
    expect(req.request.body).toEqual({ categoria: 'CABECOTE', nome: 'Teste', valor: 0 });
    req.flush({});
    await esperar(fixture, 2);
    http.expectOne(base).flush(SERVICOS);
  });

  it('editar abre preenchido e manda PUT no id', async () => {
    const { fixture, html, base } = await criar();
    (html.querySelectorAll('.grupo-categoria .linha')[1] as HTMLElement).click();
    await esperar(fixture);
    const c = campos(html);
    expect(html.querySelector('.caixa-form-titulo')?.textContent).toBe('Editar serviço');
    expect(c.nome.value).toBe('Brunimento');
    expect(c.valor.value).toBe('80.5');
    expect(c.categoria.value).toBe('BLOCO');
    digitar(c.valor, '90');
    enviar(c.form);
    const req = http.expectOne(r => r.method === 'PUT' && r.url === base + '/2');
    expect(req.request.body).toEqual({ categoria: 'BLOCO', nome: 'Brunimento', valor: 90 });
    req.flush({});
    await esperar(fixture, 2);
    http.expectOne(base).flush(SERVICOS);
  });

  it('nome vazio não envia e avisa', async () => {
    const { fixture, html } = await criar();
    await abrirNovo(fixture, html, 'Novo serviço');
    enviar(campos(html).form);
    expect(dialogo.toastTexto()).toBe('Informe o nome.');
    expect(dialogo.toastErro()).toBe(true);
  });

  it('bloqueia nome repetido na mesma categoria (sem diferenciar maiúsculas) mas aceita em outra', async () => {
    const { fixture, html, base } = await criar();
    await abrirNovo(fixture, html, 'Novo serviço');
    const c = campos(html);
    digitar(c.categoria, 'CABECOTE');
    digitar(c.nome, ' RETÍFICA DE SEDE');
    enviar(c.form);
    expect(dialogo.toastTexto()).toBe('Já existe um serviço com esse nome nessa categoria.');
    http.expectNone(r => r.method === 'POST');

    digitar(c.categoria, 'BLOCO');
    enviar(c.form);
    http.expectOne(r => r.method === 'POST' && r.url === base).flush({});
    await esperar(fixture, 2);
    http.expectOne(base).flush(SERVICOS);
  });

  it('peças: mensagem de nome repetido no feminino', async () => {
    const { fixture, html, base } = await criar('pecas');
    expect(base).toBe('/api/pecas-catalogo');
    // a lista de peças veio vazia; força uma repetida pelo cache da tela
    (fixture.componentInstance as unknown as { lista: { set(v: unknown): void } }).lista.set([
      { id: 9, categoria: 'CABECOTE', categoriaRotulo: 'Cabeçote', nome: 'Junta', valor: 10 },
    ]);
    await abrirNovo(fixture, html, 'Nova peça');
    const c = campos(html);
    digitar(c.nome, 'junta');
    enviar(c.form);
    expect(dialogo.toastTexto()).toBe('Já existe uma peça com esse nome nessa categoria.');
  });

  it('remover pede confirmação, manda DELETE e recarrega', async () => {
    const { fixture, html, base } = await criar();
    (html.querySelectorAll('.grupo-categoria .linha')[0] as HTMLElement).click();
    await esperar(fixture);
    botao(html, 'Remover').click();
    await esperar(fixture, 1);
    expect(dialogo.dialogos().at(-1)?.mensagem).toBe('Remover este item do catálogo?');
    dialogo.dialogos().at(-1)!.responder(true);
    await esperar(fixture, 1);
    http.expectOne(r => r.method === 'DELETE' && r.url === base + '/1').flush(null, { status: 204, statusText: 'No Content' });
    await esperar(fixture, 2);
    expect(dialogo.toastTexto()).toBe('Removido.');
    http.expectOne(base).flush([SERVICOS[1]]);
    await esperar(fixture);
    expect(html.querySelector('.subtitulo')?.textContent).toBe('1 cadastrado');
  });

  it('remover cancelado não manda nada', async () => {
    const { fixture, html } = await criar();
    (html.querySelectorAll('.grupo-categoria .linha')[0] as HTMLElement).click();
    await esperar(fixture);
    botao(html, 'Remover').click();
    await esperar(fixture, 1);
    dialogo.dialogos().at(-1)!.responder(false);
    await esperar(fixture, 1);
    http.expectNone(r => r.method === 'DELETE');
  });

  it('guarda de saída: formulário alterado fica "sujo"; aberto sem mexer, não', async () => {
    const { fixture, html } = await criar();
    const tela = fixture.componentInstance;
    expect(tela.guardaSaida()?.sujo()).toBe(false);
    await abrirNovo(fixture, html, 'Novo serviço');
    expect(tela.guardaSaida()?.sujo()).toBe(false);
    digitar(campos(html).nome, 'x');
    expect(tela.guardaSaida()?.sujo()).toBe(true);
  });

  it('Cancelar com alterações pergunta antes de descartar', async () => {
    const { fixture, html } = await criar();
    await abrirNovo(fixture, html, 'Novo serviço');
    digitar(campos(html).nome, 'x');
    botao(html, 'Cancelar').click();
    await esperar(fixture, 1);
    expect(dialogo.dialogos().at(-1)?.mensagem).toContain('alterações que ainda não foram salvas');
    dialogo.dialogos().at(-1)!.responder(false); // Continuar editando
    await esperar(fixture, 1);
    expect((html.querySelector('.caixa-form') as HTMLElement).hidden).toBe(false);
    botao(html, 'Cancelar').click();
    await esperar(fixture, 1);
    dialogo.dialogos().at(-1)!.responder(true); // Descartar
    await esperar(fixture, 1);
    expect((html.querySelector('.caixa-form') as HTMLElement).hidden).toBe(true);
  });
});
