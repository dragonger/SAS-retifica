import { Injectable, inject } from '@angular/core';
import { ApiService } from './api.service';

/** Caminho da lista de pedidos abertos (invalidado junto com dashboard e encerrados). */
export const PEDIDOS_ABERTOS = '/api/pedidos?abertos=true';
export const PATH_DASHBOARD_PEDIDOS = '/api/pedidos/dashboard';
export const PATH_ENCERRADOS_PEDIDOS = '/api/pedidos/encerrados';

/**
 * Cache leve das telas (Início/Pedidos/Encerrados/Dashboard). Guarda a última
 * resposta de cada GET: ao reabrir a tela mostra o que já tem na hora (sem
 * "Carregando..." nem esperar rede) e busca de novo por trás; só redesenha
 * com o dado fresco se ele realmente mudou. Equivale a respostaCache /
 * cacheVersao / cacheInvalidar / comCache / carregarComCache do app.js.
 */
@Injectable({ providedIn: 'root' })
export class CacheService {
  private readonly api = inject(ApiService);

  private readonly respostas = new Map<string, unknown>();
  private readonly versoes = new Map<string, number>();
  private geracao = 0;

  /**
   * Chamar a cada navegação concluída na checagem de guardas (o shell faz isso):
   * invalida qualquer revalidação pendente de uma tela anterior.
   */
  novaGeracao(): void {
    this.geracao++;
  }

  tem(path: string): boolean {
    return this.respostas.has(path);
  }

  ler<T>(path: string): T | undefined {
    return this.respostas.get(path) as T | undefined;
  }

  invalidar(...paths: string[]): void {
    for (const p of paths) {
      this.respostas.delete(p);
      this.versoes.set(p, (this.versoes.get(p) || 0) + 1);
    }
  }

  /** Depois de criar/editar/finalizar/excluir um pedido: abertos, dashboard e encerrados ficam velhos. */
  invalidarPedidos(): void {
    this.invalidar(PEDIDOS_ABERTOS, PATH_DASHBOARD_PEDIDOS, PATH_ENCERRADOS_PEDIDOS);
  }

  /**
   * Busca `path` e guarda no cache, mas descarta o resultado se o path foi
   * invalidado enquanto a requisição estava no ar (senão uma lista velha
   * voltaria pro cache logo depois de um cadastro/edição).
   */
  async buscarECachear<T>(path: string): Promise<T> {
    const versao = this.versoes.get(path) || 0;
    const dado = await this.api.get<T>(path);
    if ((this.versoes.get(path) || 0) === versao) this.respostas.set(path, dado);
    return dado;
  }

  /** True quando todos os caminhos já têm resposta guardada (a tela pode abrir sem "Carregando..."). */
  todosEmCache(paths: string[]): boolean {
    return paths.every(p => this.respostas.get(p) !== undefined);
  }

  /**
   * Para telas com formulário de edição acoplado: com tudo em cache, devolve
   * na hora e só atualiza o cache em segundo plano (a tela não redesenha
   * sozinha, pra não atropelar uma edição em andamento). Sem cache, espera a rede.
   */
  async carregarComCache<T extends unknown[]>(paths: string[]): Promise<T> {
    if (this.todosEmCache(paths)) {
      const emCache = paths.map(p => this.respostas.get(p));
      Promise.all(paths.map(p => this.buscarECachear(p))).catch(() => { /* a falha já foi avisada pelo interceptor */ });
      return emCache as T;
    }
    return Promise.all(paths.map(p => this.buscarECachear(p))) as Promise<T>;
  }

  /**
   * Chama render(dado) na hora se já tiver algo guardado, sempre busca de novo
   * em segundo plano, e chama render(fresco) de novo só se o dado mudou e o
   * usuário ainda estiver nessa tela (uma resposta atrasada não sobrescreve
   * uma tela pra onde ele já navegou).
   */
  async comCache<T>(path: string, render: (dado: T) => void): Promise<void> {
    const minhaGeracao = this.geracao;
    const emCache = this.respostas.get(path) as T | undefined;
    if (emCache !== undefined) render(emCache);
    const fresco = await this.api.get<T>(path);
    const mudou = JSON.stringify(fresco) !== JSON.stringify(emCache);
    this.respostas.set(path, fresco);
    if (this.geracao === minhaGeracao && (emCache === undefined || mudou)) render(fresco);
  }
}
