package org.example.backend.security;

import org.example.repository.UsuarioRepository;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;

/**
 * Revogação de sessões. O JWT não guarda estado, então cada usuário tem uma versão de sessão no banco
 * ({@code UsuarioModel.sessaoVersao}) que vai dentro do token: o token só vale enquanto a versão dele
 * for a atual. Subir a versão ({@link #revogarTodas}) derruba de uma vez todos os tokens já emitidos
 * para aquele usuário, em qualquer aparelho. Usuário apagado também derruba (não tem versão).
 *
 * <p>O banco fica longe do servidor, então a versão lida fica guardada em memória por
 * {@link #VALIDADE_DO_CACHE_MS}. A revogação feita por aqui atualiza o cache na hora (o app roda numa
 * instância só); o prazo do cache só importa se alguém mudar a coluna direto no banco.
 */
@Component
public class SessaoService {

    static final long VALIDADE_DO_CACHE_MS = TimeUnit.SECONDS.toMillis(30);

    private record Lida(Integer versao, long lidaEm) { }

    private final UsuarioRepository usuarios = new UsuarioRepository();
    private final Map<Long, Lida> cache = new ConcurrentHashMap<>();

    /** True se um token com essa versão ainda vale para o usuário. */
    public boolean valida(Long usuarioId, int versaoDoToken) {
        if (usuarioId == null) {
            return false;
        }
        long agora = System.currentTimeMillis();
        Lida lida = cache.get(usuarioId);
        if (lida == null || agora - lida.lidaEm() > VALIDADE_DO_CACHE_MS) {
            lida = new Lida(usuarios.versaoDaSessao(usuarioId), agora);
            cache.put(usuarioId, lida);
        }
        return lida.versao() != null && lida.versao() == versaoDoToken;
    }

    /**
     * Invalida todos os tokens já emitidos para o usuário. Devolve a versão nova, para quem quiser
     * emitir na mesma hora um token que continue valendo (o aparelho que pediu a revogação).
     */
    public int revogarTodas(Long usuarioId) {
        Integer nova = usuarios.revogarSessoes(usuarioId);
        cache.put(usuarioId, new Lida(nova, System.currentTimeMillis()));
        return nova == null ? 0 : nova;
    }
}
