package org.example.backend.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.example.model.EmpresaModel;
import org.example.model.UsuarioModel;
import org.junit.jupiter.api.Test;

import javax.crypto.SecretKey;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.Date;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * JwtUtil: o empresaId do token e a unica fonte do tenant. A chave vem do
 * JWT_SECRET sintetico que o surefire define (nunca a de producao).
 */
class JwtUtilTest {

    private final JwtUtil jwt = new JwtUtil();

    private static SecretKey chaveDeTeste() {
        String segredo = System.getenv("JWT_SECRET");
        assertThat(segredo).as("JWT_SECRET sintetico do surefire").isNotBlank();
        return Keys.hmacShaKeyFor(Base64.getDecoder().decode(segredo.trim()));
    }

    private static UsuarioModel usuario(long id, long empresaId, String email) {
        EmpresaModel e = new EmpresaModel();
        e.setId(empresaId);
        UsuarioModel u = new UsuarioModel();
        u.setId(id);
        u.setEmail(email);
        u.setEmpresa(e);
        return u;
    }

    private static String tokenQueExpiraEm(long dias, SecretKey chave) {
        Instant agora = Instant.now();
        return Jwts.builder().subject("x@example.test").claim("usuarioId", 7L).claim("empresaId", 3L)
                .issuedAt(Date.from(agora.minus(1, ChronoUnit.DAYS)))
                .expiration(Date.from(agora.plus(dias, ChronoUnit.DAYS)))
                .signWith(chave).compact();
    }

    @Test
    void geraEValidaPreservandoUsuarioEEmpresa() {
        Claims c = jwt.validar(jwt.gerar(usuario(11, 22, "a@example.test")));
        assertThat(c).isNotNull();
        assertThat(c.getSubject()).isEqualTo("a@example.test");
        assertThat(c.get("usuarioId", Long.class)).isEqualTo(11L);
        assertThat(c.get("empresaId", Long.class)).isEqualTo(22L);
    }

    @Test
    void tokenAdulteradoOuDeOutraChaveOuExpiradoOuMalformadoNaoValida() {
        String bom = jwt.gerar(usuario(1, 1, "a@example.test"));
        String[] partes = bom.split("\\.");
        // Troca o PRIMEIRO caractere da assinatura: o ultimo carrega bits de preenchimento do base64 e
        // alterá-lo as vezes nao muda os bytes decodificados (o teste ficaria intermitente).
        char primeiro = partes[2].charAt(0);
        String assinaturaAdulterada = partes[0] + "." + partes[1] + "."
                + (primeiro == 'A' ? 'B' : 'A') + partes[2].substring(1);
        SecretKey outraChave = Keys.hmacShaKeyFor("outra-chave-sintetica-com-mais-de-32-bytes!".getBytes());

        assertThat(jwt.validar(assinaturaAdulterada)).as("assinatura adulterada").isNull();
        assertThat(jwt.validar(tokenQueExpiraEm(10, outraChave))).as("outra chave").isNull();
        assertThat(jwt.validar(tokenQueExpiraEm(-2, chaveDeTeste()))).as("expirado").isNull();
        assertThat(jwt.validar("abc")).isNull();
        assertThat(jwt.validar("")).isNull();
        assertThat(jwt.validar("eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0.")).as("alg none").isNull();
    }

    @Test
    void trocarOCorpoDoTokenParaOutraEmpresaInvalidaAAssinatura() {
        String bom = jwt.gerar(usuario(1, 1, "a@example.test"));
        String[] partes = bom.split("\\.");
        String corpoOutraEmpresa = Base64.getUrlEncoder().withoutPadding().encodeToString(
                "{\"sub\":\"a@example.test\",\"usuarioId\":1,\"empresaId\":999,\"exp\":4102444800}".getBytes());
        assertThat(jwt.validar(partes[0] + "." + corpoOutraEmpresa + "." + partes[2])).isNull();
    }

    @Test
    void renovaSoQuandoFaltamMenosDeSeteDias() {
        SecretKey chave = chaveDeTeste();
        assertThat(jwt.precisaRenovar(jwt.validar(tokenQueExpiraEm(30, chave)))).as("30 dias").isFalse();
        assertThat(jwt.precisaRenovar(jwt.validar(tokenQueExpiraEm(10, chave)))).as("10 dias").isFalse();
        assertThat(jwt.precisaRenovar(jwt.validar(tokenQueExpiraEm(6, chave)))).as("6 dias").isTrue();
        assertThat(jwt.precisaRenovar(jwt.validar(tokenQueExpiraEm(1, chave)))).as("1 dia").isTrue();
    }

    @Test
    void renovarMantemUsuarioEEmpresaEEstendeAValidade() {
        Claims velho = jwt.validar(tokenQueExpiraEm(2, chaveDeTeste()));
        Claims novo = jwt.validar(jwt.renovar(velho));
        assertThat(novo).isNotNull();
        assertThat(novo.getSubject()).isEqualTo("x@example.test");
        assertThat(novo.get("usuarioId", Long.class)).isEqualTo(7L);
        assertThat(novo.get("empresaId", Long.class)).isEqualTo(3L);
        assertThat(novo.getExpiration()).isAfter(Date.from(Instant.now().plus(25, ChronoUnit.DAYS)));
        assertThat(jwt.precisaRenovar(novo)).isFalse();
    }
}
