import { TestBed } from '@angular/core/testing';
import { CompartilharService } from './compartilhar.service';
import { DialogoService } from './dialogo.service';

type Nav = Record<string, unknown>;

describe('CompartilharService', () => {
  let servico: CompartilharService;
  let dialogo: DialogoService;
  let share: ReturnType<typeof vi.fn>;
  let canShare: ReturnType<typeof vi.fn>;
  let aberturas: ReturnType<typeof vi.fn>;

  const pdf = new Blob(['%PDF'], { type: 'application/pdf' });
  const erro = (nome: string) => Object.assign(new Error(nome), { name: nome });
  const novaAbaFalsa = () => ({ close: vi.fn(), location: { href: '' } }) as unknown as Window & { close: ReturnType<typeof vi.fn> };
  const microtarefas = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };

  function definirNavegador(opcoes: { share?: unknown; canShare?: unknown }) {
    for (const [k, v] of Object.entries(opcoes)) {
      if (v === undefined) delete (navigator as unknown as Nav)[k];
      else Object.defineProperty(navigator, k, { value: v, configurable: true, writable: true });
    }
  }

  beforeEach(() => {
    TestBed.configureTestingModule({});
    servico = TestBed.inject(CompartilharService);
    dialogo = TestBed.inject(DialogoService);
    share = vi.fn().mockResolvedValue(undefined);
    canShare = vi.fn().mockReturnValue(true);
    definirNavegador({ share, canShare });
    aberturas = vi.fn();
    vi.stubGlobal('open', aberturas);
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:pdf'), revokeObjectURL: vi.fn() });
    vi.spyOn(dialogo, 'toast');
  });

  afterEach(() => {
    definirNavegador({ share: undefined, canShare: undefined });
    delete (URL as unknown as Nav)['createObjectURL'];
    delete (URL as unknown as Nav)['revokeObjectURL'];
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('temSuporteACompartilharArquivo', () => {
    it('true quando share e canShare existem e canShare aceita PDF', () => {
      expect(servico.temSuporteACompartilharArquivo()).toBe(true);
      const arg = canShare.mock.calls[0][0] as { files: File[] };
      expect(arg.files[0].type).toBe('application/pdf');
    });

    it('false sem share, sem canShare, com canShare recusando ou lançando', () => {
      definirNavegador({ share: undefined });
      expect(servico.temSuporteACompartilharArquivo()).toBe(false);
      definirNavegador({ share, canShare: undefined });
      expect(servico.temSuporteACompartilharArquivo()).toBe(false);
      definirNavegador({ canShare: vi.fn().mockReturnValue(false) });
      expect(servico.temSuporteACompartilharArquivo()).toBe(false);
      definirNavegador({ canShare: vi.fn(() => { throw new Error('x'); }) });
      expect(servico.temSuporteACompartilharArquivo()).toBe(false);
    });
  });

  describe('compartilharOrcamento', () => {
    it('com o PDF já pronto, navigator.share é chamado só depois de microtarefas (nenhum temporizador/rede antes), sem abrir aba', async () => {
      vi.useFakeTimers(); // se algo esperasse um setTimeout, o share nunca seria chamado aqui
      const pronto = Promise.resolve(pdf);
      const resultado = servico.compartilharOrcamento(pronto, 'orcamento-12.pdf', null);
      await microtarefas();
      expect(share).toHaveBeenCalledTimes(1);
      expect(aberturas).not.toHaveBeenCalled();
      expect(await resultado).toBe('compartilhado');
    });

    it('compartilha só o arquivo PDF, sem text nem title', async () => {
      expect(await servico.compartilharOrcamento(Promise.resolve(pdf), 'orcamento-12.pdf', null)).toBe('compartilhado');
      const dados = share.mock.calls[0][0] as { files: File[]; text?: string; title?: string };
      expect(Object.keys(dados)).toEqual(['files']);
      expect(dados.files.length).toBe(1);
      expect(dados.files[0].name).toBe('orcamento-12.pdf');
      expect(dados.files[0].type).toBe('application/pdf');
    });

    it('espera o PDF ainda em preparo e então compartilha', async () => {
      let resolver!: (b: Blob) => void;
      const pendente = new Promise<Blob>(r => { resolver = r; });
      const resultado = servico.compartilharOrcamento(pendente, 'o.pdf', null);
      await microtarefas();
      expect(share).not.toHaveBeenCalled();
      resolver(pdf);
      expect(await resultado).toBe('compartilhado');
      expect(share).toHaveBeenCalledTimes(1);
    });

    it('fecha a aba reservada antes de compartilhar', async () => {
      const aba = novaAbaFalsa();
      await servico.compartilharOrcamento(Promise.resolve(pdf), 'o.pdf', aba);
      expect(aba.close).toHaveBeenCalled();
    });

    it('AbortError depois de mais de 400ms = o usuário cancelou: sem fallback nem aviso', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      share.mockImplementation(async () => { vi.setSystemTime(Date.now() + 500); throw erro('AbortError'); });
      expect(await servico.compartilharOrcamento(Promise.resolve(pdf), 'o.pdf', null)).toBe('cancelado');
      expect(dialogo.toast).not.toHaveBeenCalled();
      expect(aberturas).not.toHaveBeenCalled();
    });

    it('AbortError em menos de 400ms = navegador recusou: avisa o tempo e abre o PDF direto', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      share.mockImplementation(async () => { vi.setSystemTime(Date.now() + 120); throw erro('AbortError'); });
      expect(await servico.compartilharOrcamento(Promise.resolve(pdf), 'o.pdf', null)).toBe('fallback');
      expect(dialogo.toast).toHaveBeenCalledWith('O navegador recusou compartilhar antes de abrir o menu (120ms). Abrindo o PDF direto.', true);
      expect(aberturas).toHaveBeenCalledWith('blob:pdf', '_blank');
    });

    it('AbortError em exatamente 400ms ainda é recusa (só passa de 400 vale como cancelamento)', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      share.mockImplementation(async () => { vi.setSystemTime(Date.now() + 400); throw erro('AbortError'); });
      expect(await servico.compartilharOrcamento(Promise.resolve(pdf), 'o.pdf', null)).toBe('fallback');
    });

    it('outro erro do share (NotAllowedError) vai para o fallback com o nome do erro', async () => {
      share.mockRejectedValue(erro('NotAllowedError'));
      expect(await servico.compartilharOrcamento(Promise.resolve(pdf), 'o.pdf', null)).toBe('fallback');
      expect(dialogo.toast).toHaveBeenCalledWith('Falha ao abrir o menu de compartilhar (NotAllowedError). Abrindo o PDF direto.', true);
    });

    it('fallback usa a aba reservada quando há uma (location.href) em vez de window.open', async () => {
      canShare.mockReturnValue(false);
      const aba = novaAbaFalsa();
      expect(await servico.compartilharOrcamento(Promise.resolve(pdf), 'o.pdf', aba)).toBe('fallback');
      expect(aba.location.href).toBe('blob:pdf');
      expect(aberturas).not.toHaveBeenCalled();
      expect(dialogo.toast).toHaveBeenCalledWith('Este navegador não aceita compartilhar arquivo PDF. Abrindo o PDF direto.', true);
      expect(share).not.toHaveBeenCalled();
    });

    it('sem navigator.share e sem navigator.canShare: mensagens próprias e PDF aberto direto', async () => {
      definirNavegador({ share: undefined });
      expect(await servico.compartilharOrcamento(Promise.resolve(pdf), 'o.pdf', null)).toBe('fallback');
      expect(dialogo.toast).toHaveBeenLastCalledWith('Este navegador não tem a opção de compartilhar arquivos. Abrindo o PDF direto.', true);
      definirNavegador({ share, canShare: undefined });
      expect(await servico.compartilharOrcamento(Promise.resolve(pdf), 'o.pdf', null)).toBe('fallback');
      expect(dialogo.toast).toHaveBeenLastCalledWith('Este navegador não sabe verificar se pode compartilhar arquivos. Abrindo o PDF direto.', true);
      expect(aberturas).toHaveBeenCalledTimes(2);
    });

    it('canShare lançando erro vira fallback com a mensagem', async () => {
      canShare.mockImplementation(() => { throw new Error('boom'); });
      expect(await servico.compartilharOrcamento(Promise.resolve(pdf), 'o.pdf', null)).toBe('fallback');
      expect(dialogo.toast).toHaveBeenCalledWith('Erro ao verificar compartilhamento (boom). Abrindo o PDF direto.', true);
    });

    it('PDF que falhou ao gerar: erro, toast, aba fechada e nada compartilhado', async () => {
      const aba = novaAbaFalsa();
      expect(await servico.compartilharOrcamento(Promise.reject(new Error('HTTP 500')), 'o.pdf', aba)).toBe('erro');
      expect(dialogo.toast).toHaveBeenCalledWith('Não foi possível gerar o orçamento.', true);
      expect(aba.close).toHaveBeenCalled();
      expect(share).not.toHaveBeenCalled();
    });

    it('duplo toque: o segundo é ignorado ("cancelado") e fecha a aba dele', async () => {
      let terminar!: () => void;
      share.mockReturnValue(new Promise<void>(r => { terminar = r; }));
      const primeiro = servico.compartilharOrcamento(Promise.resolve(pdf), 'o.pdf', null);
      await microtarefas();
      const aba = novaAbaFalsa();
      expect(await servico.compartilharOrcamento(Promise.resolve(pdf), 'o.pdf', aba)).toBe('cancelado');
      expect(aba.close).toHaveBeenCalled();
      expect(share).toHaveBeenCalledTimes(1);
      terminar();
      expect(await primeiro).toBe('compartilhado');
      // liberado: dá pra compartilhar de novo
      share.mockResolvedValue(undefined);
      expect(await servico.compartilharOrcamento(Promise.resolve(pdf), 'o.pdf', null)).toBe('compartilhado');
    });
  });

  describe('compartilharFoto', () => {
    const foto = new File(['x'], 'foto.jpg', { type: 'image/jpeg' });

    it('compartilha a foto e devolve true', async () => {
      expect(await servico.compartilharFoto(foto)).toBe(true);
      expect(share).toHaveBeenCalledWith({ files: [foto] });
    });

    it('AbortError: false, sem aviso', async () => {
      share.mockRejectedValue(erro('AbortError'));
      expect(await servico.compartilharFoto(foto)).toBe(false);
      expect(dialogo.toast).not.toHaveBeenCalled();
    });

    it('outro erro: false com aviso do nome do erro', async () => {
      share.mockRejectedValue(erro('NotAllowedError'));
      expect(await servico.compartilharFoto(foto)).toBe(false);
      expect(dialogo.toast).toHaveBeenCalledWith('Não foi possível compartilhar a foto (NotAllowedError).', true);
    });

    it('com outro compartilhamento em andamento devolve false sem chamar o share', async () => {
      let terminar!: () => void;
      share.mockReturnValue(new Promise<void>(r => { terminar = r; }));
      const primeira = servico.compartilharFoto(foto);
      expect(await servico.compartilharFoto(foto)).toBe(false);
      expect(share).toHaveBeenCalledTimes(1);
      terminar();
      await primeira;
    });
  });

  describe('baixarArquivo e abrirLink', () => {
    it('baixarArquivo clica num link com download e revoga a URL depois de 60s', () => {
      vi.useFakeTimers();
      const cliques: HTMLAnchorElement[] = [];
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { cliques.push(this); });
      servico.baixarArquivo(pdf, 'orcamento-0012.pdf');
      expect(cliques.length).toBe(1);
      expect(cliques[0].download).toBe('orcamento-0012.pdf');
      expect(cliques[0].getAttribute('href')).toBe('blob:pdf');
      expect(document.body.contains(cliques[0])).toBe(false);
      expect(URL.revokeObjectURL).not.toHaveBeenCalled();
      vi.advanceTimersByTime(60000);
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:pdf');
    });

    it('abrirLink clica num link target=_blank rel=noopener', () => {
      const cliques: HTMLAnchorElement[] = [];
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { cliques.push(this); });
      servico.abrirLink('https://wa.me/5531985565586');
      expect(cliques[0].getAttribute('href')).toBe('https://wa.me/5531985565586');
      expect(cliques[0].target).toBe('_blank');
      expect(cliques[0].rel).toBe('noopener');
    });
  });
});
