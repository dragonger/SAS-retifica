import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { App } from './app';
import { authInterceptor } from './core/auth.interceptor';
import { CHAVE_AUTH } from './core/auth.service';
import { MenuPedidoService } from './core/menu-pedido.service';
import { RECARREGAR } from './core/sessao.service';
import { esperar, tokenDeTeste } from './testing/ajuda';

@Component({ selector: 'app-vazio', template: '' })
class Vazio {}

describe('App: menu "Mais opções" do pedido', () => {
  let menu: MenuPedidoService;
  let router: Router;

  async function criar(url: string) {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'pedidos', component: Vazio },
          { path: 'pedidos/:id', component: Vazio },
          { path: 'pedidos/:id/editar', component: Vazio },
          { path: 'inicio', component: Vazio },
        ]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    menu = TestBed.inject(MenuPedidoService);
    router = TestBed.inject(Router);
    const fixture = TestBed.createComponent(App);
    await router.navigateByUrl(url);
    await esperar(fixture);
    return { fixture, html: fixture.nativeElement as HTMLElement };
  }

  const botaoMenu = (html: HTMLElement) => html.querySelector('#btnMenuPedido') as HTMLButtonElement;
  const popover = (html: HTMLElement) => html.querySelector('#menuPedidoPopover') as HTMLElement;
  const itens = (html: HTMLElement) => [...popover(html).querySelectorAll('button')].map(b => b.textContent?.trim());

  it('o botão só aparece em #/pedidos/<id>; não na lista, nem em editar', async () => {
    const { fixture, html } = await criar('/pedidos/12');
    expect(botaoMenu(html).hidden).toBe(false);
    await router.navigateByUrl('/pedidos');
    await esperar(fixture);
    expect(botaoMenu(html).hidden).toBe(true);
    await router.navigateByUrl('/pedidos/12/editar');
    await esperar(fixture);
    expect(botaoMenu(html).hidden).toBe(true);
    expect(botaoMenu(html).getAttribute('aria-label')).toBe('Mais opções');
  });

  it('tocar no botão abre/fecha o popover; pedido não finalizado oferece Editar e Excluir pedido', async () => {
    const { fixture, html } = await criar('/pedidos/12');
    menu.registrar({ id: '12', finalizado: false });
    expect(popover(html).hidden).toBe(true);
    botaoMenu(html).click();
    await esperar(fixture);
    expect(popover(html).hidden).toBe(false);
    expect(itens(html)).toEqual(['Editar', 'Excluir pedido']);
    expect(popover(html).querySelector('button.danger')?.textContent).toBe('Excluir pedido');
    botaoMenu(html).click();
    await esperar(fixture);
    expect(popover(html).hidden).toBe(true);
  });

  it('pedido finalizado: só Excluir pedido (sem Editar)', async () => {
    const { fixture, html } = await criar('/pedidos/12');
    menu.registrar({ id: '12', finalizado: true });
    botaoMenu(html).click();
    await esperar(fixture);
    expect(itens(html)).toEqual(['Excluir pedido']);
  });

  it('enquanto o pedido não carregou, o popover fica vazio', async () => {
    const { fixture, html } = await criar('/pedidos/12');
    botaoMenu(html).click();
    await esperar(fixture);
    expect(itens(html)).toEqual([]);
  });

  it('Editar leva a #/pedidos/<id>/editar e fecha o popover', async () => {
    const { fixture, html } = await criar('/pedidos/12');
    menu.registrar({ id: '12', finalizado: false });
    botaoMenu(html).click();
    await esperar(fixture);
    [...popover(html).querySelectorAll('button')][0].click();
    await esperar(fixture);
    expect(router.url).toBe('/pedidos/12/editar');
    expect(popover(html).hidden).toBe(true);
  });

  it('Excluir pedido pede confirmação (menu fecha antes)', async () => {
    const { fixture, html } = await criar('/pedidos/12');
    menu.registrar({ id: '12', finalizado: false });
    botaoMenu(html).click();
    await esperar(fixture);
    popover(html).querySelector<HTMLButtonElement>('button.danger')!.click();
    await esperar(fixture);
    expect(popover(html).hidden).toBe(true);
    expect(html.querySelector('[role=dialog]')?.textContent).toContain('Excluir o pedido #12? Essa ação não pode ser desfeita.');
  });

  it('toque fora do botão e do popover fecha o popover; toque dentro do popover não', async () => {
    const { fixture, html } = await criar('/pedidos/12');
    menu.registrar({ id: '12', finalizado: true });
    botaoMenu(html).click();
    await esperar(fixture);
    popover(html).click();
    await esperar(fixture);
    expect(popover(html).hidden).toBe(false);
    (html.querySelector('main') as HTMLElement).click();
    await esperar(fixture);
    expect(popover(html).hidden).toBe(true);
  });

  it('trocar de tela fecha o popover', async () => {
    const { fixture, html } = await criar('/pedidos/12');
    menu.registrar({ id: '12', finalizado: true });
    botaoMenu(html).click();
    await esperar(fixture);
    await router.navigateByUrl('/inicio');
    await esperar(fixture);
    expect(menu.aberto()).toBe(false);
    expect(popover(html).hidden).toBe(true);
  });
});

describe('App: faixa da demonstração', () => {
  async function criar(claims: object | null) {
    localStorage.clear();
    if (claims) localStorage.setItem(CHAVE_AUTH, JSON.stringify({ token: tokenDeTeste(claims) }));
    const recarregar = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'inicio', component: Vazio }]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: RECARREGAR, useValue: recarregar },
      ],
    });
    const fixture = TestBed.createComponent(App);
    await TestBed.inject(Router).navigateByUrl('/inicio');
    await esperar(fixture);
    return { html: fixture.nativeElement as HTMLElement, recarregar };
  }

  it('sessão de demonstração: mostra a faixa com o horário em que ela será apagada', async () => {
    const fim = new Date(2026, 10, 12, 14, 32);
    const { html } = await criar({ usuarioId: 9, empresaId: 8, demo: true, exp: fim.getTime() / 1000 });
    const faixa = html.querySelector('.faixa-demo') as HTMLElement;
    expect(faixa.textContent).toContain('Demonstração com dados fictícios');
    expect(faixa.textContent).toContain('14:32');
  });

  it('Sair na faixa limpa a sessão e recarrega na tela de login', async () => {
    const { html, recarregar } = await criar({ usuarioId: 9, empresaId: 8, demo: true, exp: 1794500000 });
    (html.querySelector('.faixa-demo button') as HTMLButtonElement).click();
    expect(localStorage.getItem(CHAVE_AUTH)).toBeNull();
    expect(recarregar).toHaveBeenCalledWith('#/login');
  });

  it('sessão normal: sem faixa', async () => {
    const { html } = await criar({ usuarioId: 1, empresaId: 1, exp: 1794500000 });
    expect(html.querySelector('.faixa-demo')).toBeNull();
  });

  it('na tela de login a barra de abas fica escondida (sem sessão nenhuma aba abre)', async () => {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: 'login', component: Vazio }, { path: 'inicio', component: Vazio }]),
        provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(App);
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/login');
    await esperar(fixture);
    const html = fixture.nativeElement as HTMLElement;
    expect((html.querySelector('nav.tab-bar') as HTMLElement).hidden).toBe(true);
    await router.navigateByUrl('/inicio');
    await esperar(fixture);
    expect((html.querySelector('nav.tab-bar') as HTMLElement).hidden).toBe(false);
  });
});
