package org.example.backend;

import org.example.backend.security.JwtUtil;
import org.example.model.EmpresaModel;
import org.example.model.UsuarioModel;
import org.example.repository.EmpresaRepository;
import org.example.repository.UsuarioRepository;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.security.crypto.password.PasswordEncoder;
import tools.jackson.databind.JsonNode;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Regras do Alto Medidas ("Virabrequins do Daniel"): entrada idempotente que nunca desfaz o
 * pagamento da DIH, total devido (polimento, abatimento, repassado) e o total geral que nao
 * muda com o filtro de mes. Usa a empresa 1 (dona da integracao); como o banco de teste e
 * compartilhado com outras classes, todo total e conferido por DIFERENCA em relacao ao que ja
 * existia antes do teste.
 */
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {"ALTO_MEDIDAS_ENTRADA_KEY=chave-sintetica-de-teste", "ALTO_MEDIDAS_EMPRESA_ID=1"})
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class AltoMedidasRegrasTest {

    static final String CHAVE = "chave-sintetica-de-teste";
    static final String ENTRADA = "/api/integracoes/alto-medidas/os";

    static {
        GuardaBancoLocal.verificar();
    }

    @LocalServerPort int porta;
    @Autowired JwtUtil jwtUtil;
    @Autowired PasswordEncoder encoder;

    ApiTeste api;
    String token;
    final String sufixo = UUID.randomUUID().toString().substring(0, 6);

    @BeforeAll
    void preparar() {
        api = new ApiTeste(porta);
        EmpresaModel empresa1 = new EmpresaRepository().buscarPorId(1L);
        assertThat(empresa1).isNotNull();
        UsuarioModel u = new UsuarioModel();
        u.setEmail("alto-" + sufixo + "@example.test");
        u.setNome("Usuario Alto");
        u.setSenhaHash(encoder.encode("senha-sintetica-" + sufixo));
        u.setEmpresa(empresa1);
        token = jwtUtil.gerar(new UsuarioRepository().salvar(u));
    }

    // ------------------------------------------------------------------ helpers

    private Map<String, Object> os(String nome, Object valor, boolean polir, Object valorPolir, String finalizadoEm) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("osId", "os-" + nome + "-" + sufixo);
        m.put("numero", nome + sufixo);
        m.put("cliente", "CLIENTE " + nome);
        m.put("modelo", "MOTOR");
        m.put("medidas", "Fixo STD");
        m.put("valor", valor);
        m.put("polir", polir);
        if (valorPolir != null) m.put("valorPolir", valorPolir);
        m.put("finalizadoEm", finalizadoEm);
        return m;
    }

    private void enviar(Map<String, Object> corpo) {
        var r = api.postComChave(ENTRADA, CHAVE, corpo);
        assertThat(r.status()).as(r.corpo()).isEqualTo(200);
    }

    /** O item (de qualquer grupo) cujo numero e N+sufixo, ou null. */
    private JsonNode item(String nome) {
        JsonNode lista = api.get("/api/alto-medidas/os?mes=todos", token).json();
        for (String grupo : new String[]{"aguardando", "aRepassar", "repassado"}) {
            for (JsonNode i : lista.get(grupo).get("itens")) {
                if ((nome + sufixo).equals(i.path("numero").asString(""))) return i;
            }
        }
        return null;
    }

    private String grupoDe(String nome) {
        JsonNode lista = api.get("/api/alto-medidas/os?mes=todos", token).json();
        for (String grupo : new String[]{"aguardando", "aRepassar", "repassado"}) {
            for (JsonNode i : lista.get(grupo).get("itens")) {
                if ((nome + sufixo).equals(i.path("numero").asString(""))) return grupo;
            }
        }
        return null;
    }

    private long idDe(String nome) {
        return item(nome).get("id").asLong();
    }

    private ApiTeste.Resposta pagar(String nome, Object pago) {
        Map<String, Object> corpo = new LinkedHashMap<>();
        corpo.put("pago", pago);
        return api.put("/api/alto-medidas/os/" + idDe(nome) + "/pagamento", token, corpo);
    }

    private BigDecimal devidoGeral() {
        return new BigDecimal(api.get("/api/alto-medidas/resumo", token).json().get("devidoAoDaniel").asString());
    }

    private BigDecimal decimal(JsonNode n, String campo) {
        return new BigDecimal(n.get(campo).asString());
    }

    // ------------------------------------------------------------ entrada / upsert

    @Test
    void reenviarAOsAtualizaOsDadosMasNuncaDesmarcaOPagamentoDaDih() {
        enviar(os("up", 100, false, null, "2026-05-10T15:00:00Z"));
        assertThat(pagar("up", true).status()).isEqualTo(200);
        assertThat(item("up").get("pago").asBoolean()).isTrue();

        Map<String, Object> reenvio = os("up", 150, false, null, "2026-05-10T15:00:00Z");
        reenvio.put("cliente", "CLIENTE ALTERADO");
        enviar(reenvio);   // retry da Cloud Function com dados novos e SEM nenhum campo de pagamento

        JsonNode depois = item("up");
        assertThat(depois.get("cliente").asString()).as("os dados do servico sao atualizados").isEqualTo("CLIENTE ALTERADO");
        assertThat(decimal(depois, "valor")).isEqualByComparingTo("150");
        assertThat(depois.get("pago").asBoolean()).as("o pago e da DIH e sobrevive ao reenvio").isTrue();

        int copias = 0;
        JsonNode lista = api.get("/api/alto-medidas/os?mes=todos", token).json();
        for (String g : new String[]{"aguardando", "aRepassar", "repassado"}) {
            for (JsonNode i : lista.get(g).get("itens")) {
                if (("up" + sufixo).equals(i.path("numero").asString(""))) copias++;
            }
        }
        assertThat(copias).as("mesmo osId duas vezes continua sendo uma OS").isEqualTo(1);
    }

    @Test
    void entradaRejeitaDadoInvalidoSemGravar() {
        Map<String, Object> semId = os("inv", 10, false, null, "2026-05-10T15:00:00Z");
        semId.remove("osId");
        assertThat(api.postComChave(ENTRADA, CHAVE, semId).status()).as("osId obrigatorio").isEqualTo(400);

        Map<String, Object> idRuim = os("inv", 10, false, null, "2026-05-10T15:00:00Z");
        idRuim.put("osId", "a/b");
        assertThat(api.postComChave(ENTRADA, CHAVE, idRuim).status()).as("osId com barra").isEqualTo(400);

        Map<String, Object> idLongo = os("inv", 10, false, null, "2026-05-10T15:00:00Z");
        idLongo.put("osId", "x".repeat(161));
        assertThat(api.postComChave(ENTRADA, CHAVE, idLongo).status()).as("osId acima de 160").isEqualTo(400);

        Map<String, Object> clienteLongo = os("inv", 10, false, null, "2026-05-10T15:00:00Z");
        clienteLongo.put("cliente", "c".repeat(201));
        assertThat(api.postComChave(ENTRADA, CHAVE, clienteLongo).status()).as("cliente acima de 200").isEqualTo(400);

        assertThat(api.postComChave(ENTRADA, CHAVE, os("inv", "abc", false, null, "2026-05-10T15:00:00Z")).status())
                .as("valor nao numerico").isEqualTo(400);
        assertThat(api.postComChave(ENTRADA, CHAVE, os("inv", 99999999999L, false, null, "2026-05-10T15:00:00Z")).status())
                .as("valor fora do limite").isEqualTo(400);

        Map<String, Object> repasseRuim = os("inv", 10, false, null, "2026-05-10T15:00:00Z");
        repasseRuim.put("repassadoEm", "ontem");
        assertThat(api.postComChave(ENTRADA, CHAVE, repasseRuim).status()).as("repassadoEm invalido").isEqualTo(400);

        assertThat(item("inv")).as("nada foi gravado").isNull();
    }

    @Test
    void valoresEmTextoSaoLidosNoFormatoBrasileiroEnoFormatoJs() {
        enviar(os("fmt1", "1.250,50", false, null, "2026-05-10T15:00:00Z"));
        enviar(os("fmt2", "1250.5", false, null, "2026-05-10T15:00:00Z"));
        enviar(os("fmt3", "", false, null, "2026-05-10T15:00:00Z"));
        assertThat(decimal(item("fmt1"), "valor")).isEqualByComparingTo("1250.50");
        assertThat(decimal(item("fmt2"), "valor")).isEqualByComparingTo("1250.50");
        assertThat(decimal(item("fmt3"), "valor")).as("vazio vale zero").isEqualByComparingTo("0");
    }

    @Test
    void textoComPontoESemVirgulaEhLidoComoDecimalNaoComoMilhar() {
        // Comportamento ATUAL, registrado e nao aprovado: "1.250" vira 1,25 e nao 1.250.
        // Depende de confirmar com quem cuida da Cloud Function como o valor chega (hoje chega como numero).
        enviar(os("amb", "1.250", false, null, "2026-05-10T15:00:00Z"));
        assertThat(decimal(item("amb"), "valor")).isEqualByComparingTo("1.25");
    }

    // ------------------------------------------------------------- total devido

    @Test
    void totalDevidoSomaPolimentoSubtraiAbatimentoEIgnoraNaoPagoERepassado() {
        BigDecimal antes = devidoGeral();

        enviar(os("d1", 100, true, 30, "2026-03-10T15:00:00Z"));     // 130 com polimento
        enviar(os("d2", -20, false, null, "2026-04-10T15:00:00Z"));  // abatimento
        enviar(os("d3", 50, false, 999, "2026-03-12T15:00:00Z"));    // polir=false: o valorPolir nao entra
        enviar(os("d4", 500, false, null, "2026-03-15T15:00:00Z"));  // nunca pago
        Map<String, Object> repassada = os("d5", 70, false, null, "2026-03-16T15:00:00Z");
        enviar(repassada);

        for (String n : new String[]{"d1", "d2", "d3", "d5"}) {
            assertThat(pagar(n, true).status()).as("pagar " + n).isEqualTo(200);
        }
        assertThat(devidoGeral().subtract(antes)).as("130 - 20 + 50 + 70").isEqualByComparingTo("230");

        repassada.put("repassadoEm", "2026-04-20T12:00:00Z");   // o Daniel confirmou o recebimento
        repassada.put("repassadoPor", "daniel@example.test");
        enviar(repassada);
        assertThat(devidoGeral().subtract(antes)).as("repassada sai do devido").isEqualByComparingTo("160");
        assertThat(grupoDe("d5")).isEqualTo("repassado");
        assertThat(grupoDe("d4")).isEqualTo("aguardando");
        assertThat(grupoDe("d1")).isEqualTo("aRepassar");

        pagar("d1", false);   // desfazer o pago de uma OS ainda nao repassada
        assertThat(devidoGeral().subtract(antes)).isEqualByComparingTo("30");
        assertThat(grupoDe("d1")).isEqualTo("aguardando");
    }

    @Test
    void totalGeralNaoMudaComOFiltroDeMesEoDoPeriodoSim() {
        enviar(os("m1", 100, false, null, "2026-02-10T15:00:00Z"));
        enviar(os("m2", 40, false, null, "2026-01-10T15:00:00Z"));
        assertThat(pagar("m1", true).status()).isEqualTo(200);
        assertThat(pagar("m2", true).status()).isEqualTo(200);

        JsonNode fev = api.get("/api/alto-medidas/os?mes=2026-02", token).json();
        JsonNode jan = api.get("/api/alto-medidas/os?mes=2026-01", token).json();
        JsonNode todos = api.get("/api/alto-medidas/os?mes=todos", token).json();
        JsonNode vazio = api.get("/api/alto-medidas/os?mes=2019-01", token).json();

        BigDecimal geral = devidoGeral();
        for (JsonNode d : new JsonNode[]{fev, jan, todos, vazio}) {
            assertThat(decimal(d, "devidoAoDaniel")).as("o devido geral e sempre o mesmo").isEqualByComparingTo(geral);
        }
        assertThat(decimal(vazio, "devidoNoPeriodo")).as("mes sem OS").isEqualByComparingTo("0");
        assertThat(decimal(todos, "devidoNoPeriodo")).isEqualByComparingTo(geral);
        assertThat(decimal(fev, "devidoNoPeriodo")).isGreaterThanOrEqualTo(new BigDecimal("100"));
        assertThat(decimal(fev, "devidoNoPeriodo")).isLessThan(geral.add(new BigDecimal("0.01")));
        // as OS do mes so aparecem no seu mes
        boolean m1EmFev = false, m1EmJan = false;
        for (JsonNode i : fev.get("aRepassar").get("itens")) m1EmFev |= ("m1" + sufixo).equals(i.get("numero").asString());
        for (JsonNode i : jan.get("aRepassar").get("itens")) m1EmJan |= ("m1" + sufixo).equals(i.get("numero").asString());
        assertThat(m1EmFev).isTrue();
        assertThat(m1EmJan).isFalse();
    }

    @Test
    void mesInvalidoNoFiltroDa400() {
        for (String ruim : new String[]{"2026-13", "2026-1", "outubro", "2026-10-01", "2026-10'"}) {
            assertThat(api.get("/api/alto-medidas/os?mes=" + ruim.replace("'", "%27"), token).status())
                    .as(ruim).isEqualTo(400);
        }
    }

    // ---------------------------------------------------------------- pagamento

    @Test
    void pagamentoValidaCorpoEhIdempotenteEMarcaPendenteDeSincronia() {
        enviar(os("pg", 80, false, null, "2026-05-10T15:00:00Z"));

        assertThat(pagar("pg", null).status()).as("pago ausente").isEqualTo(400);

        var primeira = pagar("pg", true);
        assertThat(primeira.status()).isEqualTo(200);
        JsonNode a = primeira.json();
        assertThat(a.get("pago").asBoolean()).isTrue();
        assertThat(a.get("pagoSincronizado").asBoolean()).as("o Alto Medidas ainda nao foi avisado").isFalse();
        String pagoEm = a.get("pagoEm").asString();

        JsonNode b = pagar("pg", true).json();
        assertThat(b.get("pagoEm").asString()).as("marcar de novo nao muda quando foi pago").isEqualTo(pagoEm);

        JsonNode c = pagar("pg", false).json();
        assertThat(c.get("pago").asBoolean()).isFalse();
        assertThat(c.get("pagoEm").isNull()).isTrue();
    }

    @Test
    void osJaRepassadaNaoAceitaMaisMudancaDePagamento() {
        Map<String, Object> corpo = os("rep", 90, false, null, "2026-05-10T15:00:00Z");
        corpo.put("repassadoEm", "2026-05-20T12:00:00Z");
        enviar(corpo);
        var r = pagar("rep", true);
        assertThat(r.status()).isEqualTo(409);
        assertThat(item("rep").get("pago").asBoolean()).isFalse();
    }

    @Test
    void pagamentoDeOsInexistenteDa404() {
        assertThat(api.put("/api/alto-medidas/os/999999999/pagamento", token, Map.of("pago", true)).status()).isEqualTo(404);
    }
}
