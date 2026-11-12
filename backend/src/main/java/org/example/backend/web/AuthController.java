package org.example.backend.web;

import jakarta.servlet.http.HttpServletRequest;
import org.example.backend.demo.DemoService;
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

import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final UsuarioRepository usuarioRepository = new UsuarioRepository();
    private final PasswordEncoder passwordEncoder;
    private final JwtUtil jwtUtil;

    private final DemoService demoService;

    public AuthController(PasswordEncoder passwordEncoder, JwtUtil jwtUtil, DemoService demoService) {
        this.passwordEncoder = passwordEncoder;
        this.jwtUtil = jwtUtil;
        this.demoService = demoService;
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
        return ResponseEntity.ok(paraResposta(usuario));
    }

    /**
     * Abre uma DEMONSTRAÇÃO: empresa nova e isolada, com dados fictícios, apagada depois de
     * {@link DemoService#DURACAO}. Público (é o botão da tela de login). O login automático
     * (/auto-login, que entregava a empresa real sem senha) foi removido em 2026-11-12.
     */
    @PostMapping("/demo")
    public ResponseEntity<Object> demo(HttpServletRequest requisicao) {
        DemoService.Resultado r = demoService.criar(ipDe(requisicao));
        if (r.sessao() == null) {
            return ResponseEntity.status(r.status()).body(Map.of("erro", r.erro()));
        }
        return ResponseEntity.ok(r.sessao());
    }

    /** Primeiro endereço do X-Forwarded-For (o app roda atrás do proxy do Railway); senão, o da conexão. */
    static String ipDe(HttpServletRequest requisicao) {
        String encaminhado = requisicao.getHeader("X-Forwarded-For");
        if (encaminhado != null && !encaminhado.isBlank()) {
            return encaminhado.split(",")[0].trim();
        }
        return requisicao.getRemoteAddr();
    }

    private LoginResponseDTO paraResposta(UsuarioModel usuario) {
        LoginResponseDTO dto = new LoginResponseDTO();
        dto.token = jwtUtil.gerar(usuario);
        dto.nome = usuario.getNome();
        dto.empresaNome = usuario.getEmpresa() != null ? usuario.getEmpresa().getNome() : null;
        return dto;
    }
}
