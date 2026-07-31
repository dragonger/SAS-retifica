package org.example.controller;

import javafx.collections.FXCollections;
import javafx.collections.ObservableList;
import javafx.event.ActionEvent;
import javafx.fxml.FXML;
import javafx.fxml.Initializable;
import javafx.scene.control.*;
import javafx.scene.control.cell.PropertyValueFactory;
import org.example.model.CabecoteModel;
import org.example.repository.CabecoteRepository;

import java.net.URL;
import java.util.ResourceBundle;

/**
 * Controller da aba de cadastro de cabeçotes (catálogo reutilizado nos pedidos).
 */
public class CabecoteController implements Initializable {

    @FXML
    private TextField fldNome;
    @FXML
    private TextField fldMovel;
    @FXML
    private TextField fldFixo;
    @FXML
    private TableView<CabecoteModel> tblCabecotes;
    @FXML
    private TableColumn<CabecoteModel, String> colNome;
    @FXML
    private TableColumn<CabecoteModel, String> colMovel;
    @FXML
    private TableColumn<CabecoteModel, String> colFixo;

    private final CabecoteRepository cabecoteRepository = new CabecoteRepository();
    private final ObservableList<CabecoteModel> cabecotes = FXCollections.observableArrayList();

    private CabecoteModel emEdicao;

    @Override
    public void initialize(URL url, ResourceBundle resourceBundle) {
        colNome.setCellValueFactory(new PropertyValueFactory<>("nome"));
        colMovel.setCellValueFactory(new PropertyValueFactory<>("movelFaixa"));
        colFixo.setCellValueFactory(new PropertyValueFactory<>("fixoFaixa"));
        tblCabecotes.setItems(cabecotes);

        // Duplo-clique carrega o cabeçote no formulário para edição.
        tblCabecotes.setRowFactory(tv -> {
            TableRow<CabecoteModel> row = new TableRow<>();
            row.setOnMouseClicked(event -> {
                if (event.getClickCount() == 2 && !row.isEmpty()) {
                    carregarParaEdicao(row.getItem());
                }
            });
            return row;
        });

        recarregar();
    }

    private void recarregar() {
        try {
            cabecotes.setAll(cabecoteRepository.listarTodos());
        } catch (RuntimeException e) {
            System.err.println("Falha ao carregar cabeçotes: " + e.getMessage());
            e.printStackTrace();
        }
    }

    private void carregarParaEdicao(CabecoteModel cabecote) {
        emEdicao = cabecote;
        fldNome.setText(cabecote.getNome());
        fldMovel.setText(cabecote.getMovelFaixa());
        fldFixo.setText(cabecote.getFixoFaixa());
    }

    @FXML
    private void salvar(ActionEvent event) {
        String nome = textoOuNulo(fldNome.getText());
        if (nome == null) {
            alerta(Alert.AlertType.WARNING, "Informe o nome do cabeçote.");
            return;
        }
        try {
            CabecoteModel cabecote = emEdicao != null ? emEdicao : new CabecoteModel();
            cabecote.setNome(nome);
            cabecote.setMovelFaixa(fldMovel.getText());
            cabecote.setFixoFaixa(fldFixo.getText());
            cabecoteRepository.salvar(cabecote);
            limparFormulario();
            recarregar();
        } catch (NumberFormatException e) {
            alerta(Alert.AlertType.ERROR,
                    "As medidas devem ser numéricas — valor único (25,10) ou faixa (25,045-27,070).");
        } catch (RuntimeException e) {
            e.printStackTrace();
            alerta(Alert.AlertType.ERROR, "Erro ao salvar o cabeçote: " + e.getMessage());
        }
    }

    @FXML
    private void limpar(ActionEvent event) {
        limparFormulario();
    }

    @FXML
    private void remover(ActionEvent event) {
        CabecoteModel selecionado = tblCabecotes.getSelectionModel().getSelectedItem();
        if (selecionado == null) {
            alerta(Alert.AlertType.INFORMATION, "Selecione um cabeçote para remover.");
            return;
        }

        Alert confirmacao = new Alert(Alert.AlertType.CONFIRMATION,
                "Deseja remover o cabeçote \"" + selecionado.getNome() + "\"?",
                ButtonType.YES, ButtonType.NO);
        confirmacao.setHeaderText(null);
        confirmacao.showAndWait();

        if (confirmacao.getResult() == ButtonType.YES) {
            try {
                cabecoteRepository.deletar(selecionado.getId());
                limparFormulario();
                recarregar();
            } catch (RuntimeException e) {
                e.printStackTrace();
                alerta(Alert.AlertType.ERROR,
                        "Não foi possível remover: o cabeçote pode estar em uso por algum pedido.");
            }
        }
    }

    private void limparFormulario() {
        emEdicao = null;
        fldNome.clear();
        fldMovel.clear();
        fldFixo.clear();
        tblCabecotes.getSelectionModel().clearSelection();
        fldNome.requestFocus();
    }

    private String textoOuNulo(String texto) {
        if (texto == null) {
            return null;
        }
        String t = texto.trim();
        return t.isEmpty() ? null : t;
    }

    private void alerta(Alert.AlertType tipo, String mensagem) {
        Alert alert = new Alert(tipo, mensagem, ButtonType.OK);
        alert.setHeaderText(null);
        alert.showAndWait();
    }
}
