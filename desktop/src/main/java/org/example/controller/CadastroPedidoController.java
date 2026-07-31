package org.example.controller;

import javafx.collections.FXCollections;
import javafx.collections.ObservableList;
import javafx.event.ActionEvent;
import javafx.fxml.FXML;
import javafx.fxml.Initializable;
import javafx.scene.Node;
import javafx.scene.control.*;
import javafx.scene.control.cell.PropertyValueFactory;
import javafx.scene.control.cell.TextFieldTableCell;
import javafx.scene.layout.GridPane;
import javafx.stage.Stage;
import javafx.util.StringConverter;
import javafx.util.converter.IntegerStringConverter;
import org.example.model.CabecoteModel;
import org.example.model.ClienteModel;
import org.example.model.PecaCatalogoModel;
import org.example.model.PecaModel;
import org.example.model.PedidoModel;
import org.example.model.ServicoCatalogoModel;
import org.example.model.ServicoModel;
import org.example.repository.CabecoteRepository;
import org.example.repository.PecaCatalogoRepository;
import org.example.repository.PedidoRepository;
import org.example.repository.ServicoCatalogoRepository;

import java.math.BigDecimal;
import java.net.URL;
import java.time.LocalDateTime;
import java.util.ResourceBundle;

/**
 * Controller da tela de cadastro/edição de pedido. Coleta os dados do formulário
 * (pedido, cliente, serviços e peças) e persiste via {@link PedidoRepository}.
 */
public class CadastroPedidoController implements Initializable {

    @FXML
    private ComboBox<CabecoteModel> cmbCabecote;
    @FXML
    private TextField fldPedido;
    @FXML
    private DatePicker dtpEntregaEstimada;
    @FXML
    private TextArea fldObservacao;

    @FXML
    private TextField fldNome;
    @FXML
    private TextField fldTelefone;
    @FXML
    private TextField fldRua;
    @FXML
    private TextField fldNumero;
    @FXML
    private TextField fldBairro;
    @FXML
    private TextField fldCep;
    @FXML
    private TextField fldMunicipio;
    @FXML
    private TextField fldUf;

    @FXML
    private ComboBox<ServicoCatalogoModel> cmbServico;
    @FXML
    private TextField fldServQtd;
    @FXML
    private TableView<ServicoModel> tblServicos;
    @FXML
    private TableColumn<ServicoModel, String> colServDescricao;
    @FXML
    private TableColumn<ServicoModel, Integer> colServQtd;
    @FXML
    private TableColumn<ServicoModel, BigDecimal> colServValor;
    @FXML
    private TableColumn<ServicoModel, BigDecimal> colServTotal;

    @FXML
    private ComboBox<PecaCatalogoModel> cmbPeca;
    @FXML
    private TextField fldPecaQtd;
    @FXML
    private TableView<PecaModel> tblPecas;
    @FXML
    private TableColumn<PecaModel, String> colPecaDescricao;
    @FXML
    private TableColumn<PecaModel, Integer> colPecaQtd;
    @FXML
    private TableColumn<PecaModel, BigDecimal> colPecaValor;
    @FXML
    private TableColumn<PecaModel, BigDecimal> colPecaTotal;

    private final ObservableList<ServicoModel> servicos = FXCollections.observableArrayList();
    private final ObservableList<PecaModel> pecas = FXCollections.observableArrayList();
    private final PedidoRepository pedidoRepository = new PedidoRepository();
    private final CabecoteRepository cabecoteRepository = new CabecoteRepository();
    private final ServicoCatalogoRepository servicoCatalogoRepository = new ServicoCatalogoRepository();
    private final PecaCatalogoRepository pecaCatalogoRepository = new PecaCatalogoRepository();

    private Runnable onSalvo;
    private PedidoModel pedidoEmEdicao;

    @Override
    public void initialize(URL url, ResourceBundle resourceBundle) {
        configurarComboCabecote();
        configurarComboServico();
        configurarComboPeca();

        colServDescricao.setCellValueFactory(new PropertyValueFactory<>("descricao"));
        colServQtd.setCellValueFactory(new PropertyValueFactory<>("quantidade"));
        colServValor.setCellValueFactory(new PropertyValueFactory<>("valorUnitario"));
        colServTotal.setCellValueFactory(new PropertyValueFactory<>("valorTotal"));
        // Quantidade editável direto na tabela; ao confirmar, recalcula o total da linha.
        colServQtd.setCellFactory(TextFieldTableCell.forTableColumn(new IntegerStringConverter()));
        colServQtd.setOnEditCommit(evento -> {
            evento.getRowValue().setQuantidade(evento.getNewValue());
            tblServicos.refresh();
        });
        tblServicos.setItems(servicos);

        colPecaDescricao.setCellValueFactory(new PropertyValueFactory<>("descricao"));
        colPecaQtd.setCellValueFactory(new PropertyValueFactory<>("quantidade"));
        colPecaValor.setCellValueFactory(new PropertyValueFactory<>("valorUnitario"));
        colPecaTotal.setCellValueFactory(new PropertyValueFactory<>("valorTotal"));
        colPecaQtd.setCellFactory(TextFieldTableCell.forTableColumn(new IntegerStringConverter()));
        colPecaQtd.setOnEditCommit(evento -> {
            evento.getRowValue().setQuantidade(evento.getNewValue());
            tblPecas.refresh();
        });
        tblPecas.setItems(pecas);
    }

    private void configurarComboCabecote() {
        cmbCabecote.setConverter(new StringConverter<>() {
            @Override
            public String toString(CabecoteModel cabecote) {
                return cabecote == null ? "" : cabecote.toString();
            }

            @Override
            public CabecoteModel fromString(String texto) {
                return null;
            }
        });
        try {
            cmbCabecote.getItems().setAll(cabecoteRepository.listarTodos());
        } catch (RuntimeException e) {
            System.err.println("Falha ao carregar cabeçotes: " + e.getMessage());
            e.printStackTrace();
        }
    }

    private void configurarComboServico() {
        cmbServico.setConverter(new StringConverter<>() {
            @Override
            public String toString(ServicoCatalogoModel servico) {
                return servico == null ? "" : servico.toString();
            }

            @Override
            public ServicoCatalogoModel fromString(String texto) {
                return null;
            }
        });
        try {
            cmbServico.getItems().setAll(servicoCatalogoRepository.listarTodos());
        } catch (RuntimeException e) {
            System.err.println("Falha ao carregar serviços: " + e.getMessage());
            e.printStackTrace();
        }
    }

    private void configurarComboPeca() {
        cmbPeca.setConverter(new StringConverter<>() {
            @Override
            public String toString(PecaCatalogoModel peca) {
                return peca == null ? "" : peca.toString();
            }

            @Override
            public PecaCatalogoModel fromString(String texto) {
                return null;
            }
        });
        try {
            cmbPeca.getItems().setAll(pecaCatalogoRepository.listarTodos());
        } catch (RuntimeException e) {
            System.err.println("Falha ao carregar peças: " + e.getMessage());
            e.printStackTrace();
        }
    }

    /**
     * Define o callback executado após salvar com sucesso (ex.: atualizar a lista).
     */
    public void setOnSalvo(Runnable onSalvo) {
        this.onSalvo = onSalvo;
    }

    /**
     * Preenche o formulário com um pedido existente para edição.
     */
    public void carregarParaEdicao(PedidoModel pedido) {
        this.pedidoEmEdicao = pedido;
        fldPedido.setText(pedido.getPedido());
        fldObservacao.setText(pedido.getObservacao());
        dtpEntregaEstimada.setValue(pedido.getDatEntregaEstimada());
        // Desktop ainda escolhe só um componente por vez (o pedido pode ter
        // mais, cadastrados pela versão web) — ao editar, mostra o primeiro.
        selecionarCabecote(pedido.getComponentes().isEmpty() ? null : pedido.getComponentes().get(0));

        ClienteModel cliente = pedido.getCliente();
        if (cliente != null) {
            fldNome.setText(cliente.getNome());
            fldTelefone.setText(cliente.getTelefone());
            fldRua.setText(cliente.getRua());
            fldNumero.setText(cliente.getNumero());
            fldBairro.setText(cliente.getBairro());
            fldCep.setText(cliente.getCep());
            fldMunicipio.setText(cliente.getMunicipio());
            fldUf.setText(cliente.getUf());
        }

        servicos.setAll(pedido.getServicoList());
        pecas.setAll(pedido.getPecaList());
    }

    /**
     * Seleciona no combo o item que corresponde ao cabeçote do pedido (por id),
     * já que os itens do combo são instâncias carregadas separadamente.
     */
    private void selecionarCabecote(CabecoteModel cabecote) {
        if (cabecote == null || cabecote.getId() == null) {
            return;
        }
        cmbCabecote.getItems().stream()
                .filter(c -> cabecote.getId().equals(c.getId()))
                .findFirst()
                .ifPresent(cmbCabecote::setValue);
    }

    @FXML
    private void adicionarServico(ActionEvent event) {
        ServicoCatalogoModel catalogo = cmbServico.getValue();
        if (catalogo == null) {
            alerta(Alert.AlertType.WARNING, "Selecione um serviço.");
            return;
        }
        try {
            Integer quantidade = parseQuantidade(fldServQtd.getText());
            if (quantidade == null) {
                quantidade = 1;
            }
            ServicoModel servico = new ServicoModel();
            servico.setDescricao(catalogo.getNome());
            servico.setValorUnitario(catalogo.getValor());
            servico.setQuantidade(quantidade);
            servicos.add(servico);
            cmbServico.setValue(null);
            fldServQtd.clear();
        } catch (NumberFormatException e) {
            alerta(Alert.AlertType.ERROR, "A quantidade deve ser numérica.");
        }
    }

    @FXML
    private void novoCabecote(ActionEvent event) {
        Dialog<ButtonType> dialog = new Dialog<>();
        dialog.setTitle("Novo cabeçote");
        dialog.setHeaderText(null);
        dialog.getDialogPane().getButtonTypes().addAll(ButtonType.OK, ButtonType.CANCEL);

        TextField nome = new TextField();
        nome.setPromptText("Nome / Motor");
        TextField movel = new TextField();
        movel.setPromptText("ex.: 25,045-27,070");
        TextField fixo = new TextField();
        fixo.setPromptText("ex.: 29,990-30,015");

        GridPane grid = new GridPane();
        grid.setHgap(10);
        grid.setVgap(10);
        grid.addRow(0, new Label("Nome"), nome);
        grid.addRow(1, new Label("Móvel"), movel);
        grid.addRow(2, new Label("Fixo"), fixo);
        dialog.getDialogPane().setContent(grid);

        dialog.showAndWait();
        if (dialog.getResult() != ButtonType.OK) {
            return;
        }
        String n = textoOuNulo(nome.getText());
        if (n == null) {
            alerta(Alert.AlertType.WARNING, "Informe o nome do cabeçote.");
            return;
        }
        try {
            CabecoteModel cabecote = new CabecoteModel();
            cabecote.setNome(n);
            cabecote.setMovelFaixa(movel.getText());
            cabecote.setFixoFaixa(fixo.getText());
            CabecoteModel salvo = cabecoteRepository.salvar(cabecote);
            cmbCabecote.getItems().setAll(cabecoteRepository.listarTodos());
            selecionarCabecote(salvo);
        } catch (NumberFormatException e) {
            alerta(Alert.AlertType.ERROR, "As medidas devem ser numéricas — valor único ou faixa (ex.: 25,045-27,070).");
        } catch (RuntimeException e) {
            e.printStackTrace();
            alerta(Alert.AlertType.ERROR, "Erro ao salvar o cabeçote: " + e.getMessage());
        }
    }

    @FXML
    private void novoServico(ActionEvent event) {
        Dialog<ButtonType> dialog = new Dialog<>();
        dialog.setTitle("Novo serviço");
        dialog.setHeaderText(null);
        dialog.getDialogPane().getButtonTypes().addAll(ButtonType.OK, ButtonType.CANCEL);

        TextField nome = new TextField();
        nome.setPromptText("Nome");
        TextField valor = new TextField();
        valor.setPromptText("Valor (R$)");

        GridPane grid = new GridPane();
        grid.setHgap(10);
        grid.setVgap(10);
        grid.addRow(0, new Label("Nome"), nome);
        grid.addRow(1, new Label("Valor"), valor);
        dialog.getDialogPane().setContent(grid);

        dialog.showAndWait();
        if (dialog.getResult() != ButtonType.OK) {
            return;
        }
        String n = textoOuNulo(nome.getText());
        if (n == null) {
            alerta(Alert.AlertType.WARNING, "Informe o nome do serviço.");
            return;
        }
        try {
            ServicoCatalogoModel servico = new ServicoCatalogoModel();
            servico.setNome(n);
            servico.setValor(parseValor(valor.getText()));
            ServicoCatalogoModel salvo = servicoCatalogoRepository.salvar(servico);
            cmbServico.getItems().setAll(servicoCatalogoRepository.listarTodos());
            selecionarServicoCatalogo(salvo);
        } catch (NumberFormatException e) {
            alerta(Alert.AlertType.ERROR, "O valor deve ser numérico.");
        } catch (RuntimeException e) {
            e.printStackTrace();
            alerta(Alert.AlertType.ERROR, "Erro ao salvar o serviço: " + e.getMessage());
        }
    }

    private void selecionarServicoCatalogo(ServicoCatalogoModel servico) {
        if (servico == null || servico.getId() == null) {
            return;
        }
        cmbServico.getItems().stream()
                .filter(s -> servico.getId().equals(s.getId()))
                .findFirst()
                .ifPresent(cmbServico::setValue);
    }

    @FXML
    private void removerServico(ActionEvent event) {
        ServicoModel selecionado = tblServicos.getSelectionModel().getSelectedItem();
        if (selecionado != null) {
            servicos.remove(selecionado);
        }
    }

    @FXML
    private void adicionarPeca(ActionEvent event) {
        PecaCatalogoModel catalogo = cmbPeca.getValue();
        if (catalogo == null) {
            alerta(Alert.AlertType.WARNING, "Selecione uma peça.");
            return;
        }
        try {
            Integer quantidade = parseQuantidade(fldPecaQtd.getText());
            if (quantidade == null) {
                quantidade = 1;
            }
            PecaModel peca = new PecaModel();
            peca.setDescricao(catalogo.getNome());
            peca.setValorUnitario(catalogo.getValor());
            peca.setQuantidade(quantidade);
            pecas.add(peca);
            cmbPeca.setValue(null);
            fldPecaQtd.clear();
        } catch (NumberFormatException e) {
            alerta(Alert.AlertType.ERROR, "A quantidade deve ser numérica.");
        }
    }

    @FXML
    private void novoPeca(ActionEvent event) {
        Dialog<ButtonType> dialog = new Dialog<>();
        dialog.setTitle("Nova peça");
        dialog.setHeaderText(null);
        dialog.getDialogPane().getButtonTypes().addAll(ButtonType.OK, ButtonType.CANCEL);

        TextField nome = new TextField();
        nome.setPromptText("Nome");
        TextField valor = new TextField();
        valor.setPromptText("Preço (R$)");

        GridPane grid = new GridPane();
        grid.setHgap(10);
        grid.setVgap(10);
        grid.addRow(0, new Label("Nome"), nome);
        grid.addRow(1, new Label("Preço"), valor);
        dialog.getDialogPane().setContent(grid);

        dialog.showAndWait();
        if (dialog.getResult() != ButtonType.OK) {
            return;
        }
        String n = textoOuNulo(nome.getText());
        if (n == null) {
            alerta(Alert.AlertType.WARNING, "Informe o nome da peça.");
            return;
        }
        try {
            PecaCatalogoModel peca = new PecaCatalogoModel();
            peca.setNome(n);
            peca.setValor(parseValor(valor.getText()));
            PecaCatalogoModel salvo = pecaCatalogoRepository.salvar(peca);
            cmbPeca.getItems().setAll(pecaCatalogoRepository.listarTodos());
            selecionarPecaCatalogo(salvo);
        } catch (NumberFormatException e) {
            alerta(Alert.AlertType.ERROR, "O preço deve ser numérico.");
        } catch (RuntimeException e) {
            e.printStackTrace();
            alerta(Alert.AlertType.ERROR, "Erro ao salvar a peça: " + e.getMessage());
        }
    }

    private void selecionarPecaCatalogo(PecaCatalogoModel peca) {
        if (peca == null || peca.getId() == null) {
            return;
        }
        cmbPeca.getItems().stream()
                .filter(p -> peca.getId().equals(p.getId()))
                .findFirst()
                .ifPresent(cmbPeca::setValue);
    }

    @FXML
    private void removerPeca(ActionEvent event) {
        PecaModel selecionado = tblPecas.getSelectionModel().getSelectedItem();
        if (selecionado != null) {
            pecas.remove(selecionado);
        }
    }

    @FXML
    private void salvar(ActionEvent event) {
        String nome = textoOuNulo(fldNome.getText());
        String descricaoPedido = textoOuNulo(fldPedido.getText());
        CabecoteModel cabecote = cmbCabecote.getValue();
        if (cabecote == null && descricaoPedido == null) {
            alerta(Alert.AlertType.WARNING, "Selecione um cabeçote ou informe a descrição do pedido.");
            return;
        }
        if (nome == null) {
            alerta(Alert.AlertType.WARNING, "Informe o nome do cliente.");
            return;
        }

        try {
            PedidoModel pedido = pedidoEmEdicao != null ? pedidoEmEdicao : new PedidoModel();
            pedido.getComponentes().clear();
            if (cabecote != null) {
                pedido.getComponentes().add(cabecote);
            }
            pedido.setPedido(descricaoPedido);
            pedido.setObservacao(textoOuNulo(fldObservacao.getText()));
            pedido.setDatEntregaEstimada(dtpEntregaEstimada.getValue());
            if (pedido.getDatCriacao() == null) {
                pedido.setDatCriacao(LocalDateTime.now());
            }

            ClienteModel cliente = pedido.getCliente() != null ? pedido.getCliente() : new ClienteModel();
            cliente.setNome(nome);
            cliente.setTelefone(textoOuNulo(fldTelefone.getText()));
            cliente.setRua(textoOuNulo(fldRua.getText()));
            cliente.setNumero(textoOuNulo(fldNumero.getText()));
            cliente.setBairro(textoOuNulo(fldBairro.getText()));
            cliente.setCep(textoOuNulo(fldCep.getText()));
            cliente.setMunicipio(textoOuNulo(fldMunicipio.getText()));
            cliente.setUf(textoOuNulo(fldUf.getText()));
            pedido.setCliente(cliente);

            // Sincroniza as coleções mantendo os dois lados do relacionamento.
            pedido.getServicoList().clear();
            servicos.forEach(pedido::addServico);
            pedido.getPecaList().clear();
            pecas.forEach(pedido::addPeca);

            pedido.setTotalGeral(calcularTotal());

            pedidoRepository.salvar(pedido);

            if (onSalvo != null) {
                onSalvo.run();
            }
            fechar(event);
        } catch (RuntimeException e) {
            e.printStackTrace();
            alerta(Alert.AlertType.ERROR, "Erro ao salvar o pedido: " + e.getMessage());
        }
    }

    @FXML
    private void cancelar(ActionEvent event) {
        fechar(event);
    }

    private BigDecimal calcularTotal() {
        BigDecimal total = BigDecimal.ZERO;
        for (ServicoModel servico : servicos) {
            total = total.add(servico.getValorTotal());
        }
        for (PecaModel peca : pecas) {
            total = total.add(peca.getValorTotal());
        }
        return total;
    }

    private Integer parseQuantidade(String texto) {
        String t = textoOuNulo(texto);
        return t == null ? null : Integer.valueOf(t);
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

    private void fechar(ActionEvent event) {
        ((Stage) ((Node) event.getSource()).getScene().getWindow()).close();
    }
}
