package org.example.repository;

import org.example.model.ServicoCatalogoModel;
import org.example.persistence.JPAUtil;

import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityTransaction;
import java.util.List;

/**
 * Acesso a dados de {@link ServicoCatalogoModel} (catálogo de serviços).
 */
public class ServicoCatalogoRepository {

    public ServicoCatalogoModel salvar(ServicoCatalogoModel servico) {
        EntityManager em = JPAUtil.getEntityManager();
        EntityTransaction tx = em.getTransaction();
        try {
            tx.begin();
            ServicoCatalogoModel gerenciado = em.merge(servico);
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

    public ServicoCatalogoModel buscarPorId(Long id) {
        EntityManager em = JPAUtil.getEntityManager();
        try {
            return em.find(ServicoCatalogoModel.class, id);
        } finally {
            em.close();
        }
    }

    public List<ServicoCatalogoModel> listarTodos() {
        EntityManager em = JPAUtil.getEntityManager();
        try {
            return em.createQuery(
                    "SELECT s FROM ServicoCatalogoModel s ORDER BY s.categoria, s.nome", ServicoCatalogoModel.class)
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
            ServicoCatalogoModel servico = em.find(ServicoCatalogoModel.class, id);
            if (servico != null) {
                em.remove(servico);
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
            return em.createQuery("SELECT COUNT(s) FROM ServicoCatalogoModel s", Long.class)
                    .getSingleResult();
        } finally {
            em.close();
        }
    }
}
