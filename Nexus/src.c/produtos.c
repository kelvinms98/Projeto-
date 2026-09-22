#include <stdio.h>
#include <string.h>
#include "produtos.h"
#include "../include/conexao.h"

void cadastrarProdutosIniciais(void) {
    // Os produtos já são inseridos via script SQL no banco, 
    // então esta função pode ficar vazia ou apenas validar a conexão.
}

void listarProdutos(void) {
    MYSQL *conn = conectarBanco();
    if (conn == NULL) return;

    if (mysql_query(conn, "SELECT id_produto, nome, tamanho, cor, preco, estoque FROM produto")) {
        printf("Erro ao buscar produtos: %s\n", mysql_error(conn));
        mysql_close(conn);
        return;
    }

    MYSQL_RES *result = mysql_store_result(conn);
    if (result == NULL) {
        mysql_close(conn);
        return;
    }

    printf("\n====================================================================\n");
    printf("                     PRODUTOS DO BANCO NEXUS\n");
    printf("====================================================================\n");
    printf("%-5s %-25s %-10s %-10s %-12s %-8s\n",
           "ID", "NOME", "TAMANHO", "COR", "PRECO", "ESTOQUE");
    printf("--------------------------------------------------------------------\n");

    MYSQL_ROW row;
    while ((row = mysql_fetch_row(result))) {
        printf("%-5s %-25s %-10s %-10s R$ %-8s %-8s\n",
               row[0], row[1], row[2], row[3], row[4], row[5]);
    }

    printf("====================================================================\n");

    mysql_free_result(result);
    mysql_close(conn);
}