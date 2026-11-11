import { TestBed } from '@angular/core/testing';
import { SwUpdate, VersionEvent } from '@angular/service-worker';
import { Subject } from 'rxjs';
import { AvisoNovaVersao } from '../shared/aviso-nova-versao';
import { esperar } from '../testing/ajuda';
import { NovaVersaoService, RECARREGAR_PAGINA } from './nova-versao.service';

describe('aviso de nova versão', () => {
  const TEXTO = 'Nova versão disponível — toque para atualizar';
  let eventos: Subject<VersionEvent>;
  let activateUpdate: ReturnType<typeof vi.fn>;
  let recarregar: ReturnType<typeof vi.fn>;

  function criar(comSw = true) {
    eventos = new Subject<VersionEvent>();
    activateUpdate = vi.fn().mockResolvedValue(true);
    recarregar = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        { provide: RECARREGAR_PAGINA, useValue: recarregar },
        ...(comSw ? [{ provide: SwUpdate, useValue: { versionUpdates: eventos.asObservable(), activateUpdate } }] : []),
      ],
    });
    const fixture = TestBed.createComponent(AvisoNovaVersao);
    return { fixture, html: fixture.nativeElement as HTMLElement };
  }

  const botao = (html: HTMLElement) => html.querySelector('button') as HTMLButtonElement | null;
  const pronta = { type: 'VERSION_READY', currentVersion: { hash: 'a' }, latestVersion: { hash: 'b' } } as VersionEvent;

  it('não aparece enquanto não houver versão nova', async () => {
    const { fixture, html } = criar();
    await esperar(fixture);
    expect(botao(html)).toBeNull();
  });

  it('aparece ao receber VERSION_READY, com o mesmo texto e posição do app atual', async () => {
    const { fixture, html } = criar();
    eventos.next(pronta);
    await esperar(fixture);
    const b = botao(html)!;
    expect(b.textContent?.trim()).toBe(TEXTO);
    expect(b.getAttribute('style')).toContain('position: fixed');
    expect(b.getAttribute('style')).toContain('bottom: calc(140px + env(safe-area-inset-bottom))');
    expect(b.getAttribute('style')).toContain('z-index: 20');
  });

  it('ignora os outros eventos (detectada, sem novidade, falha de instalação)', async () => {
    const { fixture, html } = criar();
    eventos.next({ type: 'VERSION_DETECTED', version: { hash: 'b' } } as VersionEvent);
    eventos.next({ type: 'NO_NEW_VERSION_DETECTED', version: { hash: 'a' } } as VersionEvent);
    eventos.next({ type: 'VERSION_INSTALLATION_FAILED', version: { hash: 'b' }, error: 'x' } as VersionEvent);
    await esperar(fixture);
    expect(botao(html)).toBeNull();
  });

  it('ao tocar: ativa a versão nova e só depois recarrega', async () => {
    const { fixture, html } = criar();
    const ordem: string[] = [];
    activateUpdate.mockImplementation(async () => { ordem.push('ativar'); return true; });
    recarregar.mockImplementation(() => ordem.push('recarregar'));
    eventos.next(pronta);
    await esperar(fixture);
    botao(html)!.click();
    await esperar(fixture);
    expect(ordem).toEqual(['ativar', 'recarregar']);
  });

  it('se a ativação falhar, recarrega mesmo assim', async () => {
    const { fixture, html } = criar();
    activateUpdate.mockRejectedValue(new Error('falhou'));
    eventos.next(pronta);
    await esperar(fixture);
    botao(html)!.click();
    await esperar(fixture);
    expect(recarregar).toHaveBeenCalledTimes(1);
  });

  it('fica na tela até o toque (vários VERSION_READY não duplicam o botão)', async () => {
    const { fixture, html } = criar();
    eventos.next(pronta);
    eventos.next(pronta);
    await esperar(fixture);
    expect(html.querySelectorAll('button')).toHaveLength(1);
  });

  it('sem service worker (desenvolvimento): nada aparece e atualizar() só recarrega', async () => {
    const { fixture, html } = criar(false);
    await esperar(fixture);
    expect(botao(html)).toBeNull();
    await TestBed.inject(NovaVersaoService).atualizar();
    expect(recarregar).toHaveBeenCalledTimes(1);
  });
});
