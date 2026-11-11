import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { provedoresDeTela } from '../testing/ajuda';
import { CacheService, PATH_DASHBOARD_PEDIDOS, PATH_ENCERRADOS_PEDIDOS, PEDIDOS_ABERTOS } from './cache.service';
import { DialogoService } from './dialogo.service';
import { MenuPedidoService } from './menu-pedido.service';
import { OrcamentoCacheService } from './orcamento-cache.service';

describe('MenuPedidoService', () => {
  let menu: MenuPedidoService;
  let http: HttpTestingController;
  let dialogo: DialogoService;
  let cache: CacheService;
  let orcamentos: OrcamentoCacheService;
  let navegar: ReturnType<typeof vi.spyOn>;

  const microtarefas = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
  const responder = (valor: boolean) => dialogo.dialogos().at(-1)!.responder(valor);

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: provedoresDeTela() });
    menu = TestBed.inject(MenuPedidoService);
    http = TestBed.inject(HttpTestingController);
    dialogo = TestBed.inject(DialogoService);
    cache = TestBed.inject(CacheService);
    orcamentos = TestBed.inject(OrcamentoCacheService);
    navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    menu.registrar({ id: '12', finalizado: false });
  });

  afterEach(() => http.verify());

  it('alternar abre e fecha; limpar esquece o pedido e fecha', () => {
    expect(menu.aberto()).toBe(false);
    menu.alternar();
    expect(menu.aberto()).toBe(true);
    menu.alternar();
    expect(menu.aberto()).toBe(false);
    menu.alternar();
    menu.limpar();
    expect(menu.pedido()).toBeNull();
    expect(menu.aberto()).toBe(false);
  });

  it('editar fecha o menu e vai para /pedidos/<id>/editar', () => {
    menu.alternar();
    menu.editar();
    expect(menu.aberto()).toBe(false);
    expect(navegar).toHaveBeenCalledWith(['/pedidos', '12', 'editar']);
  });

  it('excluir pergunta (diálogo perigoso) e, cancelando, não chama a API', async () => {
    const fim = menu.excluir();
    const d = dialogo.dialogos().at(-1)!;
    expect(d.mensagem).toBe('Excluir o pedido #12? Essa ação não pode ser desfeita.');
    expect(d.opcoes.map(o => o.rotulo)).toEqual(['Cancelar', 'Excluir']);
    expect(d.opcoes[1].estilo).toBe('btn-danger');
    responder(false);
    await fim;
    http.expectNone('/api/pedidos/12');
    expect(navegar).not.toHaveBeenCalled();
  });

  it('excluir confirmado: DELETE, invalida abertos/dashboard/encerrados e o orçamento, avisa e vai para #/pedidos', async () => {
    const invalidar = vi.spyOn(cache, 'invalidar');
    const orcamento = vi.spyOn(orcamentos, 'invalidar');
    const fim = menu.excluir();
    responder(true);
    await microtarefas();
    const req = http.expectOne('/api/pedidos/12');
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
    await fim;
    expect(invalidar).toHaveBeenCalledWith(PEDIDOS_ABERTOS, PATH_DASHBOARD_PEDIDOS, PATH_ENCERRADOS_PEDIDOS);
    expect(PEDIDOS_ABERTOS).toBe('/api/pedidos?abertos=true');
    expect(PATH_DASHBOARD_PEDIDOS).toBe('/api/pedidos/dashboard');
    expect(PATH_ENCERRADOS_PEDIDOS).toBe('/api/pedidos/encerrados');
    expect(orcamento).toHaveBeenCalledWith('12');
    expect(dialogo.toastTexto()).toBe('Pedido deletado.');
    expect(navegar).toHaveBeenCalledWith(['/pedidos']);
  });

  it('excluir com erro do servidor: só o aviso genérico, sem invalidar nem navegar', async () => {
    const invalidar = vi.spyOn(cache, 'invalidar');
    const fim = menu.excluir();
    responder(true);
    await microtarefas();
    http.expectOne('/api/pedidos/12').flush({}, { status: 500, statusText: 'x' });
    await fim;
    expect(dialogo.toastTexto()).toBe('Erro ao acessar /api/pedidos/12 (500)');
    expect(invalidar).not.toHaveBeenCalled();
    expect(navegar).not.toHaveBeenCalled();
  });
});
