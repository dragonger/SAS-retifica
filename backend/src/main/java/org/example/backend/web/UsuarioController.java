package org.example.backend.web;

import org.example.backend.dto.TrocarSenhaRequestDTO;
import org.example.backend.security.SecurityUtils;
import org.example.model.UsuarioModel;
import org.example.repository.UsuarioRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;
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

    public UsuarioController(PasswordEncoder passwordEncoder) {
        this.passwordEncoder = passwordEncoder;
    }

    @PutMapping("/senha")
    public ResponseEntity<Void> trocarSenha(@RequestBody TrocarSenhaRequestDTO request) {
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
        return ResponseEntity.noContent().build();
    }
}
