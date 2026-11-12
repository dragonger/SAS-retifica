import { DestroyRef, Injectable, InjectionToken, inject, signal } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';

/** Recarrega a página (trocável nos testes: o jsdom não implementa location.reload). */
export const RECARREGAR_PAGINA = new InjectionToken<() => void>('RECARREGAR_PAGINA', {
  providedIn: 'root',
  factory: () => () => location.reload(),
});

/**
 * Aviso de "nova versão" (o fluxo retifica:nova-versao do sw.js/app.js, agora no
 * service worker do Angular): quando o ngsw termina de baixar uma versão nova
 * em segundo plano (VERSION_READY), o aviso aparece e fica até o usuário tocar.
 * Ao tocar: ativa a versão nova e recarrega. Sem service worker (desenvolvimento,
 * navegador sem suporte) o SwUpdate não existe/não emite e o aviso nunca aparece.
 */
@Injectable({ providedIn: 'root' })
export class NovaVersaoService {
  private readonly sw = inject(SwUpdate, { optional: true });
  private readonly recarregar = inject(RECARREGAR_PAGINA);

  readonly disponivel = signal(false);

  constructor() {
    const assinatura = this.sw?.versionUpdates.subscribe(ev => {
      if (ev.type === 'VERSION_READY') this.disponivel.set(true);
    });
    inject(DestroyRef).onDestroy(() => assinatura?.unsubscribe());
  }

  /** Ativa a versão baixada (a próxima carga já usa os arquivos novos) e recarrega. */
  async atualizar(): Promise<void> {
    try {
      await this.sw?.activateUpdate();
    } catch {
      /* se a ativação falhar, o recarregamento ainda pega a versão nova na próxima abertura */
    }
    this.recarregar();
  }
}
