package org.example.backend.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jws;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.example.model.UsuarioModel;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.SecureRandom;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.Date;

/**
 * Geração e validação de token JWT. A chave de assinatura vem da variável de
 * ambiente JWT_SECRET quando existir (produção — filesystem não é
 * persistente no Railway); sem ela, é gerada na primeira vez que o app roda
 * localmente e guardada em ~/.retificasDesktop/jwt-secret.key — fora do
 * repositório, nunca deve ir pro git (o repo é público).
 */
@Component
public class JwtUtil {

    private static final long EXPIRACAO_DIAS = 30;

    private final SecretKey chave;

    public JwtUtil() {
        this.chave = Keys.hmacShaKeyFor(carregarOuGerarChave());
    }

    public String gerar(UsuarioModel usuario) {
        Instant agora = Instant.now();
        return Jwts.builder()
                .subject(usuario.getEmail())
                .claim("usuarioId", usuario.getId())
                .claim("empresaId", usuario.getEmpresa() != null ? usuario.getEmpresa().getId() : null)
                .issuedAt(Date.from(agora))
                .expiration(Date.from(agora.plus(EXPIRACAO_DIAS, ChronoUnit.DAYS)))
                .signWith(chave)
                .compact();
    }

    /** Retorna as claims do token se válido, ou null se inválido/expirado. */
    public Claims validar(String token) {
        try {
            Jws<Claims> jws = Jwts.parser().verifyWith(chave).build().parseSignedClaims(token);
            return jws.getPayload();
        } catch (RuntimeException e) {
            return null;
        }
    }

    private byte[] carregarOuGerarChave() {
        String doAmbiente = System.getenv("JWT_SECRET");
        if (doAmbiente != null && !doAmbiente.isBlank()) {
            return Base64.getDecoder().decode(doAmbiente.trim());
        }

        Path arquivo = Path.of(System.getProperty("user.home"), ".retificasDesktop", "jwt-secret.key");
        try {
            if (Files.exists(arquivo)) {
                return Base64.getDecoder().decode(Files.readString(arquivo, StandardCharsets.UTF_8).trim());
            }
            Files.createDirectories(arquivo.getParent());
            byte[] chaveBytes = new byte[32];
            new SecureRandom().nextBytes(chaveBytes);
            Files.writeString(arquivo, Base64.getEncoder().encodeToString(chaveBytes), StandardCharsets.UTF_8);
            return chaveBytes;
        } catch (IOException e) {
            throw new IllegalStateException("Não foi possível carregar/gerar a chave JWT em " + arquivo, e);
        }
    }
}
