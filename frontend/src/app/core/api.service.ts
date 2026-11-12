import { HttpClient, HttpContext, HttpContextToken } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

/**
 * Códigos HTTP que o chamador trata com mensagem própria: o interceptor não
 * mostra o toast genérico "Erro ao acessar..." para eles (evita dois avisos).
 */
export const STATUS_SEM_AVISO = new HttpContextToken<readonly number[]>(() => []);


/**
 * O 401 desta chamada NÃO significa sessão vencida (ex.: "senha atual incorreta"):
 * o interceptor não limpa a sessão nem refaz o login, só devolve o ErroApi(401).
 */
export const ERRO_401_PROPRIO = new HttpContextToken<boolean>(() => false);

export interface OpcoesApi {
  statusSemAviso?: readonly number[];
  /** Ver ERRO_401_PROPRIO. */
  erro401Proprio?: boolean;
}

/** Erro de uma chamada à API. `detalhe` vem do corpo `{"erro": "..."}` do servidor, se houver. */
export class ErroApi extends Error {
  constructor(
    readonly status: number,
    readonly detalhe: string | undefined,
    readonly caminho: string,
  ) {
    super('HTTP ' + status);
    this.name = 'ErroApi';
  }
}

/** Equivalente ao api() do app.js, sobre o HttpClient (token, renovação e erros ficam no interceptor). */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  get<T>(caminho: string, opcoes?: OpcoesApi): Promise<T> {
    return this.requisitar<T>('GET', caminho, undefined, opcoes);
  }

  post<T>(caminho: string, corpo?: unknown, opcoes?: OpcoesApi): Promise<T> {
    return this.requisitar<T>('POST', caminho, corpo, opcoes);
  }

  put<T>(caminho: string, corpo?: unknown, opcoes?: OpcoesApi): Promise<T> {
    return this.requisitar<T>('PUT', caminho, corpo, opcoes);
  }

  delete<T>(caminho: string, opcoes?: OpcoesApi): Promise<T> {
    return this.requisitar<T>('DELETE', caminho, undefined, opcoes);
  }

  /** Respostas que não são JSON (logo, PDF). */
  blob(caminho: string, opcoes?: OpcoesApi): Promise<Blob> {
    return firstValueFrom(this.http.get(caminho, { responseType: 'blob', context: this.contexto(opcoes) }));
  }

  /** 204 devolve null. Corpo FormData segue como multipart. */
  requisitar<T>(metodo: string, caminho: string, corpo?: unknown, opcoes?: OpcoesApi): Promise<T> {
    return firstValueFrom(this.http.request<T>(metodo, caminho, {
      body: corpo,
      context: this.contexto(opcoes),
    })) as Promise<T>;
  }

  private contexto(opcoes?: OpcoesApi): HttpContext {
    return new HttpContext()
      .set(STATUS_SEM_AVISO, opcoes?.statusSemAviso ?? [])
      .set(ERRO_401_PROPRIO, !!opcoes?.erro401Proprio);
  }
}
