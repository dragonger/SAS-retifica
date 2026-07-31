package org.example.repository;

import org.example.model.PecaCatalogoModel;
import org.example.persistence.JPAUtil;

import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityTransaction;
import jakarta.persistence.NoResultException;
import java.util.List;

/**
 * Acesso a dados de {@link PecaCatalogoModel} (catálogo de peças).
 * Toda leitura/exclusão é escopada pela empresa (tenant) do usuário logado.
 */
public class PecaCatalogoRepository {

    public PecaCatalogoModel salvar(PecaCatalogoModel peca) {
        EntityManager em = JPAUtil.getEntityManager();
        EntityTransaction tx = em.getTransaction();
        try {
            tx.begin();
            PecaCatalogoModel gerenciado = em.merge(peca);
            tx.commit();
            return gerenciado;
        } catch (RuntimeException e) {
            if (tx.isActive()) {
                tx.rollback();
            }
            throw e;
        } finally {
            em.close();
        }
    }

    public PecaCatalogoModel buscarPorId(Long id, Long empresaId) {
        EntityManager em = JPAUtil.getEntityManager();
        try {
            return em.createQuery(
                    "SELECT p FROM PecaCatalogoModel p WHERE p.id = :id AND p.empresa.id = :empresaId",
                    PecaCatalogoModel.class)
                    .setParameter("id", id)
                    .setParameter("empresaId", empresaId)
                    .getSingleResult();
        } catch (NoResultException e) {
            return null;
        } finally {
            em.close();
        }
    }

    public List<PecaCatalogoModel> listarTodos(Long empresaId) {
        EntityManager em = JPAUtil.getEntityManager();
        try {
            return em.createQuery(
                    "SELECT p FROM PecaCatalogoModel p WHERE p.empresa.id = :empresaId ORDER BY p.categoria, p.nome",
                    PecaCatalogoModel.class)
                    .setParameter("empresaId", empresaId)
                    .getResultList();
        } finally {
            em.close();
        }
    }

    public void deletar(Long id, Long empresaId) {
        EntityManager em = JPAUtil.getEntityManager();
        EntityTransaction tx = em.getTransaction();
        try {
            tx.begin();
            PecaCatalogoModel peca = em.createQuery(
                    "SELECT p FROM PecaCatalogoModel p WHERE p.id = :id AND p.empresa.id = :empresaId",
                    PecaCatalogoModel.class)
                    .setParameter("id", id)
                    .setParameter("empresaId", empresaId)
                    .getResultStream().findFirst().orElse(null);
            if (peca != null) {
                em.remove(peca);
            }
            tx.commit();
        } catch (RuntimeException e) {
            if (tx.isActive()) {
                tx.rollback();
            }
            throw e;
        } finally {
            em.close();
        }
    }

    public long contar() {
        EntityManager em = JPAUtil.getEntityManager();
        try {
            return em.createQuery("SELECT COUNT(p) FROM PecaCatalogoModel p", Long.class)
                    .getSingleResult();
        } finally {
            em.close();
        }
    }
}
