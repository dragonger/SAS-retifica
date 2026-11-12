package org.example.backend.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.servlet.config.annotation.ViewControllerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.io.IOException;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Front (Angular) servido na raiz a partir de static/ (build de frontend/, ver frontend/README.md).
 * As rotas do Angular usam hash (#/inicio), então não há fallback de SPA a fazer.
 *
 * <p>/novo/ foi o endereço do Angular durante a migração: agora redireciona para a raiz.
 * Só /novo/ngsw-worker.js continua existindo (worker de limpeza que desregistra o service
 * worker antigo de /novo/ nos aparelhos que testaram o front ali).
 *
 * <p>Cache HTTP: os arquivos que decidem qual versão do app roda (index.html, manifest,
 * service workers e ngsw.json) vão com {@code no-cache}, para o navegador sempre conferir
 * com o servidor; os arquivos com hash no nome (main-ABC123.js) nunca mudam de conteúdo
 * e podem ficar em cache por um ano.
 */
@Configuration
public class FrontConfig implements WebMvcConfigurer {

    @Override
    public void addViewControllers(ViewControllerRegistry registry) {
        registry.addRedirectViewController("/novo", "/");
        registry.addRedirectViewController("/novo/", "/");
        registry.addRedirectViewController("/novo/index.html", "/");
    }

    @Bean
    FilterRegistrationBean<OncePerRequestFilter> cacheDoFront() {
        OncePerRequestFilter filtro = new OncePerRequestFilter() {
            @Override
            protected void doFilterInternal(HttpServletRequest req, HttpServletResponse resp, FilterChain chain)
                    throws ServletException, IOException {
                String valor = cacheControlPara(req.getRequestURI());
                if (valor != null) resp.setHeader("Cache-Control", valor);
                chain.doFilter(req, resp);
            }
        };
        FilterRegistrationBean<OncePerRequestFilter> reg = new FilterRegistrationBean<>(filtro);
        reg.setName("cacheDoFront");
        reg.addUrlPatterns("/*");
        return reg;
    }

    private static final Set<String> SEMPRE_CONFERIR = Set.of(
            "/", "/index.html", "/manifest.json", "/sw.js", "/ngsw-worker.js", "/ngsw.json",
            "/safety-worker.js", "/worker-basic.min.js", "/novo/ngsw-worker.js");

    /** main-ABCD1234.js, styles-ABCD1234.css, chunk-ABCD1234.js (hash do build do Angular). */
    private static final Pattern COM_HASH = Pattern.compile("^/[\\w.-]+-[A-Z0-9]{8}\\.(js|css)$");

    /** Valor do Cache-Control para um caminho, ou null para deixar como está (API, imagens, fontes). */
    static String cacheControlPara(String caminho) {
        if (caminho == null) return null;
        if (SEMPRE_CONFERIR.contains(caminho)) return "no-cache";
        if (COM_HASH.matcher(caminho).matches()) return "public, max-age=31536000, immutable";
        return null;
    }
}
