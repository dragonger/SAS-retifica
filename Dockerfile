# Build multi-stage: compila core+backend com Maven, roda só o jar do backend
# numa JRE enxuta. O desktop (JavaFX) não entra na imagem — é só o servidor.

# Front (Angular, servido na raiz): gera o build do frontend/, que tem tudo o que
# precisa (estilo, fontes, icones, manifest, pdf-lib e os service workers).
FROM node:22-alpine AS front
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /app
COPY pom.xml .
COPY core/pom.xml core/pom.xml
COPY backend/pom.xml backend/pom.xml
COPY desktop/pom.xml desktop/pom.xml
COPY core/src core/src
COPY backend/src backend/src
COPY --from=front /app/frontend/dist/frontend/browser backend/src/main/resources/static
RUN mvn -pl core,backend -am -DskipTests package

FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
COPY --from=build /app/backend/target/retificas-backend.jar app.jar
# Local o app escuta na 8443; no Railway a porta vem da variável PORT (8080).
EXPOSE 8443
# Flags de memoria: sem elas a JVM usa heap ate 25% do limite do container
# (bem mais do que a app realmente usa) e G1GC, que reserva mais memoria
# de "contabilidade" interna do que vale a pena pra uma app desse porte
# (uso real girava em torno de 300-400MB, com picos ocasionais). Xmx da um
# teto explicito, SerialGC e mais enxuto pra heaps pequenos/trafego baixo,
# e TieredStopAtLevel=1 poupa memoria do JIT (troca por menos pico de
# performance, irrelevante nessa escala).
ENTRYPOINT ["java", "-Xmx512m", "-XX:MaxMetaspaceSize=160m", "-XX:+UseSerialGC", "-XX:TieredStopAtLevel=1", "-jar", "app.jar"]
