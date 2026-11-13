package org.example.backend;

import io.jsonwebtoken.Jwts;
import org.example.backend.security.JwtUtil;
import org.example.model.UsuarioModel;
import org.example.repository.UsuarioRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Sessões revogáveis: trocar a senha, "sair dos outros aparelhos" e a recuperação pelas variáveis do
 * servidor derrubam os tokens já emitidos (inclusive os que a renovação manteria vivos), e o aparelho
 * que pediu continua com o token novo do X-Auth-Refresh.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class SessaoRevogavelTest {

    static {
        GuardaBancoLocal.verificar();
    }

    @LocalServerPort int porta;
    @Autowired JwtUtil jwtUtil;
    @Autowired PasswordEncoder encoder;
    @Autowired RedefinicaoDeSenha redefinicao;

    private ApiTeste api() {
        return new ApiTeste(porta);
    }

    private int statusCom(String token) {
        return api().get("/api/clientes", token).status();
    }

    private String loginNovo(Cenario c, String senha) {
        var r = api().post("/api/auth/login", null, Map.of("email", c.email, "senha", senha));
        assertThat(r.status()).as(r.corpo()).isEqualTo(200);
        return r.json().get("token").asString();
    }

    @Test
    void trocarASenhaDerrubaOsOutrosAparelhosEMantemEste() {
        Cenario c = Cenario.nova("Sessao", jwtUtil, encoder);
        String outroAparelho = loginNovo(c, c.senha);
        assertThat(statusCom(c.token)).isEqualTo(200);
        assertThat(statusCom(outroAparelho)).isEqualTo(200);

        var r = api().put("/api/usuario/senha", c.token, Map.of("senhaAtual", c.senha, "novaSenha", "senha-nova-123"));
        assertThat(r.status()).isEqualTo(204);
        String novo = r.headers().firstValue("X-Auth-Refresh").orElseThrow();

        assertThat(statusCom(c.token)).as("o token usado na troca também é substituído").isEqualTo(401);
        assertThat(statusCom(outroAparelho)).as("outro aparelho sai").isEqualTo(401);
        assertThat(statusCom(novo)).as("este aparelho continua com o token novo").isEqualTo(200);
        assertThat(statusCom(loginNovo(c, "senha-nova-123"))).as("login com a senha nova vale").isEqualTo(200);
    }

    @Test
    void sairDosOutrosAparelhosDerrubaTodosMenosEste() {
        Cenario c = Cenario.nova("SairOutros", jwtUtil, encoder);
        String outroAparelho = loginNovo(c, c.senha);

        var r = api().postSemCorpo("/api/usuario/sair-dos-outros-aparelhos", c.token);
        assertThat(r.status()).isEqualTo(204);
        String novo = r.headers().firstValue("X-Auth-Refresh").orElseThrow();

        assertThat(statusCom(outroAparelho)).isEqualTo(401);
        assertThat(statusCom(c.token)).isEqualTo(401);
        assertThat(statusCom(novo)).isEqualTo(200);
        assertThat(statusCom(loginNovo(c, c.senha))).as("a senha não mudou: entrar de novo funciona").isEqualTo(200);
    }

    @Test
    void renovacaoNaoRessuscitaTokenRevogado() {
        Cenario c = Cenario.nova("Renovar", jwtUtil, encoder);
        var claimsAntigas = jwtUtil.validar(c.token);
        api().postSemCorpo("/api/usuario/sair-dos-outros-aparelhos", c.token);
        String renovadoDoAntigo = jwtUtil.renovar(claimsAntigas);
        assertThat(statusCom(renovadoDoAntigo)).as("renovar mantém a versão antiga, que já não vale").isEqualTo(401);
    }

    @Test
    void tokenSemVersaoValeAtePrimeiraRevogacao() {
        Cenario c = Cenario.nova("SemVersao", jwtUtil, encoder);
        var claims = jwtUtil.validar(c.token);
        assertThat(JwtUtil.versaoDe(claims)).isZero();
        assertThat(JwtUtil.versaoDe(Jwts.claims().add("usuarioId", 1L).build()))
                .as("token emitido antes da revogação existir").isZero();
    }

    @Test
    void redefinirPelasVariaveisDerrubaAsSessoesUmaVezSo() {
        Cenario c = Cenario.nova("RedefinirSessao", jwtUtil, encoder);
        assertThat(redefinicao.redefinir(c.email, "senha-do-servidor")).isEqualTo(RedefinicaoDeSenha.Resultado.REDEFINIDA);
        assertThat(statusCom(c.token)).isEqualTo(401);

        String depois = loginNovo(c, "senha-do-servidor");
        // nova subida com as mesmas variáveis (o servidor dorme e acorda): não derruba de novo
        assertThat(redefinicao.redefinir(c.email, "senha-do-servidor")).isEqualTo(RedefinicaoDeSenha.Resultado.REDEFINIDA);
        assertThat(statusCom(depois)).isEqualTo(200);
    }

    @Test
    void salvarUmUsuarioCarregadoAntesNaoDesfazARevogacao() {
        Cenario c = Cenario.nova("Merge", jwtUtil, encoder);
        var repo = new UsuarioRepository();
        UsuarioModel carregadoAntes = repo.buscarPorEmail(c.email);
        api().postSemCorpo("/api/usuario/sair-dos-outros-aparelhos", c.token);

        carregadoAntes.setNome("Nome alterado");
        repo.salvar(carregadoAntes); // merge com a versão antiga na memória
        assertThat(repo.versaoDaSessao(carregadoAntes.getId())).isEqualTo(1);
        assertThat(statusCom(c.token)).isEqualTo(401);
    }

    @Test
    void tokenDeUsuarioQueNaoExisteMaisNaoEntra() {
        Cenario c = Cenario.nova("Apagado", jwtUtil, encoder);
        long id = jwtUtil.validar(c.token).get("usuarioId", Long.class);
        UsuarioModel inexistente = new UsuarioModel();
        inexistente.setId(id + 1_000_000); // id sintético que não existe no banco de teste
        inexistente.setEmail("inexistente@example.test");
        assertThat(new UsuarioRepository().versaoDaSessao(inexistente.getId())).isNull();
        assertThat(statusCom(jwtUtil.gerar(inexistente))).isEqualTo(401);
    }
}
