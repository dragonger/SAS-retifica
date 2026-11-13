package org.example.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "USUARIO")
public class UsuarioModel {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(unique = true)
    private String email;

    private String senhaHash;
    private String nome;

    @ManyToOne
    private EmpresaModel empresa;

    private LocalDateTime criadoEm;

    /**
     * Versão das sessões do usuário: vai no token (claim "sv") e é conferida a cada requisição. Subir
     * o número invalida todos os tokens já emitidos (troca de senha, "sair dos outros aparelhos").
     * Nulo = 0 (usuários de antes da coluna). {@code updatable = false}: o merge de um UsuarioModel
     * carregado antes nunca desfaz uma revogação; só {@code UsuarioRepository.revogarSessoes} muda o valor.
     */
    @Column(updatable = false)
    private Integer sessaoVersao;

    public UsuarioModel() {
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public String getSenhaHash() {
        return senhaHash;
    }

    public void setSenhaHash(String senhaHash) {
        this.senhaHash = senhaHash;
    }

    public String getNome() {
        return nome;
    }

    public void setNome(String nome) {
        this.nome = nome;
    }

    public EmpresaModel getEmpresa() {
        return empresa;
    }

    public void setEmpresa(EmpresaModel empresa) {
        this.empresa = empresa;
    }

    public LocalDateTime getCriadoEm() {
        return criadoEm;
    }

    public void setCriadoEm(LocalDateTime criadoEm) {
        this.criadoEm = criadoEm;
    }

    public int getSessaoVersao() {
        return sessaoVersao == null ? 0 : sessaoVersao;
    }

    public void setSessaoVersao(Integer sessaoVersao) {
        this.sessaoVersao = sessaoVersao;
    }

    @Override
    public String toString() {
        return nome != null ? nome : email;
    }
}
