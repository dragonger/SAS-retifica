import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ALTO_OS, ALTO_RESUMO, AltoMedidasService, ListaAltoMedidas } from '../../core/alto-medidas.service';
import { CHAVE_AUTH } from '../../core/auth.service';
import { CacheService } from '../../core/cache.service';
import { DialogoService } from '../../core/dialogo.service';
import { digitar, esperar, provedoresDeTela } from '../../testing/ajuda';
import { AltoMedidas } from './alto-medidas';

const os = (id: number, extra: object = {}) => ({
  id, numero: 1000 + id, cliente: 'Oficina Silva', modelo: 'MWM 4.10', medidas: 'STD', valorTotal: 800, polir: false,
  pago: false, pagoEm: null, repassadoEm: null, finalizadoEm: '2026-10-20T15:00:00Z', pagoSincronizado: true, ...extra,
});

function lista(extra: Partial<ListaAltoMedidas> = {}): ListaAltoMedidas {
  return {
    mes: '2026-10',
    meses: [{ mes: '2026-10', quantidade: 3 }, { mes: '2026-09', quantidade: 1 }],
    devidoAoDaniel: 1500, quantidadeDevida: 2,
    devidoNoPeriodo: 700, quantidadeDevidaNoPeriodo: 1,
    aRepassar: { total: 700, itens: [os(1, { pago: true, pagoEm: '2026-10-25T15:00:00Z', valorTotal: 700, polir: true })] },
    aguardando: { total: 800, itens: [os(2), os(3, { pagoSincronizado: false })] },
    repassado: { total: 0, itens: [] },
    ...extra,
  };
}

describe('AltoMedidas', () => {
  let http: HttpTestingController;
  let dialogo: DialogoService;
  let cache: CacheService;
  let alto: AltoMedidasService;

  async function criar(dados: ListaAltoMedidas = lista()) {
    localStorage.clear();
    localStorage.setItem(CHAVE_AUTH, JSON.stringify({ token: 't' }));
    TestBed.configureTestingModule({ providers: provedoresDeTela() });
    http = TestBed.inject(HttpTestingController);
    dialogo = TestBed.inject(DialogoService);
    cache = TestBed.inject(CacheService);
    alto = TestBed.inject(AltoMedidasService);
    const fixture = TestBed.createComponent(AltoMedidas);
    http.expectOne(ALTO_OS).flush(dados);
    await esperar(fixture);
    return { fixture, html: fixture.nativeElement as HTMLElement };
  }

  const botao = (html: HTMLElement, texto: string) =>
    [...html.querySelectorAll('button')].find(b => b.textContent?.trim() === texto) as HTMLButtonElement;
  const secoes = (html: HTMLElement) => [...html.querySelectorAll('h2.secao')].map(h => h.textContent?.trim());
  /** Responde ao diálogo de confirmação aberto. */
  const responder = (valor: boolean) => dialogo.dialogos().at(-1)!.responder(valor);

  afterEach(() => http.verify());

  it('mostra "Carregando..." até a lista chegar', async () => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: provedoresDeTela() });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(AltoMedidas);
    await esperar(fixture);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Carregando...');
    http.expectOne(ALTO_OS).flush(lista());
    await esperar(fixture);
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Carregando...');
  });

  it('cartão grande com o total geral e a linha do mês quando o mês tem só uma parte', async () => {
    const { html } = await criar();
    const cartao = html.querySelector('.card-destaque') as HTMLElement;
    expect(cartao.textContent).toContain('Você deve ao Daniel');
    expect(cartao.textContent).toContain('R$ 1.500,00');
    expect(cartao.textContent).toContain('2 virabrequins que o cliente já pagou');
    expect(cartao.textContent).toContain('Em Outubro de 2026: R$ 700,00 (1 virabrequim) · o resto é de outros meses');
  });

  it('sem diferença entre mês e geral (ou em "todos") não mostra a linha extra', async () => {
    const { html } = await criar(lista({ devidoNoPeriodo: 1500 }));
    expect((html.querySelector('.card-destaque') as HTMLElement).textContent).not.toContain('o resto é de outros meses');
  });

  it('as três listas, na ordem, com subtotal e o mês no título', async () => {
    const { html } = await criar();
    expect(secoes(html)).toEqual([
      'Pago pelo cliente — a repassar ao Daniel — Outubro de 2026 — R$ 700,00',
      'Aguardando o cliente pagar — Outubro de 2026 — R$ 800,00',
      'Já repassado ao Daniel — Outubro de 2026 — R$ 0,00',
    ]);
    expect(html.textContent).toContain('Nenhum repasse confirmado neste mês.');
  });

  it('em "todos os meses" não põe sufixo e usa as mensagens gerais de lista vazia', async () => {
    const { html } = await criar(lista({ mes: 'todos', aRepassar: { total: 0, itens: [] }, aguardando: { total: 0, itens: [] } }));
    expect(secoes(html)[0]).toBe('Pago pelo cliente — a repassar ao Daniel — R$ 0,00');
    expect(html.textContent).toContain('Nenhum virabrequim pago aguardando repasse.');
    expect(html.textContent).toContain('Nenhum virabrequim aguardando pagamento.');
    expect(html.textContent).toContain('Nenhum repasse confirmado ainda.');
  });

  it('linha da OS: número, valor (com polimento), detalhes, datas, aviso de não sincronizado e ação por status', async () => {
    const { html } = await criar(lista({
      repassado: { total: 500, itens: [os(9, { pago: true, pagoEm: '2026-10-10T15:00:00Z', repassadoEm: '2026-10-28T15:00:00Z', valorTotal: 500 })] },
    }));
    const linhas = [...html.querySelectorAll('.linha')] as HTMLElement[];
    expect(linhas).toHaveLength(4);
    expect(linhas[0].textContent).toContain('OS #1001');
    expect(linhas[0].textContent).toContain('R$ 700,00 (com polimento)');
    expect(linhas[0].textContent).toContain('Oficina Silva · MWM 4.10 · STD');
    expect(linhas[0].textContent).toContain('Cliente pagou em 25/10/2026');
    expect(linhas[0].querySelector('button')!.textContent?.trim()).toBe('Desfazer');
    expect(linhas[0].textContent).not.toContain('Ainda não avisado');
    expect(linhas[1].textContent).toContain('Finalizado em 20/10/2026');
    expect(linhas[1].querySelector('button')!.textContent?.trim()).toBe('Cliente pagou');
    expect(linhas[2].textContent).toContain('Ainda não avisado ao Alto Medidas — vai tentar de novo sozinho.');
    expect(linhas[3].textContent).toContain('Repassado em 28/10/2026');
    expect(linhas[3].querySelector('button')).toBeNull(); // já repassado: sem ação
  });

  it('seletor de mês: "Todos os meses" + um por mês com a quantidade; o mês atual vem selecionado', async () => {
    const { html } = await criar();
    const select = html.querySelector('select') as HTMLSelectElement;
    expect([...select.options].map(o => o.textContent)).toEqual([
      'Todos os meses', 'Outubro de 2026 · 3 virabrequins', 'Setembro de 2026 · 1 virabrequim',
    ]);
    expect(select.value).toBe('2026-10');
  });

  it('sem meses na resposta não mostra o seletor', async () => {
    const { html } = await criar(lista({ meses: [] }));
    expect(html.querySelector('select')).toBeNull();
  });

  it('trocar o mês busca ?mes=... e mostra a lista nova', async () => {
    const { fixture, html } = await criar();
    const select = html.querySelector('select') as HTMLSelectElement;
    digitar(select, '2026-09');
    await esperar(fixture);
    http.expectOne(ALTO_OS + '?mes=2026-09').flush(lista({ mes: '2026-09', aguardando: { total: 0, itens: [] }, aRepassar: { total: 0, itens: [] } }));
    await esperar(fixture);
    expect(secoes(html)[0]).toContain('Setembro de 2026');
    expect(alto.mesEscolhido).toBe('2026-09');
  });

  it('"Cliente pagou": pergunta primeiro; cancelar não chama o servidor', async () => {
    const { fixture, html } = await criar();
    void botao(html, 'Cliente pagou').click();
    await esperar(fixture);
    expect(dialogo.dialogos().at(-1)!.mensagem).toBe(
      'Marcar a OS #1002 como paga pelo cliente? Ela passa a contar no que você deve ao Daniel (R$ 800,00).');
    expect(dialogo.dialogos().at(-1)!.opcoes.map(o => o.rotulo)).toEqual(['Cancelar', 'Cliente pagou']);
    responder(false);
    await esperar(fixture);
    http.expectNone(r => r.method === 'PUT');
  });

  it('confirmando: PUT {pago:true}, invalida resumo e todos os meses visitados e recarrega a tela', async () => {
    const { fixture, html } = await criar();
    cache.invalidar = vi.fn(cache.invalidar.bind(cache));
    alto.caminhosVisitados.add(ALTO_OS + '?mes=2026-09');
    botao(html, 'Cliente pagou').click();
    await esperar(fixture);
    responder(true);
    await esperar(fixture);
    const put = http.expectOne(ALTO_OS + '/2/pagamento');
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual({ pago: true });
    // enquanto salva: botão desabilitado com "Salvando…"
    expect(botao(html, 'Salvando…').disabled).toBe(true);
    put.flush({ ok: true });
    await esperar(fixture);
    expect(cache.invalidar).toHaveBeenCalledWith(ALTO_RESUMO, ALTO_OS, ALTO_OS + '?mes=2026-09');
    http.expectOne(ALTO_OS).flush(lista({ aguardando: { total: 0, itens: [] }, aRepassar: { total: 1500, itens: [os(1, { pago: true }), os(2, { pago: true })] } }));
    await esperar(fixture);
    expect(html.querySelectorAll('.linha')).toHaveLength(2);
  });

  it('"Desfazer": pergunta com botão perigoso e manda {pago:false}', async () => {
    const { fixture, html } = await criar();
    botao(html, 'Desfazer').click();
    await esperar(fixture);
    const d = dialogo.dialogos().at(-1)!;
    expect(d.mensagem).toBe('Desfazer o "cliente pagou" da OS #1001? Ela deixa de contar no que você deve ao Daniel.');
    expect(d.opcoes[1]).toMatchObject({ rotulo: 'Desfazer', estilo: 'btn-danger' });
    responder(true);
    await esperar(fixture);
    const put = http.expectOne(ALTO_OS + '/1/pagamento');
    expect(put.request.body).toEqual({ pago: false });
    put.flush({});
    await esperar(fixture);
    http.expectOne(ALTO_OS).flush(lista());
  });

  it('409 com mensagem do servidor: mostra a mensagem, sem toast genérico, sem recarregar', async () => {
    const { fixture, html } = await criar();
    botao(html, 'Desfazer').click();
    await esperar(fixture);
    responder(true);
    await esperar(fixture);
    http.expectOne(ALTO_OS + '/1/pagamento').flush({ erro: 'O Daniel já confirmou o recebimento.' }, { status: 409, statusText: 'Conflict' });
    await esperar(fixture);
    expect(dialogo.toastTexto()).toBe('O Daniel já confirmou o recebimento.');
    expect(dialogo.toastErro()).toBe(true);
    expect(botao(html, 'Desfazer').disabled).toBe(false);
  });

  it('falha sem mensagem: "Não foi possível salvar. Tente de novo."', async () => {
    const { fixture, html } = await criar();
    botao(html, 'Cliente pagou').click();
    await esperar(fixture);
    responder(true);
    await esperar(fixture);
    http.expectOne(ALTO_OS + '/2/pagamento').flush(null, { status: 404, statusText: 'Not Found' });
    await esperar(fixture);
    expect(dialogo.toastTexto()).toBe('Não foi possível salvar. Tente de novo.');
  });

  it('com a lista já em cache abre na hora e confere o servidor por trás', async () => {
    const { fixture } = await criar();
    expect(cache.tem(ALTO_OS)).toBe(true);
    fixture.destroy();
    const outra = TestBed.createComponent(AltoMedidas);
    await esperar(outra);
    expect((outra.nativeElement as HTMLElement).textContent).not.toContain('Carregando...'); // veio do cache
    http.expectOne(ALTO_OS).flush(lista());
  });

  it('sem rede: continua mostrando o que estava em cache e o interceptor avisa', async () => {
    const { fixture, html } = await criar();
    fixture.destroy();
    const outra = TestBed.createComponent(AltoMedidas);
    await esperar(outra);
    http.expectOne(ALTO_OS).error(new ProgressEvent('error'));
    await esperar(outra);
    expect((outra.nativeElement as HTMLElement).querySelectorAll('.linha').length).toBe(3);
    expect(dialogo.toastTexto()).toBe('Sem conexão com o servidor.');
    expect(html).toBeTruthy();
  });
});

describe('Início depois de um pagamento no Alto Medidas', () => {
  it('o cartão do Início sempre busca o resumo de novo (nada velho em cache)', async () => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: provedoresDeTela() });
    const http = TestBed.inject(HttpTestingController);
    const alto = TestBed.inject(AltoMedidasService);
    const aguardar = () => new Promise(r => setTimeout(r, 0));

    const p1 = alto.resumo();
    http.expectOne('/api/alto-medidas/status').flush({ habilitado: true });
    await aguardar();
    http.expectOne(ALTO_RESUMO).flush({ devidoAoDaniel: 800, quantidadeDevida: 1 });
    expect((await p1)?.devidoAoDaniel).toBe(800);

    // depois do pagamento: nova visita ao Início -> nova requisição (o status da integração já está guardado)
    const p2 = alto.resumo();
    await aguardar();
    http.expectOne(ALTO_RESUMO).flush({ devidoAoDaniel: 1500, quantidadeDevida: 2 });
    expect((await p2)?.devidoAoDaniel).toBe(1500);
    http.verify();
  });
});
