package org.example.backend;

import org.example.model.EmpresaModel;
import org.example.model.UsuarioModel;
import org.example.repository.EmpresaRepository;
import org.example.repository.UsuarioRepository;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.Base64;

/**
 * Cria a primeira empresa + usuário no primeiro startup (banco de usuários
 * ainda vazio). A senha é gerada aleatoriamente e gravada em
 * ~/.retificasDesktop/bootstrap-credentials.txt — nunca fica hardcoded em
 * arquivo versionado (o repositório é público).
 */
@Component
public class BootstrapUsuario implements CommandLineRunner {

    private static final String EMAIL_BOOTSTRAP = "miguelbelizario144@gmail.com";

    private final UsuarioRepository usuarioRepository = new UsuarioRepository();
    private final EmpresaRepository empresaRepository = new EmpresaRepository();
    private final PasswordEncoder passwordEncoder;

    public BootstrapUsuario(PasswordEncoder passwordEncoder) {
        this.passwordEncoder = passwordEncoder;
    }

    @Override
    public void run(String... args) throws IOException {
        if (usuarioRepository.contar() > 0) {
            return;
        }

        EmpresaModel empresa = new EmpresaModel();
        empresa.setNome("Retífica");
        empresa.setCriadaEm(LocalDateTime.now());
        empresa = empresaRepository.salvar(empresa);

        String senha = gerarSenhaAleatoria();

        UsuarioModel usuario = new UsuarioModel();
        usuario.setEmail(EMAIL_BOOTSTRAP);
        usuario.setNome("Miguel");
        usuario.setSenhaHash(passwordEncoder.encode(senha));
        usuario.setEmpresa(empresa);
        usuario.setCriadoEm(LocalDateTime.now());
        usuarioRepository.salvar(usuario);

        gravarCredenciais(senha);
    }

    private String gerarSenhaAleatoria() {
        byte[] bytes = new byte[9];
        new SecureRandom().nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private void gravarCredenciais(String senha) throws IOException {
        Path arquivo = Path.of(System.getProperty("user.home"), ".retificasDesktop", "bootstrap-credentials.txt");
        Files.createDirectories(arquivo.getParent());
        String conteudo = "Login inicial do sistema (gerado automaticamente):\n"
                + "E-mail: " + EMAIL_BOOTSTRAP + "\n"
                + "Senha: " + senha + "\n"
                + "Gerado em: " + LocalDateTime.now() + "\n";
        Files.writeString(arquivo, conteudo, StandardCharsets.UTF_8);
        System.out.println("=== Usuário inicial criado. Credenciais em " + arquivo + " ===");
    }
}
