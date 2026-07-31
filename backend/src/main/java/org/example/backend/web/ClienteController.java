package org.example.backend.web;

import org.example.backend.dto.ClienteDTO;
import org.example.model.ClienteModel;
import org.example.repository.ClienteRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.List;

/**
 * API REST de clientes — cadastro reutilizável entre pedidos (base para o
 * futuro envio automático de orçamento via WhatsApp).
 */
@RestController
@RequestMapping("/api/clientes")
public class ClienteController {

    private final ClienteRepository repository = new ClienteRepository();

    @GetMapping
    public List<ClienteDTO> listar() {
        List<ClienteDTO> resultado = new ArrayList<>();
        for (ClienteModel c : repository.listarTodos()) {
            resultado.add(toDTO(c));
        }
        return resultado;
    }

    @GetMapping("/{id}")
    public ResponseEntity<ClienteDTO> buscar(@PathVariable Long id) {
        ClienteModel cliente = repository.buscarPorId(id);
        if (cliente == null) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(toDTO(cliente));
    }

    @PostMapping
    public ResponseEntity<ClienteDTO> criar(@RequestBody ClienteDTO request) {
        return salvar(new ClienteModel(), request);
    }

    @PutMapping("/{id}")
    public ResponseEntity<ClienteDTO> atualizar(@PathVariable Long id, @RequestBody ClienteDTO request) {
        ClienteModel existente = repository.buscarPorId(id);
        if (existente == null) {
            return ResponseEntity.notFound().build();
        }
        return salvar(existente, request);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deletar(@PathVariable Long id) {
        try {
            repository.deletar(id);
        } catch (RuntimeException e) {
            // Cliente ainda referenciado por algum pedido (FK) — não deixa remover.
            return ResponseEntity.status(409).build();
        }
        return ResponseEntity.noContent().build();
    }

    private ResponseEntity<ClienteDTO> salvar(ClienteModel cliente, ClienteDTO request) {
        if (request.nome == null || request.nome.isBlank()) {
            return ResponseEntity.badRequest().build();
        }
        cliente.setNome(request.nome.trim());
        cliente.setTelefone(vazioParaNulo(request.telefone));
        cliente.setRua(vazioParaNulo(request.rua));
        cliente.setNumero(vazioParaNulo(request.numero));
        cliente.setBairro(vazioParaNulo(request.bairro));
        cliente.setCep(vazioParaNulo(request.cep));
        cliente.setMunicipio(vazioParaNulo(request.municipio));
        cliente.setUf(vazioParaNulo(request.uf));
        ClienteModel salvo = repository.salvar(cliente);
        return ResponseEntity.ok(toDTO(salvo));
    }

    private String vazioParaNulo(String texto) {
        if (texto == null) {
            return null;
        }
        String t = texto.trim();
        return t.isEmpty() ? null : t;
    }

    private ClienteDTO toDTO(ClienteModel c) {
        ClienteDTO dto = new ClienteDTO();
        dto.id = c.getId();
        dto.nome = c.getNome();
        dto.telefone = c.getTelefone();
        dto.rua = c.getRua();
        dto.numero = c.getNumero();
        dto.bairro = c.getBairro();
        dto.cep = c.getCep();
        dto.municipio = c.getMunicipio();
        dto.uf = c.getUf();
        return dto;
    }
}
