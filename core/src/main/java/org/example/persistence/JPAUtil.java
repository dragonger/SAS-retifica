package org.example.persistence;

import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
import jakarta.persistence.Persistence;

import java.util.HashMap;
import java.util.Map;

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
            factory = Persistence.createEntityManagerFactory(PERSISTENCE_UNIT, conexaoOverrides());
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

    /**
     * Sobrescreve url/usuário/senha do persistence.xml com o que vier de
     * DATABASE_URL/DATABASE_USER/DATABASE_PASSWORD, se essas variáveis de
     * ambiente existirem (produção). Sem elas, valem os defaults do
     * persistence.xml (Postgres local do docker-compose.yml).
     */
    private static Map<String, Object> conexaoOverrides() {
        Map<String, Object> overrides = new HashMap<>();
        putSeExistir(overrides, "jakarta.persistence.jdbc.url", "DATABASE_URL");
        putSeExistir(overrides, "jakarta.persistence.jdbc.user", "DATABASE_USER");
        putSeExistir(overrides, "jakarta.persistence.jdbc.password", "DATABASE_PASSWORD");
        return overrides;
    }

    private static void putSeExistir(Map<String, Object> overrides, String propriedade, String variavelAmbiente) {
        String valor = System.getenv(variavelAmbiente);
        if (valor != null && !valor.isBlank()) {
            overrides.put(propriedade, valor);
        }
    }
}
