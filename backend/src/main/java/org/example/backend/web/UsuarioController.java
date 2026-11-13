package org.example.backend.web;

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
     * entrar). Este aparelho continua: o token novo vai no X-Auth-Refresh, que o front já guarda.
     */

    @PutMapping("/senha")
    public ResponseEntity<Void> trocarSenha(@RequestBody TrocarSenhaRequestDTO request) {
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
        usuario.setSenhaHash(passwordEncoder.encode(request.novaSenha));
        usuarioRepository.salvar(usuario);
        return ResponseEntity.noContent().header("X-Auth-Refresh", revogarOutras(usuario)).build();
    }

    /**
     * "Sair dos outros aparelhos": invalida todos os tokens do usuário (celular perdido, aparelho de
     * outra pessoa) e mantém só este, com um token novo no X-Auth-Refresh.
     */
    @PostMapping("/sair-dos-outros-aparelhos")
    public ResponseEntity<Void> sairDosOutrosAparelhos() {
        if (SecurityUtils.ehDemo()) {
            return ResponseEntity.status(403).build();
        }
        UsuarioModel usuario = usuarioRepository.buscarPorId(SecurityUtils.principalAtual().getUsuarioId());
        if (usuario == null) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.noContent().header("X-Auth-Refresh", revogarOutras(usuario)).build();
    }

    /** Sobe a versão das sessões e devolve um token na versão nova para o aparelho que pediu. */
    private String revogarOutras(UsuarioModel usuario) {
        usuario.setSessaoVersao(sessoes.revogarTodas(usuario.getId()));
        return jwtUtil.gerar(usuario);
    }
}
