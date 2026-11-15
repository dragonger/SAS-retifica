package org.example.backend.web;

import jakarta.servlet.http.HttpServletResponse;
import org.example.backend.dto.TrocarSenhaRequestDTO;
import org.example.backend.security.JwtUtil;
import org.example.backend.security.SecurityUtils;
import org.example.backend.security.SessaoService;
import org.example.model.UsuarioModel;
import org.example.repository.UsuarioRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Endpoints do próprio usuário logado (fora de /api/auth/** — exige token). */
@RestController
@RequestMapping("/api/usuario")
public class UsuarioController {

    static final String HEADER_RENOVACAO = "X-Auth-Refresh";

    private final UsuarioRepository usuarioRepository = new UsuarioRepository();
    private final PasswordEncoder passwordEncoder;
    private final SessaoService sessoes;
    private final JwtUtil jwtUtil;

    public UsuarioController(PasswordEncoder passwordEncoder, SessaoService sessoes, JwtUtil jwtUtil) {
        this.passwordEncoder = passwordEncoder;
        this.sessoes = sessoes;
        this.jwtUtil = jwtUtil;
    }

    /**
     * Troca a senha e derruba todas as outras sessões do usuário (quem tinha a senha antiga deixa de
     * entrar), numa transação só. Este aparelho continua: o token novo vai no X-Auth-Refresh, que o
     * front já guarda.
     */
    @PutMapping("/senha")
    public ResponseEntity<Void> trocarSenha(@RequestBody TrocarSenhaRequestDTO request, HttpServletResponse response) {
        if (SecurityUtils.ehDemo()) {
            return ResponseEntity.status(403).build(); // o usuário da demonstração não tem senha conhecida
        }
        if (request.novaSenha == null || request.novaSenha.length() < 6) {
            return ResponseEntity.badRequest().build();
        }
        UsuarioModel usuario = usuarioRepository.buscarPorId(SecurityUtils.principalAtual().getUsuarioId());
        if (usuario == null) {
            return ResponseEntity.notFound().build();
        }
        if (request.senhaAtual == null || !passwordEncoder.matches(request.senhaAtual, usuario.getSenhaHash())) {
            return ResponseEntity.status(401).build();
        }
        String novoHash = passwordEncoder.encode(request.novaSenha);
        int versao = sessoes.trocarSenha(usuario.getId(), novoHash);
        usuario.setSenhaHash(novoHash);
        usuario.setSessaoVersao(versao);
        renovarToken(response, usuario);
        return ResponseEntity.noContent().build();
    }

    /**
     * "Sair dos outros aparelhos": invalida todos os tokens do usuário (celular perdido, aparelho de
     * outra pessoa) e mantém só este, com um token novo no X-Auth-Refresh.
     */
    @PostMapping("/sair-dos-outros-aparelhos")
    public ResponseEntity<Void> sairDosOutrosAparelhos(HttpServletResponse response) {
        if (SecurityUtils.ehDemo()) {
            return ResponseEntity.status(403).build();
        }
        UsuarioModel usuario = usuarioRepository.buscarPorId(SecurityUtils.principalAtual().getUsuarioId());
        if (usuario == null) {
            return ResponseEntity.notFound().build();
        }
        usuario.setSessaoVersao(sessoes.revogarTodas(usuario.getId()));
        renovarToken(response, usuario);
        return ResponseEntity.noContent().build();
    }

    /**
     * Põe o token na versão nova no X-Auth-Refresh. Usa setHeader porque o JwtAuthFilter já pode ter
     * posto um token renovado (na versão antiga) ali: o valor novo substitui, sem ficar "A, B".
     */
    private void renovarToken(HttpServletResponse response, UsuarioModel usuario) {
        response.setHeader(HEADER_RENOVACAO, jwtUtil.gerar(usuario));
    }
}
