package org.example;

import javafx.application.Application;
import javafx.fxml.FXMLLoader;
import javafx.scene.Scene;
import javafx.scene.layout.BorderPane;
import javafx.stage.Stage;
import org.example.persistence.JPAUtil;

public class MainFx extends Application {

    @Override
    public void start(Stage stage) throws Exception {
        try{
            FXMLLoader fxmlLoader = new FXMLLoader(getClass().getResource("/views/TelaInicial.fxml"));
            BorderPane root = fxmlLoader.load();
            Scene scene = new Scene(root, 700,400);

            stage.setScene(scene);
            stage.show();
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    @Override
    public void stop() {
        // Libera o pool de conexões / EntityManagerFactory ao fechar a aplicação.
        JPAUtil.close();
    }

    public static void main(String[] args) {
        launch(args);
    }
}
