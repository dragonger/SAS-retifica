package org.example.backend;

import org.example.model.EmpresaModel;
import org.example.model.UsuarioModel;
import org.example.persistence.JPAUtil;
import org.example.repository.EmpresaRepository;
import org.example.repository.UsuarioRepository;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityTransaction;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.Base64;

/**
 * No startup: garante que existe pelo menos uma empresa + usuário (cria no
 * primeiro boot, com senha aleatória gravada em
 * ~/.retificasDesktop/bootstrap-credentials.txt — nunca hardcoded em arquivo
 * versionado, já que o repositório é público) e vincula à empresa qualquer
 * registro de negócio ainda sem dono (backfill da Fase 1b, roda em todo
 * startup mas é inofensivo depois da primeira vez — só mexe em linhas com
 * empresa nula).
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
        EmpresaModel empresa = obterOuCriarEmpresa();
        backfillEmpresaId(empresa);
    }

    private EmpresaModel obterOuCriarEmpresa() throws IOException {
        if (usuarioRepository.contar() > 0) {
            EmpresaModel existente = empresaRepository.buscarPrimeira();
            if (existente != null) {
                return existente;
            }
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
        return empresa;
    }

    /**
     * Vincula à empresa qualquer linha das 5 tabelas de negócio que ainda
     * esteja sem dono (dados criados antes da Fase 1b). Idempotente — WHERE
     * empresa IS NULL não acha nada depois que já rodou uma vez.
     */
    private void backfillEmpresaId(EmpresaModel empresa) {
        EntityManager em = JPAUtil.getEntityManager();
        EntityTransaction tx = em.getTransaction();
        try {
            tx.begin();
            em.createQuery("UPDATE PedidoModel p SET p.empresa = :empresa WHERE p.empresa IS NULL")
                    .setParameter("empresa", empresa).executeUpdate();
            em.createQuery("UPDATE ClienteModel c SET c.empresa = :empresa WHERE c.empresa IS NULL")
                    .setParameter("empresa", empresa).executeUpdate();
            em.createQuery("UPDATE CabecoteModel c SET c.empresa = :empresa WHERE c.empresa IS NULL")
                    .setParameter("empresa", empresa).executeUpdate();
            em.createQuery("UPDATE ServicoCatalogoModel s SET s.empresa = :empresa WHERE s.empresa IS NULL")
                    .setParameter("empresa", empresa).executeUpdate();
            em.createQuery("UPDATE PecaCatalogoModel p SET p.empresa = :empresa WHERE p.empresa IS NULL")
                    .setParameter("empresa", empresa).executeUpdate();
            tx.commit();
        } catch (RuntimeException e) {
            if (tx.isActive()) {
                tx.rollback();
            }
            throw e;
        } finally {
            em.close();
        }
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
