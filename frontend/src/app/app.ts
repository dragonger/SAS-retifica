import { Component, ElementRef, inject, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { GuardsCheckEnd, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { CacheService } from './core/cache.service';
import { DialogoAberto, DialogoService } from './core/dialogo.service';
import { GuardaSaidaService } from './core/guarda-saida.service';
import { IdentidadeService } from './core/identidade.service';
import { MenuPedidoService } from './core/menu-pedido.service';
import { TopoService } from './core/topo.service';
import { Foco } from './shared/foco';

/** Telas raiz: sem botão voltar e com o ícone do catálogo. */
const RAIZES = ['/inicio', '/pedidos', '/cabecotes', '/encerrados', '/dashboard', '/login', '/trocar-senha'];

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Foco],
  templateUrl: './app.html',
  host: {
    style: 'display: contents', // body continua sendo o flex: topo, main, abas e toast são filhos diretos
    '(document:click)': 'cliqueNoDocumento($event)',
  },
})
export class App {
  private readonly router = inject(Router);
  private readonly cache = inject(CacheService);
  protected readonly guarda = inject(GuardaSaidaService);
  protected readonly dialogo = inject(DialogoService);
  protected readonly topo = inject(TopoService);
  protected readonly identidade = inject(IdentidadeService);
  protected readonly menuPedido = inject(MenuPedidoService);

  private readonly conteudo = viewChild<ElementRef<HTMLElement>>('conteudo');

  /** Caminho atual sem query string (ex.: "/pedidos/12"). */
  protected readonly caminho = toSignal(
    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd),
      map(() => this.router.url.split('?')[0]),
      startWith(this.router.url.split('?')[0]),
    ),
    { initialValue: '/' },
  );

  constructor() {
    this.router.events.subscribe(e => {
      // invalida revalidações de cache pendentes de uma tela anterior (renderGen++ do app.js)
      if (e instanceof GuardsCheckEnd && e.shouldActivate) this.cache.novaGeracao();
      if (e instanceof NavigationEnd) {
        this.rolarAoTopo();
        this.menuPedido.fechar(); // o popover do pedido fecha a cada troca de tela
      }
    });
  }

  /** Botão "Mais opções" só em #/pedidos/<id> (não em novo nem editar). */
  protected menuPedidoVisivel(): boolean {
    return /^\/pedidos\/\d+$/.test(this.caminho());
  }

  /** Toque fora do botão e do popover fecha o popover. */
  protected cliqueNoDocumento(ev: Event): void {
    if (!this.menuPedido.aberto()) return;
    const alvo = ev.target as Element | null;
    if (!alvo?.closest('#btnMenuPedido, #menuPedidoPopover')) this.menuPedido.fechar();
  }

  private rolarAoTopo(): void {
    const el = this.conteudo()?.nativeElement;
    if (el) el.scrollTop = 0;
  }

  protected telaRaiz(): boolean {
    return RAIZES.slice(0, 5).includes(this.caminho());
  }

  protected mostrarVoltar(): boolean {
    return !RAIZES.includes(this.caminho());
  }

  protected abaAtiva(aba: string): boolean {
    return (this.caminho().split('/')[1] || 'inicio') === aba;
  }

  protected voltar(): void {
    if (history.length > 1) history.back();
    else void this.router.navigateByUrl('/inicio');
  }

  protected irParaCatalogo(): void {
    void this.router.navigateByUrl('/catalogo');
  }

  protected irParaAba(aba: string): void {
    void this.router.navigateByUrl('/' + aba);
  }

  /** A logo é o botão "início": já no Início, só sobe ao topo. */
  protected irParaInicio(): void {
    if (this.caminho() === '/inicio') this.rolarAoTopo();
    else void this.router.navigateByUrl('/inicio');
  }

  protected teclaLogo(ev: Event): void {
    ev.preventDefault();
    this.irParaInicio();
  }

  /** Toque fora do diálogo escolhe a primeira opção (a segura). */
  protected fundoClicado(ev: MouseEvent, fundo: HTMLElement, d: DialogoAberto): void {
    if (ev.target === fundo) d.responder(d.opcoes[0].valor);
  }
}
