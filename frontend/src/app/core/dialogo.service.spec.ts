import { TestBed } from '@angular/core/testing';
import { DialogoService, DURACAO_TOAST_MS } from './dialogo.service';
import { GuardaSaida, GuardaSaidaService, guardaDeSaida } from './guarda-saida.service';

describe('DialogoService', () => {
  let dialogo: DialogoService;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({});
    dialogo = TestBed.inject(DialogoService);
  });

  afterEach(() => vi.useRealTimers());

  it('toast aparece e some depois de 3,2 s; erro marca a variante', () => {
    dialogo.toast('Salvo');
    expect(dialogo.toastVisivel()).toBe(true);
    expect(dialogo.toastTexto()).toBe('Salvo');
    expect(dialogo.toastErro()).toBe(false);
    vi.advanceTimersByTime(DURACAO_TOAST_MS - 1);
    expect(dialogo.toastVisivel()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(dialogo.toastVisivel()).toBe(false);
    dialogo.toast('Ops', true);
    expect(dialogo.toastErro()).toBe(true);
  });

  it('um toast novo reinicia o tempo do anterior', () => {
    dialogo.toast('a');
    vi.advanceTimersByTime(3000);
    dialogo.toast('b');
    vi.advanceTimersByTime(3000);
    expect(dialogo.toastVisivel()).toBe(true);
    vi.advanceTimersByTime(200);
    expect(dialogo.toastVisivel()).toBe(false);
  });

  it('escolher resolve com o valor da opção tocada', async () => {
    const p = dialogo.escolher('Qual?', [{ rotulo: 'A', valor: 'a' }, { rotulo: 'B', valor: 'b' }]);
    const aberto = dialogo.dialogos()[0];
    expect(aberto.mensagem).toBe('Qual?');
    expect(aberto.foco).toBe(0);
    aberto.responder('b');
    expect(await p).toBe('b');
    expect(dialogo.dialogos()).toHaveLength(0);
  });

  it('Esc escolhe a primeira opção (a segura)', async () => {
    const p = dialogo.escolher('Qual?', [{ rotulo: 'A', valor: 'a' }, { rotulo: 'B', valor: 'b' }]);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(await p).toBe('a');
    expect(dialogo.dialogos()).toHaveLength(0);
  });

  it('confirmar: Cancelar (false) primeiro; destrutivo foca o Cancelar', async () => {
    const p = dialogo.confirmar('Apagar?', 'Apagar', true);
    const aberto = dialogo.dialogos()[0];
    expect(aberto.opcoes.map(o => o.rotulo)).toEqual(['Cancelar', 'Apagar']);
    expect(aberto.opcoes[1].estilo).toBe('btn-danger');
    expect(aberto.foco).toBe(0);
    expect(aberto.linha).toBe(true);
    aberto.responder(true);
    expect(await p).toBe(true);
  });

  it('confirmar não destrutivo foca o botão de confirmar; Esc cancela', async () => {
    const p = dialogo.confirmar('Continuar?');
    const aberto = dialogo.dialogos()[0];
    expect(aberto.opcoes[1].rotulo).toBe('Confirmar');
    expect(aberto.opcoes[1].estilo).toBe('btn-primary');
    expect(aberto.foco).toBe(1);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(await p).toBe(false);
  });

  it('com dois diálogos empilhados, Esc fecha só o de cima', async () => {
    const baixo = dialogo.escolher('1', [{ rotulo: 'x', valor: 'x1' }]);
    const cima = dialogo.escolher('2', [{ rotulo: 'x', valor: 'x2' }]);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(await cima).toBe('x2');
    expect(dialogo.dialogos()).toHaveLength(1);
    dialogo.dialogos()[0].responder('x1');
    expect(await baixo).toBe('x1');
  });
});

describe('guardaDeSaida', () => {
  let dialogo: DialogoService;
  let servico: GuardaSaidaService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    dialogo = TestBed.inject(DialogoService);
    servico = TestBed.inject(GuardaSaidaService);
  });

  const executar = (g: GuardaSaida | null) =>
    TestBed.runInInjectionContext(() => guardaDeSaida({ guardaSaida: () => g }, null as never, null as never, null as never));

  it('libera quando não há guarda ou não há alterações', () => {
    expect(executar(null)).toBe(true);
    expect(executar({ tipo: 'formulario', sujo: () => false })).toBe(true);
  });

  it('formulário sujo: pergunta; "Sair sem salvar" libera e chama aoDescartar', async () => {
    const aoDescartar = vi.fn();
    const r = executar({ tipo: 'formulario', sujo: () => true, aoDescartar }) as Promise<boolean>;
    const aberto = dialogo.dialogos()[0];
    expect(aberto.mensagem).toBe('Você tem alterações que ainda não foram salvas. Se sair agora, elas serão perdidas.');
    expect(aberto.opcoes.map(o => o.rotulo)).toEqual(['Continuar editando', 'Sair sem salvar']);
    aberto.responder('descartar');
    expect(await r).toBe(true);
    expect(aoDescartar).toHaveBeenCalled();
  });

  it('pedido sujo: três opções; "Sair e guardar rascunho" chama aoGuardar; Esc continua editando', async () => {
    const aoGuardar = vi.fn();
    const r = executar({ tipo: 'pedido', sujo: () => true, aoGuardar }) as Promise<boolean>;
    const aberto = dialogo.dialogos()[0];
    expect(aberto.opcoes.map(o => o.rotulo)).toEqual(['Continuar editando', 'Sair e guardar rascunho', 'Descartar']);
    aberto.responder('guardar');
    expect(await r).toBe(true);
    expect(aoGuardar).toHaveBeenCalledOnce();

    const r2 = executar({ tipo: 'pedido', sujo: () => true, aoGuardar }) as Promise<boolean>;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(await r2).toBe(false);
    expect(aoGuardar).toHaveBeenCalledOnce();
  });

  it('guardarSeSujo grava o rascunho da tela ativa (usado no 401)', () => {
    const aoGuardar = vi.fn();
    servico.registrar({ guardaSaida: () => ({ tipo: 'pedido', sujo: () => true, aoGuardar }) });
    servico.guardarSeSujo();
    expect(aoGuardar).toHaveBeenCalledOnce();
    servico.desregistrar();
    servico.guardarSeSujo();
    expect(aoGuardar).toHaveBeenCalledOnce();
  });
});
