import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { CHAVE_AUTH, CHAVE_LOGO } from '../../core/auth.service';
import { DialogoService } from '../../core/dialogo.service';
import { OrcamentoCacheService } from '../../core/orcamento-cache.service';
import { digitar, esperar, provedoresDeTela } from '../../testing/ajuda';
import { Empresa } from './empresa';

const DADOS = { nome: 'DIH Retífica', telefone: '31985565586', instagram: 'dih', slogan: 'Qualidade' };

describe('Empresa', () => {
  let http: HttpTestingController;
  let dialogo: DialogoService;
  let orcamentos: OrcamentoCacheService;

  async function criar(logoGuardada = false) {
    localStorage.clear();
    localStorage.setItem(CHAVE_AUTH, JSON.stringify({ token: 't', empresaNome: 'DIH Retífica' }));
    if (logoGuardada) localStorage.setItem(CHAVE_LOGO, JSON.stringify({ versao: 'v1', dataUrl: 'data:image/png;base64,AAAA' }));
    TestBed.configureTestingModule({ providers: provedoresDeTela() });
    http = TestBed.inject(HttpTestingController);
    dialogo = TestBed.inject(DialogoService);
    orcamentos = TestBed.inject(OrcamentoCacheService);
    const fixture = TestBed.createComponent(Empresa);
    http.expectOne('/api/empresa').flush(DADOS);
    await esperar(fixture);
    return { fixture, html: fixture.nativeElement as HTMLElement };
  }

  const botao = (html: HTMLElement, texto: string) =>
    [...html.querySelectorAll('button')].find(b => b.textContent?.includes(texto)) as HTMLButtonElement;
  const seletor = (html: HTMLElement) => html.querySelector('input[type=file]') as HTMLInputElement;
  const campo = (html: HTMLElement, placeholder: string) =>
    html.querySelector(`input[placeholder^="${placeholder}"]`) as HTMLInputElement;

  function escolherArquivo(html: HTMLElement, arquivo: File) {
    const input = seletor(html);
    Object.defineProperty(input, 'files', { value: [arquivo], configurable: true });
    input.dispatchEvent(new Event('change'));
  }

  afterEach(() => http.verify());

  it('carrega os dados do servidor (telefone formatado) e mostra "sem logo"', async () => {
    const { html } = await criar();
    expect(campo(html, 'Nome da empresa').value).toBe('DIH Retífica');
    expect(campo(html, 'WhatsApp').value).toBe('(31) 98556-5586');
    expect(campo(html, 'Instagram').value).toBe('dih');
    expect(campo(html, 'Frase').value).toBe('Qualidade');
    expect((html.querySelector('.empty') as HTMLElement).hidden).toBe(false);
    expect((html.querySelector('.logo-previa') as HTMLElement).hidden).toBe(true);
    expect(botao(html, 'Remover logo').hidden).toBe(true);
  });

  it('com logo guardada mostra a prévia e o botão de remover', async () => {
    const { html } = await criar(true);
    const previa = html.querySelector('.logo-previa') as HTMLImageElement;
    expect(previa.hidden).toBe(false);
    expect(previa.getAttribute('src')).toBe('data:image/png;base64,AAAA');
    expect(botao(html, 'Remover logo').hidden).toBe(false);
  });

  it('salvar dados manda PUT /api/empresa com os 4 campos, invalida os orçamentos e recarrega a identidade', async () => {
    const { fixture, html } = await criar();
    const invalidar = vi.spyOn(orcamentos, 'invalidarTodos');
    digitar(campo(html, 'Nome da empresa'), 'DIH Nova');
    digitar(campo(html, 'Instagram'), 'dihnova');
    expect(fixture.componentInstance.guardaSaida().sujo()).toBe(true);
    botao(html, 'Salvar dados').click();
    const req = http.expectOne(r => r.method === 'PUT' && r.url === '/api/empresa');
    expect(req.request.body).toEqual({ nome: 'DIH Nova', telefone: '(31) 98556-5586', instagram: 'dihnova', slogan: 'Qualidade' });
    req.flush({});
    await esperar(fixture, 2);
    expect(invalidar).toHaveBeenCalled();
    http.expectOne(r => r.method === 'GET' && r.url === '/api/empresa').flush({ nome: 'DIH Nova' }); // carregarIdentidade
    await esperar(fixture);
    expect(dialogo.toastTexto()).toBe('Dados salvos.');
    expect(fixture.componentInstance.guardaSaida().sujo()).toBe(false);
    expect(JSON.parse(localStorage.getItem(CHAVE_AUTH)!).empresaNome).toBe('DIH Nova');
  });

  it('erro 400 ao salvar mostra a mensagem do servidor e não zera a guarda', async () => {
    const { fixture, html } = await criar();
    digitar(campo(html, 'Nome da empresa'), '');
    botao(html, 'Salvar dados').click();
    http.expectOne(r => r.method === 'PUT').flush({ erro: 'Informe o nome da empresa.' }, { status: 400, statusText: 'Bad Request' });
    await esperar(fixture, 2);
    expect(dialogo.toastTexto()).toBe('Informe o nome da empresa.');
    expect(dialogo.toastErro()).toBe(true);
    expect(fixture.componentInstance.guardaSaida().sujo()).toBe(true);
  });

  it('guarda de saída: sem alteração não é sujo', async () => {
    const { fixture } = await criar();
    expect(fixture.componentInstance.guardaSaida().sujo()).toBe(false);
  });

  it('enviar logo: multipart no campo "logo" em PUT /api/empresa/logo e atualiza a identidade', async () => {
    const { fixture, html } = await criar();
    const invalidar = vi.spyOn(orcamentos, 'invalidarTodos');
    const arquivo = new File([new Uint8Array([1, 2, 3])], 'logo.png', { type: 'image/png' });
    escolherArquivo(html, arquivo);
    const req = http.expectOne(r => r.method === 'PUT' && r.url === '/api/empresa/logo');
    expect(req.request.body).toBeInstanceOf(FormData);
    expect((req.request.body as FormData).get('logo')).toBeInstanceOf(File);
    expect(((req.request.body as FormData).get('logo') as File).name).toBe('logo.png');
    req.flush({ logoVersao: 'v2' });
    await esperar(fixture, 2);
    expect(invalidar).toHaveBeenCalled();
    // identidade: GET /api/empresa e depois a imagem
    http.expectOne(r => r.method === 'GET' && r.url === '/api/empresa').flush({ nome: 'DIH Retífica', logoVersao: 'v2' });
    await esperar(fixture, 2);
    http.expectOne('/api/empresa/logo').flush(new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' }));
    await new Promise(r => setTimeout(r, 50));
    await esperar(fixture);
    expect(dialogo.toastTexto()).toBe('Logo atualizada.');
    expect(JSON.parse(localStorage.getItem(CHAVE_LOGO)!).versao).toBe('v2');
    expect((html.querySelector('.logo-previa') as HTMLImageElement).hidden).toBe(false);
  });

  it('rejeita arquivo que não é PNG/JPG e arquivo acima de 5 MB sem chamar a API', async () => {
    const { html } = await criar();
    escolherArquivo(html, new File(['x'], 'a.gif', { type: 'image/gif' }));
    expect(dialogo.toastTexto()).toBe('Use uma imagem PNG ou JPG.');
    const grande = new File(['x'], 'b.png', { type: 'image/png' });
    Object.defineProperty(grande, 'size', { value: 5 * 1024 * 1024 + 1 });
    escolherArquivo(html, grande);
    expect(dialogo.toastTexto()).toBe('A imagem passa de 5 MB.');
    http.expectNone(r => r.method === 'PUT');
  });

  it('erro do servidor ao enviar logo mostra o motivo', async () => {
    const { fixture, html } = await criar();
    escolherArquivo(html, new File(['x'], 'a.png', { type: 'image/png' }));
    http.expectOne(r => r.method === 'PUT' && r.url === '/api/empresa/logo')
      .flush({ erro: 'A imagem passa de 5 MB.' }, { status: 413, statusText: 'Payload Too Large' });
    await esperar(fixture, 2);
    expect(dialogo.toastTexto()).toBe('A imagem passa de 5 MB.');
    expect(dialogo.toastErro()).toBe(true);
  });

  it('remover logo: confirma, DELETE /api/empresa/logo e limpa a prévia', async () => {
    const { fixture, html } = await criar(true);
    const invalidar = vi.spyOn(orcamentos, 'invalidarTodos');
    botao(html, 'Remover logo').click();
    await esperar(fixture, 1);
    expect(dialogo.dialogos().at(-1)?.mensagem).toBe('Remover a logo da empresa?');
    dialogo.dialogos().at(-1)!.responder(true);
    await esperar(fixture, 1);
    http.expectOne(r => r.method === 'DELETE' && r.url === '/api/empresa/logo').flush(null, { status: 204, statusText: 'No Content' });
    await esperar(fixture, 2);
    expect(invalidar).toHaveBeenCalled();
    http.expectOne(r => r.method === 'GET' && r.url === '/api/empresa').flush({ nome: 'DIH Retífica', logoVersao: null });
    await esperar(fixture);
    expect(dialogo.toastTexto()).toBe('Logo removida.');
    expect(localStorage.getItem(CHAVE_LOGO)).toBeNull();
    expect((html.querySelector('.logo-previa') as HTMLElement).hidden).toBe(true);
    expect(botao(html, 'Remover logo').hidden).toBe(true);
  });

  it('remover logo cancelado não chama a API', async () => {
    const { fixture, html } = await criar(true);
    botao(html, 'Remover logo').click();
    await esperar(fixture, 1);
    dialogo.dialogos().at(-1)!.responder(false);
    await esperar(fixture, 1);
    http.expectNone(r => r.method === 'DELETE');
  });
});
