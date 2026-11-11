import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { CHAVE_AUTH, CHAVE_RASCUNHOS } from '../core/auth.service';
import { DialogoService } from '../core/dialogo.service';
import { RascunhoService } from '../core/rascunho.service';
import { esperar, tokenDeTeste } from '../testing/ajuda';
import { gravarRascunhosDeTeste } from '../testing/rascunhos';
import { SecaoRascunhos } from './secao-rascunhos';

const MIN = 60_000;
describe('SecaoRascunhos (cartões "Pedido incompleto")', () => {
  let navegar: ReturnType<typeof vi.fn>;
  let dialogo: DialogoService;

  function criar(itens: Record<string, { quando: number; titulo: string }> = {}) {
    localStorage.clear();
    localStorage.setItem(CHAVE_AUTH, JSON.stringify({ token: tokenDeTeste({ usuarioId: 7, empresaId: 3 }) }));
    gravarRascunhosDeTeste(itens);
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    navegar = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true) as never;
    dialogo = TestBed.inject(DialogoService);
    const fixture = TestBed.createComponent(SecaoRascunhos);
    return { fixture, html: fixture.nativeElement as HTMLElement };
  }

  const botao = (html: HTMLElement, texto: string, n = 0) =>
    [...html.querySelectorAll('button')].filter(b => b.textContent === texto)[n] as HTMLButtonElement;

  it('sem rascunhos não desenha nada', async () => {
    const { fixture, html } = criar();
    await fixture.whenStable();
    expect(html.querySelector('.card-destaque')).toBeNull();
    expect(html.textContent!.trim()).toBe('');
  });

  it('pedido novo: "Pedido incompleto", o título e "Guardado ... neste aparelho"', async () => {
    const { fixture, html } = criar({ novo: { quando: Date.now() - 5 * MIN, titulo: 'Maria · Retífica' } });
    await fixture.whenStable();
    const cartao = html.querySelector('.card-destaque')!;
    expect(cartao.querySelector('.card-destaque-titulo')!.textContent).toBe('Pedido incompleto');
    expect(cartao.textContent).toContain('Maria · Retífica');
    expect(cartao.textContent).toContain('Guardado há 5 min neste aparelho');
    expect(cartao.classList.contains('blueprint')).toBe(true);
    expect(cartao.querySelectorAll('i.corner').length).toBe(4);
  });

  it('edição: "Alterações não salvas · pedido #<id>"; sem título "Sem cliente"', async () => {
    const { fixture, html } = criar({ 'pedido:12': { quando: Date.now() - 2 * 60 * MIN, titulo: '' } });
    await fixture.whenStable();
    const cartao = html.querySelector('.card-destaque')!;
    expect(cartao.querySelector('.card-destaque-titulo')!.textContent).toBe('Alterações não salvas · pedido #12');
    expect(cartao.textContent).toContain('Sem cliente');
    expect(cartao.textContent).toContain('Guardado há 2 h neste aparelho');
  });

  it('um cartão por rascunho, do mais recente para o mais antigo', async () => {
    const { fixture, html } = criar({
      'pedido:3': { quando: Date.now() - 60 * MIN, titulo: 'antigo' },
      novo: { quando: Date.now() - 1 * MIN, titulo: 'recente' },
    });
    await fixture.whenStable();
    expect([...html.querySelectorAll('.card-destaque')].map(c => c.querySelector('div:nth-of-type(2)')!.textContent)).toEqual(['recente', 'antigo']);
  });

  it('rascunhos de outro dono ou vencidos não aparecem', async () => {
    localStorage.clear();
    localStorage.setItem(CHAVE_AUTH, JSON.stringify({ token: tokenDeTeste({ usuarioId: 7, empresaId: 3 }) }));
    gravarRascunhosDeTeste({ novo: { quando: Date.now(), titulo: 'de outro' } }, '8|3');
    gravarRascunhosDeTeste({ 'pedido:1': { quando: Date.now() - 15 * 24 * 60 * MIN, titulo: 'vencido' } });
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(SecaoRascunhos);
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('.card-destaque')).toBeNull();
  });

  it('Continuar marca o rascunho e vai para a rota do pedido novo', async () => {
    const { fixture, html } = criar({ novo: { quando: Date.now() - MIN, titulo: 'T' } });
    await fixture.whenStable();
    botao(html, 'Continuar').click();
    expect(navegar).toHaveBeenCalledWith('/pedidos/novo');
    expect(TestBed.inject(RascunhoService).consumirRetomada('novo')).toBe(true); // o formulário não vai perguntar
  });

  it('Continuar de uma edição vai para /pedidos/<id>/editar', async () => {
    const { fixture, html } = criar({ 'pedido:12': { quando: Date.now() - MIN, titulo: 'T' } });
    await fixture.whenStable();
    botao(html, 'Continuar').click();
    expect(navegar).toHaveBeenCalledWith('/pedidos/12/editar');
    expect(TestBed.inject(RascunhoService).consumirRetomada('pedido:12')).toBe(true);
  });

  it('Descartar pede confirmação (texto do app atual); cancelar mantém o rascunho', async () => {
    const { fixture, html } = criar({ novo: { quando: Date.now() - MIN, titulo: 'T' } });
    await fixture.whenStable();
    botao(html, 'Descartar').click();
    await esperar(fixture);
    const d = dialogo.dialogos().at(-1)!;
    expect(d.mensagem).toBe('Descartar este rascunho? O que foi digitado será perdido.');
    expect(d.opcoes.map(o => o.rotulo)).toEqual(['Cancelar', 'Descartar']);
    d.responder(false);
    await esperar(fixture);
    expect(html.querySelector('.card-destaque')).toBeTruthy();
    expect(Object.keys(JSON.parse(localStorage.getItem(CHAVE_RASCUNHOS)!)['7|3'])).toEqual(['novo']);
  });

  it('Descartar confirmado apaga só aquele rascunho e tira o cartão', async () => {
    const { fixture, html } = criar({
      novo: { quando: Date.now() - MIN, titulo: 'um' },
      'pedido:5': { quando: Date.now() - 2 * MIN, titulo: 'dois' },
    });
    await fixture.whenStable();
    botao(html, 'Descartar').click();
    await esperar(fixture);
    dialogo.dialogos().at(-1)!.responder(true);
    await esperar(fixture);
    expect(html.querySelectorAll('.card-destaque').length).toBe(1);
    expect(html.textContent).toContain('dois');
    expect(Object.keys(JSON.parse(localStorage.getItem(CHAVE_RASCUNHOS)!)['7|3'])).toEqual(['pedido:5']);
  });
});
