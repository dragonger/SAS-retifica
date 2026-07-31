package org.example.controller;

import javafx.event.ActionEvent;
import javafx.fxml.FXML;
import javafx.fxml.FXMLLoader;
import javafx.fxml.Initializable;
import javafx.scene.Parent;
import javafx.scene.Scene;
import javafx.scene.control.*;
import javafx.stage.Stage;
import org.example.model.PedidoModel;
import org.example.repository.PedidoRepository;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.net.URL;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.ResourceBundle;

/**
 * Aba de pedidos encerrados (finalizados), agrupados por mês de entrega.
 * A árvore tem um nó por mês; os filhos são os pedidos daquele mês.
 */
public class EncerradosController implements Initializable {

    private static final Locale PT_BR = new Locale("pt", "BR");
    private static final DateTimeFormatter MES_FORMAT = DateTimeFormatter.ofPattern("MMMM 'de' yyyy", PT_BR);
    private static final DateTimeFormatter DIA_FORMAT = DateTimeFormatter.ofPattern("dd/MM/yyyy");

    @FXML
    private TreeView<Object> treePedidos;

    private final PedidoRepository pedidoRepository = new PedidoRepository();

    @Override
    public void initialize(URL url, ResourceBundle resourceBundle) {
        treePedidos.setShowRoot(false);
        treePedidos.setCellFactory(tv -> new TreeCell<>() {
            @Override
            protected void updateItem(Object item, boolean empty) {
                super.updateItem(item, empty);
                if (empty || item == null) {
                    setText(null);
                } else if (item instanceof PedidoModel pedido) {
                    setText(textoPedido(pedido));
                } else {
                    setText(item.toString());
                }
            }
        });

        // Duplo-clique num pedido abre a visualização.
        treePedidos.setOnMouseClicked(event -> {
            if (event.getClickCount() == 2) {
                TreeItem<Object> selecionado = treePedidos.getSelectionModel().getSelectedItem();
                if (selecionado != null && selecionado.getValue() instanceof PedidoModel pedido) {
                    abrirVisualizacao(pedido);
                }
            }
        });

        recarregar();
    }

    @FXML
    private void atualizar(ActionEvent event) {
        recarregar();
    }

    public void recarregar() {
        TreeItem<Object> raiz = new TreeItem<>("root");
        try {
            Map<YearMonth, List<PedidoModel>> porMes = new LinkedHashMap<>();
            for (PedidoModel pedido : pedidoRepository.listarEncerrados()) {
                YearMonth mes = YearMonth.from(pedido.getDatEntrega());
                porMes.computeIfAbsent(mes, k -> new ArrayList<>()).add(pedido);
            }

            for (Map.Entry<YearMonth, List<PedidoModel>> entrada : porMes.entrySet()) {
                List<PedidoModel> pedidos = entrada.getValue();
                BigDecimal totalMes = BigDecimal.ZERO;
                for (PedidoModel p : pedidos) {
                    totalMes = totalMes.add(p.getTotalGeral() != null ? p.getTotalGeral() : BigDecimal.ZERO);
                }
                String rotulo = capitalizar(entrada.getKey().format(MES_FORMAT))
                        + "   —   " + pedidos.size() + " pedido(s)   —   Total " + moeda(totalMes);

                TreeItem<Object> noMes = new TreeItem<>(rotulo);
                for (PedidoModel p : pedidos) {
                    noMes.getChildren().add(new TreeItem<>(p));
                }
                noMes.setExpanded(true);
                raiz.getChildren().add(noMes);
            }
        } catch (RuntimeException e) {
            System.err.println("Falha ao carregar pedidos encerrados: " + e.getMessage());
            e.printStackTrace();
        }
        treePedidos.setRoot(raiz);
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
            controller.carregar(completo, this::recarregar);

            Stage stage = new Stage();
            stage.setTitle("Pedido #" + item.getId());
            stage.setScene(new Scene(root));
            stage.show();
        } catch (Exception e) {
            e.printStackTrace();
            Alert alert = new Alert(Alert.AlertType.ERROR,
                    "Não foi possível abrir o pedido: " + e.getMessage(), ButtonType.OK);
            alert.setHeaderText(null);
            alert.showAndWait();
        }
    }

    private String textoPedido(PedidoModel pedido) {
        String cliente = pedido.getCliente() != null && pedido.getCliente().getNome() != null
                ? pedido.getCliente().getNome() : "-";
        String cabecote = !pedido.getComponentes().isEmpty()
                ? pedido.getComponentes().get(0).getNome()
                : (pedido.getPedido() != null ? pedido.getPedido() : "-");
        String entrega = pedido.getDatEntrega() != null
                ? pedido.getDatEntrega().toLocalDate().format(DIA_FORMAT) : "-";
        return "#" + pedido.getId() + "   " + cliente + "   •   " + cabecote
                + "   •   Entregue " + entrega + "   •   " + moeda(pedido.getTotalGeral());
    }

    private String capitalizar(String texto) {
        if (texto == null || texto.isEmpty()) {
            return texto;
        }
        return Character.toUpperCase(texto.charAt(0)) + texto.substring(1);
    }

    private String moeda(BigDecimal valor) {
        BigDecimal v = valor != null ? valor : BigDecimal.ZERO;
        return "R$ " + v.setScale(2, RoundingMode.HALF_UP).toPlainString().replace('.', ',');
    }
}
