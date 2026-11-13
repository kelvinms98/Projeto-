#include <stdio.h>
#include <string.h>
#include "../include/vendas.h"

void realizarVenda(Produto produtos[], int totalProdutos,
                   Funcionario *vendedor,
                   Venda vendas[], int *totalVendas) {

    if (*totalVendas >= MAX_VENDAS) {
        printf("\nLimite de vendas atingido!\n");
        return;
    }

    if (totalProdutos <= 0) {
        printf("\nNenhum produto cadastrado!\n");
        return;
    }

    printf("\n====================================================================\n");
    printf("                         NOVA VENDA\n");
    printf("====================================================================\n");
    printf("%-5s %-25s %-15s %-12s %-8s\n",
           "ID", "PRODUTO", "CATEGORIA", "PRECO", "ESTOQUE");
    printf("--------------------------------------------------------------------\n");

    for (int i = 0; i < totalProdutos; i++) {
        printf("%-5d %-25s %-15s R$ %-8.2f %-8d\n",
               produtos[i].id,
               produtos[i].nome,
               produtos[i].categoria,
               produtos[i].preco,
               produtos[i].quantidade);
    }

    int id;
    int quantidade;
    int indice = -1;

    printf("\nDigite o ID do produto: ");
    scanf("%d", &id);

    for (int i = 0; i < totalProdutos; i++) {
        if (produtos[i].id == id) {
            indice = i;
            break;
        }
    }

    if (indice == -1) {
        printf("\nProduto nao encontrado!\n");
        return;
    }

    if (produtos[indice].quantidade <= 0) {
        printf("\nProduto sem estoque!\n");
        return;
    }

    printf("Quantidade: ");
    scanf("%d", &quantidade);

    if (quantidade <= 0) {
        printf("\nQuantidade invalida!\n");
        return;
    }

    if (quantidade > produtos[indice].quantidade) {
        printf("\nEstoque insuficiente! Disponivel: %d\n",
               produtos[indice].quantidade);
        return;
    }

    float total = produtos[indice].preco * quantidade;
    float comissao = total * vendedor->percentualComissao / 100.0f;

    produtos[indice].quantidade -= quantidade;

    vendedor->totalVendido += total;
    vendedor->totalComissao += comissao;

    Venda nova;

    nova.codigoVenda = *totalVendas + 1;
    nova.idProduto = produtos[indice].id;
    strcpy(nova.produto, produtos[indice].nome);
    strcpy(nova.categoria, produtos[indice].categoria);
    nova.quantidade = quantidade;
    nova.valorUnitario = produtos[indice].preco;
    nova.valorTotal = total;
    nova.comissao = comissao;
    strcpy(nova.vendedorEmail, vendedor->email);

    vendas[*totalVendas] = nova;
    (*totalVendas)++;

    printf("\n============================================\n");
    printf("             VENDA REALIZADA\n");
    printf("============================================\n");
    printf("Venda: #%d\n", nova.codigoVenda);
    printf("Vendedor: %s\n", nova.vendedorEmail);
    printf("Produto: %s\n", nova.produto);
    printf("Quantidade: %d\n", nova.quantidade);
    printf("Valor unitario: R$ %.2f\n", nova.valorUnitario);
    printf("Valor total: R$ %.2f\n", nova.valorTotal);
    printf("Comissao: R$ %.2f\n", nova.comissao);
    printf("Estoque restante: %d\n", produtos[indice].quantidade);
    printf("============================================\n");
}

void listarMinhasVendas(Venda vendas[], int totalVendas,
                        const char vendedorEmail[]) {

    int encontrou = 0;
    float total = 0.0f;

    printf("\n============================================\n");
    printf("              MINHAS VENDAS\n");
    printf("============================================\n");

    for (int i = 0; i < totalVendas; i++) {
        if (strcmp(vendas[i].vendedorEmail, vendedorEmail) == 0) {
            encontrou = 1;

            printf("\nVenda #%d\n", vendas[i].codigoVenda);
            printf("Produto: %s\n", vendas[i].produto);
            printf("Quantidade: %d\n", vendas[i].quantidade);
            printf("Total: R$ %.2f\n", vendas[i].valorTotal);
            printf("Comissao: R$ %.2f\n", vendas[i].comissao);
            printf("--------------------------------------------\n");

            total += vendas[i].valorTotal;
        }
    }

    if (!encontrou) {
        printf("\nNenhuma venda encontrada.\n");
    } else {
        printf("\nTotal vendido nesta sessao: R$ %.2f\n", total);
    }
}

void mostrarMinhasComissoes(Funcionario *vendedor) {
    printf("\n============================================\n");
    printf("             MINHAS COMISSOES\n");
    printf("============================================\n");
    printf("Vendedor: %s\n", vendedor->email);
    printf("Percentual: %.2f%%\n", vendedor->percentualComissao);
    printf("Total vendido: R$ %.2f\n", vendedor->totalVendido);
    printf("Comissao acumulada: R$ %.2f\n", vendedor->totalComissao);
    printf("============================================\n");
}

void relatorioVendas(Venda vendas[], int totalVendas) {
    if (totalVendas == 0) {
        printf("\nNenhuma venda registrada.\n");
        return;
    }

    float faturamento = 0.0f;
    float comissoes = 0.0f;

    printf("\n============================================================\n");
    printf("                  RELATORIO DE VENDAS\n");
    printf("============================================================\n");

    for (int i = 0; i < totalVendas; i++) {
        printf("\nVenda #%d\n", vendas[i].codigoVenda);
        printf("Vendedor: %s\n", vendas[i].vendedorEmail);
        printf("Produto: %s\n", vendas[i].produto);
        printf("Quantidade: %d\n", vendas[i].quantidade);
        printf("Valor: R$ %.2f\n", vendas[i].valorTotal);
        printf("Comissao: R$ %.2f\n", vendas[i].comissao);
        printf("------------------------------------------------------------\n");

        faturamento += vendas[i].valorTotal;
        comissoes += vendas[i].comissao;
    }

    printf("\nFATURAMENTO TOTAL: R$ %.2f\n", faturamento);
    printf("TOTAL EM COMISSOES: R$ %.2f\n", comissoes);
    printf("TOTAL DE VENDAS: %d\n", totalVendas);
}
