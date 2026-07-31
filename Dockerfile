# Build multi-stage: compila core+backend com Maven, roda só o jar do backend
# numa JRE enxuta. O desktop (JavaFX) não entra na imagem — é só o servidor.

FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /app
COPY pom.xml .
COPY core/pom.xml core/pom.xml
COPY backend/pom.xml backend/pom.xml
COPY desktop/pom.xml desktop/pom.xml
COPY core/src core/src
COPY backend/src backend/src
RUN mvn -pl core,backend -am -DskipTests package

FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
COPY --from=build /app/backend/target/retificas-backend.jar app.jar
EXPOSE 8443
ENTRYPOINT ["java", "-jar", "app.jar"]
