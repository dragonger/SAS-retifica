package org.example.repository;

import org.example.model.PecaCatalogoModel;
import org.example.persistence.JPAUtil;

import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityTransaction;
import java.util.List;

/**
 * Acesso a dados de {@link PecaCatalogoModel} (catálogo de peças).
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

    public PecaCatalogoModel buscarPorId(Long id) {
        EntityManager em = JPAUtil.getEntityManager();
        try {
            return em.find(PecaCatalogoModel.class, id);
        } finally {
            em.close();
        }
    }

    public List<PecaCatalogoModel> listarTodos() {
        EntityManager em = JPAUtil.getEntityManager();
        try {
            return em.createQuery(
                    "SELECT p FROM PecaCatalogoModel p ORDER BY p.categoria, p.nome", PecaCatalogoModel.class)
                    .getResultList();
        } finally {
            em.close();
        }
    }

    public void deletar(Long id) {
        EntityManager em = JPAUtil.getEntityManager();
        EntityTransaction tx = em.getTransaction();
        try {
            tx.begin();
            PecaCatalogoModel peca = em.find(PecaCatalogoModel.class, id);
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
