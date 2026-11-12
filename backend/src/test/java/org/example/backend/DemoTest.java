package org.example.backend;

import io.jsonwebtoken.Claims;
import jakarta.persistence.EntityManager;
import org.example.backend.demo.DemoService;
import org.example.backend.security.JwtUtil;
import org.example.persistence.JPAUtil;
import org.example.repository.EmpresaDemoRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.security.crypto.password.PasswordEncoder;
import tools.jackson.databind.JsonNode;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

/**
 * Demonstracao para visitantes: empresa nova e isolada com dados ficticios, token de 2 horas que nao
 * renova, ditado/WhatsApp/troca de senha bloqueados, limite por endereco e limpeza que so apaga
 * empresa de demonstracao vencida (uma empresa real nunca, nem com prazo preenchido).
 */
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {"ALTO_MEDIDAS_ENTRADA_KEY=chave-sintetica-de-teste", "ALTO_MEDIDAS_EMPRESA_ID=1"})
class DemoTest {

    static {
        GuardaBancoLocal.verificar();
    }

    @LocalServerPort int porta;
    @Autowired JwtUtil jwtUtil;
    @Autowired PasswordEncoder encoder;
    @Autowired DemoService demoService;

    private ApiTeste api() {
        return new ApiTeste(porta);
    }

    /** Abre uma demonstracao vinda de {@code ip} e devolve o token. */
    private String abrir(String ip) {
        var r = api().postDeEndereco("/api/auth/demo", ip);
        assertThat(r.status()).as(r.corpo()).isEqualTo(200);
        return r.json().get("token").asString();
    }

    private long empresaDo(String token) {
        return jwtUtil.validar(token).get("empresaId", Long.class);
    }

    private static long contar(String sql, Object... parametros) {
        EntityManager em = JPAUtil.getEntityManager();
        try {
            var q = em.createNativeQuery(sql);
            for (int i = 0; i < parametros.length; i++) q.setParameter(i + 1, parametros[i]);
            return ((Number) q.getSingleResult()).longValue();
        } finally {
            em.close();
        }
    }

    private static void executar(String sql, Object... parametros) {
        EntityManager em = JPAUtil.getEntityManager();
        try {
            em.getTransaction().begin();
            var q = em.createNativeQuery(sql);
            for (int i = 0; i < parametros.length; i++) q.setParameter(i + 1, parametros[i]);
            q.executeUpdate();
            em.getTransaction().commit();
        } finally {
            em.close();
        }
    }

    /** Vence todas as demonstracoes do banco de teste e roda a limpeza (um dia para tras cobre qualquer fuso). */
    @AfterEach
    void apagarDemonstracoes() {
        executar("update empresa set demoexpiraem = now() - interval '1 day' where demo = true");
        demoService.limparVencidas();
    }

    @Test
    void abreEmpresaNovaComDadosFicticiosETokenDeDuasHorasQueNaoRenova() {
        String token = abrir("10.0.0.1");
        Claims claims = jwtUtil.validar(token);
        assertThat(JwtUtil.ehDemo(claims)).isTrue();
        assertThat(Duration.between(Instant.now(), claims.getExpiration().toInstant()).toMinutes())
                .isCloseTo(120L, within(2L));

        assertThat(api().get("/api/empresa", token).json().get("nome").asString()).isEqualTo("Retífica Demonstração");
        var clientes = api().get("/api/clientes", token);
        assertThat(clientes.json().size()).isEqualTo(5);
        assertThat(clientes.headers().firstValue("X-Auth-Refresh")).as("token da demo nunca renova").isEmpty();
        assertThat(api().get("/api/pedidos?abertos=true", token).json().size()).isEqualTo(5);
        assertThat(api().get("/api/servicos-catalogo", token).json().size()).isEqualTo(8);
        JsonNode encerrados = api().get("/api/pedidos/encerrados", token).json();
        int finalizados = 0;
        for (JsonNode mes : encerrados) finalizados += mes.get("pedidos").size();
        assertThat(finalizados).isEqualTo(3);

        String outra = abrir("10.0.0.1");
        assertThat(empresaDo(outra)).as("cada clique e uma empresa nova").isNotEqualTo(empresaDo(token));
    }

    @Test
    void demonstracaoNaoVeDadosDeOutraEmpresaNemOutraVeOsDela() {
        Cenario real = Cenario.nova("Demo", jwtUtil, encoder);
        long clienteReal = api().post("/api/clientes", real.token, Map.of("nome", "Cliente Real Sintetico")).json().get("id").asLong();
        String demo = abrir("10.0.0.2");

        assertThat(api().get("/api/clientes/" + clienteReal, demo).status()).isEqualTo(404);
        assertThat(api().get("/api/clientes", demo).corpo()).doesNotContain("Cliente Real Sintetico");
        long pedidoDemo = api().get("/api/pedidos?abertos=true", demo).json().get(0).get("id").asLong();
        assertThat(api().get("/api/pedidos/" + pedidoDemo, real.token).status()).isEqualTo(404);
        assertThat(api().delete("/api/pedidos/" + pedidoDemo, real.token).status()).isIn(204, 404);
        assertThat(api().get("/api/pedidos/" + pedidoDemo, demo).status()).as("continua la").isEqualTo(200);
    }

    @Test
    void naDemonstracaoDitadoWhatsAppETrocaDeSenhaFicamBloqueados() {
        String demo = abrir("10.0.0.3");
        long pedido = api().get("/api/pedidos?abertos=true", demo).json().get(0).get("id").asLong();

        assertThat(api().get("/api/ditado/status", demo).json().get("habilitado").asBoolean()).isFalse();
        var ditado = api().post("/api/ditado", demo, Map.of("texto", "pedido do toninho"));
        assertThat(ditado.status()).isEqualTo(403);
        assertThat(ditado.json().get("erro").asString()).contains("demonstração");
        assertThat(api().post("/api/ditado/x/respostas", demo, Map.of()).status()).isEqualTo(403);
        assertThat(api().get("/api/whatsapp/status", demo).json().get("habilitado").asBoolean()).isFalse();
        assertThat(api().postSemCorpo("/api/pedidos/" + pedido + "/whatsapp", demo).status()).isEqualTo(403);
        assertThat(api().put("/api/usuario/senha", demo, Map.of("senhaAtual", "x", "novaSenha", "123456")).status()).isEqualTo(403);
    }

    @Test
    void limpezaApagaSoDemonstracaoVencidaENuncaEmpresaReal() {
        String vencida = abrir("10.0.0.4");
        String valendo = abrir("10.0.0.4");
        long idVencida = empresaDo(vencida);
        long idValendo = empresaDo(valendo);
        Cenario real = Cenario.nova("DemoReal", jwtUtil, encoder);
        api().post("/api/clientes", real.token, Map.of("nome", "Cliente da empresa real"));
        // empresa real com prazo preenchido por engano: mesmo assim nunca e apagada
        executar("update empresa set demoexpiraem = now() - interval '1 day' where id in (?1, ?2)", idVencida, real.empresaId);

        demoService.limparVencidas();

        for (String tabela : new String[]{"pedido", "cliente", "cabecote", "servico_catalogo", "peca_catalogo", "usuario"}) {
            assertThat(contar("select count(*) from " + tabela + " where empresa_id = ?1", idVencida)).as(tabela).isZero();
        }
        assertThat(contar("select count(*) from empresa where id = ?1", idVencida)).isZero();
        assertThat(contar("select count(*) from empresa where id = ?1", idValendo)).as("dentro do prazo fica").isEqualTo(1);
        assertThat(contar("select count(*) from cliente where empresa_id = ?1", idValendo)).isEqualTo(5);
        assertThat(contar("select count(*) from empresa where id = ?1", real.empresaId)).as("empresa real fica").isEqualTo(1);
        assertThat(contar("select count(*) from cliente where empresa_id = ?1", real.empresaId)).isEqualTo(1);
        assertThat(new EmpresaDemoRepository().apagar(real.empresaId)).as("apagar recusa empresa real").isFalse();
        assertThat(contar("select count(*) from empresa where id = ?1", real.empresaId)).isEqualTo(1);
    }

    @Test
    void cincoPorEnderecoPorHoraDepoisResponde429() {
        for (int i = 0; i < 5; i++) abrir("10.0.0.5");
        var sexta = api().postDeEndereco("/api/auth/demo", "10.0.0.5");
        assertThat(sexta.status()).isEqualTo(429);
        assertThat(sexta.json().get("erro").asString()).isNotBlank();
        assertThat(api().postDeEndereco("/api/auth/demo", "10.0.0.6").status()).as("outro endereco entra").isEqualTo(200);
    }
}
