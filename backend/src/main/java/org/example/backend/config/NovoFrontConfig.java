package org.example.backend.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ViewControllerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Front novo (Angular) servido em /novo/, em paralelo ao app atual na raiz.
 * O build do Angular vai para static/novo/ (ver frontend/README.md); aqui só
 * se garante que "/novo" e "/novo/" abrem o index.html dele. As rotas do
 * Angular usam hash (#/inicio), então não há fallback de SPA a fazer.
 */
@Configuration
public class NovoFrontConfig implements WebMvcConfigurer {

    @Override
    public void addViewControllers(ViewControllerRegistry registry) {
        registry.addRedirectViewController("/novo", "/novo/");
        registry.addViewController("/novo/").setViewName("forward:/novo/index.html");
    }
}
