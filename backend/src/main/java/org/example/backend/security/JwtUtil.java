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
    private static final long RENOVAR_SE_FALTAM_DIAS = 7;

    private final SecretKey chave;

    public JwtUtil() {
        this.chave = Keys.hmacShaKeyFor(carregarOuGerarChave());
    }

    public String gerar(UsuarioModel usuario) {
        return gerar(usuario.getEmail(), usuario.getId(),
                usuario.getEmpresa() != null ? usuario.getEmpresa().getId() : null);
    }

    /**
     * Token da DEMONSTRAÇÃO: vence junto com a empresa de demonstração (que é apagada nesse prazo) e
     * nunca é renovado (claim {@code demo = true}, ver {@link #precisaRenovar}).
     */
    public String gerarDemo(UsuarioModel usuario, Instant expiraEm) {
        return Jwts.builder()
                .subject(usuario.getEmail())
                .claim("usuarioId", usuario.getId())
                .claim("empresaId", usuario.getEmpresa().getId())
                .claim("demo", true)
                .issuedAt(Date.from(Instant.now()))
                .expiration(Date.from(expiraEm))
                .signWith(chave)
                .compact();
    }

    /** True se o token é de uma sessão de demonstração. */
    public static boolean ehDemo(Claims claims) {
        return Boolean.TRUE.equals(claims.get("demo", Boolean.class));
    }

    /** Renova um token válido (mesmo usuário/empresa, nova expiração) — mantém a sessão ativa sem exigir login de novo. */
    public String renovar(Claims claims) {
        return gerar(claims.getSubject(), claims.get("usuarioId", Long.class), claims.get("empresaId", Long.class));
    }

    private String gerar(String email, Long usuarioId, Long empresaId) {
        Instant agora = Instant.now();
        return Jwts.builder()
                .subject(email)
                .claim("usuarioId", usuarioId)
                .claim("empresaId", empresaId)
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

    /** True quando falta pouco pra expirar — sinal pro filtro renovar o token silenciosamente. */
    public boolean precisaRenovar(Claims claims) {
        if (ehDemo(claims)) {
            return false; // a demonstração acaba no prazo dela, junto com a empresa
        }
        Instant limiteRenovacao = claims.getExpiration().toInstant().minus(RENOVAR_SE_FALTAM_DIAS, ChronoUnit.DAYS);
        return Instant.now().isAfter(limiteRenovacao);
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
