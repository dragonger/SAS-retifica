package org.example.backend.config;

import org.example.backend.security.JwtAuthFilter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.http.HttpStatus;

/**
 * Sessão stateless com JWT (sem cookie, sem CSRF). Endpoints fora de
 * /api/** (o PWA estático) e /api/auth/** ficam liberados; o resto de
 * /api/** exige um token válido, verificado pelo {@link JwtAuthFilter}.
 *
 * Sem um AuthenticationEntryPoint explícito, o Spring Security usa
 * Http403ForbiddenEntryPoint por padrão — token ausente/expirado/inválido
 * vira 403 em vez de 401. O front (interceptor) só faz logout automático (limpa a sessão +
 * redireciona pro login) em cima de 401, então token vencido ficava preso
 * num 403 mostrando só um toast de erro pra sempre. Por isso forçamos 401
 * aqui: não existe checagem de papel/role nessa app, então todo "acesso
 * negado" a /api/** hoje é sempre falta de autenticação válida, nunca
 * autorização insuficiente.
 */
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    private final JwtAuthFilter jwtAuthFilter;

    public SecurityConfig(JwtAuthFilter jwtAuthFilter) {
        this.jwtAuthFilter = jwtAuthFilter;
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
                .csrf(csrf -> csrf.disable())
                .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .exceptionHandling(eh -> eh.authenticationEntryPoint(new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED)))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/api/auth/**").permitAll()
                        // máquina a máquina (Cloud Function do Alto Medidas): o controller confere a chave X-Api-Key
                        .requestMatchers("/api/integracoes/**").permitAll()
                        .requestMatchers("/api/**").authenticated()
                        .anyRequest().permitAll()
                )
                .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }
}
