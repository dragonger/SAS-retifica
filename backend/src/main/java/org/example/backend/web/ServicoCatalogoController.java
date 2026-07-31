package org.example.backend.web;

import org.example.backend.dto.CatalogoItemDTO;
import org.example.backend.dto.CatalogoRequestDTO;
import org.example.backend.security.SecurityUtils;
import org.example.model.CategoriaProduto;
import org.example.model.EmpresaModel;
import org.example.model.ServicoCatalogoModel;
import org.example.repository.EmpresaRepository;
import org.example.repository.ServicoCatalogoRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

@RestController
@RequestMapping("/api/servicos-catalogo")
public class ServicoCatalogoController {

    private final ServicoCatalogoRepository repository = new ServicoCatalogoRepository();
    private final EmpresaRepository empresaRepository = new EmpresaRepository();

    @GetMapping
    public List<CatalogoItemDTO> listar() {
        List<CatalogoItemDTO> resultado = new ArrayList<>();
        for (ServicoCatalogoModel s : repository.listarTodos(SecurityUtils.empresaAtual())) {
            resultado.add(toDTO(s));
        }
        return resultado;
    }

    @PostMapping
    public ResponseEntity<CatalogoItemDTO> criar(@RequestBody CatalogoRequestDTO request) {
        ServicoCatalogoModel servico = new ServicoCatalogoModel();
        EmpresaModel empresa = empresaRepository.buscarPorId(SecurityUtils.empresaAtual());
        servico.setEmpresa(empresa);
        return salvar(servico, request);
    }

    @PutMapping("/{id}")
    public ResponseEntity<CatalogoItemDTO> atualizar(@PathVariable Long id, @RequestBody CatalogoRequestDTO request) {
        ServicoCatalogoModel existente = repository.buscarPorId(id, SecurityUtils.empresaAtual());
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

    private ResponseEntity<CatalogoItemDTO> salvar(ServicoCatalogoModel servico, CatalogoRequestDTO request) {
        if (request.nome == null || request.nome.isBlank()) {
            return ResponseEntity.badRequest().build();
        }
        servico.setNome(request.nome.trim());
        servico.setCategoria(parseCategoria(request.categoria));
        servico.setValor(request.valor != null ? request.valor : BigDecimal.ZERO);
        ServicoCatalogoModel salvo = repository.salvar(servico);
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

    private CatalogoItemDTO toDTO(ServicoCatalogoModel s) {
        CatalogoItemDTO dto = new CatalogoItemDTO();
        dto.id = s.getId();
        dto.categoria = s.getCategoria().name();
        dto.categoriaRotulo = s.getCategoria().getRotulo();
        dto.nome = s.getNome();
        dto.valor = s.getValor();
        return dto;
    }
}
