import { TestBed } from '@angular/core/testing';
import { DialogoService } from '../../core/dialogo.service';
import { DITADO_AVISO_CHAVE, ResultadoDitado } from '../../core/ditado.service';
import { RascunhoService } from '../../core/rascunho.service';
import { Entendimento, Pergunta, RefEntendida } from '../../shared/ditado-regra';
import { digitar, esperar } from '../../testing/ajuda';
import { Formulario, OpcoesFormulario, abaVisivel, botao, montarFormulario, textoDe } from '../../testing/pedido-form';
import { ReconhecimentoFalso } from '../../testing/voz';

/** Texto visível com um espaço entre os elementos (o textContent cola "tag" e "corpo", que no navegador são colunas). */
function visivel(no: Node | null | undefined): string {
  if (!no) return '';
  const partes: string[] = [];
  no.childNodes.forEach(c => {
    const t = c.nodeType === Node.TEXT_NODE ? (c.textContent ?? '').trim() : visivel(c);
    if (t) partes.push(t);
  });
  return partes.join(' ').replace(/\s+/g, ' ').trim();
}

const janela = window as unknown as Record<string, unknown>;

const ok = (id: number, nome: string, extra: Partial<RefEntendida> = {}): RefEntendida =>
  ({ estado: 'OK', id, nome, categoria: null, opcoes: [], ouvido: null, ...extra });

/** Pedido completo e sem pendência: cliente, modelo, serviço, peça, valores, entrega e situação. */
const COMPLETO = (extra: Entendimento = {}): Entendimento => ({
  cliente: ok(4, 'João da Silva'),
  componentes: [ok(1, 'Fiat Uno', { categoria: 'CABECOTE' })],
  servicos: [{ estado: 'OK', id: 10, nome: 'Plainar', categoria: 'CABECOTE', quantidade: null, opcoes: [] }],
  pecas: [{ estado: 'OK', id: 20, nome: 'Junta', categoria: 'CABECOTE', quantidade: 2, opcoes: [] }],
  valores: [{ categoria: 'CABECOTE', valorServicos: 800, valorPecas: 200 }],
  entregaData: '2030-01-15', status: 'PRONTO',
  ...extra,
});

const PRONTO = (entendimento: Entendimento, extra: Partial<ResultadoDitado> = {}): ResultadoDitado =>
  ({ sessaoId: 's1', rodada: 1, maxRodadas: 4, situacao: 'PRONTO', perguntas: [], entendimento, avisos: [], usosRestantesHoje: 99, ...extra });

const DUVIDA_JOAO: RefEntendida = { estado: 'DUVIDA', ouvido: 'joão', opcoes: [{ id: 4, nome: 'João da Silva' }, { id: 5, nome: 'João Pereira' }] };

const PERGUNTA_ESCOLHA: Pergunta = {
  id: 'r1p1', texto: 'Qual João?', tipo: 'ESCOLHA',
  opcoes: [{ indice: 0, rotulo: 'João da Silva' }, { indice: 1, rotulo: 'João Pereira' }],
};
const PERGUNTA_ABERTA: Pergunta = { id: 'r1p2', texto: 'Para quando?', tipo: 'ABERTA' };

const PERGUNTAS = (perguntas: Pergunta[], entendimento: Entendimento = {}): ResultadoDitado =>
  ({ sessaoId: 's1', rodada: 1, maxRodadas: 4, situacao: 'PERGUNTAS', perguntas, entendimento, avisos: [], usosRestantesHoje: 99 });

describe('Ditar pedido (painel)', () => {
  let f: Formulario;

  const aceitouAviso = () => localStorage.setItem(DITADO_AVISO_CHAVE, '1');
  const abrirFormulario = async (opcoes: OpcoesFormulario = {}) => {
    f = await montarFormulario({ ditado: true, antes: aceitouAviso, ...opcoes });
  };
  const painel = () => f.html.querySelector('.ditado-overlay') as HTMLElement | null;
  const btn = (texto: string) =>
    [...(painel() ?? f.html).querySelectorAll('button')].find(b => b.textContent?.trim() === texto) as HTMLButtonElement;
  const clicar = async (el: Element | undefined | null) => { (el as HTMLElement).click(); await esperar(f.fixture); };
  const abrirPainel = async () => { await clicar(botao(f.html, 'Ditar pedido')); };
  const campoTexto = () => f.html.querySelector('#ditadoTexto') as HTMLTextAreaElement;
  const escrever = async (texto: string) => { digitar(campoTexto() as unknown as HTMLInputElement, texto); await esperar(f.fixture); };
  const titulo = () => textoDe(painel()?.querySelector('.ditado-titulo'));
  const linhas = () => [...(painel()?.querySelectorAll('.ditado-linha') ?? [])].map(l => visivel(l));
  const erro = () => textoDe(painel()?.querySelector('.ditado-erro'));
  const responder = async (url: string, corpo: any, status = 200) => {
    const req = f.http.expectOne(url);
    req.flush(corpo, status === 200 ? undefined : { status, statusText: 'erro' });
    await esperar(f.fixture);
    return req;
  };
  /** Escreve o texto, toca em "Entender o pedido" e devolve o corpo enviado. */
  const entender = async (texto: string, resultado: ResultadoDitado | { corpo: object | string; status: number }) => {
    await escrever(texto);
    await clicar(btn('Entender o pedido'));
    expect(titulo()).toBe('Ditar pedido');
    expect(textoDe(painel()!.querySelector('.ditado-espera'))).toBe('Entendendo o pedido…');
    const req = f.http.expectOne('/api/ditado');
    expect(req.request.body).toEqual({ texto: texto.trim() });
    if ('corpo' in resultado) req.flush(resultado.corpo, { status: resultado.status, statusText: 'erro' });
    else req.flush(resultado);
    await esperar(f.fixture);
  };
  const dadosAtuais = () => f.componente.obterAtual();
  const escolherClienteNoForm = async (nome: string) =>
    clicar([...f.html.querySelectorAll('.lista-escolha button')].find(b => b.textContent!.includes(nome)));

  afterEach(() => {
    f.http.verify();
    delete janela['webkitSpeechRecognition'];
    delete janela['Capacitor'];
    delete (navigator as unknown as Record<string, unknown>)['vibrate'];
    ReconhecimentoFalso.instancias = [];
  });

  describe('botão "Ditar pedido"', () => {
    it('aparece no pedido novo quando o servidor tem a IA ligada, antes da dica', async () => {
      await abrirFormulario();
      const b = botao(f.html, 'Ditar pedido');
      expect(b).toBeTruthy();
      expect(b.className).toBe('btn btn-secondary btn-block');
      expect(b.querySelector('svg')).toBeTruthy();
      const form = f.html.querySelector('form')!;
      expect(textoDe(form.firstElementChild)).toBe('Ditar pedido');
      expect(painel()).toBeNull();
    });

    it('fica escondido quando a IA está desligada (habilitado false)', async () => {
      await abrirFormulario({ ditado: false });
      expect(botao(f.html, 'Ditar pedido')).toBeUndefined();
    });

    it('fica escondido ao editar um pedido (e nem pergunta o status ao servidor)', async () => {
      await abrirFormulario({ id: '12' });
      expect(botao(f.html, 'Ditar pedido')).toBeUndefined();
    });

    it('na primeira vez mostra o aviso de privacidade; Cancelar não abre o painel', async () => {
      f = await montarFormulario({ ditado: true });
      await clicar(botao(f.html, 'Ditar pedido'));
      const d = f.dialogo.dialogos().at(-1)!;
      expect(d.mensagem).toContain('vai para a IA da Anthropic');
      d.responder(false);
      await esperar(f.fixture);
      expect(painel()).toBeNull();
      expect(localStorage.getItem(DITADO_AVISO_CHAVE)).toBeNull();
    });

    it('Continuar no aviso abre o painel e guarda que já foi aceito', async () => {
      f = await montarFormulario({ ditado: true });
      await clicar(botao(f.html, 'Ditar pedido'));
      f.dialogo.dialogos().at(-1)!.responder(true);
      await esperar(f.fixture);
      expect(painel()).toBeTruthy();
      expect(localStorage.getItem(DITADO_AVISO_CHAVE)).toBe('1');
    });

    it('um segundo toque com o aviso aberto não abre dois painéis', async () => {
      f = await montarFormulario({ ditado: true });
      const b = botao(f.html, 'Ditar pedido');
      b.click(); b.click();
      await esperar(f.fixture);
      expect(f.dialogo.dialogos().length).toBe(1);
      f.dialogo.dialogos().at(-1)!.responder(true);
      await esperar(f.fixture);
      expect(f.html.querySelectorAll('.ditado-overlay').length).toBe(1);
    });
  });

  describe('1) gravar ou escrever', () => {
    beforeEach(async () => { await abrirFormulario(); await abrirPainel(); });

    it('abre com o visual do app: overlay com role dialog, painel blueprint, título, exemplo e botões', () => {
      const p = painel()!;
      expect(p.getAttribute('role')).toBe('dialog');
      expect(p.getAttribute('aria-modal')).toBe('true');
      expect(p.getAttribute('aria-label')).toBe('Ditar pedido');
      expect(p.querySelector('.ditado-painel.blueprint')).toBeTruthy();
      expect(p.querySelectorAll('.ditado-painel > i.corner').length).toBe(4);
      expect(titulo()).toBe('Ditar pedido');
      expect(textoDe(p)).toContain('Exemplo: "Pedido do João da Silva, cabeçote do AP 1.8');
      const area = campoTexto();
      expect(area.rows).toBe(6);
      expect(area.maxLength).toBe(2000);
      expect(area.placeholder).toBe('Fale ou escreva o pedido…');
      expect(area.getAttribute('aria-label')).toBe('Pedido ditado');
      expect(btn('Entender o pedido').className).toBe('btn btn-primary btn-block');
      expect(btn('Cancelar').className).toBe('btn btn-ghost btn-block');
    });

    it('sem reconhecimento de voz: só a caixa de texto, com o aviso do teclado do celular', () => {
      expect(btn('Falar')).toBeUndefined();
      expect(textoDe(painel())).toContain('Este navegador não ouve a voz. Escreva o pedido aqui, ou toque no microfone do teclado do celular.');
    });

    it('"Entender o pedido" só liga com texto', async () => {
      expect(btn('Entender o pedido').disabled).toBe(true);
      await escrever('   ');
      expect(btn('Entender o pedido').disabled).toBe(true);
      await escrever('pedido do João');
      expect(btn('Entender o pedido').disabled).toBe(false);
    });

    it('Cancelar fecha o painel sem chamar o servidor', async () => {
      await clicar(btn('Cancelar'));
      expect(painel()).toBeNull();
    });

    it('Esc fecha o painel', async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      await esperar(f.fixture);
      expect(painel()).toBeNull();
    });

    it('outra tecla não fecha', async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
      await esperar(f.fixture);
      expect(painel()).toBeTruthy();
    });

    it('Esc com um diálogo aberto por cima fecha só o diálogo (ocultar-esc do app.js)', async () => {
      const resposta = TestBed.inject(DialogoService).escolher('Posso?', [{ rotulo: 'Não', valor: 'n' }, { rotulo: 'Sim', valor: 's' }]);
      await esperar(f.fixture);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      await esperar(f.fixture);
      expect(await resposta).toBe('n');
      expect(painel()).toBeTruthy();
    });

    it('trocar de rota (hashchange) fecha o painel', async () => {
      window.dispatchEvent(new HashChangeEvent('hashchange'));
      await esperar(f.fixture);
      expect(painel()).toBeNull();
    });

    it('depois de fechar, abrir de novo começa limpo', async () => {
      await escrever('algo');
      await clicar(btn('Cancelar'));
      await abrirPainel();
      expect(campoTexto().value).toBe('');
      expect(btn('Entender o pedido').disabled).toBe(true);
    });
  });

  describe('voz no painel', () => {
    beforeEach(() => {
      janela['webkitSpeechRecognition'] = ReconhecimentoFalso;
      ReconhecimentoFalso.instancias = [];
      Object.defineProperty(navigator, 'vibrate', { value: vi.fn(), configurable: true, writable: true });
    });
    const rec = () => ReconhecimentoFalso.instancias[0];
    const estado = () => painel()!.querySelector('.ditado-ouvindo') as HTMLElement;

    it('Falar liga o microfone: "Ligando…" em destaque até o navegador começar a ouvir (vibra 40 ms)', async () => {
      await abrirFormulario(); await abrirPainel();
      expect(textoDe(btn('Falar'))).toBe('Falar');
      expect(textoDe(estado())).toBe('');
      await clicar(btn('Falar'));
      expect(rec().iniciou).toBe(1);
      expect(textoDe(btn('Parar'))).toBe('Parar');
      expect(btn('Parar').classList.contains('ditado-gravando')).toBe(true);
      expect(textoDe(estado())).toBe('Ligando o microfone… espere a vibração para falar.');
      expect(estado().classList.contains('ditado-aguarde')).toBe(true);
      rec().onaudiostart!();
      await esperar(f.fixture);
      expect(textoDe(estado())).toBe('Ouvindo… pode falar. Toque em Parar quando terminar.');
      expect(estado().classList.contains('ditado-aguarde')).toBe(false);
      expect(navigator.vibrate).toHaveBeenCalledWith(40);
    });

    it('o que se fala vai para a caixa (sem repetir no padrão do Android) e liga "Entender o pedido"', async () => {
      await abrirFormulario(); await abrirPainel();
      await clicar(btn('Falar'));
      rec().resultados('pedido');
      rec().resultados('pedido', 'pedido do');
      rec().resultados('pedido', 'pedido do', 'pedido do João da Silva', 'cabeça', 'cabeça de ap');
      await esperar(f.fixture);
      expect(campoTexto().value).toBe('pedido do João da Silva cabeça de ap');
      expect(btn('Entender o pedido').disabled).toBe(false);
    });

    it('quando o navegador para sozinho, volta a "Ligando…" e religa', async () => {
      await abrirFormulario(); await abrirPainel();
      await clicar(btn('Falar'));
      rec().onaudiostart!();
      rec().onend!();
      await esperar(f.fixture);
      expect(rec().iniciou).toBe(2);
      expect(textoDe(estado())).toBe('Ligando o microfone… espere a vibração para falar.');
      expect(textoDe(btn('Parar'))).toBe('Parar');
    });

    it('Parar desliga e o botão volta a "Falar"', async () => {
      await abrirFormulario(); await abrirPainel();
      await clicar(btn('Falar'));
      await clicar(btn('Parar'));
      expect(rec().parou).toBe(1);
      expect(textoDe(btn('Falar'))).toBe('Falar');
      expect(textoDe(estado())).toBe('');
      rec().onend!();
      await esperar(f.fixture);
      expect(textoDe(btn('Falar'))).toBe('Falar');
    });

    it('sem permissão do microfone: toast de erro e o botão volta a "Falar"', async () => {
      await abrirFormulario(); await abrirPainel();
      await clicar(btn('Falar'));
      rec().onerror!({ error: 'not-allowed' });
      rec().onend!();
      await esperar(f.fixture);
      expect(f.dialogo.toastTexto()).toBe('Sem permissão para o microfone. Escreva o pedido, ou libere o microfone para este site.');
      expect(f.dialogo.toastErro()).toBe(true);
      expect(textoDe(btn('Falar'))).toBe('Falar');
    });

    it('"Entender o pedido" com o microfone ligado para a escuta antes de enviar', async () => {
      await abrirFormulario(); await abrirPainel();
      await clicar(btn('Falar'));
      rec().resultados('pedido do João');
      await esperar(f.fixture);
      await clicar(btn('Entender o pedido'));
      expect(rec().parou).toBe(1);
      expect(rec().abortou).toBe(1); // ao entrar na fase "entendendo" o reconhecedor é encerrado
      f.http.expectOne('/api/ditado').flush(PRONTO({}));
      await esperar(f.fixture);
    });

    it('fechar o painel (Esc) com o microfone ligado encerra o reconhecimento', async () => {
      await abrirFormulario(); await abrirPainel();
      await clicar(btn('Falar'));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      await esperar(f.fixture);
      expect(rec().abortou).toBe(1);
      expect(painel()).toBeNull();
    });

    it('sair da tela com o microfone ligado também encerra', async () => {
      await abrirFormulario(); await abrirPainel();
      await clicar(btn('Falar'));
      f.fixture.destroy();
      expect(rec().abortou).toBe(1);
    });

    it('dentro do APK usa o plugin nativo: resultado escreve na caixa e "estado" avisa que está ouvindo', async () => {
      const ouvintes: Record<string, (ev: Record<string, unknown>) => void> = {};
      const plugin = {
        iniciar: vi.fn().mockResolvedValue(undefined), parar: vi.fn(), encerrar: vi.fn(),
        addListener: (nome: string, fn: (ev: Record<string, unknown>) => void) => { ouvintes[nome] = fn; return Promise.resolve({ remove: () => undefined }); },
      };
      janela['Capacitor'] = { isNativePlatform: () => true, Plugins: { DitadoVoz: plugin } };
      await abrirFormulario(); await abrirPainel();
      await clicar(btn('Falar'));
      expect(plugin.iniciar).toHaveBeenCalledWith({ idioma: 'pt-BR' });
      expect(ReconhecimentoFalso.instancias.length).toBe(0);
      expect(textoDe(estado())).toBe('Ligando o microfone… espere a vibração para falar.');
      ouvintes['estado']({ pronto: true });
      ouvintes['resultado']({ texto: 'pedido do João' });
      await esperar(f.fixture);
      expect(textoDe(estado())).toBe('Ouvindo… pode falar. Toque em Parar quando terminar.');
      expect(campoTexto().value).toBe('pedido do João');
      ouvintes['erro']({ codigo: 'rede' });
      await esperar(f.fixture);
      expect(f.dialogo.toastTexto()).toBe('O reconhecimento de voz precisou de internet e falhou. Escreva o pedido.');
      expect(textoDe(btn('Falar'))).toBe('Falar');
      await clicar(btn('Cancelar'));
      expect(plugin.encerrar).toHaveBeenCalled();
    });
  });

  describe('2) entender', () => {
    beforeEach(async () => { await abrirFormulario(); await abrirPainel(); });

    it('envia o texto (sem espaços nas pontas), mostra "Entendendo o pedido…" e, sem perguntas, vai para a conferência', async () => {
      await entender('  pedido do João da Silva  ', PRONTO(COMPLETO()));
      expect(titulo()).toBe('Confira o que entendi');
    });

    it('429 (limite do dia): volta para a caixa com o texto e a mensagem do servidor, sem toast genérico', async () => {
      await entender('pedido do João', { corpo: { erro: 'O limite de 100 ditados por dia foi atingido.' }, status: 429 });
      expect(titulo()).toBe('Ditar pedido');
      expect(erro()).toBe('O limite de 100 ditados por dia foi atingido.');
      expect(campoTexto().value).toBe('pedido do João');
      expect(btn('Entender o pedido').disabled).toBe(false);
      expect(f.dialogo.toastVisivel()).toBe(false);
    });

    it.each([[502, 'A IA não conseguiu responder.'], [503, 'A IA do ditado não está configurada corretamente.'],
      [400, 'O texto está vazio.'], [409, 'Chamada em andamento.']])('%i: mostra a mensagem do servidor na caixa', async (status, msg) => {
      await entender('pedido', { corpo: { erro: msg }, status });
      expect(erro()).toBe(msg);
    });

    it('erro sem mensagem do servidor: texto padrão do app', async () => {
      await entender('pedido', { corpo: '', status: 502 });
      expect(erro()).toBe('Não consegui entender agora. Tente de novo ou preencha à mão.');
    });

    it('depois do erro dá para tentar de novo (e a mensagem some)', async () => {
      await entender('pedido', { corpo: { erro: 'tente depois' }, status: 429 });
      await clicar(btn('Entender o pedido'));
      f.http.expectOne('/api/ditado').flush(PRONTO(COMPLETO()));
      await esperar(f.fixture);
      expect(titulo()).toBe('Confira o que entendi');
      expect(erro()).toBe('');
    });

    it('resposta que chega depois de fechar o painel é ignorada', async () => {
      await escrever('pedido');
      await clicar(btn('Entender o pedido'));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      await esperar(f.fixture);
      f.http.expectOne('/api/ditado').flush(PRONTO(COMPLETO()));
      await esperar(f.fixture);
      expect(painel()).toBeNull();
    });
  });

  describe('3) perguntas', () => {
    beforeEach(async () => { await abrirFormulario(); await abrirPainel(); });
    const chips = () => [...painel()!.querySelectorAll<HTMLButtonElement>('.ditado-opcoes button.chip')];
    const campoLivre = (i = 0) => painel()!.querySelectorAll<HTMLInputElement>('input[aria-label="Outra resposta"]')[i];
    const digitarResposta = async (i: number, v: string) => { digitar(campoLivre(i), v); await esperar(f.fixture); };

    it('mostra a pergunta, as opções como botões e o campo "Outra resposta…"; Responder começa desligado', async () => {
      await entender('pedido do joão', PERGUNTAS([PERGUNTA_ESCOLHA], { cliente: DUVIDA_JOAO }));
      expect(titulo()).toBe('A IA tem uma dúvida');
      expect(textoDe(painel()!.querySelector('.ditado-nota'))).toBe('Pergunta 1 de até 3. Toque numa opção, ou responda falando ou escrevendo.');
      expect(textoDe(painel()!.querySelector('.ditado-pergunta-texto'))).toBe('Qual João?');
      expect(chips().map(c => c.textContent)).toEqual(['João da Silva', 'João Pereira']);
      expect(chips().map(c => c.getAttribute('aria-pressed'))).toEqual(['false', 'false']);
      expect(campoLivre().placeholder).toBe('Outra resposta…');
      expect(campoLivre().maxLength).toBe(300);
      expect(btn('Responder').disabled).toBe(true);
      expect(painel()!.querySelector('.ditado-mic')).toBeNull(); // sem reconhecimento de voz
    });

    it('pergunta aberta: sem botões, com campo "Sua resposta…"', async () => {
      await entender('pedido', PERGUNTAS([PERGUNTA_ABERTA]));
      expect(chips().length).toBe(0);
      expect(campoLivre().placeholder).toBe('Sua resposta…');
    });

    it('tocar numa opção a marca (aria-pressed) e liga Responder; tocar em outra troca a marcação', async () => {
      await entender('pedido', PERGUNTAS([PERGUNTA_ESCOLHA]));
      await clicar(chips()[1]);
      expect(chips().map(c => c.getAttribute('aria-pressed'))).toEqual(['false', 'true']);
      expect(chips()[1].classList.contains('active')).toBe(true);
      expect(btn('Responder').disabled).toBe(false);
      await clicar(chips()[0]);
      expect(chips().map(c => c.classList.contains('active'))).toEqual([true, false]);
    });

    it('escrever outra resposta desmarca a opção; tocar numa opção limpa o campo; apagar o campo desliga Responder', async () => {
      await entender('pedido', PERGUNTAS([PERGUNTA_ESCOLHA]));
      await clicar(chips()[0]);
      await digitarResposta(0, 'o terceiro');
      expect(chips().map(c => c.classList.contains('active'))).toEqual([false, false]);
      expect(btn('Responder').disabled).toBe(false);
      await clicar(chips()[1]);
      expect(campoLivre().value).toBe('');
      await clicar(chips()[1]); // continua marcada
      await digitarResposta(0, 'x');
      await digitarResposta(0, '  ');
      expect(btn('Responder').disabled).toBe(true);
    });

    it('Responder envia índice e texto, vai para "Entendendo as respostas…" e depois para a conferência', async () => {
      await entender('pedido', PERGUNTAS([PERGUNTA_ESCOLHA, PERGUNTA_ABERTA], { cliente: DUVIDA_JOAO }));
      await clicar(chips()[1]);
      await digitarResposta(1, '  sexta que vem ');
      await clicar(btn('Responder'));
      expect(textoDe(painel()!.querySelector('.ditado-espera'))).toBe('Entendendo as respostas…');
      const req = f.http.expectOne('/api/ditado/s1/respostas');
      expect(req.request.body).toEqual({ respostas: [{ perguntaId: 'r1p1', opcaoIndice: 1 }, { perguntaId: 'r1p2', texto: 'sexta que vem' }] });
      req.flush(PRONTO(COMPLETO({ cliente: ok(5, 'João Pereira') }), { rodada: 2 }));
      await esperar(f.fixture);
      expect(titulo()).toBe('Confira o que entendi');
      expect(linhas()[0]).toContain('Cliente: João Pereira');
    });

    it('o servidor pode perguntar de novo: a numeração da rodada acompanha', async () => {
      await entender('pedido', PERGUNTAS([PERGUNTA_ESCOLHA]));
      await clicar(chips()[0]);
      await clicar(btn('Responder'));
      await responder('/api/ditado/s1/respostas', { ...PERGUNTAS([PERGUNTA_ABERTA]), rodada: 2 });
      expect(titulo()).toBe('A IA tem uma dúvida');
      expect(textoDe(painel()!.querySelector('.ditado-nota'))).toContain('Pergunta 2 de até 3.');
      expect(btn('Responder').disabled).toBe(true); // as escolhas da rodada anterior não passam para esta
    });

    it('429 ao responder: continua nas perguntas com a mensagem do servidor, mantendo o que foi escolhido', async () => {
      await entender('pedido', PERGUNTAS([PERGUNTA_ESCOLHA]));
      await clicar(chips()[0]);
      await clicar(btn('Responder'));
      await responder('/api/ditado/s1/respostas', { erro: 'Tente de novo em instantes.' }, 429);
      expect(titulo()).toBe('A IA tem uma dúvida');
      expect(erro()).toBe('Tente de novo em instantes.');
      expect(f.dialogo.toastVisivel()).toBe(false);
    });

    it.each([502, 503])('%i ao responder sem mensagem: texto padrão que sugere "Pular e conferir"', async (status) => {
      await entender('pedido', PERGUNTAS([PERGUNTA_ESCOLHA]));
      await clicar(chips()[0]);
      await clicar(btn('Responder'));
      await responder('/api/ditado/s1/respostas', '', status);
      expect(erro()).toBe('Não consegui entender agora. Tente de novo ou toque em "Pular e conferir".');
    });

    it('409 (rodadas esgotadas) mostra a mensagem do servidor', async () => {
      await entender('pedido', PERGUNTAS([PERGUNTA_ESCOLHA]));
      await clicar(chips()[0]);
      await clicar(btn('Responder'));
      await responder('/api/ditado/s1/respostas', { erro: 'Rodadas esgotadas.' }, 409);
      expect(erro()).toBe('Rodadas esgotadas.');
    });

    it('404 (conversa expirada): recomeça sozinho com o texto original mais o que já foi respondido', async () => {
      await entender('pedido do joão', PERGUNTAS([PERGUNTA_ESCOLHA, PERGUNTA_ABERTA], { cliente: DUVIDA_JOAO }));
      await clicar(chips()[1]);
      await digitarResposta(1, 'sexta');
      await clicar(btn('Responder'));
      f.http.expectOne('/api/ditado/s1/respostas').flush({ erro: 'Sessão expirada.' }, { status: 404, statusText: 'não achou' });
      await esperar(f.fixture);
      expect(textoDe(painel()!.querySelector('.ditado-espera'))).toBe('A conversa expirou; recomeçando com o que você já disse…');
      const novo = f.http.expectOne('/api/ditado');
      expect(novo.request.body).toEqual({ texto: 'pedido do joão. Qual João? João Pereira. Para quando? sexta' });
      novo.flush(PRONTO(COMPLETO({ cliente: ok(5, 'João Pereira') }), { sessaoId: 's2' }));
      await esperar(f.fixture);
      expect(titulo()).toBe('Confira o que entendi');
      expect(f.http.match(() => true)).toEqual([]);
    });

    it('404 seguido de nova pergunta: as respostas seguintes vão para a sessão nova', async () => {
      await entender('pedido', PERGUNTAS([PERGUNTA_ESCOLHA]));
      await clicar(chips()[0]);
      await clicar(btn('Responder'));
      await responder('/api/ditado/s1/respostas', { erro: 'expirou' }, 404);
      await responder('/api/ditado', { ...PERGUNTAS([PERGUNTA_ABERTA]), sessaoId: 's2' });
      expect(titulo()).toBe('A IA tem uma dúvida');
      await digitarResposta(0, 'sexta');
      await clicar(btn('Responder'));
      f.http.expectOne('/api/ditado/s2/respostas').flush(PRONTO(COMPLETO()));
      await esperar(f.fixture);
      expect(titulo()).toBe('Confira o que entendi');
    });

    it('404 e a nova tentativa também falha: volta para a caixa com o texto recomposto e a mensagem', async () => {
      await entender('pedido do joão', PERGUNTAS([PERGUNTA_ESCOLHA]));
      await clicar(chips()[0]);
      await clicar(btn('Responder'));
      await responder('/api/ditado/s1/respostas', { erro: 'expirou' }, 404);
      await responder('/api/ditado', { erro: 'O limite de 100 ditados por dia foi atingido.' }, 429);
      expect(titulo()).toBe('Ditar pedido');
      expect(erro()).toBe('O limite de 100 ditados por dia foi atingido.');
      expect(campoTexto().value).toBe('pedido do joão. Qual João? João da Silva');
    });

    it('404 e falha sem mensagem: texto padrão de "não consegui recomeçar"', async () => {
      await entender('pedido', PERGUNTAS([PERGUNTA_ESCOLHA]));
      await clicar(chips()[0]);
      await clicar(btn('Responder'));
      await responder('/api/ditado/s1/respostas', '', 404);
      await responder('/api/ditado', '', 502);
      expect(erro()).toBe('Não consegui recomeçar. Tente de novo ou preencha à mão.');
    });

    it('o texto recomposto nunca passa de 2000 caracteres', async () => {
      await entender('a'.repeat(1995), PERGUNTAS([PERGUNTA_ESCOLHA]));
      await clicar(chips()[0]);
      await clicar(btn('Responder'));
      await responder('/api/ditado/s1/respostas', '', 404);
      const novo = f.http.expectOne('/api/ditado');
      expect((novo.request.body as { texto: string }).texto.length).toBe(2000);
      novo.flush(PRONTO({}));
      await esperar(f.fixture);
    });

    it('"Pular e conferir" vai direto para a conferência, sem chamar o servidor', async () => {
      await entender('pedido', PERGUNTAS([PERGUNTA_ESCOLHA], { cliente: DUVIDA_JOAO }));
      await clicar(btn('Pular e conferir'));
      expect(titulo()).toBe('Confira o que entendi');
      expect(linhas()[0]).toContain('Qual cliente?');
      expect(textoDe(painel()!.querySelector('.ditado-pendencias'))).toContain('Qual cliente? Nomes parecidos: João da Silva, João Pereira.');
    });

    it('Cancelar fecha o painel', async () => {
      await entender('pedido', PERGUNTAS([PERGUNTA_ESCOLHA]));
      await clicar(btn('Cancelar'));
      expect(painel()).toBeNull();
    });

    it('com situação PERGUNTAS mas sem perguntas, vai direto para a conferência', async () => {
      await entender('pedido', PERGUNTAS([], COMPLETO()));
      expect(titulo()).toBe('Confira o que entendi');
    });

    describe('microfone de cada pergunta', () => {
      beforeEach(() => {
        janela['webkitSpeechRecognition'] = ReconhecimentoFalso;
        ReconhecimentoFalso.instancias = [];
      });
      const mic = (i = 0) => painel()!.querySelectorAll<HTMLButtonElement>('.ditado-mic')[i];

      it('aparece quando há reconhecimento e escreve a resposta falada no campo, ligando Responder', async () => {
        // o painel já abriu sem reconhecimento: fecha e abre de novo com o navegador "com voz"
        await clicar(btn('Cancelar'));
        await abrirPainel();
        await entender('pedido', PERGUNTAS([PERGUNTA_ABERTA, PERGUNTA_ESCOLHA]));
        expect(painel()!.querySelectorAll('.ditado-mic').length).toBe(2);
        expect(mic().getAttribute('aria-label')).toBe('Responder falando');
        await clicar(mic());
        const rec = ReconhecimentoFalso.instancias[0];
        expect(rec.iniciou).toBe(1);
        expect(mic().classList.contains('ditado-gravando')).toBe(true);
        rec.resultados('sexta');
        rec.resultados('sexta', 'sexta que vem');
        await esperar(f.fixture);
        expect(campoLivre().value).toBe('sexta que vem');
        expect(btn('Responder').disabled).toBe(false);
        await clicar(mic());
        expect(rec.parou).toBe(1);
        expect(mic().classList.contains('ditado-gravando')).toBe(false);
        await clicar(btn('Responder'));
        const req = f.http.expectOne('/api/ditado/s1/respostas');
        expect(req.request.body).toEqual({ respostas: [{ perguntaId: 'r1p2', texto: 'sexta que vem' }] });
        req.flush(PRONTO(COMPLETO()));
        await esperar(f.fixture);
        expect(rec.abortou).toBe(1); // o painel encerrou o microfone ao sair das perguntas
      });

      it('o microfone para sozinho (fim da escuta) e perde o destaque', async () => {
        await clicar(btn('Cancelar'));
        await abrirPainel();
        await entender('pedido', PERGUNTAS([PERGUNTA_ABERTA]));
        await clicar(mic());
        const rec = ReconhecimentoFalso.instancias[0];
        rec.onerror!({ error: 'network' });
        rec.onend!();
        await esperar(f.fixture);
        expect(mic().classList.contains('ditado-gravando')).toBe(false);
        expect(f.dialogo.toastTexto()).toBe('O reconhecimento de voz precisa de internet. Escreva o pedido.');
      });
    });
  });

  describe('4) conferência', () => {
    beforeEach(async () => { await abrirFormulario(); await abrirPainel(); });
    const comEntendimento = async (e: Entendimento, extra: Partial<ResultadoDitado> = {}) => entender('pedido', PRONTO(e, extra));
    const linha = (trecho: string) => [...painel()!.querySelectorAll<HTMLElement>('.ditado-linha')].find(l => visivel(l).includes(trecho))!;
    const remover = (trecho: string) => clicar(linha(trecho).querySelector('.ditado-remover'));
    const entrada = (rotulo: string) => painel()!.querySelector<HTMLInputElement>(`input[aria-label="${rotulo}"]`)!;
    const mudar = async (campo: HTMLInputElement, valor: string) => { campo.value = valor; campo.dispatchEvent(new Event('change', { bubbles: true })); await esperar(f.fixture); };

    it('mostra uma linha por coisa entendida, com o mesmo texto do app', async () => {
      await comEntendimento(COMPLETO({
        servicos: [{ estado: 'OK', id: 10, nome: 'Plainar', categoria: 'CABECOTE', quantidade: null }, { estado: 'LIVRE', nome: 'trocar guias', categoria: null }],
        descricao: 'Retífica completa', observacao: 'Cliente vem buscar', descontoTipo: 'PERCENTUAL', descontoValor: 10, status: 'EM_ANDAMENTO',
      }));
      expect(linhas()).toEqual([
        'Entendi Cliente: João da Silva',
        'Entendi Modelo: Fiat Uno ✕',
        'Entendi Serviço: Plainar (Cabeçote) ✕',
        'Texto livre Serviço: trocar guias ✕',
        'Entendi Peça: 2 × Junta (Cabeçote) ✕',
        'Entendi Valores de Cabeçote Serviços R$ Peças R$ ✕',
        'Entendi Entrega: ✕',
        'Entendi Descrição: Retífica completa ✕',
        'Entendi Observação: Cliente vem buscar ✕',
        'Entendi Situação: em andamento ✕',
        'Entendi Desconto: 10% ✕',
      ]);
      expect(painel()!.querySelector('.ditado-linha.ok .ditado-tag.ok')).toBeTruthy();
      expect(btn('Preencher formulário').className).toBe('btn btn-primary btn-block');
      expect(btn('Ditar de novo').className).toBe('btn btn-secondary btn-block');
    });

    it('desconto em valor aparece em reais', async () => {
      await comEntendimento(COMPLETO({ descontoTipo: 'VALOR', descontoValor: 50 }));
      expect(visivel(linha('Desconto:'))).toMatch(/Desconto: R\$\s?50,00/);
    });

    it('cliente não encontrado: linha "Não achei" que avisa que dá para cadastrar ao preencher', async () => {
      await comEntendimento(COMPLETO({ cliente: { estado: 'NAO_ENCONTRADO', ouvido: 'Carlos Novo' } }));
      expect(visivel(linha('Carlos Novo'))).toBe('Não achei Cliente "Carlos Novo" não está cadastrado. Você poderá cadastrar ao preencher.');
      expect(linha('Carlos Novo').classList.contains('falta')).toBe(true);
      expect(linha('Carlos Novo').querySelector('.ditado-remover')).toBeNull();
    });

    it('modelo não encontrado: linha "Não achei" com remover', async () => {
      await comEntendimento(COMPLETO({ componentes: [{ estado: 'NAO_ENCONTRADO', ouvido: 'xyz' }] }));
      expect(visivel(linha('xyz'))).toContain('Modelo "xyz" não está cadastrado.');
      await remover('xyz');
      expect(linhas().some(l => l.includes('xyz'))).toBe(false);
    });

    it('dúvida de cliente: toca numa opção e a linha vira "Entendi"', async () => {
      await comEntendimento(COMPLETO({ cliente: DUVIDA_JOAO }));
      expect(visivel(linha('Qual cliente?'))).toBe('Dúvida Qual cliente? João da Silva João Pereira');
      await clicar([...linha('Qual cliente?').querySelectorAll('button.chip')].find(b => b.textContent === 'João Pereira'));
      expect(linhas()[0]).toContain('Entendi Cliente: João Pereira');
      expect(painel()!.querySelector('.chip')).toBeNull();
    });

    it('dúvida de modelo, serviço e peça: as opções trocam só aquela linha', async () => {
      const duvida = (nomes: string[]): RefEntendida => ({ estado: 'DUVIDA', opcoes: nomes.map((nome, i) => ({ id: 100 + i, nome })) });
      await comEntendimento(COMPLETO({
        componentes: [duvida(['AP 1.8', 'AP 2.0'])], servicos: [duvida(['Plainar cabeçote', 'Plainar bloco'])], pecas: [duvida(['Junta', 'Junta dupla'])],
      }));
      expect(linhas().filter(l => l.startsWith('Dúvida')).map(l => l.split(' ').slice(0, 3).join(' '))).toEqual(['Dúvida Qual modelo?', 'Dúvida Qual serviço?', 'Dúvida Qual peça?']);
      await clicar([...linha('Qual serviço?').querySelectorAll('button.chip')][1]);
      expect(linhas().some(l => l.includes('Serviço: Plainar bloco'))).toBe(true);
      expect(linhas().filter(l => l.startsWith('Dúvida')).length).toBe(2);
    });

    it('remover uma linha (✕) a tira do que será preenchido', async () => {
      await comEntendimento(COMPLETO());
      await remover('Serviço: Plainar');
      await remover('Peça: 2 × Junta');
      await clicar(btn('Preencher formulário'));
      const d = dadosAtuais();
      expect(d.servicos).toEqual([]);
      expect(d.pecas).toEqual([]);
    });

    it('remover entrega, descrição, observação, situação e desconto', async () => {
      await comEntendimento(COMPLETO({ descricao: 'D', observacao: 'O', descontoTipo: 'VALOR', descontoValor: 5 }));
      for (const t of ['Entrega:', 'Descrição:', 'Observação:', 'Situação:', 'Desconto:']) await remover(t);
      expect(linhas().some(l => /Entrega|Descrição|Observação|Situação|Desconto/.test(l))).toBe(false);
      await clicar(btn('Preencher formulário'));
      const d = dadosAtuais();
      expect(d.entrega).toBe('');
      expect(d.descricao).toBe('');
      expect(d.status).toBe('ABERTO');
      expect(d.descontoTipo).toBe('');
    });

    it('valores e data de entrega são editáveis; o que foi editado é o que preenche', async () => {
      await comEntendimento(COMPLETO());
      expect(entrada('Serviços R$ de Cabeçote').value).toBe('800');
      expect(entrada('Peças R$ de Cabeçote').value).toBe('200');
      expect(entrada('Data de entrega').value).toBe('2030-01-15');
      await mudar(entrada('Serviços R$ de Cabeçote'), '950.5');
      await mudar(entrada('Peças R$ de Cabeçote'), '-30');
      await mudar(entrada('Data de entrega'), '2030-02-20');
      await clicar(btn('Preencher formulário'));
      const d = dadosAtuais();
      expect(d.categorias).toEqual([['CABECOTE', { valorServicos: 950.5, valorPecas: 0 }]]);
      expect(d.entrega).toBe('2030-02-20');
    });

    it('apagar a data editável tira a entrega do preenchimento', async () => {
      await comEntendimento(COMPLETO());
      await mudar(entrada('Data de entrega'), '');
      await clicar(btn('Preencher formulário'));
      expect(dadosAtuais().entrega).toBe('');
    });

    it('remover os valores de uma categoria tira o valor mas mantém a categoria marcada, com pendência', async () => {
      await comEntendimento(COMPLETO());
      await remover('Valores de Cabeçote');
      expect(textoDe(painel()!.querySelector('.ditado-pendencias'))).toContain('Falta o valor de Cabeçote.');
    });

    it('o que ficou pendente é listado, junto com os avisos do servidor', async () => {
      await comEntendimento(COMPLETO({ entregaData: null }), { avisos: ['Não entendi a data "semana que vem".'] });
      expect(textoDe(painel()!.querySelector('.ditado-secao h3'))).toBe('Ficou pendente (você completa à mão)');
      const itens = [...painel()!.querySelectorAll('.ditado-pendencias li')].map(l => l.textContent);
      expect(itens).toEqual(['Falta a data de entrega.', 'Não entendi a data "semana que vem".']);
    });

    it('nada entendido: avisa, sem botão de preencher, e "Ditar de novo" volta com o texto', async () => {
      await entender('blá blá', PRONTO({}));
      expect(erro()).toBe('Não entendi nada que dê para preencher. Tente de novo.');
      expect(btn('Preencher formulário')).toBeUndefined();
      await clicar(btn('Ditar de novo'));
      expect(titulo()).toBe('Ditar pedido');
      expect(campoTexto().value).toBe('blá blá');
      expect(erro()).toBe('');
    });

    it('Cancelar na conferência fecha sem mexer no formulário', async () => {
      await comEntendimento(COMPLETO());
      await clicar(btn('Cancelar'));
      expect(painel()).toBeNull();
      expect(dadosAtuais().cliente).toBeNull();
    });

    it('entendimento sem listas (servidor omitiu) não quebra a conferência', async () => {
      await comEntendimento({ cliente: ok(4, 'João da Silva'), componentes: null, servicos: null, pecas: null, valores: null });
      expect(linhas()).toEqual(['Entendi Cliente: João da Silva']);
    });
  });

  describe('Preencher formulário', () => {
    beforeEach(async () => { await abrirFormulario(); await abrirPainel(); });

    it('preenche o formulário, fecha o painel, avisa e guarda o rascunho (nunca salva o pedido)', async () => {
      await entender('pedido completo', PRONTO(COMPLETO({ descricao: 'Retífica', descontoTipo: 'PERCENTUAL', descontoValor: 10 })));
      await clicar(btn('Preencher formulário'));
      expect(painel()).toBeNull();
      const d = dadosAtuais();
      expect(d.cliente).toEqual({ id: 4, nome: 'João da Silva', telefone: null });
      expect(d.componentes).toEqual([{ id: 1, nome: 'Fiat Uno' }]);
      expect(d.servicos).toEqual([{ descricao: 'Plainar', categoria: 'CABECOTE' }]);
      expect(d.pecas).toEqual([{ descricao: 'Junta', categoria: 'CABECOTE', quantidade: 2 }]);
      expect(d.categorias).toEqual([['CABECOTE', { valorServicos: 800, valorPecas: 200 }]]);
      expect(d.entrega).toBe('2030-01-15');
      expect(d.status).toBe('PRONTO');
      expect(d.descricao).toBe('Retífica');
      expect(d.descontoTipo).toBe('PERCENTUAL');
      expect(d.descontoValor).toBe('10');
      expect(f.dialogo.toastTexto()).toBe('Formulário preenchido. Confira e salve.');
      expect(f.dialogo.toastErro()).toBe(false);
      expect(TestBed.inject(RascunhoService).ler('novo')!.dados.cliente!.id).toBe(4);
      expect(f.http.match(() => true)).toEqual([]); // nenhuma chamada além das do ditado: o pedido não foi salvo
      expect(f.navegar).not.toHaveBeenCalled();
    });

    it('o formulário mostra o que foi preenchido (cliente escolhido)', async () => {
      await entender('pedido', PRONTO(COMPLETO()));
      await clicar(btn('Preencher formulário'));
      expect(textoDe(f.html.querySelector('.cliente-selecionado'))).toContain('João da Silva');
    });

    it('sem pendência fica na etapa em que estava', async () => {
      await entender('pedido', PRONTO(COMPLETO()));
      await clicar(btn('Preencher formulário'));
      expect(abaVisivel(f.html)).toEqual(['cliente']);
    });

    it('com pendência vai para a primeira etapa que precisa de atenção e avisa', async () => {
      await entender('pedido', PRONTO(COMPLETO({ entregaData: null })));
      await clicar(btn('Preencher formulário'));
      expect(abaVisivel(f.html)).toEqual(['pedido']);
      expect(f.dialogo.toastTexto()).toBe('Formulário preenchido. Falta completar o que ficou pendente.');
    });

    it('vai para a etapa mais à esquerda entre as pendências (itens e componentes pendentes: componentes)', async () => {
      await entender('pedido', PRONTO({ cliente: ok(4, 'João da Silva'), entregaData: '2030-01-15' }));
      await clicar(btn('Preencher formulário'));
      expect(abaVisivel(f.html)).toEqual(['componentes']);
    });

    it('cliente não cadastrado: abre o cadastro rápido com o nome ouvido e vai para a etapa Cliente', async () => {
      await entender('pedido', PRONTO(COMPLETO({ cliente: { estado: 'NAO_ENCONTRADO', ouvido: 'Carlos Novo' } })));
      await clicar(btn('Preencher formulário'));
      expect(abaVisivel(f.html)).toEqual(['cliente']);
      const caixa = f.html.querySelector('.caixa-form') as HTMLElement;
      expect(caixa.hidden).toBe(false);
      expect((caixa.querySelector('input[placeholder="Nome completo"]') as HTMLInputElement).value).toBe('Carlos Novo');
      expect(dadosAtuais().cliente).toBeNull();
      expect(dadosAtuais().servicos.length).toBe(1); // o resto foi preenchido mesmo assim
    });

    it('cliente em dúvida e deixado assim: não escolhe ninguém e fica pendente na etapa Cliente', async () => {
      await entender('pedido', PRONTO(COMPLETO({ cliente: DUVIDA_JOAO })));
      await clicar(btn('Preencher formulário'));
      expect(dadosAtuais().cliente).toBeNull();
      expect(abaVisivel(f.html)).toEqual(['cliente']);
      expect((f.html.querySelector('.caixa-form') as HTMLElement).hidden).toBe(true);
    });

    it('NUNCA troca o que já estava preenchido: o conflito aparece na conferência e o formulário fica como estava', async () => {
      await escolherClienteNoForm('Maria');
      await clicar(botao(f.html, 'Avançar'));
      const entrega = f.html.querySelector('[data-aba="pedido"] input[type="date"]') as HTMLInputElement;
      digitar(entrega, '2030-03-01');
      await esperar(f.fixture);
      await abrirPainel();
      await entender('pedido do joão', PRONTO(COMPLETO()));
      const secao = painel()!.querySelector('.ditado-secao')!;
      expect(textoDe(secao.querySelector('h3'))).toBe('O formulário já tinha outra coisa (não vou trocar)');
      const conflitos = [...secao.querySelectorAll('.ditado-linha')].map(l => visivel(l));
      expect(conflitos).toEqual([
        'Conflito Cliente: o formulário tem "Maria Souza" e você disse "João da Silva".',
        'Conflito Entrega: o formulário tem 01/03/2030 e você disse 15/01/2030.',
      ]);
      await clicar(btn('Preencher formulário'));
      const d = dadosAtuais();
      expect(d.cliente!.id).toBe(3);
      expect(d.entrega).toBe('2030-03-01');
      expect(d.componentes.length).toBe(1); // o que estava vazio foi preenchido
      expect(abaVisivel(f.html)).toEqual(['cliente']); // a primeira etapa com conflito
    });

    it('acrescenta serviços sem duplicar os que já estavam no formulário', async () => {
      await entender('pedido', PRONTO(COMPLETO()));
      await clicar(btn('Preencher formulário'));
      await abrirPainel();
      await entender('pedido de novo', PRONTO(COMPLETO()));
      expect(painel()!.querySelector('.ditado-secao')).toBeNull(); // nada igual vira conflito
      await clicar(btn('Preencher formulário'));
      expect(dadosAtuais().servicos.length).toBe(1);
      expect(dadosAtuais().pecas.length).toBe(1);
    });

    it('"Ditar de novo" a partir da conferência volta para a caixa, e o novo texto vai de novo ao servidor', async () => {
      await entender('primeiro', PRONTO(COMPLETO()));
      await clicar(btn('Ditar de novo'));
      expect(campoTexto().value).toBe('primeiro');
      await escrever('segundo');
      await clicar(btn('Entender o pedido'));
      const req = f.http.expectOne('/api/ditado');
      expect(req.request.body).toEqual({ texto: 'segundo' });
      req.flush(PRONTO(COMPLETO()));
      await esperar(f.fixture);
      expect(titulo()).toBe('Confira o que entendi');
    });
  });
});
