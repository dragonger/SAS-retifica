import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { CacheService } from '../../core/cache.service';
import { DialogoService } from '../../core/dialogo.service';
import { digitar, esperar, provedoresDeTela } from '../../testing/ajuda';
import { Clientes } from './clientes';

const PATH = '/api/clientes';
const CLIENTES = [
  { id: 7, nome: 'Oficina Silva', telefone: '31985565586', rua: 'Rua A', numero: '10', bairro: 'Centro', cep: '30000-000', municipio: 'BH', uf: 'MG' },
  { id: 8, nome: 'Ana Souza', telefone: null },
];

describe('Clientes', () => {
  let http: HttpTestingController;
  let dialogo: DialogoService;
  let cache: CacheService;

  async function criar() {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: provedoresDeTela() });
    http = TestBed.inject(HttpTestingController);
    dialogo = TestBed.inject(DialogoService);
    cache = TestBed.inject(CacheService);
    const fixture = TestBed.createComponent(Clientes);
    http.expectOne(PATH).flush(CLIENTES);
    await esperar(fixture);
    return { fixture, html: fixture.nativeElement as HTMLElement };
  }

  const botao = (html: HTMLElement, texto: string) =>
    [...html.querySelectorAll('button')].find(b => b.textContent?.includes(texto)) as HTMLButtonElement;
  const enviar = (html: HTMLElement) => html.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
  const campos = (html: HTMLElement) => [...html.querySelectorAll<HTMLInputElement>('form input')];

  afterEach(() => http.verify());

  it('lista os clientes com o telefone formatado', async () => {
    const { html } = await criar();
    expect(html.querySelector('.subtitulo')?.textContent).toBe('2 cadastrados');
    const linhas = [...html.querySelectorAll('.linha')];
    expect(linhas.length).toBe(2);
    expect(linhas[0].textContent).toContain('Oficina Silva');
    expect(linhas[0].textContent).toContain('(31) 98556-5586');
    expect(linhas[1].querySelector('.linha-sub')?.textContent).toBe('-');
  });

  it('busca por nome e por telefone (ignorando a formatação)', async () => {
    const { fixture, html } = await criar();
    const busca = html.querySelector('input[type=search]') as HTMLInputElement;
    digitar(busca, 'ana');
    await esperar(fixture);
    expect(html.querySelectorAll('.linha').length).toBe(1);
    digitar(busca, '9855');
    await esperar(fixture);
    expect(html.querySelectorAll('.linha').length).toBe(1);
    expect(html.textContent).toContain('Oficina Silva');
  });

  it('busca sem resultado mostra a mensagem', async () => {
    const { fixture, html } = await criar();
    digitar(html.querySelector('input[type=search]') as HTMLInputElement, 'zzz');
    await esperar(fixture);
    expect(html.querySelector('.empty')?.textContent).toBe('Nenhum cliente encontrado.');
  });

  it('cadastrar manda POST com campos vazios como null e aplica a máscara no telefone', async () => {
    const { fixture, html } = await criar();
    const invalidar = vi.spyOn(cache, 'invalidar');
    botao(html, 'Novo cliente').click();
    await esperar(fixture);
    const [nome, telefone] = campos(html);
    expect(html.querySelector('.caixa-form-titulo')?.textContent).toBe('Novo cliente');
    digitar(nome, '  Carlos ');
    digitar(telefone, '31999015257');
    expect(telefone.value).toBe('(31) 99901-5257');
    enviar(html);
    const req = http.expectOne(r => r.method === 'POST' && r.url === PATH);
    expect(req.request.body).toEqual({
      nome: 'Carlos', telefone: '(31) 99901-5257', rua: null, numero: null, bairro: null, cep: null, municipio: null, uf: null,
    });
    req.flush({ id: 9 });
    await esperar(fixture, 2);
    expect(invalidar).toHaveBeenCalledWith(PATH);
    expect(dialogo.toastTexto()).toBe('Cliente salvo.');
    http.expectOne(PATH).flush(CLIENTES);
  });

  it('sem nome não envia', async () => {
    const { fixture, html } = await criar();
    botao(html, 'Novo cliente').click();
    await esperar(fixture);
    enviar(html);
    expect(dialogo.toastTexto()).toBe('Informe o nome do cliente.');
  });

  it('editar abre preenchido, mostra "Ver pedidos" e manda PUT', async () => {
    const { fixture, html } = await criar();
    expect(botao(html, 'Ver pedidos deste cliente').hidden).toBe(true);
    (html.querySelector('.linha') as HTMLElement).click();
    await esperar(fixture);
    expect(html.querySelector('.caixa-form-titulo')?.textContent).toBe('Editar cliente');
    const c = campos(html);
    expect(c[0].value).toBe('Oficina Silva');
    expect(c[1].value).toBe('(31) 98556-5586');
    expect(c[2].value).toBe('Rua A');
    expect(botao(html, 'Ver pedidos deste cliente').hidden).toBe(false);
    digitar(c[0], 'Oficina Silva 2');
    enviar(html);
    const req = http.expectOne(r => r.method === 'PUT' && r.url === PATH + '/7');
    expect(req.request.body.nome).toBe('Oficina Silva 2');
    expect(req.request.body.telefone).toBe('(31) 98556-5586');
    req.flush({});
    await esperar(fixture, 2);
    http.expectOne(PATH).flush(CLIENTES);
  });

  it('"Ver pedidos deste cliente" vai para #/pedidos?cliente=ID', async () => {
    const { fixture, html } = await criar();
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    (html.querySelector('.linha') as HTMLElement).click();
    await esperar(fixture);
    botao(html, 'Ver pedidos deste cliente').click();
    expect(navegar).toHaveBeenCalledWith(['/pedidos'], { queryParams: { cliente: 7 } });
  });

  it('remover confirma e recarrega', async () => {
    const { fixture, html } = await criar();
    (html.querySelector('.linha') as HTMLElement).click();
    await esperar(fixture);
    botao(html, 'Remover').click();
    await esperar(fixture, 1);
    expect(dialogo.dialogos().at(-1)?.mensagem).toBe('Remover este cliente?');
    dialogo.dialogos().at(-1)!.responder(true);
    await esperar(fixture, 1);
    http.expectOne(r => r.method === 'DELETE' && r.url === PATH + '/7').flush(null, { status: 204, statusText: 'No Content' });
    await esperar(fixture, 2);
    expect(dialogo.toastTexto()).toBe('Removido.');
    http.expectOne(PATH).flush([CLIENTES[1]]);
    await esperar(fixture);
    expect(html.querySelector('.subtitulo')?.textContent).toBe('1 cadastrado');
  });

  it('remover com 409 avisa que há pedidos vinculados', async () => {
    const { fixture, html } = await criar();
    (html.querySelector('.linha') as HTMLElement).click();
    await esperar(fixture);
    botao(html, 'Remover').click();
    await esperar(fixture, 1);
    dialogo.dialogos().at(-1)!.responder(true);
    await esperar(fixture, 1);
    http.expectOne(r => r.method === 'DELETE').flush({}, { status: 409, statusText: 'Conflict' });
    await esperar(fixture, 2);
    expect(dialogo.toastTexto()).toBe('Não foi possível remover: cliente tem pedidos vinculados.');
    expect(dialogo.toastErro()).toBe(true);
  });

  it('guarda de saída avisa quando o formulário foi alterado', async () => {
    const { fixture, html } = await criar();
    botao(html, 'Novo cliente').click();
    await esperar(fixture);
    expect(fixture.componentInstance.guardaSaida()?.sujo()).toBe(false);
    digitar(campos(html)[0], 'x');
    expect(fixture.componentInstance.guardaSaida()?.sujo()).toBe(true);
  });
});
