package org.example.backend.security;

import org.example.repository.UsuarioRepository;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.function.Function;

/**
 * Revogação de sessões. O JWT não guarda estado, então cada usuário tem uma versão de sessão no banco
 * ({@code UsuarioModel.sessaoVersao}) que vai dentro do token: o token só vale enquanto a versão dele
 * for a atual. Subir a versão ({@link #revogarTodas}) derruba de uma vez todos os tokens já emitidos
 * para aquele usuário, em qualquer aparelho. Usuário apagado também derruba (não tem versão).
 *
 * <p>O banco fica longe do servidor, então a versão lida fica guardada em memória por
 * {@link #VALIDADE_DO_CACHE_MS} (5 minutos). Toda revogação passa por esta instância (o app roda numa
 * instância só) e atualiza o cache na hora; o prazo só importa se alguém mudar a coluna direto no banco.
 *
 * <p>A versão só sobe, então o cache nunca troca uma versão maior por uma menor: uma leitura lenta do
 * banco que chega depois da revogação não ressuscita o token revogado. Usuário inexistente (versão
 * nula) é definitivo. A leitura do banco roda uma vez só por usuário, mesmo com várias requisições
 * simultâneas na falta de cache.
 */
@Component
public class SessaoService {

    static final long VALIDADE_DO_CACHE_MS = TimeUnit.MINUTES.toMillis(5);
    static final int LIMITE_DO_CACHE = 10_000;

    private record Lida(Integer versao, long lidaEm) { }

    private final UsuarioRepository usuarios = new UsuarioRepository();
    private final Map<Long, Lida> cache = new ConcurrentHashMap<>();

    /** Gancho dos testes: como a versão é lida do banco (permite simular uma leitura atrasada). */
    Function<Long, Integer> leitor = usuarios::versaoDaSessao;

    /** True se um token com essa versão ainda vale para o usuário. */
    public boolean valida(Long usuarioId, int versaoDoToken) {
        if (usuarioId == null) {
            return false;
        }
        long agora = System.currentTimeMillis();
        Lida lida = cache.get(usuarioId);
        if (lida == null || vencida(lida, agora)) {
            lida = cache.compute(usuarioId, (id, atual) ->
                    atual != null && !vencida(atual, agora) ? atual : fundir(atual, leitor.apply(id), agora));
            if (cache.size() > LIMITE_DO_CACHE) {
                cache.values().removeIf(l -> vencida(l, agora));
            }
        }
        return lida.versao() != null && lida.versao() == versaoDoToken;
    }

    /**
     * Invalida todos os tokens já emitidos para o usuário. Devolve a versão nova, para quem quiser
     * emitir na mesma hora um token que continue valendo (o aparelho que pediu a revogação).
     */
    public int revogarTodas(Long usuarioId) {
        return gravar(usuarioId, usuarios.revogarSessoes(usuarioId));
    }

    /**
     * Troca o hash da senha e sobe a versão das sessões numa transação só. Devolve a versão nova
     * (0 se o usuário não existe).
     */
    public int trocarSenha(Long usuarioId, String novoHash) {
        return gravar(usuarioId, usuarios.trocarSenha(usuarioId, novoHash));
    }

    /** Grava no cache uma versão conhecida agora (vinda de uma escrita), sem nunca reduzi-la. */
    int gravar(Long usuarioId, Integer versao) {
        long agora = System.currentTimeMillis();
        cache.compute(usuarioId, (id, atual) -> fundir(atual, versao, agora));
        return versao == null ? 0 : versao;
    }

    /** Gancho dos testes: marca a entrada do cache como vencida. */
    void forcarVencimento(Long usuarioId) {
        cache.computeIfPresent(usuarioId, (id, atual) -> new Lida(atual.versao(), 0));
    }

    private static boolean vencida(Lida lida, long agora) {
        return agora - lida.lidaEm() > VALIDADE_DO_CACHE_MS;
    }

    /** Regra do cache: nulo (usuário apagado) é definitivo; senão vale a maior versão já vista. */
    private static Lida fundir(Lida atual, Integer versaoNova, long agora) {
        if (versaoNova == null || (atual != null && atual.versao() == null)) {
            return new Lida(null, agora);
        }
        int maior = atual == null ? versaoNova : Math.max(atual.versao(), versaoNova);
        return new Lida(maior, agora);
    }
}
