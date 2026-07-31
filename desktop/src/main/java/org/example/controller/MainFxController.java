package org.example.controller;

import javafx.beans.property.SimpleObjectProperty;
import javafx.collections.FXCollections;
import javafx.collections.ObservableList;
import javafx.event.ActionEvent;
import javafx.fxml.FXML;
import javafx.fxml.FXMLLoader;
import javafx.fxml.Initializable;
import javafx.scene.Parent;
import javafx.scene.Scene;
import javafx.scene.control.*;
import javafx.scene.layout.BorderPane;
import javafx.stage.Stage;
import javafx.stage.FileChooser;
import org.example.model.ClienteModel;
import org.example.model.PedidoModel;
import org.example.repository.PedidoRepository;
import org.example.service.PedidoPdfService;

import java.awt.Desktop;
import java.io.File;
import java.net.URL;
import java.time.format.DateTimeFormatter;
import java.util.ResourceBundle;


public class MainFxController implements Initializable {

    @FXML
    private BorderPane telaPedidos;
    @FXML
    private TableView<PedidoModel> tblPedidos;
    @FXML
    private TableColumn<PedidoModel, String> colPedido;
    @FXML
    private TableColumn<PedidoModel, String> colCliente;
    @FXML
    private TableColumn<PedidoModel, String> colDataEntrega;
    @FXML
    private TableColumn<PedidoModel, String> colSituacao;

    private static final DateTimeFormatter DIA_FORMAT = DateTimeFormatter.ofPattern("dd/MM/yyyy");

    private final PedidoRepository pedidoRepository = new PedidoRepository();
    private final PedidoPdfService pedidoPdfService = new PedidoPdfService();

    @Override
    public void initialize(URL url, ResourceBundle resourceBundle) {
        colPedido.setCellValueFactory(cellData -> {
            PedidoModel pedido = cellData.getValue();
            String texto = !pedido.getComponentes().isEmpty()
                    ? pedido.getComponentes().get(0).getNome()
                    : (pedido.getPedido() != null ? pedido.getPedido() : "");
            return new SimpleObjectProperty<>(texto);
        });
        colCliente.setCellValueFactory(cellData -> {
            PedidoModel pedido = cellData.getValue();
            String nomeCliente = pedido.getCliente() != null ? pedido.getCliente().getNome() : "";
            return new SimpleObjectProperty<>(nomeCliente);
        });
        // Mostra a data de entrega real se finalizado, senão a estimada.
        colDataEntrega.setCellValueFactory(cellData -> {
            PedidoModel pedido = cellData.getValue();
            String texto = "-";
            if (pedido.getDatEntrega() != null) {
                texto = pedido.getDatEntrega().toLocalDate().format(DIA_FORMAT);
            } else if (pedido.getDatEntregaEstimada() != null) {
                texto = pedido.getDatEntregaEstimada().format(DIA_FORMAT);
            }
            return new SimpleObjectProperty<>(texto);
        });
        colSituacao.setCellValueFactory(cellData ->
                new SimpleObjectProperty<>(cellData.getValue().isFinalizado() ? "Entregue" : "Em aberto"));

        // Duplo-clique numa linha abre a visualização do pedido.
        tblPedidos.setRowFactory(tv -> {
            TableRow<PedidoModel> row = new TableRow<>();
            row.setOnMouseClicked(event -> {
                if (event.getClickCount() == 2 && !row.isEmpty()) {
                    abrirVisualizacao(row.getItem());
                }
            });
            return row;
        });

        tblPedidos.setItems(carregaPedidos());
    }

    /**
     * Carrega os pedidos do banco. Se o banco estiver vazio, cria dados iniciais;
     * se a persistência falhar por qualquer motivo, cai no mock em memória para que
     * a tela continue funcional.
     */
    private ObservableList<PedidoModel> carregaPedidos() {
        try {
            if (pedidoRepository.contar() == 0) {
                semeiaDadosIniciais();
            }
            return FXCollections.observableArrayList(pedidoRepository.listarTodos());
        } catch (RuntimeException e) {
            System.err.println("Falha ao acessar o banco, usando dados em memória: " + e.getMessage());
            e.printStackTrace();
            return criaMockPedidos();
        }
    }

    private void semeiaDadosIniciais() {
        ClienteModel cliente = new ClienteModel();
        cliente.setNome("José do cabeçote 69");

        PedidoModel pedido = new PedidoModel();
        pedido.setPedido("Retífica de cabeçote");
        pedido.setCliente(cliente);

        pedidoRepository.salvar(pedido);
    }

    private ObservableList<PedidoModel> criaMockPedidos() {
        ClienteModel clienteModel = new ClienteModel();
        clienteModel.setNome("José do cabeçote 69");

        PedidoModel pedidoModel = new PedidoModel();
        pedidoModel.setId(1L);
        pedidoModel.setPedido("Retífica de cabeçote");
        pedidoModel.setCliente(clienteModel);

        return FXCollections.observableArrayList(pedidoModel);
    }

    public void criarPedido(ActionEvent actionEvent) {
        try {
            FXMLLoader loader = new FXMLLoader(getClass().getResource("/views/CadastroPedido.fxml"));
            Parent root = loader.load();
            CadastroPedidoController controller = loader.getController();
            controller.setOnSalvo(this::atualizarTabela);

            Stage stage = new Stage();
            stage.setTitle("Novo pedido");
            stage.setScene(new Scene(root));
            stage.show();
        } catch (Exception e) {
            e.printStackTrace();
            mostrarErro("Não foi possível abrir o cadastro: " + e.getMessage());
        }
    }

    private void abrirVisualizacao(PedidoModel item) {
        try {
            PedidoModel completo = pedidoRepository.buscarComItens(item.getId());
            if (completo == null) {
                completo = item;
            }

            FXMLLoader loader = new FXMLLoader(getClass().getResource("/views/VisualizarPedido.fxml"));
            Parent root = loader.load();
            VisualizarPedidoController controller = loader.getController();
            controller.carregar(completo, this::atualizarTabela);

            Stage stage = new Stage();
            stage.setTitle("Pedido #" + item.getId());
            stage.setScene(new Scene(root));
            stage.show();
        } catch (Exception e) {
            e.printStackTrace();
            mostrarErro("Não foi possível abrir o pedido: " + e.getMessage());
        }
    }

    public void gerarPdf(ActionEvent actionEvent) {
        PedidoModel selecionado = tblPedidos.getSelectionModel().getSelectedItem();
        if (selecionado == null) {
            mostrarInfo("Selecione um pedido na lista para gerar o PDF.");
            return;
        }

        PedidoModel completo = pedidoRepository.buscarComItens(selecionado.getId());
        if (completo == null) {
            completo = selecionado;
        }

        FileChooser chooser = new FileChooser();
        chooser.setTitle("Salvar PDF do pedido");
        chooser.setInitialFileName("pedido-" + completo.getId() + ".pdf");
        chooser.getExtensionFilters().add(new FileChooser.ExtensionFilter("PDF", "*.pdf"));

        File destino = chooser.showSaveDialog(tblPedidos.getScene().getWindow());
        if (destino == null) {
            return;
        }

        try {
            pedidoPdfService.gerar(completo, destino);
            abrirArquivo(destino);
        } catch (RuntimeException e) {
            e.printStackTrace();
            mostrarErro("Erro ao gerar o PDF: " + e.getMessage());
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

    /**
     * Recarrega a tabela a partir do banco. Útil após criar/editar/deletar pedidos.
     */
    public void atualizarTabela() {
        tblPedidos.setItems(carregaPedidos());
    }

    private void mostrarErro(String mensagem) {
        alerta(Alert.AlertType.ERROR, mensagem);
    }

    private void mostrarInfo(String mensagem) {
        alerta(Alert.AlertType.INFORMATION, mensagem);
    }

    private void alerta(Alert.AlertType tipo, String mensagem) {
        Alert alert = new Alert(tipo, mensagem, ButtonType.OK);
        alert.setHeaderText(null);
        alert.showAndWait();
    }
}
