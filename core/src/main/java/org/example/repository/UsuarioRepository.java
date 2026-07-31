package org.example.repository;

import org.example.model.UsuarioModel;
import org.example.persistence.JPAUtil;

import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityTransaction;
import jakarta.persistence.NoResultException;

/**
 * Acesso a dados de {@link UsuarioModel} (conta de login).
 */
public class UsuarioRepository {

    public UsuarioModel salvar(UsuarioModel usuario) {
        EntityManager em = JPAUtil.getEntityManager();
        EntityTransaction tx = em.getTransaction();
        try {
            tx.begin();
            UsuarioModel gerenciado = em.merge(usuario);
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

    public UsuarioModel buscarPorId(Long id) {
        EntityManager em = JPAUtil.getEntityManager();
        try {
            return em.find(UsuarioModel.class, id);
        } finally {
            em.close();
        }
    }

    public UsuarioModel buscarPorEmail(String email) {
        EntityManager em = JPAUtil.getEntityManager();
        try {
            return em.createQuery(
                    "SELECT u FROM UsuarioModel u LEFT JOIN FETCH u.empresa WHERE u.email = :email",
                    UsuarioModel.class)
                    .setParameter("email", email)
                    .getSingleResult();
        } catch (NoResultException e) {
            return null;
        } finally {
            em.close();
        }
    }

    public long contar() {
        EntityManager em = JPAUtil.getEntityManager();
        try {
            return em.createQuery("SELECT COUNT(u) FROM UsuarioModel u", Long.class)
                    .getSingleResult();
        } finally {
            em.close();
        }
    }
}
