import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { CHAVE_AUTH } from '../../core/auth.service';
import { CacheService } from '../../core/cache.service';
import { DialogoService } from '../../core/dialogo.service';
import { FotoOrcamentoService, PdfLib } from '../../core/foto-orcamento.service';
import { MenuPedidoService } from '../../core/menu-pedido.service';
import { OrcamentoCacheService } from '../../core/orcamento-cache.service';
import { PedidoDetalhe } from '../../shared/modelos';
import { esperar, provedoresDeTela } from '../../testing/ajuda';
import { Pedido, linkWhatsApp } from './pedido';

const BASE: PedidoDetalhe = {
  id: 12,
  cliente: { id: 3, nome: 'MARIA souza da Silva', telefone: '31985565586', rua: 'Rua A', numero: '10', bairro: 'Centro', municipio: 'Belo Horizonte', uf: 'MG' },
  componentes: [
    { nome: 'Fiat Uno', categoriaRotulo: 'Cabeçote' },
    { nome: 'Gol', categoriaRotulo: 'Cabeçote' },
    { nome: 'Scania', categoriaRotulo: 'Bloco' },
  ],
  pedidoDescricao: '',
  datCriacao: '01/10/2026',
  datEntregaEstimada: '2026-10-20',
  situacao: 'Aberto',
  finalizado: false,
  servicos: [
    { descricao: 'Retífica', categoria: 'CABECOTE', quantidade: 1 },
    { descricao: 'Retífica', categoria: 'BLOCO', quantidade: 1 },
    { descricao: 'Teste', categoria: 'BLOCO', quantidade: 1 },
  ],
  pecas: [{ descricao: 'Junta', categoria: 'CABECOTE', quantidade: 2 }],
  categoriaValores: [{ categoriaRotulo: 'Cabeçote', valorTotal: 1000, valorServicos: 800, valorPecas: 200 }],
  observacao: 'Entregar à tarde',
  descontoTipo: null,
  descontoValor: null,
  subtotal: 1000,
  totalGeral: 1000,
};

const pdfOriginal = new Blob(['%PDF-original'], { type: 'application/pdf' });

describe('Pedido (visualizar)', () => {
  let http: HttpTestingController;
  let dialogo: DialogoService;
  let cache: CacheService;
  let orcamentos: OrcamentoCacheService;
  let menu: MenuPedidoService;
  let parametros: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let fetchPdf: ReturnType<typeof vi.fn>;
  let share: ReturnType<typeof vi.fn>;
  let canShare: ReturnType<typeof vi.fn>;
  let abrir: ReturnType<typeof vi.fn>;
  let cliques: HTMLAnchorElement[];

  const microtarefas = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

  async function criar(pedido: PedidoDetalhe | null = BASE, opcoes: { whatsAppApi?: boolean } = {}) {
    parametros = new BehaviorSubject(convertToParamMap({ id: '12' }));
    TestBed.configureTestingModule({
      providers: [...provedoresDeTela(), { provide: ActivatedRoute, useValue: { paramMap: parametros } }],
    });
    http = TestBed.inject(HttpTestingController);
    dialogo = TestBed.inject(DialogoService);
    cache = TestBed.inject(CacheService);
    orcamentos = TestBed.inject(OrcamentoCacheService);
    menu = TestBed.inject(MenuPedidoService);
    const fixture = TestBed.createComponent(Pedido);
    await fixture.whenStable();
    const html = fixture.nativeElement as HTMLElement;
    const carregando = html.textContent;
    http.expectOne('/api/pedidos/12').flush(pedido);
    await esperar(fixture);
    const status = http.match('/api/whatsapp/status');
    status.forEach(r => r.flush({ habilitado: !!opcoes.whatsAppApi }));
    await esperar(fixture);
    await new Promise(r => setTimeout(r, 60)); // pré-busca do PDF: depois da pintura (requestAnimationFrame + setTimeout)
    await esperar(fixture);
    return { fixture, html, carregando };
  }

  const botao = (html: HTMLElement, texto: string) =>
    [...html.querySelectorAll('button')].find(b => b.textContent?.includes(texto)) as HTMLButtonElement;
  const responder = (valor: boolean) => dialogo.dialogos().at(-1)!.responder(valor);
  const linha = (html: HTMLElement, rotulo: string) =>
    [...html.querySelectorAll('div')].find(d => d.children.length === 2 && d.firstElementChild?.tagName === 'SPAN' && d.firstElementChild.textContent === rotulo);
  const textos = (html: HTMLElement, seletor: string) => [...html.querySelectorAll(seletor)].map(e => e.textContent?.trim());

  function escolherFoto(html: HTMLElement, foto: File | null) {
    const input = html.querySelector('input[type=file]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: foto ? [foto] : [], configurable: true });
    input.dispatchEvent(new Event('change'));
  }

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(CHAVE_AUTH, JSON.stringify({ token: 'tk', empresaNome: 'DIH Retífica' }));
    fetchPdf = vi.fn(() => Promise.resolve({ ok: true, status: 200, blob: () => Promise.resolve(pdfOriginal) }));
    vi.stubGlobal('fetch', fetchPdf);
    share = vi.fn().mockResolvedValue(undefined);
    canShare = vi.fn().mockReturnValue(true);
    Object.defineProperty(navigator, 'share', { value: share, configurable: true, writable: true });
    Object.defineProperty(navigator, 'canShare', { value: canShare, configurable: true, writable: true });
    abrir = vi.fn();
    vi.stubGlobal('open', abrir);
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:pdf'), revokeObjectURL: vi.fn() });
    cliques = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { cliques.push(this); });
  });

  afterEach(() => {
    http.verify();
    delete (navigator as unknown as Record<string, unknown>)['share'];
    delete (navigator as unknown as Record<string, unknown>)['canShare'];
    delete (URL as unknown as Record<string, unknown>)['createObjectURL'];
    delete (URL as unknown as Record<string, unknown>)['revokeObjectURL'];
    delete (window as unknown as { PDFLib?: unknown }).PDFLib;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('apresentação', () => {
    it('mostra "Carregando..." e depois os dados; título "Pedido #12"', async () => {
      const { html, carregando } = await criar();
      expect(carregando).toContain('Carregando...');
      expect(TestBed.inject(MenuPedidoService).pedido()).toEqual({ id: '12', finalizado: false });
      expect(html.querySelector('.card-destaque-titulo')?.textContent).toBe('MARIA souza da Silva');
    });

    it('pedido inexistente: "Pedido não encontrado."', async () => {
      const { html } = await criar(null);
      expect(html.querySelector('.empty')?.textContent).toBe('Pedido não encontrado.');
      expect(menu.pedido()).toBeNull();
    });

    it('cliente: telefone formatado e endereço montado', async () => {
      const { html } = await criar();
      expect(textos(html, '.card-destaque .linha-sub')).toEqual(['(31) 98556-5586', 'Rua A, 10 – Centro, Belo Horizonte/MG']);
    });

    it('cliente sem telefone nem endereço: só o nome', async () => {
      const { html } = await criar({ ...BASE, cliente: { id: 3, nome: 'Zé' } });
      expect(html.querySelectorAll('.card-destaque .linha-sub').length).toBe(0);
      expect(botao(html, 'WhatsApp')).toBeUndefined();
    });

    it('detalhes agrupados por categoria, datas e situação', async () => {
      const { html } = await criar();
      expect(linha(html, 'Cabeçote')?.lastElementChild?.textContent).toBe('Fiat Uno, Gol');
      expect(linha(html, 'Bloco')?.lastElementChild?.textContent).toBe('Scania');
      expect(linha(html, 'Descrição')).toBeUndefined();
      expect(linha(html, 'Criado em')?.lastElementChild?.textContent).toBe('01/10/2026');
      expect(linha(html, 'Entrega estimada')?.lastElementChild?.textContent).toBe('20/10/2026');
      expect(linha(html, 'Situação')?.querySelector('.tag')?.textContent?.trim()).toBe('Aberto');
    });

    it('sem componentes mostra a Descrição; sem datas, travessão', async () => {
      const { html } = await criar({ ...BASE, componentes: [], pedidoDescricao: 'Motor completo', datCriacao: null, datEntregaEstimada: null });
      expect(linha(html, 'Descrição')?.lastElementChild?.textContent).toBe('Motor completo');
      expect(linha(html, 'Criado em')?.lastElementChild?.textContent).toBe('-');
      expect(linha(html, 'Entrega estimada')?.lastElementChild?.textContent).toBe('-');
    });

    it('serviços e peças: mesmo nome em categorias diferentes mostra a categoria; peças com ×quantidade', async () => {
      const { html } = await criar();
      const itens = textos(html, '.item-linha');
      expect(itens).toEqual(['Retífica · Cabeçote', 'Retífica · Bloco', 'Teste', 'Junta ×2']);
    });

    it('listas vazias mostram as mensagens', async () => {
      const { html } = await criar({ ...BASE, servicos: [], pecas: null, categoriaValores: [] });
      expect(textos(html, '.empty')).toEqual(['Nenhum serviço.', 'Nenhuma peça utilizada.', 'Nenhuma categoria com valor definido.']);
    });

    it('valores por categoria e observação', async () => {
      const { html } = await criar();
      const cv = html.querySelector('.linha') as HTMLElement;
      expect(cv.querySelector('.linha-titulo')?.textContent).toBe('Cabeçote');
      expect(cv.textContent).toContain('R$ 1.000,00');
      expect(cv.textContent).toContain('Serviços R$ 800,00');
      expect(cv.textContent).toContain('Peças R$ 200,00');
      expect(html.textContent).toContain('Entregar à tarde');
    });

    it('selo Atrasado e Finalizado', async () => {
      let r = await criar({ ...BASE, situacao: 'Atrasado' });
      let tag = linha(r.html, 'Situação')!.querySelector('.tag') as HTMLElement;
      expect(tag.className).toContain('tag-accent-2');
      expect(tag.querySelector('svg')).not.toBeNull();
      TestBed.resetTestingModule();
      r = await criar({ ...BASE, situacao: 'Finalizado', finalizado: true });
      tag = linha(r.html, 'Situação')!.querySelector('.tag') as HTMLElement;
      expect(tag.className).toContain('tag-finalizado');
      expect(tag.querySelector('svg')).not.toBeNull();
    });

    it('barra do total: sem desconto só o Total', async () => {
      const { html } = await criar();
      const barra = html.querySelector('.barra-total') as HTMLElement;
      expect(barra.className).toContain('barra-total-view');
      expect(barra.querySelector('.linha-total')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('TotalR$ 1.000,00');
      expect(barra.textContent).not.toContain('Subtotal');
    });

    it('barra do total: desconto percentual mostra Subtotal, Desconto (10%) e o valor descontado', async () => {
      const { html } = await criar({ ...BASE, descontoTipo: 'PERCENTUAL', descontoValor: 10, subtotal: 1000, totalGeral: 900 });
      const barra = html.querySelector('.barra-total') as HTMLElement;
      expect(barra.textContent).toContain('Subtotal');
      expect(barra.textContent).toContain('R$ 1.000,00');
      expect(barra.textContent).toContain('Desconto (10%)');
      expect(barra.textContent).toContain('- R$ 100,00');
      expect(barra.querySelector('.valor')?.textContent).toBe('R$ 900,00');
    });

    it('desconto em valor fixo chama-se só "Desconto"', async () => {
      const { html } = await criar({ ...BASE, descontoTipo: 'VALOR', descontoValor: 50, subtotal: 1000, totalGeral: 950 });
      expect((html.querySelector('.barra-total') as HTMLElement).textContent).toContain('Desconto- R$ 50,00');
    });

    it('pedido em aberto tem Gerar orçamento e Finalizar; finalizado só Gerar orçamento', async () => {
      let r = await criar();
      expect(botao(r.html, 'Gerar orçamento')).toBeDefined();
      expect(botao(r.html, 'Finalizar')).toBeDefined();
      TestBed.resetTestingModule();
      r = await criar({ ...BASE, situacao: 'Finalizado', finalizado: true });
      expect(botao(r.html, 'Gerar orçamento')).toBeDefined();
      expect(botao(r.html, 'Finalizar')).toBeUndefined();
      expect(menu.pedido()).toEqual({ id: '12', finalizado: true });
    });

    it('ao sair da tela o menu do topo é limpo', async () => {
      const { fixture } = await criar();
      expect(menu.pedido()).not.toBeNull();
      fixture.destroy();
      expect(menu.pedido()).toBeNull();
    });
  });

  describe('finalizar', () => {
    it('cancelar a confirmação não chama a API', async () => {
      const { html } = await criar();
      botao(html, 'Finalizar').click();
      await microtarefas();
      expect(dialogo.dialogos().at(-1)!.mensagem).toBe('Finalizar o pedido #12? A data de entrega será registrada agora.');
      responder(false);
      await microtarefas();
      http.expectNone('/api/pedidos/12/finalizar');
    });

    it('confirmar: POST, invalida abertos/dashboard/encerrados e o orçamento, avisa e redesenha o pedido já finalizado', async () => {
      const { fixture, html } = await criar();
      const invalidar = vi.spyOn(cache, 'invalidar');
      const invalidarOrc = vi.spyOn(orcamentos, 'invalidar');
      botao(html, 'Finalizar').click();
      await microtarefas();
      expect(dialogo.dialogos().at(-1)!.opcoes.map(o => o.rotulo)).toEqual(['Cancelar', 'Finalizar']);
      responder(true);
      await microtarefas();
      const req = http.expectOne('/api/pedidos/12/finalizar');
      expect(req.request.method).toBe('POST');
      await fixture.whenStable();
      expect(botao(html, 'Finalizando…').disabled).toBe(true);
      req.flush(null, { status: 204, statusText: 'No Content' });
      await esperar(fixture);
      expect(invalidar).toHaveBeenCalledWith('/api/pedidos?abertos=true', '/api/pedidos/dashboard', '/api/pedidos/encerrados');
      expect(invalidarOrc).toHaveBeenCalledWith('12');
      expect(dialogo.toastTexto()).toBe('Pedido finalizado.');
      // redesenha: carrega de novo e agora vem finalizado
      http.expectOne('/api/pedidos/12').flush({ ...BASE, situacao: 'Finalizado', finalizado: true });
      await esperar(fixture);
      http.match('/api/whatsapp/status').forEach(r => r.flush({ habilitado: false }));
      expect(botao(html, 'Finalizar')).toBeUndefined();
      expect(menu.pedido()).toEqual({ id: '12', finalizado: true });
    });

    it('erro do servidor: só o aviso genérico, o botão volta e nada é invalidado', async () => {
      const { fixture, html } = await criar();
      const invalidar = vi.spyOn(cache, 'invalidar');
      botao(html, 'Finalizar').click();
      await microtarefas();
      responder(true);
      await microtarefas();
      http.expectOne('/api/pedidos/12/finalizar').flush({}, { status: 500, statusText: 'x' });
      await esperar(fixture);
      expect(dialogo.toastTexto()).toBe('Erro ao acessar /api/pedidos/12/finalizar (500)');
      expect(invalidar).not.toHaveBeenCalled();
      expect(botao(html, 'Finalizar').disabled).toBe(false);
    });
  });

  describe('orçamento: pré-busca e compartilhar', () => {
    it('depois de desenhar a tela, busca o PDF uma vez com o token', async () => {
      await criar();
      expect(fetchPdf).toHaveBeenCalledTimes(1);
      expect(fetchPdf).toHaveBeenCalledWith('/api/pedidos/12/pdf', { headers: { Authorization: 'Bearer tk' } });
    });

    it('com o PDF já pré-carregado, o toque chama navigator.share só depois de microtarefas, sem window.open e sem novo fetch', async () => {
      const { html } = await criar();
      botao(html, 'Gerar orçamento').click();
      await microtarefas(); // nenhum temporizador/rede: se esperasse um, o share ainda não teria sido chamado
      expect(abrir).not.toHaveBeenCalled();
      expect(share).toHaveBeenCalledTimes(1);
      const dados = share.mock.calls[0][0] as { files: File[] };
      expect(Object.keys(dados)).toEqual(['files']);
      expect(dados.files.length).toBe(1);
      expect(dados.files[0].name).toBe('orcamento-12.pdf');
      expect(dados.files[0].type).toBe('application/pdf');
      expect(fetchPdf).toHaveBeenCalledTimes(1);
    });

    it('sem suporte a compartilhar arquivo: reserva a aba (window.open vazio) ANTES e abre o PDF nela', async () => {
      canShare.mockReturnValue(false);
      const aba = { close: vi.fn(), location: { href: '' } };
      abrir.mockReturnValue(aba);
      const { fixture, html } = await criar();
      botao(html, 'Gerar orçamento').click();
      expect(abrir).toHaveBeenCalledWith('', '_blank'); // síncrono, dentro do toque
      await esperar(fixture);
      expect(share).not.toHaveBeenCalled();
      expect(aba.location.href).toBe('blob:pdf');
      expect(dialogo.toastTexto()).toBe('Este navegador não aceita compartilhar arquivo PDF. Abrindo o PDF direto.');
    });

    it('PDF ainda sendo gerado no toque: reaproveita a mesma busca e compartilha quando chegar', async () => {
      let entregar!: () => void;
      fetchPdf.mockImplementation(() => new Promise(r => { entregar = () => r({ ok: true, status: 200, blob: () => Promise.resolve(pdfOriginal) }); }));
      const { html } = await criar();
      botao(html, 'Gerar orçamento').click();
      await microtarefas();
      expect(share).not.toHaveBeenCalled();
      entregar();
      await microtarefas();
      expect(share).toHaveBeenCalledTimes(1);
      expect(fetchPdf).toHaveBeenCalledTimes(1);
    });

    it('falha ao gerar o PDF: aviso e nada compartilhado', async () => {
      fetchPdf.mockResolvedValue({ ok: false, status: 500, blob: () => Promise.resolve(pdfOriginal) });
      const { fixture, html } = await criar();
      botao(html, 'Gerar orçamento').click();
      await esperar(fixture);
      expect(share).not.toHaveBeenCalled();
      expect(dialogo.toastTexto()).toBe('Não foi possível gerar o orçamento.');
    });

    it('AbortError depois do menu aberto (cancelou): sem aviso nem fallback', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      share.mockImplementation(async () => { vi.setSystemTime(Date.now() + 900); throw Object.assign(new Error('x'), { name: 'AbortError' }); });
      const { fixture, html } = await criar();
      botao(html, 'Gerar orçamento').click();
      await esperar(fixture);
      vi.useRealTimers();
      expect(dialogo.toastVisivel()).toBe(false);
      expect(abrir).not.toHaveBeenCalled();
    });

    it('AbortError instantâneo (<400ms): fallback abre o PDF e avisa', async () => {
      share.mockRejectedValue(Object.assign(new Error('x'), { name: 'AbortError' }));
      const { fixture, html } = await criar();
      botao(html, 'Gerar orçamento').click();
      await esperar(fixture);
      expect(dialogo.toastTexto()).toMatch(/^O navegador recusou compartilhar antes de abrir o menu \(\d+ms\)\. Abrindo o PDF direto\.$/);
      expect(abrir).toHaveBeenCalledWith('blob:pdf', '_blank');
    });
  });

  describe('foto do componente', () => {
    const foto = new File(['jpg'], 'componente.jpg', { type: 'image/jpeg' });
    const pdfMesclado = new Blob(['%PDF-com-foto'], { type: 'application/pdf' });

    it('escolher a foto monta o PDF com a foto em cima do PDF do orçamento e mostra o arquivo', async () => {
      const { fixture, html } = await criar();
      const fotos = TestBed.inject(FotoOrcamentoService);
      const mesclar = vi.spyOn(fotos, 'pdfComFoto').mockResolvedValue(pdfMesclado);
      expect(botao(html, 'Anexar foto do componente')).toBeDefined();
      escolherFoto(html, foto);
      await esperar(fixture);
      expect(mesclar).toHaveBeenCalledTimes(1);
      expect(mesclar.mock.calls[0][1]).toBe(foto);
      expect(await mesclar.mock.calls[0][0]).toBe(pdfOriginal); // a promessa do PDF do orçamento (uma só busca)
      expect(fetchPdf).toHaveBeenCalledTimes(1);
      expect(botao(html, 'Trocar foto')).toBeDefined();
      expect(html.textContent).toContain('componente.jpg');
      expect(html.textContent).toContain('A foto vai junto, como última página do PDF do orçamento.');
    });

    it('gerar orçamento com foto compartilha UM arquivo só: o PDF já mesclado', async () => {
      const { fixture, html } = await criar();
      vi.spyOn(TestBed.inject(FotoOrcamentoService), 'pdfComFoto').mockResolvedValue(pdfMesclado);
      escolherFoto(html, foto);
      await esperar(fixture);
      botao(html, 'Gerar orçamento').click();
      await microtarefas();
      expect(share).toHaveBeenCalledTimes(1);
      const dados = share.mock.calls[0][0] as { files: File[] };
      expect(dados.files.length).toBe(1);
      expect(dados.files[0].name).toBe('orcamento-12.pdf');
      expect(dados.files[0].size).toBe(pdfMesclado.size);
    });

    it('fluxo completo com pdf-lib e canvas simulados: o arquivo compartilhado é o PDF salvo pelo pdf-lib', async () => {
      const salvo = new Uint8Array([1, 2, 3, 4, 5, 6, 7]);
      const pagina = { drawRectangle: vi.fn(), drawText: vi.fn(), drawImage: vi.fn() };
      const doc = {
        embedJpg: vi.fn().mockResolvedValue('JPG'),
        embedFont: vi.fn().mockResolvedValue('F'),
        getPage: () => ({ getSize: () => ({ width: 600, height: 800 }) }),
        addPage: vi.fn(() => pagina),
        save: vi.fn().mockResolvedValue(salvo),
      };
      (window as unknown as { PDFLib: PdfLib }).PDFLib = {
        PDFDocument: { load: vi.fn().mockResolvedValue(doc) },
        StandardFonts: { Helvetica: 'H' },
        rgb: () => 0,
      } as unknown as PdfLib;
      const { fixture, html } = await criar();
      vi.spyOn(TestBed.inject(FotoOrcamentoService), 'reduzirFoto').mockResolvedValue({ bytes: new Uint8Array([9]), largura: 1000, altura: 500 });
      const original = Object.assign(new Blob(['%PDF-original'], { type: 'application/pdf' }), { arrayBuffer: () => Promise.resolve(new ArrayBuffer(3)) });
      fetchPdf.mockResolvedValue({ ok: true, status: 200, blob: () => Promise.resolve(original) });
      orcamentos.invalidarTodos();
      escolherFoto(html, foto);
      await esperar(fixture);
      botao(html, 'Gerar orçamento').click();
      await microtarefas();
      await esperar(fixture);
      expect(doc.embedJpg).toHaveBeenCalled();
      expect(doc.addPage).toHaveBeenCalledWith([600, 800]);
      expect(pagina.drawImage).toHaveBeenCalled();
      const dados = share.mock.calls[0][0] as { files: File[] };
      expect(dados.files.length).toBe(1);
      expect(dados.files[0].size).toBe(salvo.length);
    });

    it('guarda de saída: com foto escolhida e não enviada pergunta; depois de enviada ou removida, não', async () => {
      const { fixture, html } = await criar();
      vi.spyOn(TestBed.inject(FotoOrcamentoService), 'pdfComFoto').mockResolvedValue(pdfMesclado);
      const guarda = () => fixture.componentInstance.guardaSaida()!;
      expect(guarda().sujo()).toBe(false);
      escolherFoto(html, foto);
      await esperar(fixture);
      expect(guarda().sujo()).toBe(true);
      expect(guarda().tipo).toBe('formulario');
      expect(guarda().mensagem).toBe('Você escolheu uma foto para o orçamento, mas ainda não a enviou. Se sair agora, a escolha será descartada.');
      expect(guarda().rotuloSair).toBe('Sair e descartar a foto');
      botao(html, 'Gerar orçamento').click();
      await microtarefas();
      await esperar(fixture);
      expect(guarda().sujo()).toBe(false); // compartilhado com a foto dentro
      escolherFoto(html, foto);
      await esperar(fixture);
      expect(guarda().sujo()).toBe(true);
      (html.querySelector('.item-linha button') as HTMLButtonElement).click();
      await esperar(fixture);
      expect(guarda().sujo()).toBe(false);
      expect(botao(html, 'Anexar foto do componente')).toBeDefined();
    });

    it('share que falha (fallback) não marca a foto como enviada: a guarda continua perguntando', async () => {
      const { fixture, html } = await criar();
      vi.spyOn(TestBed.inject(FotoOrcamentoService), 'pdfComFoto').mockResolvedValue(pdfMesclado);
      escolherFoto(html, foto);
      await esperar(fixture);
      share.mockRejectedValue(Object.assign(new Error('x'), { name: 'NotAllowedError' }));
      botao(html, 'Gerar orçamento').click();
      await esperar(fixture);
      expect(fixture.componentInstance.guardaSaida()!.sujo()).toBe(true);
    });

    it('não deu pra juntar a foto: manda o PDF sozinho, avisa e oferece "Enviar a foto também" (segundo compartilhamento)', async () => {
      const { fixture, html } = await criar();
      vi.spyOn(TestBed.inject(FotoOrcamentoService), 'pdfComFoto').mockRejectedValue(new Error('pdf-lib'));
      escolherFoto(html, foto);
      await esperar(fixture);
      botao(html, 'Gerar orçamento').click();
      await microtarefas();
      await esperar(fixture);
      const primeiro = share.mock.calls[0][0] as { files: File[] };
      expect(primeiro.files.length).toBe(1);
      expect(primeiro.files[0].type).toBe('application/pdf');
      expect(dialogo.toastTexto()).toBe('Não deu pra juntar a foto ao PDF. Toque em "Enviar a foto também".');
      expect(fixture.componentInstance.guardaSaida()!.sujo()).toBe(true); // a foto ainda não foi
      expect(html.textContent).not.toContain('A foto vai junto');
      botao(html, 'Enviar a foto também').click();
      await esperar(fixture);
      expect(share).toHaveBeenCalledTimes(2);
      expect(share.mock.calls[1][0]).toEqual({ files: [foto] });
      expect(dialogo.toastTexto()).toBe('Foto compartilhada.');
      expect(fixture.componentInstance.guardaSaida()!.sujo()).toBe(false);
    });

    it('trocar a foto volta a mensagem "vai junto" e esconde "Enviar a foto também"', async () => {
      const { fixture, html } = await criar();
      vi.spyOn(TestBed.inject(FotoOrcamentoService), 'pdfComFoto').mockRejectedValue(new Error('pdf-lib'));
      escolherFoto(html, foto);
      await esperar(fixture);
      botao(html, 'Gerar orçamento').click();
      await microtarefas();
      await esperar(fixture);
      expect(botao(html, 'Enviar a foto também')).toBeDefined();
      escolherFoto(html, new File(['x'], 'outra.jpg'));
      await esperar(fixture);
      expect(botao(html, 'Enviar a foto também')).toBeUndefined();
      expect(html.textContent).toContain('A foto vai junto');
    });
  });

  describe('WhatsApp do cliente', () => {
    const textoDoLink = (a: HTMLAnchorElement) => decodeURIComponent(a.href.split('?text=')[1]);

    it('linkWhatsApp: DDI 55 só com DDD; aceita já com 55; recusa o resto', () => {
      expect(linkWhatsApp('(31) 98556-5586')).toBe('https://wa.me/5531985565586');
      expect(linkWhatsApp('3133334444', 'oi tudo')).toBe('https://wa.me/553133334444?text=oi%20tudo');
      expect(linkWhatsApp('5531985565586')).toBe('https://wa.me/5531985565586');
      expect(linkWhatsApp('12345')).toBeNull();
      expect(linkWhatsApp(null)).toBeNull();
    });

    it('sem telefone de celular/fixo BR não há botão nem consulta de status', async () => {
      const { html } = await criar({ ...BASE, cliente: { id: 3, nome: 'X', telefone: '123' } });
      expect(botao(html, 'WhatsApp')).toBeUndefined();
    });

    it('modo manual (API desligada): rótulo padrão', async () => {
      const { html } = await criar();
      expect(botao(html, 'WhatsApp').textContent?.trim()).toBe('Enviar no WhatsApp do cliente');
    });

    it('modo manual com o PDF pronto: baixa o PDF, avisa e abre a conversa, tudo no mesmo toque (síncrono)', async () => {
      const { html } = await criar();
      botao(html, 'WhatsApp').click();
      // sem await: baixar e abrir a conversa acontecem dentro do toque
      expect(cliques.length).toBe(2);
      expect(cliques[0].download).toBe('orcamento-0012.pdf');
      expect(cliques[1].target).toBe('_blank');
      expect(cliques[1].href).toContain('https://wa.me/5531985565586?text=');
      expect(textoDoLink(cliques[1])).toBe('Olá, Maria! Segue o orçamento nº 0012 da DIH Retífica.\nModelo: Fiat Uno, Gol, Scania');
      expect(dialogo.toastTexto()).toBe('PDF salvo no aparelho — na conversa, anexe em 📎 › Documento.');
    });

    it('mensagem usa a descrição do pedido quando não há componentes, e omite o modelo se também vazio', async () => {
      let r = await criar({ ...BASE, componentes: [], pedidoDescricao: ' Motor AP ' });
      botao(r.html, 'WhatsApp').click();
      expect(textoDoLink(cliques[1])).toBe('Olá, Maria! Segue o orçamento nº 0012 da DIH Retífica.\nModelo: Motor AP');
      TestBed.resetTestingModule();
      cliques = [];
      r = await criar({ ...BASE, componentes: [], pedidoDescricao: '' });
      botao(r.html, 'WhatsApp').click();
      expect(textoDoLink(cliques[1])).toBe('Olá, Maria! Segue o orçamento nº 0012 da DIH Retífica.');
    });

    it('modo manual com o PDF ainda gerando: botão ocupado, salva ao ficar pronto e pede segundo toque; o segundo só abre a conversa', async () => {
      let entregar!: () => void;
      fetchPdf.mockImplementation(() => new Promise(r => { entregar = () => r({ ok: true, status: 200, blob: () => Promise.resolve(pdfOriginal) }); }));
      const { fixture, html } = await criar();
      botao(html, 'WhatsApp').click();
      await fixture.whenStable();
      await esperar(fixture, 1);
      expect(botao(html, 'Preparando o PDF…').disabled).toBe(true);
      expect(cliques.length).toBe(0);
      entregar();
      await esperar(fixture);
      expect(cliques.length).toBe(1);
      expect(cliques[0].download).toBe('orcamento-0012.pdf');
      expect(dialogo.toastTexto()).toBe('PDF salvo no aparelho. Toque de novo pra abrir a conversa.');
      expect(botao(html, 'WhatsApp').textContent?.trim()).toBe('Abrir conversa no WhatsApp');
      botao(html, 'WhatsApp').click();
      expect(cliques.length).toBe(2);
      expect(cliques[1].href).toContain('https://wa.me/');
    });

    it('trocar a foto depois de salvar o PDF volta o botão ao rótulo padrão (o PDF salvo não vale mais)', async () => {
      let entregar!: () => void;
      fetchPdf.mockImplementation(() => new Promise(r => { entregar = () => r({ ok: true, status: 200, blob: () => Promise.resolve(pdfOriginal) }); }));
      const { fixture, html } = await criar();
      botao(html, 'WhatsApp').click();
      await esperar(fixture, 1);
      entregar();
      await esperar(fixture);
      expect(botao(html, 'WhatsApp').textContent?.trim()).toBe('Abrir conversa no WhatsApp');
      vi.spyOn(TestBed.inject(FotoOrcamentoService), 'pdfComFoto').mockResolvedValue(new Blob(['x']));
      escolherFoto(html, new File(['x'], 'f.jpg'));
      await esperar(fixture);
      expect(botao(html, 'WhatsApp').textContent?.trim()).toBe('Enviar no WhatsApp do cliente');
    });

    it('modo manual: falha ao gerar o PDF avisa', async () => {
      fetchPdf.mockImplementation(() => new Promise((_, rej) => setTimeout(() => rej(new TypeError('rede')), 0)));
      const { fixture, html } = await criar();
      botao(html, 'WhatsApp').click();
      await esperar(fixture);
      expect(dialogo.toastTexto()).toBe('Não foi possível gerar o PDF.');
      expect(cliques.length).toBe(0);
    });

    describe('API ligada no servidor', () => {
      it('o rótulo muda e o toque pede confirmação com nome e telefone; cancelar não envia', async () => {
        const { html } = await criar(BASE, { whatsAppApi: true });
        expect(botao(html, 'WhatsApp').textContent?.trim()).toBe('Enviar orçamento no WhatsApp do cliente');
        botao(html, 'WhatsApp').click();
        await microtarefas();
        const d = dialogo.dialogos().at(-1)!;
        expect(d.mensagem).toBe('Enviar o orçamento nº 0012 pro WhatsApp de MARIA souza da Silva ((31) 98556-5586)?');
        expect(d.opcoes.map(o => o.rotulo)).toEqual(['Cancelar', 'Enviar']);
        responder(false);
        await microtarefas();
        http.expectNone('/api/pedidos/12/whatsapp');
        expect(cliques.length).toBe(0);
      });

      it('confirmar: POST multipart com o PDF, botão "Enviando…" e aviso de sucesso com o primeiro nome', async () => {
        const { fixture, html } = await criar(BASE, { whatsAppApi: true });
        botao(html, 'WhatsApp').click();
        await microtarefas();
        responder(true);
        await esperar(fixture, 2);
        const req = http.expectOne('/api/pedidos/12/whatsapp');
        expect(req.request.method).toBe('POST');
        const arquivo = (req.request.body as FormData).get('pdf') as File;
        expect(arquivo.name).toBe('orcamento-0012.pdf');
        expect(arquivo.size).toBe(pdfOriginal.size);
        await fixture.whenStable();
        expect(botao(html, 'Enviando…').disabled).toBe(true);
        req.flush({ ok: true });
        await esperar(fixture);
        expect(dialogo.toastTexto()).toBe('Orçamento enviado pro WhatsApp de Maria.');
        expect(botao(html, 'WhatsApp').disabled).toBe(false);
        expect(cliques.length).toBe(0); // não abre a conversa nem baixa o arquivo
      });

      it('com foto escolhida envia o PDF com a foto', async () => {
        const { fixture, html } = await criar(BASE, { whatsAppApi: true });
        const mesclado = new Blob(['%PDF-com-foto-maior'], { type: 'application/pdf' });
        vi.spyOn(TestBed.inject(FotoOrcamentoService), 'pdfComFoto').mockResolvedValue(mesclado);
        escolherFoto(html, new File(['x'], 'f.jpg'));
        await esperar(fixture);
        botao(html, 'WhatsApp').click();
        await microtarefas();
        responder(true);
        await esperar(fixture, 2);
        const req = http.expectOne('/api/pedidos/12/whatsapp');
        expect(((req.request.body as FormData).get('pdf') as File).size).toBe(mesclado.size);
        req.flush({});
        await esperar(fixture);
      });

      it('se o PDF não sair do aparelho manda o multipart sem arquivo (o servidor gera o padrão)', async () => {
        fetchPdf.mockResolvedValue({ ok: false, status: 500, blob: () => Promise.resolve(pdfOriginal) });
        const { fixture, html } = await criar(BASE, { whatsAppApi: true });
        botao(html, 'WhatsApp').click();
        await microtarefas();
        responder(true);
        await esperar(fixture, 3);
        const req = http.expectOne('/api/pedidos/12/whatsapp');
        expect((req.request.body as FormData).has('pdf')).toBe(false);
        req.flush({});
        await esperar(fixture);
      });

      for (const status of [400, 413, 422, 502, 503]) {
        it(`erro ${status}: mostra a mensagem do servidor, volta ao modo manual e o rótulo padrão`, async () => {
          const { fixture, html } = await criar(BASE, { whatsAppApi: true });
          botao(html, 'WhatsApp').click();
          await microtarefas();
          responder(true);
          await esperar(fixture, 2);
          http.expectOne('/api/pedidos/12/whatsapp').flush({ erro: 'Número sem WhatsApp.' }, { status, statusText: 'x' });
          await esperar(fixture);
          expect(dialogo.toastTexto()).toBe('Número sem WhatsApp. Toque de novo pra enviar pela conversa.');
          expect(dialogo.toastErro()).toBe(true);
          expect(botao(html, 'WhatsApp').textContent?.trim()).toBe('Enviar no WhatsApp do cliente');
          // próximo toque já é o modo manual
          botao(html, 'WhatsApp').click();
          expect(cliques.length).toBe(2);
          expect(dialogo.dialogos().length).toBe(0);
        });
      }

      it('erro sem mensagem do servidor usa o texto padrão', async () => {
        const { fixture, html } = await criar(BASE, { whatsAppApi: true });
        botao(html, 'WhatsApp').click();
        await microtarefas();
        responder(true);
        await esperar(fixture, 2);
        http.expectOne('/api/pedidos/12/whatsapp').flush({}, { status: 503, statusText: 'x' });
        await esperar(fixture);
        expect(dialogo.toastTexto()).toBe('Não foi possível enviar automático. Toque de novo pra enviar pela conversa.');
      });

      it('429 (limite de envios): só avisa e continua no modo API', async () => {
        const { fixture, html } = await criar(BASE, { whatsAppApi: true });
        botao(html, 'WhatsApp').click();
        await microtarefas();
        responder(true);
        await esperar(fixture, 2);
        http.expectOne('/api/pedidos/12/whatsapp').flush({ erro: 'Espere 30s.' }, { status: 429, statusText: 'x' });
        await esperar(fixture);
        expect(dialogo.toastTexto()).toBe('Espere 30s.');
        expect(botao(html, 'WhatsApp').textContent?.trim()).toBe('Enviar orçamento no WhatsApp do cliente');
      });

      it('429 sem mensagem usa "Espere um pouco pra enviar de novo."', async () => {
        const { fixture, html } = await criar(BASE, { whatsAppApi: true });
        botao(html, 'WhatsApp').click();
        await microtarefas();
        responder(true);
        await esperar(fixture, 2);
        http.expectOne('/api/pedidos/12/whatsapp').flush({}, { status: 429, statusText: 'x' });
        await esperar(fixture);
        expect(dialogo.toastTexto()).toBe('Espere um pouco pra enviar de novo.');
      });
    });
  });
});
