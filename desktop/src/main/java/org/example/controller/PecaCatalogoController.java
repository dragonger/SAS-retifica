package org.example.controller;

import javafx.collections.FXCollections;
import javafx.collections.ObservableList;
import javafx.event.ActionEvent;
import javafx.fxml.FXML;
import javafx.fxml.Initializable;
import javafx.scene.control.*;
import javafx.scene.control.cell.PropertyValueFactory;
import org.example.model.CategoriaProduto;
import org.example.model.PecaCatalogoModel;
import org.example.repository.PecaCatalogoRepository;

import java.math.BigDecimal;
import java.net.URL;
import java.util.ResourceBundle;

/**
 * Controller da aba de cadastro de peças (catálogo reutilizado nos pedidos).
 * Duplo-clique numa linha carrega o item no formulário para editar (nome,
 * categoria e valor podem ser alterados e salvos de novo).
 */
public class PecaCatalogoController implements Initializable {

    @FXML
    private ComboBox<CategoriaProduto> cmbCategoria;
    @FXML
    private TextField fldNome;
    @FXML
    private TextField fldValor;
    @FXML
    private TableView<PecaCatalogoModel> tblPecas;
    @FXML
    private TableColumn<PecaCatalogoModel, CategoriaProduto> colCategoria;
    @FXML
    private TableColumn<PecaCatalogoModel, String> colNome;
    @FXML
    private TableColumn<PecaCatalogoModel, BigDecimal> colValor;

    private final PecaCatalogoRepository pecaRepository = new PecaCatalogoRepository();
    private final ObservableList<PecaCatalogoModel> pecas = FXCollections.observableArrayList();

    private PecaCatalogoModel emEdicao;

    @Override
    public void initialize(URL url, ResourceBundle resourceBundle) {
        cmbCategoria.getItems().setAll(CategoriaProduto.values());

        colCategoria.setCellValueFactory(new PropertyValueFactory<>("categoria"));
        colNome.setCellValueFactory(new PropertyValueFactory<>("nome"));
        colValor.setCellValueFactory(new PropertyValueFactory<>("valor"));
        tblPecas.setItems(pecas);

        tblPecas.setRowFactory(tv -> {
            TableRow<PecaCatalogoModel> row = new TableRow<>();
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
            pecas.setAll(pecaRepository.listarTodos());
        } catch (RuntimeException e) {
            System.err.println("Falha ao carregar peças: " + e.getMessage());
            e.printStackTrace();
        }
    }

    private void carregarParaEdicao(PecaCatalogoModel peca) {
        emEdicao = peca;
        cmbCategoria.setValue(peca.getCategoria());
        fldNome.setText(peca.getNome());
        fldValor.setText(peca.getValor() != null ? peca.getValor().toPlainString() : "");
    }

    @FXML
    private void salvar(ActionEvent event) {
        String nome = textoOuNulo(fldNome.getText());
        if (nome == null) {
            alerta(Alert.AlertType.WARNING, "Informe o nome da peça.");
            return;
        }
        BigDecimal valor;
        try {
            valor = parseValor(fldValor.getText());
        } catch (NumberFormatException e) {
            alerta(Alert.AlertType.ERROR, "O valor deve ser numérico.");
            return;
        }

        try {
            PecaCatalogoModel peca = emEdicao != null ? emEdicao : new PecaCatalogoModel();
            peca.setNome(nome);
            peca.setCategoria(cmbCategoria.getValue());
            peca.setValor(valor != null ? valor : BigDecimal.ZERO);
            pecaRepository.salvar(peca);
            limparFormulario();
            recarregar();
        } catch (RuntimeException e) {
            e.printStackTrace();
            alerta(Alert.AlertType.ERROR, "Erro ao salvar a peça: " + e.getMessage());
        }
    }

    @FXML
    private void limpar(ActionEvent event) {
        limparFormulario();
    }

    @FXML
    private void remover(ActionEvent event) {
        PecaCatalogoModel selecionado = tblPecas.getSelectionModel().getSelectedItem();
        if (selecionado == null) {
            alerta(Alert.AlertType.INFORMATION, "Selecione uma peça para remover.");
            return;
        }

        Alert confirmacao = new Alert(Alert.AlertType.CONFIRMATION,
                "Deseja remover a peça \"" + selecionado.getNome() + "\"?",
                ButtonType.YES, ButtonType.NO);
        confirmacao.setHeaderText(null);
        confirmacao.showAndWait();

        if (confirmacao.getResult() == ButtonType.YES) {
            try {
                pecaRepository.deletar(selecionado.getId());
                limparFormulario();
                recarregar();
            } catch (RuntimeException e) {
                e.printStackTrace();
                alerta(Alert.AlertType.ERROR, "Erro ao remover a peça: " + e.getMessage());
            }
        }
    }

    private void limparFormulario() {
        emEdicao = null;
        cmbCategoria.setValue(null);
        fldNome.clear();
        fldValor.clear();
        tblPecas.getSelectionModel().clearSelection();
        fldNome.requestFocus();
    }

    private BigDecimal parseValor(String texto) {
        String t = textoOuNulo(texto);
        return t == null ? null : new BigDecimal(t.replace(",", "."));
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
