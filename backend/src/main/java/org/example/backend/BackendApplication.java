package org.example.backend;

import org.example.persistence.JPAUtil;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * Backend REST + servidor da versão web/mobile (PWA) da retífica.
 * Usa o mesmo banco H2 do app desktop (arquivo em ~/.retificasDesktop,
 * modo AUTO_SERVER) — desktop e mobile enxergam os mesmos pedidos.
 */
@SpringBootApplication
public class BackendApplication {

    public static void main(String[] args) {
        SpringApplication.run(BackendApplication.class, args);
        Runtime.getRuntime().addShutdownHook(new Thread(JPAUtil::close));
    }
}
