package org.example.backend;

import org.example.model.UsuarioModel;
import org.example.backend.security.SessaoService;
import org.example.repository.UsuarioRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

/**
 * Recuperação de acesso pelo dono do servidor: com {@code REDEFINIR_SENHA_EMAIL} e {@code REDEFINIR_SENHA}
 * definidas (no painel do Railway), a subida grava essa senha para o usuário daquele e-mail. Só quem tem acesso
 * às variáveis do servidor consegue usar, então não abre nenhuma porta pela internet. A senha nunca vai para o
 * log. Redefinir derruba todas as sessões abertas do usuário. Depois de entrar, apague as duas variáveis:
 * enquanto existirem, toda subida confere a senha (se já for a mesma, não muda nada nem derruba ninguém).
 */
@Component
public class RedefinicaoDeSenha implements CommandLineRunner {

    static final int TAMANHO_MINIMO = 6;

    enum Resultado { NADA_A_FAZER, REDEFINIDA, USUARIO_NAO_ENCONTRADO, SENHA_CURTA, USUARIO_DE_DEMONSTRACAO }

    private final PasswordEncoder passwordEncoder;
    private final SessaoService sessoes;
    private final String email;
    private final String senha;

    public RedefinicaoDeSenha(PasswordEncoder passwordEncoder, SessaoService sessoes,
                              @Value("${REDEFINIR_SENHA_EMAIL:}") String email,
                              @Value("${REDEFINIR_SENHA:}") String senha) {
        this.passwordEncoder = passwordEncoder;
        this.sessoes = sessoes;
        this.email = email;
        this.senha = senha;
    }

    @Override
    public void run(String... args) {
        Resultado r = redefinir(email, senha);
        switch (r) {
            case NADA_A_FAZER -> { }
            case REDEFINIDA -> System.out.println("Senha de " + email.trim() + " redefinida pelas variáveis "
                    + "REDEFINIR_SENHA_EMAIL/REDEFINIR_SENHA. Depois de entrar, apague as duas variáveis.");
            case USUARIO_NAO_ENCONTRADO -> System.out.println("REDEFINIR_SENHA_EMAIL não corresponde a nenhum usuário; "
                    + "nenhuma senha foi alterada.");
            case SENHA_CURTA -> System.out.println("REDEFINIR_SENHA precisa ter pelo menos " + TAMANHO_MINIMO
                    + " caracteres; nenhuma senha foi alterada.");
            case USUARIO_DE_DEMONSTRACAO -> System.out.println("REDEFINIR_SENHA_EMAIL é de um usuário de demonstração; "
                    + "nenhuma senha foi alterada.");
        }
    }

    Resultado redefinir(String email, String senha) {
        if (email == null || email.isBlank() || senha == null || senha.isEmpty()) {
            return Resultado.NADA_A_FAZER;
        }
        if (senha.length() < TAMANHO_MINIMO) {
            return Resultado.SENHA_CURTA;
        }
        UsuarioRepository repo = new UsuarioRepository();
        UsuarioModel usuario = repo.buscarPorEmail(email.trim().toLowerCase()); // igual ao login
        if (usuario == null) {
            return Resultado.USUARIO_NAO_ENCONTRADO;
        }
        if (usuario.getEmpresa() != null && usuario.getEmpresa().isDemo()) {
            return Resultado.USUARIO_DE_DEMONSTRACAO;
        }
        String hashAtual = usuario.getSenhaHash();
        if (hashAtual != null && passwordEncoder.matches(senha, hashAtual)) {
            return Resultado.REDEFINIDA; // já é essa a senha (subida repetida com as variáveis): não derruba ninguém de novo
        }
        usuario.setSenhaHash(passwordEncoder.encode(senha));
        repo.salvar(usuario);
        sessoes.revogarTodas(usuario.getId()); // quem entrou com a senha antiga sai
        return Resultado.REDEFINIDA;
    }
}
