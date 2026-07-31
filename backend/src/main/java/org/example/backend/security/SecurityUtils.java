package org.example.backend.security;

import org.springframework.security.core.context.SecurityContextHolder;

/**
 * Atalho pra extrair a identidade do usuário autenticado (populada pelo
 * {@link JwtAuthFilter}) sem cada controller repetir a mesma leitura do
 * {@link SecurityContextHolder}.
 */
public final class SecurityUtils {

    private SecurityUtils() {
    }

    public static RetificaPrincipal principalAtual() {
        return (RetificaPrincipal) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
    }

    public static Long empresaAtual() {
        return principalAtual().getEmpresaId();
    }
}
