package org.example.backend.web;

import org.example.backend.dto.CategoriaDTO;
import org.example.model.CategoriaProduto;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.List;

/** Lista as categorias (componentes do motor) disponíveis para os catálogos. */
@RestController
@RequestMapping("/api/categorias")
public class CategoriaController {

    @GetMapping
    public List<CategoriaDTO> listar() {
        List<CategoriaDTO> resultado = new ArrayList<>();
        for (CategoriaProduto categoria : CategoriaProduto.values()) {
            CategoriaDTO dto = new CategoriaDTO();
            dto.nome = categoria.name();
            dto.rotulo = categoria.getRotulo();
            resultado.add(dto);
        }
        return resultado;
    }
}
