package org.example.controller;

import javafx.collections.FXCollections;
import javafx.event.ActionEvent;
import javafx.fxml.FXML;
import javafx.fxml.FXMLLoader;
import javafx.fxml.Initializable;
import javafx.scene.Node;
import javafx.scene.Parent;
import javafx.scene.Scene;
import javafx.scene.control.*;
import javafx.scene.control.cell.PropertyValueFactory;
import javafx.stage.FileChooser;
import javafx.stage.Stage;
import org.example.model.PecaModel;
import org.example.model.PedidoModel;
import org.example.model.ServicoModel;
import org.example.repository.PedidoRepository;
import org.example.service.PedidoPdfService;

import java.awt.Desktop;
import java.io.File;
import java.math.BigDecimal;
import java.net.URL;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ResourceBundle;

/**
 * Controller da tela de visualização de um pedido. Exibe os dados e permite
 * editar, deletar ou (futuramente) gerar PDF.
 */
public class VisualizarPedidoController implements Initializable {

    private static final DateTimeFormatter DATA_FORMAT = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm");
    private static final DateTimeFormatter DIA_FORMAT = DateTimeFormatter.ofPattern("dd/MM/yyyy");

    @FXML
    private Label lblTitulo;
    @FXML
    private Label lblCliente;
    @FXML
    private Label lblCabecote;
    @FXML
    private Label lblData;
    @FXML
    private Label lblEntregaEstimada;
    @FXML
    private Label lblEntrega;
    @FXML
    private Label lblTotal;
    @FXML
    private Button btnFinalizar;
    @FXML
    private TableView<ServicoModel> tblServicos;
    @FXML
    private TableColumn<ServicoModel, String> colDescricao;
    @FXML
    private TableColumn<ServicoModel, Integer> colQuantidade;
    @FXML
    private TableColumn<ServicoModel, BigDecimal> colValor;
    @FXML
    private TableColumn<ServicoModel, BigDecimal> colTotal;
    @FXML
    private TableView<PecaModel> tblPecas;
    @FXML
    private TableColumn<PecaModel, String> colPecaDescricao;
    @FXML
    private TableColumn<PecaModel, Integer> colPecaQuantidade;
    @FXML
    private TableColumn<PecaModel, BigDecimal> colPecaValor;
    @FXML
    private TableColumn<PecaModel, BigDecimal> colPecaTotal;

    private final PedidoRepository pedidoRepository = new PedidoRepository();
    private final PedidoPdfService pedidoPdfService = new PedidoPdfService();
    private PedidoModel pedido;
    private Runnable onAlterado;

    @Override
    public void initialize(URL url, ResourceBundle resourceBundle) {
        colDescricao.setCellValueFactory(new PropertyValueFactory<>("descricao"));
        colQuantidade.setCellValueFactory(new PropertyValueFactory<>("quantidade"));
        colValor.setCellValueFactory(new PropertyValueFactory<>("valorUnitario"));
        colTotal.setCellValueFactory(new PropertyValueFactory<>("valorTotal"));

        colPecaDescricao.setCellValueFactory(new PropertyValueFactory<>("descricao"));
        colPecaQuantidade.setCellValueFactory(new PropertyValueFactory<>("quantidade"));
        colPecaValor.setCellValueFactory(new PropertyValueFactory<>("valorUnitario"));
        colPecaTotal.setCellValueFactory(new PropertyValueFactory<>("valorTotal"));
    }

    /**
     * Carrega o pedido na tela.
     *
     * @param pedido     pedido já com cliente, serviços e peças carregados
     * @param onAlterado callback executado quando o pedido é editado ou removido
     */
    public void carregar(PedidoModel pedido, Runnable onAlterado) {
        this.pedido = pedido;
        this.onAlterado = onAlterado;
        atualizarTela();
    }

    private void atualizarTela() {
        lblTitulo.setText("Pedido #" + (pedido.getId() != null ? pedido.getId() : ""));
        lblCliente.setText("Cliente: " + nomeCliente());
        lblCabecote.setText("Cabeçote: " + nomeCabecote());
        lblData.setText("Criado em: " + (pedido.getDatCriacao() != null
                ? pedido.getDatCriacao().format(DATA_FORMAT) : "-"));
        lblEntregaEstimada.setText("Entrega estimada: " + (pedido.getDatEntregaEstimada() != null
                ? pedido.getDatEntregaEstimada().format(DIA_FORMAT) : "-"));

        if (pedido.isFinalizado()) {
            lblEntrega.setText("Situação: Entregue em " + pedido.getDatEntrega().format(DATA_FORMAT));
            btnFinalizar.setText("Pedido finalizado");
            btnFinalizar.setDisable(true);
        } else {
            lblEntrega.setText("Situação: Em aberto");
            btnFinalizar.setText("Finalizar pedido");
            btnFinalizar.setDisable(false);
        }

        tblServicos.setItems(FXCollections.observableArrayList(pedido.getServicoList()));
        tblPecas.setItems(FXCollections.observableArrayList(pedido.getPecaList()));
        lblTotal.setText("Total: R$ " + calcularTotal().toPlainString());
    }

    private String nomeCliente() {
        return pedido.getCliente() != null && pedido.getCliente().getNome() != null
                ? pedido.getCliente().getNome() : "-";
    }

    private String nomeCabecote() {
        if (!pedido.getComponentes().isEmpty()) {
            return pedido.getComponentes().get(0).getNome();
        }
        return pedido.getPedido() != null ? pedido.getPedido() : "-";
    }

    private BigDecimal calcularTotal() {
        BigDecimal total = BigDecimal.ZERO;
        for (ServicoModel servico : pedido.getServicoList()) {
            total = total.add(servico.getValorTotal());
        }
        for (PecaModel peca : pedido.getPecaList()) {
            total = total.add(peca.getValorTotal());
        }
        return total;
    }

    @FXML
    private void finalizar(ActionEvent event) {
        if (pedido.isFinalizado()) {
            alerta(Alert.AlertType.INFORMATION, "Este pedido já foi finalizado.");
            return;
        }

        Alert confirmacao = new Alert(Alert.AlertType.CONFIRMATION,
                "Finalizar o pedido #" + pedido.getId() + "? A data de entrega será registrada agora.",
                ButtonType.YES, ButtonType.NO);
        confirmacao.setHeaderText(null);
        confirmacao.showAndWait();

        if (confirmacao.getResult() != ButtonType.YES) {
            return;
        }

        try {
            pedido.setDatEntrega(LocalDateTime.now());
            this.pedido = pedidoRepository.salvar(pedido);
            // Recarrega com itens para manter a tela consistente após o merge.
            PedidoModel atualizado = pedidoRepository.buscarComItens(pedido.getId());
            if (atualizado != null) {
                this.pedido = atualizado;
            }
            atualizarTela();
            if (onAlterado != null) {
                onAlterado.run();
            }
        } catch (RuntimeException e) {
            e.printStackTrace();
            alerta(Alert.AlertType.ERROR, "Erro ao finalizar o pedido: " + e.getMessage());
        }
    }

    @FXML
    private void editar(ActionEvent event) {
        try {
            FXMLLoader loader = new FXMLLoader(getClass().getResource("/views/CadastroPedido.fxml"));
            Parent root = loader.load();
            CadastroPedidoController controller = loader.getController();
            controller.carregarParaEdicao(pedido);
            controller.setOnSalvo(() -> {
                if (onAlterado != null) {
                    onAlterado.run();
                }
                PedidoModel atualizado = pedidoRepository.buscarComItens(pedido.getId());
                if (atualizado != null) {
                    this.pedido = atualizado;
                    atualizarTela();
                }
            });

            Stage stage = new Stage();
            stage.setTitle("Editar pedido #" + pedido.getId());
            stage.setScene(new Scene(root));
            stage.show();
        } catch (Exception e) {
            e.printStackTrace();
            alerta(Alert.AlertType.ERROR, "Não foi possível abrir a edição: " + e.getMessage());
        }
    }

    @FXML
    private void deletar(ActionEvent event) {
        Alert confirmacao = new Alert(Alert.AlertType.CONFIRMATION,
                "Deseja realmente deletar o pedido #" + pedido.getId() + "?",
                ButtonType.YES, ButtonType.NO);
        confirmacao.setHeaderText(null);
        confirmacao.showAndWait();

        if (confirmacao.getResult() == ButtonType.YES) {
            try {
                pedidoRepository.deletar(pedido.getId());
                if (onAlterado != null) {
                    onAlterado.run();
                }
                fechar(event);
            } catch (RuntimeException e) {
                e.printStackTrace();
                alerta(Alert.AlertType.ERROR, "Erro ao deletar: " + e.getMessage());
            }
        }
    }

    @FXML
    private void gerarPdf(ActionEvent event) {
        FileChooser chooser = new FileChooser();
        chooser.setTitle("Salvar PDF do pedido");
        chooser.setInitialFileName("pedido-" + pedido.getId() + ".pdf");
        chooser.getExtensionFilters().add(new FileChooser.ExtensionFilter("PDF", "*.pdf"));

        Stage stage = (Stage) ((Node) event.getSource()).getScene().getWindow();
        File destino = chooser.showSaveDialog(stage);
        if (destino == null) {
            return;
        }

        try {
            pedidoPdfService.gerar(pedido, destino);
            abrirArquivo(destino);
        } catch (RuntimeException e) {
            e.printStackTrace();
            alerta(Alert.AlertType.ERROR, "Erro ao gerar o PDF: " + e.getMessage());
        }
    }

    private void abrirArquivo(File arquivo) {
        try {
            if (Desktop.isDesktopSupported()) {
                Desktop.getDesktop().open(arquivo);
            }
        } catch (Exception ignored) {
            // Abrir o arquivo é opcional; o PDF já foi salvo.
        }
    }

    @FXML
    private void fechar(ActionEvent event) {
        ((Stage) ((Node) event.getSource()).getScene().getWindow()).close();
    }

    private void alerta(Alert.AlertType tipo, String mensagem) {
        Alert alert = new Alert(tipo, mensagem, ButtonType.OK);
        alert.setHeaderText(null);
        alert.showAndWait();
    }
}
