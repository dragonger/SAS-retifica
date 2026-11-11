import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { CHAVE_AUTH } from '../../core/auth.service';
import { DialogoService } from '../../core/dialogo.service';
import { GuardaSaidaService } from '../../core/guarda-saida.service';
import { digitar, esperar, provedoresDeTela } from '../../testing/ajuda';
import { TrocarSenha } from './trocar-senha';

describe('TrocarSenha', () => {
  let http: HttpTestingController;
  let dialogo: DialogoService;
  let navegar: ReturnType<typeof vi.spyOn>;

  function criar() {
    localStorage.clear();
    localStorage.setItem(CHAVE_AUTH, JSON.stringify({ token: 'tk' }));
    TestBed.configureTestingModule({ providers: provedoresDeTela() });
    http = TestBed.inject(HttpTestingController);
    dialogo = TestBed.inject(DialogoService);
    navegar = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const fixture = TestBed.createComponent(TrocarSenha);
    return { fixture, html: fixture.nativeElement as HTMLElement, comp: fixture.componentInstance };
  }

  const campo = (html: HTMLElement, placeholder: string) => html.querySelector(`input[placeholder^="${placeholder}"]`) as HTMLInputElement;
  const salvar = (html: HTMLElement) => html.querySelector('button.btn-primary') as HTMLButtonElement;

  function preencher(html: HTMLElement, atual: string, nova: string, confirma: string) {
    digitar(campo(html, 'Senha atual'), atual);
    digitar(campo(html, 'Nova senha'), nova);
    digitar(campo(html, 'Confirmar'), confirma);
  }

  afterEach(() => http.verify());

  it('mostra os três campos de senha e o botão Salvar', async () => {
    const { fixture, html } = criar();
    await esperar(fixture);
    expect(html.querySelector('h2.titulo')!.textContent).toBe('Trocar senha');
    expect(html.querySelectorAll('input[type=password]')).toHaveLength(3);
    expect(salvar(html).textContent).toBe('Salvar');
  });

  it('nova senha com menos de 6 caracteres: toast de erro, sem chamar o servidor', async () => {
    const { fixture, html } = criar();
    preencher(html, 'antiga', '12345', '12345');
    salvar(html).click();
    await esperar(fixture);
    expect(dialogo.toastTexto()).toBe('A nova senha precisa ter pelo menos 6 caracteres.');
    expect(dialogo.toastErro()).toBe(true);
    http.expectNone('/api/usuario/senha');
  });

  it('confirmação diferente: "As senhas não coincidem."', async () => {
    const { fixture, html } = criar();
    preencher(html, 'antiga', '123456', '1234567');
    salvar(html).click();
    await esperar(fixture);
    expect(dialogo.toastTexto()).toBe('As senhas não coincidem.');
    http.expectNone('/api/usuario/senha');
  });

  it('sucesso: PUT com {senhaAtual, novaSenha} e token, "Senha alterada.", limpa os campos e vai ao Início', async () => {
    const { fixture, html, comp } = criar();
    preencher(html, 'antiga', 'nova123', 'nova123');
    expect(comp.guardaSaida().sujo()).toBe(true);
    salvar(html).click();
    await esperar(fixture);
    const req = http.expectOne('/api/usuario/senha');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ senhaAtual: 'antiga', novaSenha: 'nova123' });
    expect(req.request.headers.get('Authorization')).toBe('Bearer tk');
    req.flush(null, { status: 204, statusText: 'No Content' });
    await esperar(fixture);
    expect(dialogo.toastTexto()).toBe('Senha alterada.');
    expect(dialogo.toastErro()).toBe(false);
    expect(comp.guardaSaida().sujo()).toBe(false);
    expect(navegar).toHaveBeenCalledWith('/inicio');
  });

  it('401 = "Senha atual incorreta." sem derrubar a sessão nem refazer o login', async () => {
    const { fixture, html } = criar();
    preencher(html, 'errada', 'nova123', 'nova123');
    salvar(html).click();
    await esperar(fixture);
    http.expectOne('/api/usuario/senha').flush({}, { status: 401, statusText: 'Unauthorized' });
    await esperar(fixture);
    expect(dialogo.toastTexto()).toBe('Senha atual incorreta.');
    expect(JSON.parse(localStorage.getItem(CHAVE_AUTH)!).token).toBe('tk'); // sessão intacta
    expect(navegar).not.toHaveBeenCalled();
  });

  it('outro erro HTTP: "Não foi possível trocar a senha." (sem o toast genérico)', async () => {
    const { fixture, html } = criar();
    preencher(html, 'antiga', 'nova123', 'nova123');
    salvar(html).click();
    await esperar(fixture);
    http.expectOne('/api/usuario/senha').flush({}, { status: 500, statusText: 'Server Error' });
    await esperar(fixture);
    expect(dialogo.toastTexto()).toBe('Não foi possível trocar a senha.');
    expect(navegar).not.toHaveBeenCalled();
  });

  it('sem conexão: o aviso é o do interceptor ("Sem conexão com o servidor.")', async () => {
    const { fixture, html } = criar();
    preencher(html, 'antiga', 'nova123', 'nova123');
    salvar(html).click();
    await esperar(fixture);
    http.expectOne('/api/usuario/senha').error(new ProgressEvent('error'));
    await esperar(fixture);
    expect(dialogo.toastTexto()).toBe('Sem conexão com o servidor.');
  });

  it('guarda de saída: limpa = livre; qualquer campo preenchido = pergunta antes de sair', async () => {
    const { fixture, html, comp } = criar();
    const guarda = TestBed.inject(GuardaSaidaService);
    expect(comp.guardaSaida().tipo).toBe('formulario');
    expect(guarda.sujo(comp.guardaSaida())).toBe(false);
    digitar(campo(html, 'Confirmar'), 'x');
    await esperar(fixture);
    expect(guarda.sujo(comp.guardaSaida())).toBe(true);
    const pergunta = guarda.perguntarSaida(comp.guardaSaida());
    await esperar(fixture);
    expect(dialogo.dialogos().at(-1)!.opcoes.map(o => o.rotulo)).toEqual(['Continuar editando', 'Sair sem salvar']);
    dialogo.dialogos().at(-1)!.responder('descartar');
    expect(await pergunta).toBe(true);
  });
});
