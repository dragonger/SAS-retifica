package org.example.backend;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.example.backend.security.JwtUtil;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;

import javax.crypto.SecretKey;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.Date;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Duas garantias que so aparecem com o servidor de pe:
 *  - o header X-Auth-Refresh que o PWA espera (renova a sessao sem pedir login);
 *  - com a integracao do Alto Medidas SEM chave e o WhatsApp SEM token (producao antes de configurar),
 *    nada sai nem entra: 503, e o envio de WhatsApp nunca chega a tentar a rede.
 * Contexto proprio: a chave de entrada fica vazia.
 */
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {"ALTO_MEDIDAS_ENTRADA_KEY=", "ALTO_MEDIDAS_EMPRESA_ID=1"})
class SessaoEIntegracoesDesligadasTest {

    static {
        GuardaBancoLocal.verificar();
    }

    @LocalServerPort int porta;
    @Autowired JwtUtil jwtUtil;

    private static SecretKey chave() {
        return Keys.hmacShaKeyFor(Base64.getDecoder().decode(System.getenv("JWT_SECRET").trim()));
    }

    private static String tokenQueExpiraEm(long dias) {
        Instant agora = Instant.now();
        return Jwts.builder().subject("sessao@example.test").claim("usuarioId", 5L).claim("empresaId", 1L)
                .issuedAt(Date.from(agora.minus(1, ChronoUnit.DAYS)))
                .expiration(Date.from(agora.plus(dias, ChronoUnit.DAYS)))
                .signWith(chave()).compact();
    }

    @Test
    void tokenPertoDeExpirarRecebeUmNovoNoHeaderEmUmaRotaProtegida() {
        var r = new ApiTeste(porta).get("/api/clientes", tokenQueExpiraEm(3));
        assertThat(r.status()).isEqualTo(200);
        String novo = r.cabecalho("X-Auth-Refresh");
        assertThat(novo).as("header de renovacao").isNotBlank();
        Claims c = jwtUtil.validar(novo);
        assertThat(c).isNotNull();
        assertThat(c.get("empresaId", Long.class)).as("a renovacao mantem a empresa").isEqualTo(1L);
        assertThat(c.get("usuarioId", Long.class)).isEqualTo(5L);
        assertThat(c.getExpiration()).isAfter(Date.from(Instant.now().plus(25, ChronoUnit.DAYS)));
    }

    @Test
    void tokenComMuitaValidadeNaoRecebeHeaderDeRenovacao() {
        var r = new ApiTeste(porta).get("/api/clientes", tokenQueExpiraEm(20));
        assertThat(r.status()).isEqualTo(200);
        assertThat(r.cabecalho("X-Auth-Refresh")).isNull();
    }

    @Test
    void tokenExpiradoNaoRecebeRenovacaoEDa401() {
        var r = new ApiTeste(porta).get("/api/clientes", tokenQueExpiraEm(-2));
        assertThat(r.status()).isEqualTo(401);
        assertThat(r.cabecalho("X-Auth-Refresh")).isNull();
    }

    @Test
    void entradaDoAltoMedidasSemChaveConfiguradaDa503ParaQualquerChave() {
        ApiTeste api = new ApiTeste(porta);
        Map<String, Object> corpo = Map.of("osId", "nao-deve-entrar", "valor", 1);
        assertThat(api.postComChave("/api/integracoes/alto-medidas/os", "qualquer-chave", corpo).status()).isEqualTo(503);
        assertThat(api.postComChave("/api/integracoes/alto-medidas/os", "", corpo).status()).isEqualTo(503);
    }

    @Test
    void statusDoAltoMedidasFicaDesabilitadoSemChave() {
        String token = tokenQueExpiraEm(20);   // empresa 1, a dona da integracao
        var r = new ApiTeste(porta).get("/api/alto-medidas/status", token);
        assertThat(r.json().get("habilitado").asBoolean()).isFalse();
    }

    @Test
    void whatsAppSemTokenFicaDesligadoEOEnvioDa503SemTentarARede() {
        ApiTeste api = new ApiTeste(porta);
        String token = tokenQueExpiraEm(20);
        assertThat(api.get("/api/whatsapp/status", token).json().get("habilitado").asBoolean()).isFalse();
        // 503 vem antes de olhar o pedido: nem a existencia dele e consultada nem ha chamada externa
        assertThat(api.postSemCorpo("/api/pedidos/1/whatsapp", token).status()).isEqualTo(503);
        assertThat(api.postSemCorpo("/api/pedidos/999999999/whatsapp", token).status()).isEqualTo(503);
    }
}
