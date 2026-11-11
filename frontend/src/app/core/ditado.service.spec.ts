import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provedoresDeTela } from '../testing/ajuda';
import { ErroApi } from './api.service';
import { DialogoService } from './dialogo.service';
import { DITADO_AVISO_CHAVE, DitadoService, ResultadoDitado } from './ditado.service';

const RESULTADO: ResultadoDitado = { sessaoId: 's1', rodada: 1, maxRodadas: 4, situacao: 'PRONTO', perguntas: [], entendimento: {} };

describe('DitadoService', () => {
  let servico: DitadoService;
  let http: HttpTestingController;
  let dialogo: DialogoService;

  const assentar = () => new Promise(r => setTimeout(r, 0));

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: provedoresDeTela() });
    servico = TestBed.inject(DitadoService);
    http = TestBed.inject(HttpTestingController);
    dialogo = TestBed.inject(DialogoService);
  });

  afterEach(() => { http.verify(); vi.restoreAllMocks(); });

  describe('status', () => {
    it('GET /api/ditado/status: habilitado true liga o botão', async () => {
      const p = servico.habilitado();
      http.expectOne('/api/ditado/status').flush({ habilitado: true, usosRestantesHoje: 99 });
      expect(await p).toBe(true);
    });

    it('habilitado false (sem chave da IA no servidor) deixa o botão escondido', async () => {
      const p = servico.habilitado();
      http.expectOne('/api/ditado/status').flush({ habilitado: false, usosRestantesHoje: 0 });
      expect(await p).toBe(false);
    });

    it('guarda a resposta enquanto o app está aberto: a segunda pergunta não vai ao servidor', async () => {
      const a = servico.habilitado();
      http.expectOne('/api/ditado/status').flush({ habilitado: true });
      expect(await a).toBe(true);
      expect(await servico.habilitado()).toBe(true);
      http.expectNone('/api/ditado/status');
    });

    it('duas perguntas ao mesmo tempo viram uma só chamada', async () => {
      const a = servico.habilitado();
      const b = servico.habilitado();
      http.expectOne('/api/ditado/status').flush({ habilitado: true });
      expect(await Promise.all([a, b])).toEqual([true, true]);
    });

    it.each([404, 500, 502, 503])('status %i vale como desligado, sem toast, e a próxima abertura pergunta de novo', async (codigo) => {
      const a = servico.habilitado();
      http.expectOne('/api/ditado/status').flush({ erro: 'x' }, { status: codigo, statusText: 'erro' });
      expect(await a).toBe(false);
      expect(dialogo.toastVisivel()).toBe(false);
      const b = servico.habilitado();
      http.expectOne('/api/ditado/status').flush({ habilitado: true });
      expect(await b).toBe(true);
    });

    it('resposta vazia (null) vale como desligado', async () => {
      const a = servico.habilitado();
      http.expectOne('/api/ditado/status').flush(null);
      expect(await a).toBe(false);
    });
  });

  describe('chamadas', () => {
    it('iniciar faz POST /api/ditado com o texto e devolve o resultado', async () => {
      const p = servico.iniciar('pedido do João');
      const req = http.expectOne('/api/ditado');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ texto: 'pedido do João' });
      req.flush(RESULTADO);
      expect(await p).toEqual(RESULTADO);
    });

    it('responder faz POST /api/ditado/{id}/respostas, escapando o id', async () => {
      const respostas = [{ perguntaId: 'r1p1', opcaoIndice: 1 }, { perguntaId: 'r1p2', texto: 'sexta' }];
      const p = servico.responder('a/b c', respostas);
      const req = http.expectOne('/api/ditado/a%2Fb%20c/respostas');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ respostas });
      req.flush(RESULTADO);
      expect(await p).toEqual(RESULTADO);
    });

    it.each([
      [400, 'O texto está vazio.'], [404, 'Conversa expirada.'], [409, 'Rodadas esgotadas.'],
      [429, 'O limite de 100 ditados por dia foi atingido.'], [502, 'A IA não conseguiu responder.'],
      [503, 'A IA do ditado não está configurada corretamente.'],
    ])('erro %i do servidor chega como ErroApi com o "erro" do corpo e sem o toast genérico', async (codigo, mensagem) => {
      const a = servico.iniciar('x');
      http.expectOne('/api/ditado').flush({ erro: mensagem }, { status: codigo, statusText: 'erro' });
      const ea = await a.catch(e => e);
      expect(ea).toBeInstanceOf(ErroApi);
      expect(ea.status).toBe(codigo);
      expect(ea.detalhe).toBe(mensagem);

      const b = servico.responder('s1', [{ perguntaId: 'r1p1', opcaoIndice: 0 }]);
      http.expectOne('/api/ditado/s1/respostas').flush({ erro: mensagem }, { status: codigo, statusText: 'erro' });
      const eb = await b.catch(e => e);
      expect(eb.status).toBe(codigo);
      expect(eb.detalhe).toBe(mensagem);
      expect(dialogo.toastVisivel()).toBe(false);
    });

    it('erro fora da lista (500) mostra o toast genérico do interceptor', async () => {
      const a = servico.iniciar('x');
      http.expectOne('/api/ditado').flush({ erro: 'boom' }, { status: 500, statusText: 'erro' });
      await a.catch(() => undefined);
      expect(dialogo.toastVisivel()).toBe(true);
      expect(dialogo.toastErro()).toBe(true);
    });
  });

  describe('aviso de privacidade', () => {
    const TEXTO = 'O áudio é transcrito pelo navegador (no Chrome, pelo Google). O texto, junto com os nomes de clientes e do catálogo da empresa, '
      + 'vai para a IA da Anthropic montar o pedido. Nada é salvo sozinho: você confere antes de preencher.';

    it('na primeira vez pergunta, com o texto do app e os botões Cancelar e Continuar', async () => {
      const p = servico.avisoDePrivacidade();
      await assentar();
      const d = dialogo.dialogos().at(-1)!;
      expect(d.mensagem).toBe(TEXTO);
      expect(d.opcoes.map(o => o.rotulo)).toEqual(['Cancelar', 'Continuar']);
      expect(d.opcoes[1].estilo).toBe('btn-primary');
      d.responder(true);
      expect(await p).toBe(true);
    });

    it('Continuar guarda a aceitação no localStorage (mesma chave do app atual) e não pergunta de novo', async () => {
      const p = servico.avisoDePrivacidade();
      await assentar();
      dialogo.dialogos().at(-1)!.responder(true);
      await p;
      expect(localStorage.getItem(DITADO_AVISO_CHAVE)).toBe('1');
      expect(DITADO_AVISO_CHAVE).toBe('retifica_ditado_aviso');
      expect(await servico.avisoDePrivacidade()).toBe(true);
      expect(dialogo.dialogos().length).toBe(0);
    });

    it('Cancelar (ou Esc) não deixa seguir e não guarda nada: pergunta de novo da próxima vez', async () => {
      const p = servico.avisoDePrivacidade();
      await assentar();
      dialogo.dialogos().at(-1)!.responder(false);
      expect(await p).toBe(false);
      expect(localStorage.getItem(DITADO_AVISO_CHAVE)).toBeNull();
      const q = servico.avisoDePrivacidade();
      await assentar();
      expect(dialogo.dialogos().length).toBe(1);
      dialogo.dialogos().at(-1)!.responder(false);
      await q;
    });

    it('já aceito em outra sessão (valor "1"): segue direto', async () => {
      localStorage.setItem(DITADO_AVISO_CHAVE, '1');
      expect(await servico.avisoDePrivacidade()).toBe(true);
      expect(dialogo.dialogos().length).toBe(0);
    });

    it('sem armazenamento (localStorage lança): pergunta toda vez e segue mesmo assim', async () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('bloqueado'); });
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('bloqueado'); });
      const p = servico.avisoDePrivacidade();
      await assentar();
      dialogo.dialogos().at(-1)!.responder(true);
      expect(await p).toBe(true);
      const q = servico.avisoDePrivacidade();
      await assentar();
      expect(dialogo.dialogos().length).toBe(1);
      dialogo.dialogos().at(-1)!.responder(true);
      await q;
    });
  });

  describe('voz', () => {
    afterEach(() => {
      delete (window as unknown as Record<string, unknown>)['webkitSpeechRecognition'];
      delete (window as unknown as Record<string, unknown>)['Capacitor'];
    });

    it('vozDisponivel: falso sem reconhecimento, verdadeiro com Web Speech ou com o plugin do APK', () => {
      expect(servico.vozDisponivel()).toBe(false);
      (window as unknown as Record<string, unknown>)['webkitSpeechRecognition'] = function () { /* falso */ };
      expect(servico.vozDisponivel()).toBe(true);
      delete (window as unknown as Record<string, unknown>)['webkitSpeechRecognition'];
      (window as unknown as Record<string, unknown>)['Capacitor'] = { isNativePlatform: () => true, Plugins: { DitadoVoz: {} } };
      expect(servico.vozDisponivel()).toBe(true);
    });

    it('criarVoz devolve null sem reconhecimento e os erros do microfone viram toast vermelho', () => {
      const alvo = document.createElement('textarea');
      const cb = { aoMudar: () => undefined, aoParar: () => undefined };
      expect(servico.criarVoz(alvo, cb)).toBeNull();

      let rec: { onerror: (ev: { error: string }) => void } | undefined;
      (window as unknown as Record<string, unknown>)['webkitSpeechRecognition'] = function (this: unknown) {
        rec = this as typeof rec; // o construtor falso guarda a própria instância
        Object.assign(this as object, { start() { /* falso */ }, stop() { /* falso */ }, abort() { /* falso */ } });
      };
      const voz = servico.criarVoz(alvo, cb)!;
      expect(voz).not.toBeNull();
      voz.iniciar();
      rec!.onerror({ error: 'audio-capture' });
      expect(dialogo.toastTexto()).toBe('Não achei o microfone. Escreva o pedido.');
      expect(dialogo.toastErro()).toBe(true);
    });
  });
});
