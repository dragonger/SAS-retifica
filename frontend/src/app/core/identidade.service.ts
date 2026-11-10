import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { AuthService, CHAVE_LOGO } from './auth.service';

interface LogoGuardada {
  versao: string | number;
  dataUrl: string;
}

interface DadosEmpresa {
  nome?: string;
  logoVersao?: string | number | null;
}

/**
 * Identidade da empresa (nome e logo na barra do app). Cada empresa tem a sua
 * logo; ela fica guardada no aparelho (junto da versão que o servidor
 * informou) para aparecer na hora, sem esperar rede. A cada abertura só se
 * confere a versão e baixa de novo se mudou (carregarIdentidade do app.js).
 */
@Injectable({ providedIn: 'root' })
export class IdentidadeService {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);

  /** Data URL da logo atual, ou null (sem logo / sem sessão). */
  readonly logo = signal<string | null>(null);

  private carregada = false;

  /** Dispara o carregamento uma vez por sessão (a rota protegida chama a cada navegação). */
  garantir(): void {
    if (this.carregada) return;
    this.carregada = true;
    void this.carregar();
  }

  /** Logout / 401: esquece logo e dados da empresa deste aparelho. */
  limpar(): void {
    try { localStorage.removeItem(CHAVE_LOGO); } catch { /* sem storage */ }
    this.carregada = false;
    this.logo.set(null);
  }

  logoGuardada(): LogoGuardada | null {
    try {
      const l = JSON.parse(localStorage.getItem(CHAVE_LOGO) || 'null');
      return l && typeof l === 'object' ? (l as LogoGuardada) : null;
    } catch {
      return null;
    }
  }

  async carregar(): Promise<void> {
    const guardada = this.logoGuardada();
    this.logo.set(guardada?.dataUrl ?? null);
    try {
      const dados = await this.api.get<DadosEmpresa>('/api/empresa');
      if (dados?.nome) this.auth.gravarEmpresaNome(dados.nome);
      if (!dados?.logoVersao) {
        try { localStorage.removeItem(CHAVE_LOGO); } catch { /* sem storage */ }
        this.logo.set(null);
        return;
      }
      if (guardada && guardada.versao === dados.logoVersao) return;
      const blob = await this.api.blob('/api/empresa/logo');
      const dataUrl = await lerComoDataUrl(blob);
      try {
        localStorage.setItem(CHAVE_LOGO, JSON.stringify({ versao: dados.logoVersao, dataUrl }));
      } catch { /* sem espaço guardado: aparece só nesta abertura */ }
      this.logo.set(dataUrl);
    } catch {
      // sem conexão: continua com a logo guardada
    }
  }
}

function lerComoDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(leitor.result as string);
    leitor.onerror = () => reject(leitor.error);
    leitor.readAsDataURL(blob);
  });
}
