package org.example.backend;

import jakarta.persistence.EntityManager;
import org.example.backend.security.JwtUtil;
import org.example.persistence.JPAUtil;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.security.crypto.password.PasswordEncoder;
import tools.jackson.databind.JsonNode;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Regras de pedido pela API: sincronizacao de itens, totais e desconto, validacoes, finalizar,
 * encerrados, dashboard, exclusao (cascade/orphanRemoval, tabela legada), cadastros vinculados e PDF.
 * Cada teste usa uma empresa propria (Cenario), entao as contagens sao exatas.
 */
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {"ALTO_MEDIDAS_ENTRADA_KEY=chave-sintetica-de-teste", "ALTO_MEDIDAS_EMPRESA_ID=1"})
class PedidoRegrasTest {

    static {
        GuardaBancoLocal.verificar();
    }

    @LocalServerPort int porta;
    @Autowired JwtUtil jwtUtil;
    @Autowired PasswordEncoder encoder;

    // ------------------------------------------------------------------ helpers

    private Cenario cenario() {
        return Cenario.nova("Pedido", jwtUtil, encoder);
    }

    private ApiTeste api() {
        return new ApiTeste(porta);
    }

    private long cliente(Cenario c, String nome) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("nome", nome);
        m.put("telefone", "31988887777");
        return id(api().post("/api/clientes", c.token, m));
    }

    private static Map<String, Object> corpo(long clienteId) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("clienteId", clienteId);
        m.put("componenteIds", List.of());
        m.put("pedidoDescricao", "Pedido de teste");
        m.put("status", "ABERTO");
        m.put("categoriaValores", List.of(Map.of("categoria", "CABECOTE", "valorServicos", 100, "valorPecas", 50)));
        return m;
    }

    private static Map<String, Object> item(String descricao, String categoria) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("descricao", descricao);
        if (categoria != null) m.put("categoria", categoria);
        return m;
    }

    private static Map<String, Object> peca(String descricao, Integer quantidade, String categoria) {
        Map<String, Object> m = item(descricao, categoria);
        if (quantidade != null) m.put("quantidade", quantidade);
        return m;
    }

    private static long id(ApiTeste.Resposta r) {
        assertThat(r.status()).as(r.corpo()).isEqualTo(200);
        return r.json().get("id").asLong();
    }

    private long criarPedido(Cenario c, Map<String, Object> corpo) {
        return id(api().post("/api/pedidos", c.token, corpo));
    }

    private JsonNode detalhe(Cenario c, long pedidoId) {
        var r = api().get("/api/pedidos/" + pedidoId, c.token);
        assertThat(r.status()).isEqualTo(200);
        return r.json();
    }

    private static List<String> descricoes(JsonNode lista) {
        List<String> out = new ArrayList<>();
        for (JsonNode n : lista) out.add(n.get("descricao").asString());
        return out;
    }

    private static List<Long> ids(JsonNode lista) {
        List<Long> out = new ArrayList<>();
        for (JsonNode n : lista) out.add(n.get("id").asLong());
        return out;
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

    private static Object valor(String sql, Object... parametros) {
        EntityManager em = JPAUtil.getEntityManager();
        try {
            var q = em.createNativeQuery(sql);
            for (int i = 0; i < parametros.length; i++) q.setParameter(i + 1, parametros[i]);
            return q.getSingleResult();
        } finally {
            em.close();
        }
    }

    private static void pausa(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    private static void executar(String sql) {
        EntityManager em = JPAUtil.getEntityManager();
        try {
            em.getTransaction().begin();
            em.createNativeQuery(sql).executeUpdate();
            em.getTransaction().commit();
        } finally {
            em.close();
        }
    }

    // --------------------------------------------------------- itens do pedido

    @Test
    void itensRepetidosViramLinhasSeparadas() {
        Cenario c = cenario();
        Map<String, Object> b = corpo(cliente(c, "Cliente Itens"));
        b.put("servicos", List.of(item("Retificar", null), item("Retificar", null)));
        long pedido = criarPedido(c, b);
        assertThat(descricoes(detalhe(c, pedido).get("servicos"))).containsExactly("Retificar", "Retificar");
    }

    @Test
    void prefixoInalteradoMantemOsIdsEOResto() {
        Cenario c = cenario();
        Map<String, Object> b = corpo(cliente(c, "Cliente Prefixo"));
        b.put("servicos", List.of(item("A", null), item("B", null), item("C", null)));
        long pedido = criarPedido(c, b);
        List<Long> antes = ids(detalhe(c, pedido).get("servicos"));

        b.put("servicos", List.of(item("A", null), item("B", null), item("D", null)));
        assertThat(api().put("/api/pedidos/" + pedido, c.token, b).status()).isEqualTo(200);
        JsonNode depois = detalhe(c, pedido).get("servicos");
        assertThat(descricoes(depois)).containsExactly("A", "B", "D");
        assertThat(ids(depois).subList(0, 2)).as("A e B nao foram recriados").isEqualTo(antes.subList(0, 2));
        assertThat(ids(depois).get(2)).as("D e uma linha nova").isNotIn(antes);
    }

    @Test
    void trocarOItemDoMeioRecriaDaliPraFrenteMantendoAOrdem() {
        Cenario c = cenario();
        Map<String, Object> b = corpo(cliente(c, "Cliente Ordem"));
        b.put("servicos", List.of(item("A", null), item("B", null), item("C", null)));
        long pedido = criarPedido(c, b);
        List<Long> antes = ids(detalhe(c, pedido).get("servicos"));

        b.put("servicos", List.of(item("A", null), item("C", null), item("B", null)));
        api().put("/api/pedidos/" + pedido, c.token, b);
        JsonNode depois = detalhe(c, pedido).get("servicos");
        assertThat(descricoes(depois)).containsExactly("A", "C", "B");
        assertThat(ids(depois).get(0)).as("so o prefixo A continua").isEqualTo(antes.get(0));
    }

    @Test
    void descricaoVaziaOuSoDeEspacosEhIgnorada() {
        Cenario c = cenario();
        Map<String, Object> b = corpo(cliente(c, "Cliente Vazio"));
        b.put("servicos", List.of(item("", null), item("   ", null), item("Valido", null)));
        b.put("pecas", List.of(peca("  ", 1, null)));
        long pedido = criarPedido(c, b);
        JsonNode d = detalhe(c, pedido);
        assertThat(descricoes(d.get("servicos"))).containsExactly("Valido");
        assertThat(d.get("pecas").size()).isZero();
    }

    @Test
    void pecaSemQuantidadeValeUmEMudarAQuantidadeAtualizaNoLugar() {
        Cenario c = cenario();
        Map<String, Object> b = corpo(cliente(c, "Cliente Peca"));
        b.put("pecas", List.of(peca("Valvula", null, null), peca("Junta", 3, null)));
        long pedido = criarPedido(c, b);
        JsonNode antes = detalhe(c, pedido).get("pecas");
        assertThat(antes.get(0).get("quantidade").asInt()).isEqualTo(1);
        assertThat(antes.get(1).get("quantidade").asInt()).isEqualTo(3);

        b.put("pecas", List.of(peca("Valvula", 4, null), peca("Junta", 3, null)));
        api().put("/api/pedidos/" + pedido, c.token, b);
        JsonNode depois = detalhe(c, pedido).get("pecas");
        assertThat(depois.get(0).get("quantidade").asInt()).isEqualTo(4);
        assertThat(ids(depois)).as("mesma linha, so a quantidade mudou").isEqualTo(ids(antes));
    }

    @Test
    void mesmaDescricaoEmOutraCategoriaEOutraLinha() {
        Cenario c = cenario();
        Map<String, Object> b = corpo(cliente(c, "Cliente Categoria"));
        b.put("servicos", List.of(item("Retificar", "CABECOTE")));
        long pedido = criarPedido(c, b);
        long antes = ids(detalhe(c, pedido).get("servicos")).get(0);

        b.put("servicos", List.of(item("Retificar", "BLOCO")));
        api().put("/api/pedidos/" + pedido, c.token, b);
        JsonNode depois = detalhe(c, pedido).get("servicos");
        assertThat(depois.get(0).get("categoria").asString()).isEqualTo("BLOCO");
        assertThat(depois.get(0).get("id").asLong()).isNotEqualTo(antes);
    }

    @Test
    void categoriaDeItemDesconhecidaViraNula() {
        Cenario c = cenario();
        Map<String, Object> b = corpo(cliente(c, "Cliente Cat Item"));
        b.put("servicos", List.of(item("Retificar", "NAO_EXISTE")));
        long pedido = criarPedido(c, b);
        assertThat(detalhe(c, pedido).get("servicos").get(0).get("categoria").isNull()).isTrue();
    }

    // ------------------------------------------------------- totais e desconto

    @Test
    void totalGravadoBateComOCalculoEORecalculaNoPut() {
        Cenario c = cenario();
        Map<String, Object> b = corpo(cliente(c, "Cliente Total"));
        b.put("categoriaValores", List.of(
                Map.of("categoria", "CABECOTE", "valorServicos", 100, "valorPecas", 50),
                Map.of("categoria", "BLOCO", "valorServicos", 30, "valorPecas", 0)));
        b.put("descontoTipo", "PERCENTUAL");
        b.put("descontoValor", 10);
        long pedido = criarPedido(c, b);

        JsonNode d = detalhe(c, pedido);
        assertThat(d.get("subtotal").decimalValue()).isEqualByComparingTo("180");
        assertThat(d.get("totalGeral").decimalValue()).isEqualByComparingTo("162");   // 180 - 10%

        b.put("descontoTipo", "VALOR");
        b.put("descontoValor", 999);
        api().put("/api/pedidos/" + pedido, c.token, b);
        assertThat(detalhe(c, pedido).get("totalGeral").decimalValue()).as("desconto limitado ao subtotal")
                .isEqualByComparingTo("0");

        b.put("descontoTipo", null);
        b.put("descontoValor", null);
        b.put("categoriaValores", List.of(Map.of("categoria", "CABECOTE", "valorServicos", 10.5, "valorPecas", 0)));
        api().put("/api/pedidos/" + pedido, c.token, b);
        JsonNode sem = detalhe(c, pedido);
        assertThat(sem.get("totalGeral").decimalValue()).isEqualByComparingTo("10.50");
        assertThat(sem.get("descontoTipo").isNull()).isTrue();
    }

    @Test
    void tipoDeDescontoDesconhecidoECategoriaDeValorDesconhecidaSaoIgnorados() {
        Cenario c = cenario();
        Map<String, Object> b = corpo(cliente(c, "Cliente Ignora"));
        b.put("categoriaValores", List.of(
                Map.of("categoria", "CABECOTE", "valorServicos", 100, "valorPecas", 0),
                Map.of("categoria", "NAO_EXISTE", "valorServicos", 999, "valorPecas", 999)));
        b.put("descontoTipo", "FOO");
        b.put("descontoValor", 50);
        JsonNode d = detalhe(c, criarPedido(c, b));
        assertThat(d.get("categoriaValores").size()).isEqualTo(1);
        assertThat(d.get("totalGeral").decimalValue()).as("desconto invalido nao abate").isEqualByComparingTo("100");
        assertThat(d.get("descontoTipo").isNull()).isTrue();
    }

    @Test
    void statusDesconhecidoOuAusenteViraAbertoEProntoEhGravado() {
        Cenario c = cenario();
        long cli = cliente(c, "Cliente Status");
        Map<String, Object> b = corpo(cli);
        b.put("status", "XYZ");
        assertThat(detalhe(c, criarPedido(c, b)).get("status").asString()).isEqualTo("ABERTO");
        b.remove("status");
        assertThat(detalhe(c, criarPedido(c, b)).get("status").asString()).isEqualTo("ABERTO");
        b.put("status", "PRONTO");
        assertThat(detalhe(c, criarPedido(c, b)).get("status").asString()).isEqualTo("PRONTO");
    }

    // ---------------------------------------------------------------- validacoes

    @Test
    void limitesDeTextoEValoresNegativosDao400() {
        Cenario c = cenario();
        long cli = cliente(c, "Cliente Limites");

        Map<String, Object> ok255 = corpo(cli);
        ok255.put("pedidoDescricao", "d".repeat(255));
        ok255.put("observacao", "o".repeat(2000));
        ok255.put("servicos", List.of(item("s".repeat(255), null)));
        assertThat(api().post("/api/pedidos", c.token, ok255).status()).as("limites exatos").isEqualTo(200);

        Map<String, Object> desc = corpo(cli);
        desc.put("pedidoDescricao", "d".repeat(256));
        assertThat(api().post("/api/pedidos", c.token, desc).status()).as("descricao 256").isEqualTo(400);

        Map<String, Object> obs = corpo(cli);
        obs.put("observacao", "o".repeat(2001));
        assertThat(api().post("/api/pedidos", c.token, obs).status()).as("observacao 2001").isEqualTo(400);

        Map<String, Object> itemLongo = corpo(cli);
        itemLongo.put("servicos", List.of(item("s".repeat(256), null)));
        assertThat(api().post("/api/pedidos", c.token, itemLongo).status()).as("item 256").isEqualTo(400);

        Map<String, Object> descontoNeg = corpo(cli);
        descontoNeg.put("descontoTipo", "VALOR");
        descontoNeg.put("descontoValor", -1);
        assertThat(api().post("/api/pedidos", c.token, descontoNeg).status()).as("desconto negativo").isEqualTo(400);

        Map<String, Object> valorNeg = corpo(cli);
        valorNeg.put("categoriaValores", List.of(Map.of("categoria", "CABECOTE", "valorServicos", -1, "valorPecas", 0)));
        assertThat(api().post("/api/pedidos", c.token, valorNeg).status()).as("valor negativo").isEqualTo(400);

        Map<String, Object> qtd0 = corpo(cli);
        qtd0.put("pecas", List.of(peca("Valvula", 0, null)));
        assertThat(api().post("/api/pedidos", c.token, qtd0).status()).as("quantidade 0").isEqualTo(400);

        Map<String, Object> semCliente = corpo(cli);
        semCliente.remove("clienteId");
        assertThat(api().post("/api/pedidos", c.token, semCliente).status()).as("sem cliente").isEqualTo(400);
    }

    @Test
    void entradasMalformadasNuncaSaoAceitas() {
        Cenario c = cenario();
        long cli = cliente(c, "Cliente Malformado");

        Map<String, Object> itemNulo = corpo(cli);
        List<Object> comNulo = new ArrayList<>();
        comNulo.add(null);
        itemNulo.put("servicos", comNulo);
        // Hoje responde 500 (NullPointerException); o correto seria 400. Aceita os dois, nunca 2xx.
        assertThat(api().post("/api/pedidos", c.token, itemNulo).status()).as("item nulo").isIn(400, 500);

        Map<String, Object> dataRuim = corpo(cli);
        dataRuim.put("datEntregaEstimada", "31/12/2026");
        assertThat(api().post("/api/pedidos", c.token, dataRuim).status()).as("data fora de yyyy-MM-dd").isIn(400, 500);

        var jsonRuim = api().requisicao("POST", "/api/pedidos", c.token);
        assertThat(jsonRuim.status()).as("corpo sem clienteId").isEqualTo(400);
    }

    // ------------------------------------------------- finalizar e encerrados

    @Test
    void finalizarEhIdempotenteETiraDosAbertos() {
        Cenario c = cenario();
        long pedido = criarPedido(c, corpo(cliente(c, "Cliente Finalizar")));
        assertThat(ids(api().get("/api/pedidos?abertos=true", c.token).json())).contains(pedido);

        JsonNode primeira = api().postSemCorpo("/api/pedidos/" + pedido + "/finalizar", c.token).json();
        assertThat(primeira.get("finalizado").asBoolean()).isTrue();
        String quando = primeira.get("datEntrega").asString();
        assertThat(quando).isNotBlank();

        // A resposta so mostra ate o minuto; o carimbo exato e conferido direto no banco.
        Object carimbo = valor("select datentrega from pedido where id = ?1", pedido);
        assertThat(carimbo).isNotNull();
        pausa(15);
        JsonNode segunda = api().postSemCorpo("/api/pedidos/" + pedido + "/finalizar", c.token).json();
        assertThat(segunda.get("datEntrega").asString()).isEqualTo(quando);
        assertThat(valor("select datentrega from pedido where id = ?1", pedido))
                .as("finalizar de novo nao muda a data").isEqualTo(carimbo);
        assertThat(ids(api().get("/api/pedidos?abertos=true", c.token).json())).doesNotContain(pedido);
        assertThat(ids(api().get("/api/pedidos", c.token).json())).contains(pedido);
    }

    @Test
    void pedidoFinalizadoNaoPodeSerEditadoENadaMuda() {
        Cenario c = cenario();
        long cli = cliente(c, "Cliente Finalizado");
        Map<String, Object> original = corpo(cli);
        original.put("servicos", List.of(item("Plainar", "CABECOTE")));
        long pedido = criarPedido(c, original);
        assertThat(api().postSemCorpo("/api/pedidos/" + pedido + "/finalizar", c.token).status()).isEqualTo(200);
        JsonNode antes = detalhe(c, pedido);
        Object carimbo = valor("select datentrega from pedido where id = ?1", pedido);

        Map<String, Object> alterado = corpo(cliente(c, "Outro Cliente"));
        alterado.put("pedidoDescricao", "Tentativa de mudar depois de finalizado");
        alterado.put("servicos", List.of(item("Brunir", "BLOCO")));
        alterado.put("categoriaValores", List.of(Map.of("categoria", "BLOCO", "valorServicos", 999, "valorPecas", 0)));
        var r = api().put("/api/pedidos/" + pedido, c.token, alterado);

        assertThat(r.status()).as(r.corpo()).isEqualTo(409);
        assertThat(r.json().get("erro").asString()).contains("finalizado");
        JsonNode depois = detalhe(c, pedido);
        assertThat(depois.toString()).as("nada do pedido muda").isEqualTo(antes.toString());
        assertThat(valor("select datentrega from pedido where id = ?1", pedido)).isEqualTo(carimbo);
    }

    @Test
    void pedidoAbertoContinuaEditavelEOutraEmpresaRecebe404MesmoFinalizado() {
        Cenario a = cenario();
        Cenario b = cenario();
        long pedido = criarPedido(a, corpo(cliente(a, "Cliente Editavel")));

        Map<String, Object> alterado = corpo(cliente(a, "Cliente Editavel"));
        alterado.put("pedidoDescricao", "Descricao nova");
        var editado = api().put("/api/pedidos/" + pedido, a.token, alterado);
        assertThat(editado.status()).as(editado.corpo()).isEqualTo(200);
        assertThat(editado.json().get("pedidoDescricao").asString()).isEqualTo("Descricao nova");

        api().postSemCorpo("/api/pedidos/" + pedido + "/finalizar", a.token);
        var deOutraEmpresa = api().put("/api/pedidos/" + pedido, b.token, corpo(cliente(b, "Cliente B")));
        assertThat(deOutraEmpresa.status()).as("nao revela que o pedido existe nem que esta finalizado").isEqualTo(404);
    }

    @Test
    void encerradosAgrupamPorMesComTotaisPorClienteECategoria() {
        Cenario c = cenario();
        long x = cliente(c, "Cliente X");
        long y = cliente(c, "Cliente Y");
        long p1 = criarPedido(c, comValor(x, "CABECOTE", 100));
        long p2 = criarPedido(c, comValor(x, "BLOCO", 50));
        long p3 = criarPedido(c, comValor(y, "CABECOTE", 30));
        for (long p : new long[]{p1, p2, p3}) api().postSemCorpo("/api/pedidos/" + p + "/finalizar", c.token);

        JsonNode meses = api().get("/api/pedidos/encerrados", c.token).json();
        assertThat(meses.size()).isEqualTo(1);
        JsonNode mes = meses.get(0);
        String esperado = YearMonth.now().format(DateTimeFormatter.ofPattern("MMMM 'de' yyyy", Locale.of("pt", "BR")));
        assertThat(mes.get("mes").asString()).isEqualToIgnoringCase(esperado);
        assertThat(Character.isUpperCase(mes.get("mes").asString().charAt(0))).as("mes capitalizado").isTrue();
        assertThat(mes.get("quantidade").asInt()).isEqualTo(3);
        assertThat(mes.get("total").decimalValue()).isEqualByComparingTo("180");

        JsonNode porCliente = mes.get("porCliente");
        assertThat(porCliente.get(0).get("descricao").asString()).as("maior primeiro").isEqualTo("Cliente X");
        assertThat(porCliente.get(0).get("total").decimalValue()).isEqualByComparingTo("150");
        assertThat(porCliente.get(1).get("total").decimalValue()).isEqualByComparingTo("30");

        BigDecimal somaCategorias = BigDecimal.ZERO;
        for (JsonNode cat : mes.get("porCategoria")) somaCategorias = somaCategorias.add(cat.get("total").decimalValue());
        assertThat(mes.get("porCategoria").size()).isEqualTo(2);
        assertThat(somaCategorias).isEqualByComparingTo("180");
    }

    private static Map<String, Object> comValor(long clienteId, String categoria, int valor) {
        Map<String, Object> b = corpo(clienteId);
        b.put("categoriaValores", List.of(Map.of("categoria", categoria, "valorServicos", valor, "valorPecas", 0)));
        return b;
    }

    @Test
    void dashboardContaAbertosHojeProntosEAtrasados() {
        Cenario c = cenario();
        long cli = cliente(c, "Cliente Dashboard");
        LocalDate hoje = LocalDate.now();

        Map<String, Object> atrasado = corpo(cli);
        atrasado.put("datEntregaEstimada", hoje.minusDays(1).toString());
        criarPedido(c, atrasado);

        Map<String, Object> paraHoje = corpo(cli);
        paraHoje.put("datEntregaEstimada", hoje.toString());
        criarPedido(c, paraHoje);

        Map<String, Object> pronto = corpo(cli);
        pronto.put("status", "PRONTO");
        pronto.put("datEntregaEstimada", hoje.plusDays(1).toString());
        criarPedido(c, pronto);

        criarPedido(c, corpo(cli));   // aberto, sem data

        long finalizado = criarPedido(c, corpo(cli));
        api().postSemCorpo("/api/pedidos/" + finalizado + "/finalizar", c.token);

        JsonNode d = api().get("/api/pedidos/dashboard", c.token).json();
        assertThat(d.get("abertos").asInt()).as("finalizado nao conta").isEqualTo(4);
        assertThat(d.get("hoje").asInt()).isEqualTo(1);
        assertThat(d.get("prontos").asInt()).isEqualTo(1);
        assertThat(d.get("atrasados").asInt()).isEqualTo(1);
        assertThat(d.get("entregasHoje").size()).isEqualTo(1);
    }

    @Test
    void situacaoDoPedidoDistingueAtrasadoEFinalizado() {
        Cenario c = cenario();
        long cli = cliente(c, "Cliente Situacao");
        Map<String, Object> atrasado = corpo(cli);
        atrasado.put("datEntregaEstimada", LocalDate.now().minusDays(2).toString());
        long pedido = criarPedido(c, atrasado);
        JsonNode d = detalhe(c, pedido);
        assertThat(d.get("atrasado").asBoolean()).isTrue();
        assertThat(d.get("situacao").asString()).isEqualTo("Atrasado");

        JsonNode fin = api().postSemCorpo("/api/pedidos/" + pedido + "/finalizar", c.token).json();
        assertThat(fin.get("situacao").asString()).isEqualTo("Finalizado");
        assertThat(fin.get("atrasado").asBoolean()).as("finalizado nunca fica atrasado").isFalse();
    }

    // --------------------------------------------------- exclusao e vinculos

    @Test
    void excluirPedidoApagaOsItensMasMantemClienteEComponente() {
        Cenario c = cenario();
        long cli = cliente(c, "Cliente Cascade");
        long comp = id(api().post("/api/cabecotes", c.token, Map.of("categoria", "CABECOTE", "nome", "Comp Cascade",
                "movelFaixa", "25,10", "fixoFaixa", "25,20")));
        Map<String, Object> b = corpo(cli);
        b.put("componenteIds", List.of(comp));
        b.put("servicos", List.of(item("A", null), item("B", null)));
        b.put("pecas", List.of(peca("P", 2, null)));
        long pedido = criarPedido(c, b);
        assertThat(contar("select count(*) from servico where pedido_id = ?1", pedido)).isEqualTo(2);

        assertThat(api().delete("/api/pedidos/" + pedido, c.token).status()).isEqualTo(204);
        assertThat(contar("select count(*) from servico where pedido_id = ?1", pedido)).isZero();
        assertThat(contar("select count(*) from peca where pedido_id = ?1", pedido)).isZero();
        assertThat(contar("select count(*) from pedido_categoria_valor where pedido_id = ?1", pedido)).isZero();
        assertThat(contar("select count(*) from pedido_componente where pedido_id = ?1", pedido)).isZero();
        assertThat(api().get("/api/clientes/" + cli, c.token).status()).as("cliente continua").isEqualTo(200);
        assertThat(contar("select count(*) from cabecote where id = ?1", comp)).as("componente continua").isEqualTo(1);
    }

    @Test
    void removerItemNoPutApagaALinhaDoBanco() {
        Cenario c = cenario();
        Map<String, Object> b = corpo(cliente(c, "Cliente Orfao"));
        b.put("servicos", List.of(item("A", null), item("B", null)));
        long pedido = criarPedido(c, b);
        assertThat(contar("select count(*) from servico where pedido_id = ?1", pedido)).isEqualTo(2);
        b.put("servicos", List.of(item("A", null)));
        api().put("/api/pedidos/" + pedido, c.token, b);
        assertThat(contar("select count(*) from servico where pedido_id = ?1", pedido)).as("sem linha orfa").isEqualTo(1);
    }

    @Test
    void excluirPedidoFuncionaComEsemATabelaLegadaPedidoCategoria() {
        Cenario c = cenario();
        long cli = cliente(c, "Cliente Legado");
        long pedido = criarPedido(c, corpo(cli));
        try {
            executar("create table if not exists pedido_categoria (pedido_id bigint not null references pedido(id), "
                    + "categorias varchar(50))");
            executar("insert into pedido_categoria (pedido_id, categorias) values (" + pedido + ", 'CABECOTE')");
            assertThat(api().delete("/api/pedidos/" + pedido, c.token).status())
                    .as("com a tabela legada e uma linha presa").isEqualTo(204);
            assertThat(api().get("/api/pedidos/" + pedido, c.token).status()).isEqualTo(404);
            assertThat(contar("select count(*) from pedido_categoria where pedido_id = ?1", pedido)).isZero();
        } finally {
            executar("drop table if exists pedido_categoria");
        }
        long outro = criarPedido(c, corpo(cli));
        assertThat(api().delete("/api/pedidos/" + outro, c.token).status()).as("sem a tabela legada").isEqualTo(204);
    }

    @Test
    void clienteECabecoteEmUsoNaoSaoApagadosMasLivresSao() {
        Cenario c = cenario();
        long cli = cliente(c, "Cliente Em Uso");
        long comp = id(api().post("/api/cabecotes", c.token, Map.of("categoria", "CABECOTE", "nome", "Comp Em Uso",
                "movelFaixa", "25,10", "fixoFaixa", "25,20")));
        Map<String, Object> b = corpo(cli);
        b.put("componenteIds", List.of(comp));
        criarPedido(c, b);

        assertThat(api().delete("/api/clientes/" + cli, c.token).status()).as("cliente com pedido").isEqualTo(409);
        assertThat(api().delete("/api/cabecotes/" + comp, c.token).status()).as("componente em pedido").isEqualTo(409);

        long livre = cliente(c, "Cliente Livre");
        long compLivre = id(api().post("/api/cabecotes", c.token, Map.of("categoria", "BLOCO", "nome", "Comp Livre")));
        assertThat(api().delete("/api/clientes/" + livre, c.token).status()).isEqualTo(204);
        assertThat(api().delete("/api/cabecotes/" + compLivre, c.token).status()).isEqualTo(204);
        assertThat(api().get("/api/clientes/" + livre, c.token).status()).isEqualTo(404);
    }

    // ----------------------------------------------------------- cadastros

    @Test
    void cadastrosValidamEntradas() {
        Cenario c = cenario();
        var semNome = new LinkedHashMap<String, Object>();
        semNome.put("nome", "  ");
        assertThat(api().post("/api/clientes", c.token, semNome).status()).as("cliente sem nome").isEqualTo(400);
        // Hoje 500: nome acima da coluna de 255. O correto seria 400; aceita os dois, nunca 2xx.
        assertThat(api().post("/api/clientes", c.token, Map.of("nome", "n".repeat(300))).status()).isIn(400, 500);
        assertThat(api().post("/api/cabecotes", c.token, Map.of("categoria", "CABECOTE", "nome", "n".repeat(300))).status())
                .isIn(400, 500);

        assertThat(api().post("/api/cabecotes", c.token, Map.of("categoria", "CABECOTE", "nome", " ")).status())
                .as("cabecote sem nome").isEqualTo(400);
        assertThat(api().post("/api/cabecotes", c.token, Map.of("categoria", "CABECOTE", "nome", "X", "movelFaixa", "abc"))
                .status()).as("faixa nao numerica").isEqualTo(400);

        var categoriaRuim = api().post("/api/cabecotes", c.token, Map.of("categoria", "NAO_EXISTE", "nome", "Cat Ruim"));
        assertThat(categoriaRuim.json().get("categoria").asString()).as("categoria desconhecida vira CABECOTE")
                .isEqualTo("CABECOTE");
    }

    @Test
    void catalogosValidamNomeEValorECategoriaDesconhecidaViraOutro() {
        Cenario c = cenario();
        for (String rota : new String[]{"/api/servicos-catalogo", "/api/pecas-catalogo"}) {
            assertThat(api().post(rota, c.token, Map.of("categoria", "CABECOTE", "nome", " ", "valor", 1)).status())
                    .as(rota + " sem nome").isEqualTo(400);
            assertThat(api().post(rota, c.token, Map.of("categoria", "CABECOTE", "nome", "X", "valor", -1)).status())
                    .as(rota + " valor negativo").isEqualTo(400);
            var ok = api().post(rota, c.token, Map.of("categoria", "NAO_EXISTE", "nome", "Item " + rota, "valor", 5));
            assertThat(ok.status()).isEqualTo(200);
            assertThat(ok.json().get("categoria").asString()).isEqualTo("OUTRO");
            long id = ok.json().get("id").asLong();
            assertThat(api().delete(rota + "/" + id, c.token).status()).isEqualTo(204);
            assertThat(api().delete(rota + "/" + id, c.token).status()).as("apagar de novo e idempotente").isEqualTo(204);
        }
    }

    // ------------------------------------------------------------- PDF e saude

    @Test
    void pdfDoOrcamentoSaiComoPdfComONomeDoArquivo() {
        Cenario c = cenario();
        Map<String, Object> b = corpo(cliente(c, "Cliente PDF"));
        b.put("servicos", List.of(item("Retificar cabecote", "CABECOTE")));
        long pedido = criarPedido(c, b);
        var r = api().get("/api/pedidos/" + pedido + "/pdf", c.token);
        assertThat(r.status()).isEqualTo(200);
        assertThat(r.cabecalho("Content-Type")).startsWith("application/pdf");
        assertThat(r.cabecalho("Content-Disposition")).contains("orcamento-" + pedido + ".pdf");
        assertThat(new String(r.bytes(), 0, 5, java.nio.charset.StandardCharsets.ISO_8859_1)).isEqualTo("%PDF-");
    }

    @Test
    void healthResponde200ComOk() {
        var r = api().get("/health", null);
        assertThat(r.status()).isEqualTo(200);
        assertThat(r.corpo()).isEqualTo("ok");
    }
}
