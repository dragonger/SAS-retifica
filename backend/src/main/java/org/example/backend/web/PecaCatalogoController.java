package org.example.backend.web;

import org.example.backend.dto.CatalogoItemDTO;
import org.example.backend.dto.CatalogoRequestDTO;
import org.example.backend.security.SecurityUtils;
import org.example.model.CategoriaProduto;
import org.example.model.EmpresaModel;
import org.example.model.PecaCatalogoModel;
import org.example.repository.EmpresaRepository;
import org.example.repository.PecaCatalogoRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

@RestController
@RequestMapping("/api/pecas-catalogo")
public class PecaCatalogoController {

    private final PecaCatalogoRepository repository = new PecaCatalogoRepository();
    private final EmpresaRepository empresaRepository = new EmpresaRepository();

    @GetMapping
    public List<CatalogoItemDTO> listar() {
        List<CatalogoItemDTO> resultado = new ArrayList<>();
        for (PecaCatalogoModel p : repository.listarTodos(SecurityUtils.empresaAtual())) {
            resultado.add(toDTO(p));
        }
        return resultado;
    }

    @PostMapping
    public ResponseEntity<CatalogoItemDTO> criar(@RequestBody CatalogoRequestDTO request) {
        PecaCatalogoModel peca = new PecaCatalogoModel();
        EmpresaModel empresa = empresaRepository.buscarPorId(SecurityUtils.empresaAtual());
        peca.setEmpresa(empresa);
        return salvar(peca, request);
    }

    @PutMapping("/{id}")
    public ResponseEntity<CatalogoItemDTO> atualizar(@PathVariable Long id, @RequestBody CatalogoRequestDTO request) {
        PecaCatalogoModel existente = repository.buscarPorId(id, SecurityUtils.empresaAtual());
        if (existente == null) {
            return ResponseEntity.notFound().build();
        }
        return salvar(existente, request);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deletar(@PathVariable Long id) {
        repository.deletar(id, SecurityUtils.empresaAtual());
        return ResponseEntity.noContent().build();
    }

    private ResponseEntity<CatalogoItemDTO> salvar(PecaCatalogoModel peca, CatalogoRequestDTO request) {
        if (request.nome == null || request.nome.isBlank()) {
            return ResponseEntity.badRequest().build();
        }
        peca.setNome(request.nome.trim());
        peca.setCategoria(parseCategoria(request.categoria));
        peca.setValor(request.valor != null ? request.valor : BigDecimal.ZERO);
        PecaCatalogoModel salvo = repository.salvar(peca);
        return ResponseEntity.ok(toDTO(salvo));
    }

    private CategoriaProduto parseCategoria(String nome) {
        if (nome == null) {
            return CategoriaProduto.OUTRO;
        }
        try {
            return CategoriaProduto.valueOf(nome);
        } catch (IllegalArgumentException e) {
            return CategoriaProduto.OUTRO;
        }
    }

    private CatalogoItemDTO toDTO(PecaCatalogoModel p) {
        CatalogoItemDTO dto = new CatalogoItemDTO();
        dto.id = p.getId();
        dto.categoria = p.getCategoria().name();
        dto.categoriaRotulo = p.getCategoria().getRotulo();
        dto.nome = p.getNome();
        dto.valor = p.getValor();
        return dto;
    }
}
