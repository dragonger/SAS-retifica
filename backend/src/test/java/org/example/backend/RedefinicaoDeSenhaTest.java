package org.example.backend;

import org.example.backend.RedefinicaoDeSenha.Resultado;
import org.example.backend.security.JwtUtil;
import org.example.model.UsuarioModel;
import org.example.repository.EmpresaDemoRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.time.LocalDateTime;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Recuperação de acesso pelas variáveis REDEFINIR_SENHA_EMAIL/REDEFINIR_SENHA: grava a senha nova do usuário
 * certo (com o e-mail normalizado como no login), não faz nada sem as variáveis e recusa senha curta, e-mail
 * desconhecido e usuário de demonstração.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class RedefinicaoDeSenhaTest {

    static {
        GuardaBancoLocal.verificar();
    }

    @LocalServerPort int porta;
    @Autowired JwtUtil jwtUtil;
    @Autowired PasswordEncoder encoder;
    @Autowired RedefinicaoDeSenha redefinicao;

    private int login(String email, String senha) {
        return new ApiTeste(porta).post("/api/auth/login", null, Map.of("email", email, "senha", senha)).status();
    }

    @Test
    void gravaASenhaNovaEAAntigaDeixaDeValer() {
        Cenario c = Cenario.nova("Redefinir", jwtUtil, encoder);
        assertThat(redefinicao.redefinir("  " + c.email.toUpperCase() + " ", "senha-nova-123")).isEqualTo(Resultado.REDEFINIDA);
        assertThat(login(c.email, "senha-nova-123")).isEqualTo(200);
        assertThat(login(c.email, c.senha)).isEqualTo(401);
    }

    @Test
    void semAsVariaveisOuComValorInvalidoNaoMudaNada() {
        Cenario c = Cenario.nova("RedefinirNao", jwtUtil, encoder);
        assertThat(redefinicao.redefinir("", "")).isEqualTo(Resultado.NADA_A_FAZER);
        assertThat(redefinicao.redefinir(c.email, "")).isEqualTo(Resultado.NADA_A_FAZER);
        assertThat(redefinicao.redefinir(c.email, "12345")).isEqualTo(Resultado.SENHA_CURTA);
        assertThat(redefinicao.redefinir("ninguem-" + UUID.randomUUID() + "@example.test", "senha-nova-123"))
                .isEqualTo(Resultado.USUARIO_NAO_ENCONTRADO);
        assertThat(login(c.email, c.senha)).as("senha original continua").isEqualTo(200);
    }

    @Test
    void recusaUsuarioDeDemonstracao() {
        String email = "demo-" + UUID.randomUUID() + "@demonstracao.invalid";
        UsuarioModel demo = new EmpresaDemoRepository().criar("Retífica Demonstração", LocalDateTime.now().plusHours(2),
                email, "Visitante", encoder.encode(UUID.randomUUID().toString()));
        try {
            assertThat(redefinicao.redefinir(email, "senha-nova-123")).isEqualTo(Resultado.USUARIO_DE_DEMONSTRACAO);
            assertThat(login(email, "senha-nova-123")).isEqualTo(401);
        } finally {
            new EmpresaDemoRepository().apagar(demo.getEmpresa().getId());
        }
    }
}
