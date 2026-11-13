package org.example.backend;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.servlet.mvc.method.RequestMappingInfo;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Matriz endpoint x protecao. Falha quando surge um endpoint ainda nao
 * classificado, e confirma que todo /api/** que nao e publico exige token.
 *
 * ISOLADO_POR_EMPRESA: usa SecurityUtils.empresaAtual() e e exercitado por
 * IsolamentoEntreEmpresasTest (ou nao recebe id de recurso, so listas e acoes
 * da empresa do token).
 * PUBLICO: liberado no SecurityConfig de proposito.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {"ALTO_MEDIDAS_ENTRADA_KEY=chave-sintetica-de-teste", "ALTO_MEDIDAS_EMPRESA_ID=1"})
class MatrizDeEndpointsTest {

    static {
        GuardaBancoLocal.verificar();
    }

    static final Set<String> PUBLICO = Set.of(
            "POST /api/auth/login",
            "POST /api/auth/demo",
            "POST /api/integracoes/alto-medidas/os",
            "GET /health");

    static final Set<String> ISOLADO_POR_EMPRESA = Set.of(
            "GET /api/alto-medidas/status", "GET /api/alto-medidas/os", "GET /api/alto-medidas/resumo",
            "PUT /api/alto-medidas/os/{id}/pagamento",
            "GET /api/cabecotes", "POST /api/cabecotes", "PUT /api/cabecotes/{id}", "DELETE /api/cabecotes/{id}",
            "GET /api/categorias",
            "GET /api/clientes", "GET /api/clientes/{id}", "POST /api/clientes", "PUT /api/clientes/{id}",
            "DELETE /api/clientes/{id}",
            "GET /api/empresa", "PUT /api/empresa", "GET /api/empresa/logo", "PUT /api/empresa/logo",
            "DELETE /api/empresa/logo",
            "GET /api/pecas-catalogo", "POST /api/pecas-catalogo", "PUT /api/pecas-catalogo/{id}",
            "DELETE /api/pecas-catalogo/{id}",
            "GET /api/servicos-catalogo", "POST /api/servicos-catalogo", "PUT /api/servicos-catalogo/{id}",
            "DELETE /api/servicos-catalogo/{id}",
            "GET /api/pedidos", "GET /api/pedidos/dashboard", "GET /api/pedidos/encerrados",
            "GET /api/pedidos/{id}", "POST /api/pedidos", "PUT /api/pedidos/{id}",
            "POST /api/pedidos/{id}/finalizar", "DELETE /api/pedidos/{id}", "GET /api/pedidos/{id}/pdf",
            "POST /api/pedidos/{id}/whatsapp", "GET /api/whatsapp/status",
            "PUT /api/usuario/senha", "POST /api/usuario/sair-dos-outros-aparelhos",
            "GET /api/ditado/status", "POST /api/ditado", "POST /api/ditado/{id}/respostas");

    @LocalServerPort int porta;
    @Autowired RequestMappingHandlerMapping mapeamentos;

    private Set<String> endpointsDoBackend() {
        Set<String> todos = new TreeSet<>();
        for (RequestMappingInfo info : mapeamentos.getHandlerMethods().keySet()) {
            for (String padrao : info.getPathPatternsCondition().getPatternValues()) {
                if (!padrao.startsWith("/api/") && !padrao.equals("/health")) continue;
                for (RequestMethod m : info.getMethodsCondition().getMethods()) {
                    todos.add(m.name() + " " + padrao);
                }
            }
        }
        return todos;
    }

    @Test
    void todoEndpointEstaClassificadoNaMatriz() {
        Set<String> classificados = new TreeSet<>(PUBLICO);
        classificados.addAll(ISOLADO_POR_EMPRESA);
        assertThat(endpointsDoBackend())
                .as("endpoint novo precisa entrar em PUBLICO ou ISOLADO_POR_EMPRESA (e ganhar teste de isolamento)")
                .containsExactlyInAnyOrderElementsOf(classificados);
    }

    @Test
    void todoApiNaoPublicaExigeToken() {
        ApiTeste api = new ApiTeste(porta);
        for (String endpoint : ISOLADO_POR_EMPRESA) {
            String[] partes = endpoint.split(" ");
            var r = api.requisicao(partes[0], partes[1].replace("{id}", "1"), null);
            assertThat(r.status()).as(endpoint + " sem token").isEqualTo(401);
        }
    }

    @Test
    void tokenInvalidoOuAdulteradoDa401() {
        ApiTeste api = new ApiTeste(porta);
        for (String token : new String[]{"abc", "a.b.c", "eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0."}) {
            assertThat(api.get("/api/clientes", token).status()).as("token " + token).isEqualTo(401);
        }
    }

    @Test
    void integracaoComChaveErradaOuVaziaNaoEntra() {
        ApiTeste api = new ApiTeste(porta);
        var corpo = Map.of("osId", "x-nao-deve-entrar");
        assertThat(api.postComChave("/api/integracoes/alto-medidas/os", "chave-errada", corpo).status()).isEqualTo(401);
        assertThat(api.postComChave("/api/integracoes/alto-medidas/os", "", corpo).status()).isEqualTo(401);
    }

    @Test
    void autoLoginFoiRemovido() {
        // Ate 2026-11-12 este endpoint entregava, sem senha, o token da empresa do usuario 1.
        // Foi trocado pela demonstracao isolada (POST /api/auth/demo, ver DemoTest).
        var r = new ApiTeste(porta).postSemCorpo("/api/auth/auto-login", null);
        assertThat(r.status()).isEqualTo(404);
    }
}
