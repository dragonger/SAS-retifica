package org.example.persistence;

import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
import jakarta.persistence.Persistence;

/**
 * Gerencia o {@link EntityManagerFactory} da aplicação (singleton).
 * A fábrica é cara de criar, então é mantida única durante todo o ciclo de vida;
 * cada operação com o banco deve obter um {@link EntityManager} novo e fechá-lo ao fim.
 */
public final class JPAUtil {

    private static final String PERSISTENCE_UNIT = "retificasPU";

    private static EntityManagerFactory factory;

    private JPAUtil() {
    }

    public static synchronized EntityManagerFactory getEntityManagerFactory() {
        if (factory == null || !factory.isOpen()) {
            factory = Persistence.createEntityManagerFactory(PERSISTENCE_UNIT);
        }
        return factory;
    }

    public static EntityManager getEntityManager() {
        return getEntityManagerFactory().createEntityManager();
    }

    /**
     * Fecha a fábrica. Deve ser chamado ao encerrar a aplicação.
     */
    public static synchronized void close() {
        if (factory != null && factory.isOpen()) {
            factory.close();
        }
        factory = null;
    }
}
