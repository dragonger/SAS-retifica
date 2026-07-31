package org.example.backend.web;

import org.example.backend.dto.LoginRequestDTO;
import org.example.backend.dto.LoginResponseDTO;
import org.example.backend.security.JwtUtil;
import org.example.model.UsuarioModel;
import org.example.repository.UsuarioRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final UsuarioRepository usuarioRepository = new UsuarioRepository();
    private final PasswordEncoder passwordEncoder;
    private final JwtUtil jwtUtil;

    public AuthController(PasswordEncoder passwordEncoder, JwtUtil jwtUtil) {
        this.passwordEncoder = passwordEncoder;
        this.jwtUtil = jwtUtil;
    }

    @PostMapping("/login")
    public ResponseEntity<LoginResponseDTO> login(@RequestBody LoginRequestDTO request) {
        if (request.email == null || request.senha == null) {
            return ResponseEntity.badRequest().build();
        }
        UsuarioModel usuario = usuarioRepository.buscarPorEmail(request.email.trim().toLowerCase());
        if (usuario == null || !passwordEncoder.matches(request.senha, usuario.getSenhaHash())) {
            return ResponseEntity.status(401).build();
        }
        LoginResponseDTO dto = new LoginResponseDTO();
        dto.token = jwtUtil.gerar(usuario);
        dto.nome = usuario.getNome();
        dto.empresaNome = usuario.getEmpresa() != null ? usuario.getEmpresa().getNome() : null;
        return ResponseEntity.ok(dto);
    }
}
