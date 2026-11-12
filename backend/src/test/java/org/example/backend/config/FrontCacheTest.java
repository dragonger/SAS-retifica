package org.example.backend.config;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** Cache-Control do front: quem decide a versão do app nunca fica preso em cache; arquivo com hash, um ano. */
class FrontCacheTest {

    @Test
    void arquivosQueDecidemAVersaoSempreConferemComOServidor() {
        for (String caminho : new String[]{"/", "/index.html", "/manifest.json", "/sw.js", "/ngsw-worker.js",
                "/ngsw.json", "/safety-worker.js", "/novo/ngsw-worker.js"}) {
            assertThat(FrontConfig.cacheControlPara(caminho)).as(caminho).isEqualTo("no-cache");
        }
    }

    @Test
    void arquivosComHashFicamEmCachePorUmAno() {
        assertThat(FrontConfig.cacheControlPara("/main-BSESUDHB.js")).isEqualTo("public, max-age=31536000, immutable");
        assertThat(FrontConfig.cacheControlPara("/styles-4XQ2ZK7M.css")).isEqualTo("public, max-age=31536000, immutable");
        assertThat(FrontConfig.cacheControlPara("/chunk-ABCDEF12.js")).isEqualTo("public, max-age=31536000, immutable");
    }

    @Test
    void apiFontesEImagensNaoSaoTocados() {
        for (String caminho : new String[]{"/api/pedidos", "/api/pedidos/12/pdf", "/health", "/fonts/fonts.css",
                "/icon-192.png", "/vendor/pdf-lib.min.js", "/media/logo.png", "/novo/main-BSESUDHB.js"}) {
            assertThat(FrontConfig.cacheControlPara(caminho)).as(caminho).isNull();
        }
    }
}
