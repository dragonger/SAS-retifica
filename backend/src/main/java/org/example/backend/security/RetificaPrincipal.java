package org.example.backend.security;

/**
 * Identidade do usuário autenticado, extraída do JWT. Carrega o id da
 * empresa (tenant) desde já — ainda não é usado pra filtrar dados (isso é
 * a Fase 1b), mas evita ter que mexer no filtro de novo quando chegar lá.
 */
public class RetificaPrincipal {

    private final Long usuarioId;
    private final Long empresaId;
    private final String email;

    public RetificaPrincipal(Long usuarioId, Long empresaId, String email) {
        this.usuarioId = usuarioId;
        this.empresaId = empresaId;
        this.email = email;
    }

    public Long getUsuarioId() {
        return usuarioId;
    }

    public Long getEmpresaId() {
        return empresaId;
    }

    public String getEmail() {
        return email;
    }
}
