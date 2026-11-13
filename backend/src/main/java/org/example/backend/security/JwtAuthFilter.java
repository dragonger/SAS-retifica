package org.example.backend.security;

import io.jsonwebtoken.Claims;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.lang.NonNull;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;

/**
 * Lê o header "Authorization: Bearer <token>", valida via {@link JwtUtil},
 * confere se a sessão não foi revogada ({@link SessaoService}) e, se tudo
 * certo, popula o contexto de segurança com um {@link RetificaPrincipal}.
 * Se ausente/inválido/revogado, segue sem autenticar — o SecurityConfig
 * decide se a rota exige autenticação (e responde 401).
 */
@Component
public class JwtAuthFilter extends OncePerRequestFilter {

    private final JwtUtil jwtUtil;
    private final SessaoService sessoes;

    public JwtAuthFilter(JwtUtil jwtUtil, SessaoService sessoes) {
        this.jwtUtil = jwtUtil;
        this.sessoes = sessoes;
    }

    @Override
    protected void doFilterInternal(@NonNull HttpServletRequest request, @NonNull HttpServletResponse response,
                                     @NonNull FilterChain chain) throws ServletException, IOException {
        String header = request.getHeader("Authorization");
        if (header != null && header.startsWith("Bearer ")) {
            Claims claims = jwtUtil.validar(header.substring(7));
            if (claims != null && sessoes.valida(claims.get("usuarioId", Long.class), JwtUtil.versaoDe(claims))) {
                RetificaPrincipal principal = new RetificaPrincipal(
                        claims.get("usuarioId", Long.class),
                        claims.get("empresaId", Long.class),
                        claims.getSubject(),
                        JwtUtil.ehDemo(claims));
                UsernamePasswordAuthenticationToken auth =
                        new UsernamePasswordAuthenticationToken(principal, null, List.of());
                SecurityContextHolder.getContext().setAuthentication(auth);
                if (jwtUtil.precisaRenovar(claims)) {
                    response.setHeader("X-Auth-Refresh", jwtUtil.renovar(claims));
                }
            }
        }
        chain.doFilter(request, response);
    }
}
