import type { Mock } from 'vitest';
import { ReconhecimentoFalso } from '../testing/voz';
import { AlvoDitado, CallbacksVoz, DitadoVoz, PluginDitadoVoz, criarDitadoVoz, criarVozNativa, criarVozNavegador, ditadoNativo } from './ditado-voz';

describe('voz do ditado', () => {
  let alvo: HTMLTextAreaElement;
  let avisos: [string, boolean][];
  let pronto: boolean[]; let mudou: number; let parou: number;
  let vibrar: ReturnType<typeof vi.fn>;

  const cb = (): CallbacksVoz => ({ aoMudar: () => mudou++, aoParar: () => parou++, aoPronto: ok => pronto.push(ok) });
  const avisar = (m: string, e: boolean) => avisos.push([m, e]);
  const digitarNoTeclado = (texto: string) => { alvo.value = texto; alvo.dispatchEvent(new Event('input')); };

  beforeEach(() => {
    alvo = document.createElement('textarea');
    avisos = []; pronto = []; mudou = 0; parou = 0;
    ReconhecimentoFalso.instancias = [];
    vibrar = vi.fn();
    Object.defineProperty(navigator, 'vibrate', { value: vibrar, configurable: true, writable: true });
  });

  afterEach(() => { delete (navigator as unknown as Record<string, unknown>)['vibrate']; });

  describe('navegador (Web Speech API)', () => {
    let voz: DitadoVoz; let rec: ReconhecimentoFalso;

    beforeEach(() => {
      voz = criarVozNavegador(ReconhecimentoFalso, alvo, cb(), avisar);
      rec = ReconhecimentoFalso.instancias[0];
    });

    it('configura pt-BR, resultados parciais e escuta contínua', () => {
      expect(rec.lang).toBe('pt-BR');
      expect(rec.interimResults).toBe(true);
      expect(rec.continuous).toBe(true);
    });

    it('iniciar liga o microfone e avisa que ainda não está pronto; onaudiostart avisa que está e vibra 40 ms', () => {
      expect(voz.iniciar()).toBe(true);
      expect(voz.ativo()).toBe(true);
      expect(rec.iniciou).toBe(1);
      expect(pronto).toEqual([false]);
      rec.onaudiostart!();
      expect(pronto).toEqual([false, true]);
      expect(vibrar).toHaveBeenCalledWith(40);
    });

    it('onaudiostart com a escuta já parada não avisa nem vibra', () => {
      rec.onaudiostart!();
      expect(pronto).toEqual([]);
      expect(vibrar).not.toHaveBeenCalled();
    });

    it('Android: cada hipótese parcial chega como um resultado novo e não duplica o texto', () => {
      voz.iniciar();
      rec.resultados('pedido');
      expect(alvo.value).toBe('pedido');
      rec.resultados('pedido', 'pedido do');
      rec.resultados('pedido', 'pedido do', 'pedido do João da Silva');
      expect(alvo.value).toBe('pedido do João da Silva');
      rec.resultados('pedido', 'pedido do', 'pedido do João da Silva', 'cabeça');
      expect(alvo.value).toBe('pedido do João da Silva cabeça');
      rec.resultados('pedido', 'pedido do', 'pedido do João da Silva', 'cabeça', 'cabeça de ap');
      expect(alvo.value).toBe('pedido do João da Silva cabeça de ap');
      expect(mudou).toBe(5);
    });

    it('resultados finais repetidos não duplicam o que foi falado', () => {
      voz.iniciar();
      rec.resultados('pedido do João da Silva', 'pedido do João da Silva', 'pedido do João da Silva');
      expect(alvo.value).toBe('pedido do João da Silva');
      rec.resultados('pedido do João da Silva', 'pedido do João da Silva', 'cabeça de ap', 'cabeça de ap');
      expect(alvo.value).toBe('pedido do João da Silva cabeça de ap');
    });

    it('a comparação de continuação ignora maiúsculas e a hipótese mais longa vence mesmo se vier depois', () => {
      voz.iniciar();
      rec.resultados('Pedido do joão', 'pedido do João da Silva');
      expect(alvo.value).toBe('pedido do João da Silva');
      rec.resultados('pedido do João da Silva', 'Pedido do joão');
      expect(alvo.value).toBe('pedido do João da Silva');
    });

    it('resultado vazio é ignorado', () => {
      voz.iniciar();
      rec.resultados('  ', 'pedido', '');
      expect(alvo.value).toBe('pedido');
    });

    it('o navegador parou sozinho: religa na hora, avisa "ligando" e o que foi dito continua depois do texto anterior', () => {
      voz.iniciar();
      rec.resultados('pedido do João da Silva');
      pronto.length = 0;
      rec.onend!(); // o Chrome do Android encerra a escuta sozinho
      expect(rec.iniciou).toBe(2);
      expect(pronto).toEqual([false]);
      expect(parou).toBe(0);
      expect(voz.ativo()).toBe(true);
      rec.resultados('cabeça de ap'); // a lista de resultados recomeça do zero na nova escuta
      expect(alvo.value).toBe('pedido do João da Silva cabeça de ap');
      rec.resultados('cabeça de ap', 'cabeça de ap um ponto oito');
      expect(alvo.value).toBe('pedido do João da Silva cabeça de ap um ponto oito');
    });

    it('se religar falha, para de vez e avisa a tela', () => {
      voz.iniciar();
      rec.falharNoStart = true;
      rec.onend!();
      expect(voz.ativo()).toBe(false);
      expect(parou).toBe(1);
    });

    it('edição pelo teclado muda a base: o que foi digitado é mantido e a fala continua depois dele', () => {
      voz.iniciar();
      rec.resultados('pedido do João');
      digitarNoTeclado('pedido do João da Silva');
      rec.resultados('entrega sexta');
      expect(alvo.value).toBe('pedido do João da Silva entrega sexta');
    });

    it('o input que o próprio reconhecimento gera não muda a base (nada duplica)', () => {
      // quem escuta aoMudar costuma disparar `input` no campo (a pergunta do ditado faz isso)
      const comEco = criarVozNavegador(ReconhecimentoFalso, alvo, { ...cb(), aoMudar: () => alvo.dispatchEvent(new Event('input')) }, avisar);
      const rec2 = ReconhecimentoFalso.instancias[1];
      comEco.iniciar();
      rec2.resultados('pedido');
      rec2.resultados('pedido', 'pedido do');
      expect(alvo.value).toBe('pedido do');
    });

    it('com texto já na caixa, a fala é acrescentada depois dele', () => {
      alvo.value = '  Pedido do João ';
      voz.iniciar();
      rec.resultados('cabeça');
      expect(alvo.value).toBe('Pedido do João cabeça');
    });

    it('o texto é limitado a 2000 caracteres', () => {
      voz.iniciar();
      rec.resultados('a'.repeat(2500));
      expect(alvo.value.length).toBe(2000);
    });

    it('parar desliga, não religa no onend e avisa que terminou', () => {
      voz.iniciar();
      voz.parar();
      expect(rec.parou).toBe(1);
      expect(voz.ativo()).toBe(false);
      rec.onend!();
      expect(rec.iniciou).toBe(1);
      expect(parou).toBe(1);
    });

    it('sem permissão: avisa com o texto do app e desliga', () => {
      voz.iniciar();
      rec.onerror!({ error: 'not-allowed' });
      expect(avisos).toEqual([['Sem permissão para o microfone. Escreva o pedido, ou libere o microfone para este site.', true]]);
      expect(voz.ativo()).toBe(false);
      rec.onerror!({ error: 'service-not-allowed' });
      expect(avisos.length).toBe(2);
    });

    it('sem internet e sem microfone: textos próprios', () => {
      voz.iniciar();
      rec.onerror!({ error: 'network' });
      expect(avisos[0]).toEqual(['O reconhecimento de voz precisa de internet. Escreva o pedido.', true]);
      voz.iniciar();
      rec.onerror!({ error: 'audio-capture' });
      expect(avisos[1]).toEqual(['Não achei o microfone. Escreva o pedido.', true]);
      expect(voz.ativo()).toBe(false);
    });

    it('erro sem importância (no-speech, aborted) não avisa nem desliga', () => {
      voz.iniciar();
      rec.onerror!({ error: 'no-speech' });
      rec.onerror!({ error: 'aborted' });
      expect(avisos).toEqual([]);
      expect(voz.ativo()).toBe(true);
    });

    it('iniciar devolve false quando o navegador recusa o start', () => {
      rec.falharNoStart = true;
      expect(voz.iniciar()).toBe(false);
      expect(voz.ativo()).toBe(false);
    });

    it('encerrar aborta o reconhecimento e solta o ouvido do teclado', () => {
      voz.iniciar();
      voz.encerrar();
      expect(rec.abortou).toBe(1);
      expect(voz.ativo()).toBe(false);
      voz.iniciar(); // ativo de novo só para provar que o teclado não mexe mais na base
      rec.resultados('pedido');
      digitarNoTeclado('outra coisa');
      rec.resultados('pedido', 'pedido do');
      expect(alvo.value).toBe('pedido do');
    });
  });

  describe('nativo (plugin DitadoVoz do APK)', () => {
    let ouvintes: Record<string, (ev: Record<string, unknown>) => void>;
    let removidos: string[];
    let plugin: { iniciar: Mock; parar: Mock; encerrar: Mock; addListener: PluginDitadoVoz['addListener'] };
    let voz: DitadoVoz;

    const emitir = (nome: string, ev: Record<string, unknown>) => ouvintes[nome](ev);
    const assentar = () => new Promise(r => setTimeout(r, 0));

    beforeEach(async () => {
      ouvintes = {}; removidos = [];
      plugin = {
        iniciar: vi.fn().mockResolvedValue(undefined),
        parar: vi.fn(),
        encerrar: vi.fn(),
        addListener: (nome: string, fn: (ev: Record<string, unknown>) => void) => {
          ouvintes[nome] = fn;
          return Promise.resolve({ remove: () => { removidos.push(nome); } });
        },
      };
      voz = criarVozNativa(plugin as PluginDitadoVoz, alvo, cb(), avisar);
      await assentar();
    });

    it('iniciar chama o plugin em pt-BR e avisa que ainda não está pronto', () => {
      expect(voz.iniciar()).toBe(true);
      expect(plugin.iniciar).toHaveBeenCalledWith({ idioma: 'pt-BR' });
      expect(pronto).toEqual([false]);
      expect(voz.ativo()).toBe(true);
    });

    it('cada "resultado" traz a sessão inteira: reescreve depois do texto que já estava na caixa', () => {
      alvo.value = 'Pedido ';
      voz.iniciar();
      emitir('resultado', { texto: 'do João' });
      emitir('resultado', { texto: 'do João da Silva' });
      expect(alvo.value).toBe('Pedido do João da Silva');
      expect(mudou).toBe(2);
    });

    it('resultado com a escuta parada é ignorado', () => {
      emitir('resultado', { texto: 'fantasma' });
      expect(alvo.value).toBe('');
    });

    it('edição pelo teclado muda a base; o que o plugin escreve não', () => {
      voz.iniciar();
      emitir('resultado', { texto: 'pedido do João' });
      digitarNoTeclado('pedido do João Pereira');
      emitir('resultado', { texto: 'entrega sexta' });
      expect(alvo.value).toBe('pedido do João Pereira entrega sexta');
      emitir('resultado', { texto: 'entrega sexta feira' });
      expect(alvo.value).toBe('pedido do João Pereira entrega sexta feira');
    });

    it('"estado": pronto avisa a tela e vibra 40 ms; não pronto só avisa', () => {
      voz.iniciar();
      pronto.length = 0;
      emitir('estado', { pronto: true });
      expect(pronto).toEqual([true]);
      expect(vibrar).toHaveBeenCalledWith(40);
      emitir('estado', { pronto: false });
      expect(pronto).toEqual([true, false]);
      expect(vibrar).toHaveBeenCalledTimes(1);
    });

    it('"estado" com a escuta parada não avisa nem vibra', () => {
      emitir('estado', { pronto: true });
      expect(pronto).toEqual([]);
      expect(vibrar).not.toHaveBeenCalled();
    });

    it('erros do plugin viram o texto do app, desligam e avisam que parou', () => {
      const textos: Record<string, string> = {
        permissao: 'Sem permissão para o microfone. Libere nas configurações do app, ou escreva o pedido.',
        rede: 'O reconhecimento de voz precisou de internet e falhou. Escreva o pedido.',
        microfone: 'Não achei o microfone. Escreva o pedido.',
        ocupado: 'O reconhecimento de voz está ocupado. Tente de novo.',
        outro: 'O reconhecimento de voz falhou. Escreva o pedido.',
      };
      Object.entries(textos).forEach(([codigo, texto], i) => {
        voz.iniciar();
        emitir('erro', { codigo });
        expect(avisos[i]).toEqual([texto, true]);
        expect(voz.ativo()).toBe(false);
      });
      expect(parou).toBe(5);
    });

    it('iniciar recusado por falta de permissão: avisa o texto da permissão', async () => {
      plugin.iniciar.mockRejectedValue(new Error('sem permissao de microfone'));
      voz.iniciar();
      await assentar();
      expect(avisos).toEqual([['Sem permissão para o microfone. Libere nas configurações do app, ou escreva o pedido.', true]]);
      expect(voz.ativo()).toBe(false);
      expect(parou).toBe(1);
    });

    it('iniciar recusado por outro motivo: "Não consegui ligar o microfone"', async () => {
      plugin.iniciar.mockRejectedValue('quebrou');
      voz.iniciar();
      await assentar();
      expect(avisos).toEqual([['Não consegui ligar o microfone. Escreva o pedido.', true]]);
      expect(parou).toBe(1);
    });

    it('parar manda o plugin parar e avisa que terminou logo depois', async () => {
      voz.iniciar();
      voz.parar();
      expect(plugin.parar).toHaveBeenCalled();
      expect(voz.ativo()).toBe(false);
      expect(parou).toBe(0);
      await assentar();
      expect(parou).toBe(1);
      emitir('resultado', { texto: 'depois de parar' });
      expect(alvo.value).toBe('');
    });

    it('encerrar solta os três ouvintes do plugin e encerra a sessão nativa', async () => {
      voz.encerrar();
      expect(plugin.encerrar).toHaveBeenCalled();
      expect(removidos.sort()).toEqual(['erro', 'estado', 'resultado']);
      expect(voz.ativo()).toBe(false);
    });

    it('encerrar solta também o ouvido do teclado', () => {
      voz.iniciar();
      emitir('resultado', { texto: 'pedido' });
      voz.encerrar();
      voz.iniciar();
      digitarNoTeclado('x'); // com o ouvido solto, a base não vira "x "
      emitir('resultado', { texto: 'novo' });
      expect(alvo.value).toBe('pedido novo');
    });

    it('um plugin que lança ao parar/encerrar não derruba o app', () => {
      plugin.parar.mockImplementation(() => { throw new Error('já parado'); });
      plugin.encerrar.mockImplementation(() => { throw new Error('já parado'); });
      expect(() => { voz.parar(); voz.encerrar(); }).not.toThrow();
    });
  });

  describe('escolha do adaptador', () => {
    const plugin = { iniciar: vi.fn(), parar: vi.fn(), encerrar: vi.fn(), addListener: vi.fn() } as unknown as PluginDitadoVoz;
    const ponte = (nativa: boolean) => ({ Capacitor: { isNativePlatform: () => nativa, Plugins: { DitadoVoz: plugin } } });

    it('ditadoNativo só devolve o plugin dentro do APK', () => {
      expect(ditadoNativo(ponte(true))).toBe(plugin);
      expect(ditadoNativo(ponte(false))).toBeNull();
      expect(ditadoNativo({})).toBeNull();
      expect(ditadoNativo({ Capacitor: { isNativePlatform: () => true, Plugins: {} } })).toBeNull();
      expect(ditadoNativo({ Capacitor: { isNativePlatform: () => { throw new Error('sem ponte'); } } })).toBeNull();
    });

    it('no APK usa o nativo, mesmo havendo Web Speech', () => {
      const win = { ...ponte(true), webkitSpeechRecognition: ReconhecimentoFalso };
      expect(criarDitadoVoz(win, alvo, cb(), avisar)).not.toBeNull();
      expect(ReconhecimentoFalso.instancias.length).toBe(0);
    });

    it('no navegador usa o Web Speech (com ou sem prefixo)', () => {
      expect(criarDitadoVoz({ SpeechRecognition: ReconhecimentoFalso }, alvo, cb(), avisar)).not.toBeNull();
      expect(criarDitadoVoz({ webkitSpeechRecognition: ReconhecimentoFalso }, alvo, cb(), avisar)).not.toBeNull();
      expect(ReconhecimentoFalso.instancias.length).toBe(2);
    });

    it('sem nenhum dos dois devolve null (o painel mostra só a caixa de texto)', () => {
      expect(criarDitadoVoz({}, alvo as AlvoDitado, cb(), avisar)).toBeNull();
    });
  });
});
