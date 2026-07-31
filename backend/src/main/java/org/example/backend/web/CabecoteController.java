package org.example.backend.web;

import org.example.backend.dto.CabecoteDTO;
import org.example.backend.dto.CabecoteRequestDTO;
import org.example.backend.security.SecurityUtils;
import org.example.model.CabecoteModel;
import org.example.model.CategoriaProduto;
import org.example.model.EmpresaModel;
import org.example.repository.CabecoteRepository;
import org.example.repository.EmpresaRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.List;

/**
 * Catálogo de referências técnicas — cobre cabeçote, bloco, biela e
 * virabrequim (a categoria de cada item define a que componente ele pertence).
 */
@RestController
@RequestMapping("/api/cabecotes")
public class CabecoteController {

    private final CabecoteRepository repository = new CabecoteRepository();
    private final EmpresaRepository empresaRepository = new EmpresaRepository();

    @GetMapping
    public List<CabecoteDTO> listar() {
        List<CabecoteDTO> resultado = new ArrayList<>();
        for (CabecoteModel c : repository.listarTodos(SecurityUtils.empresaAtual())) {
            resultado.add(toDTO(c));
        }
        return resultado;
    }

    @PostMapping
    public ResponseEntity<CabecoteDTO> criar(@RequestBody CabecoteRequestDTO request) {
        CabecoteModel cabecote = new CabecoteModel();
        EmpresaModel empresa = empresaRepository.buscarPorId(SecurityUtils.empresaAtual());
        cabecote.setEmpresa(empresa);
        return salvar(cabecote, request);
    }

    @PutMapping("/{id}")
    public ResponseEntity<CabecoteDTO> atualizar(@PathVariable Long id, @RequestBody CabecoteRequestDTO request) {
        CabecoteModel existente = repository.buscarPorId(id, SecurityUtils.empresaAtual());
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

    private ResponseEntity<CabecoteDTO> salvar(CabecoteModel cabecote, CabecoteRequestDTO request) {
        if (request.nome == null || request.nome.isBlank()) {
            return ResponseEntity.badRequest().build();
        }
        try {
            cabecote.setNome(request.nome.trim());
            cabecote.setCategoria(parseCategoria(request.categoria));
            cabecote.setMovelFaixa(request.movelFaixa);
            cabecote.setFixoFaixa(request.fixoFaixa);
            CabecoteModel salvo = repository.salvar(cabecote);
            return ResponseEntity.ok(toDTO(salvo));
        } catch (NumberFormatException e) {
            return ResponseEntity.badRequest().build();
        }
    }

    private CategoriaProduto parseCategoria(String nome) {
        if (nome == null) {
            return CategoriaProduto.CABECOTE;
        }
        try {
            return CategoriaProduto.valueOf(nome);
        } catch (IllegalArgumentException e) {
            return CategoriaProduto.CABECOTE;
        }
    }

    private CabecoteDTO toDTO(CabecoteModel c) {
        CabecoteDTO dto = new CabecoteDTO();
        dto.id = c.getId();
        dto.categoria = c.getCategoria().name();
        dto.categoriaRotulo = c.getCategoria().getRotulo();
        dto.nome = c.getNome();
        dto.movelFaixa = c.getMovelFaixa();
        dto.fixoFaixa = c.getFixoFaixa();
        return dto;
    }
}
