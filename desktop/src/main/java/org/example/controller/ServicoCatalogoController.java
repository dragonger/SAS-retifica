package org.example.controller;

import javafx.collections.FXCollections;
import javafx.collections.ObservableList;
import javafx.event.ActionEvent;
import javafx.fxml.FXML;
import javafx.fxml.Initializable;
import javafx.scene.control.*;
import javafx.scene.control.cell.PropertyValueFactory;
import org.example.model.CategoriaProduto;
import org.example.model.ServicoCatalogoModel;
import org.example.repository.ServicoCatalogoRepository;

import java.math.BigDecimal;
import java.net.URL;
import java.util.ResourceBundle;

/**
 * Controller da aba de cadastro de serviços (catálogo reutilizado nos pedidos).
 * Duplo-clique numa linha carrega o item no formulário para editar (nome,
 * categoria e valor podem ser alterados e salvos de novo).
 */
public class ServicoCatalogoController implements Initializable {

    @FXML
    private ComboBox<CategoriaProduto> cmbCategoria;
    @FXML
    private TextField fldNome;
    @FXML
    private TextField fldValor;
    @FXML
    private TableView<ServicoCatalogoModel> tblServicos;
    @FXML
    private TableColumn<ServicoCatalogoModel, CategoriaProduto> colCategoria;
    @FXML
    private TableColumn<ServicoCatalogoModel, String> colNome;
    @FXML
    private TableColumn<ServicoCatalogoModel, BigDecimal> colValor;

    private final ServicoCatalogoRepository servicoRepository = new ServicoCatalogoRepository();
    private final ObservableList<ServicoCatalogoModel> servicos = FXCollections.observableArrayList();

    private ServicoCatalogoModel emEdicao;

    @Override
    public void initialize(URL url, ResourceBundle resourceBundle) {
        cmbCategoria.getItems().setAll(CategoriaProduto.values());

        colCategoria.setCellValueFactory(new PropertyValueFactory<>("categoria"));
        colNome.setCellValueFactory(new PropertyValueFactory<>("nome"));
        colValor.setCellValueFactory(new PropertyValueFactory<>("valor"));
        tblServicos.setItems(servicos);

        // Duplo-clique carrega o serviço no formulário para edição.
        tblServicos.setRowFactory(tv -> {
            TableRow<ServicoCatalogoModel> row = new TableRow<>();
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
            servicos.setAll(servicoRepository.listarTodos());
        } catch (RuntimeException e) {
            System.err.println("Falha ao carregar serviços: " + e.getMessage());
            e.printStackTrace();
        }
    }

    private void carregarParaEdicao(ServicoCatalogoModel servico) {
        emEdicao = servico;
        cmbCategoria.setValue(servico.getCategoria());
        fldNome.setText(servico.getNome());
        fldValor.setText(servico.getValor() != null ? servico.getValor().toPlainString() : "");
    }

    @FXML
    private void salvar(ActionEvent event) {
        String nome = textoOuNulo(fldNome.getText());
        if (nome == null) {
            alerta(Alert.AlertType.WARNING, "Informe o nome do serviço.");
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
            ServicoCatalogoModel servico = emEdicao != null ? emEdicao : new ServicoCatalogoModel();
            servico.setNome(nome);
            servico.setCategoria(cmbCategoria.getValue());
            servico.setValor(valor != null ? valor : BigDecimal.ZERO);
            servicoRepository.salvar(servico);
            limparFormulario();
            recarregar();
        } catch (RuntimeException e) {
            e.printStackTrace();
            alerta(Alert.AlertType.ERROR, "Erro ao salvar o serviço: " + e.getMessage());
        }
    }

    @FXML
    private void limpar(ActionEvent event) {
        limparFormulario();
    }

    @FXML
    private void remover(ActionEvent event) {
        ServicoCatalogoModel selecionado = tblServicos.getSelectionModel().getSelectedItem();
        if (selecionado == null) {
            alerta(Alert.AlertType.INFORMATION, "Selecione um serviço para remover.");
            return;
        }

        Alert confirmacao = new Alert(Alert.AlertType.CONFIRMATION,
                "Deseja remover o serviço \"" + selecionado.getNome() + "\"?",
                ButtonType.YES, ButtonType.NO);
        confirmacao.setHeaderText(null);
        confirmacao.showAndWait();

        if (confirmacao.getResult() == ButtonType.YES) {
            try {
                servicoRepository.deletar(selecionado.getId());
                limparFormulario();
                recarregar();
            } catch (RuntimeException e) {
                e.printStackTrace();
                alerta(Alert.AlertType.ERROR, "Erro ao remover o serviço: " + e.getMessage());
            }
        }
    }

    private void limparFormulario() {
        emEdicao = null;
        cmbCategoria.setValue(null);
        fldNome.clear();
        fldValor.clear();
        tblServicos.getSelectionModel().clearSelection();
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
