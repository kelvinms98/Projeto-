
#include <stdio.h>
#include <string.h>
#include "produtos.h"
#include "../include/conexao.h"

void cadastrarProdutosIniciais(void) {
    MYSQL *conn = conectarBanco();
    if (conn == NULL) return;

    const char *sql =
        "INSERT INTO produto (nome, tamanho, cor, preco, estoque) "

        "SELECT 'NEXUS NEYMAR JR. 100% CORRE PAULISTAO 2012', 'P', 'Unica', 249.00, 100 "
        "WHERE NOT EXISTS (SELECT 1 FROM produto WHERE nome='NEXUS NEYMAR JR. 100% CORRE PAULISTAO 2012' AND tamanho='P' AND cor='Unica') "

        "UNION ALL SELECT 'NEXUS NEYMAR JR. 100% CORRE PAULISTAO 2012', 'M', 'Unica', 249.00, 100 "
        "WHERE NOT EXISTS (SELECT 1 FROM produto WHERE nome='NEXUS NEYMAR JR. 100% CORRE PAULISTAO 2012' AND tamanho='M' AND cor='Unica') "

        "UNION ALL SELECT 'NEXUS NEYMAR JR. 100% CORRE PAULISTAO 2012', 'G', 'Unica', 249.00, 100 "
        "WHERE NOT EXISTS (SELECT 1 FROM produto WHERE nome='NEXUS NEYMAR JR. 100% CORRE PAULISTAO 2012' AND tamanho='G' AND cor='Unica') "

        "UNION ALL SELECT 'NEXUS NEYMAR JR. 100% CORRE PAULISTAO 2012', 'GG', 'Unica', 249.00, 100 "
        "WHERE NOT EXISTS (SELECT 1 FROM produto WHERE nome='NEXUS NEYMAR JR. 100% CORRE PAULISTAO 2012' AND tamanho='GG' AND cor='Unica') "

        "UNION ALL SELECT 'NEXUS WASTED FUR HOODIE', 'P', 'Unica', 189.00, 100 "
        "WHERE NOT EXISTS (SELECT 1 FROM produto WHERE nome='NEXUS WASTED FUR HOODIE' AND tamanho='P' AND cor='Unica') "

        "UNION ALL SELECT 'NEXUS WASTED FUR HOODIE', 'M', 'Unica', 189.00, 100 "
        "WHERE NOT EXISTS (SELECT 1 FROM produto WHERE nome='NEXUS WASTED FUR HOODIE' AND tamanho='M' AND cor='Unica') "

        "UNION ALL SELECT 'NEXUS WASTED FUR HOODIE', 'G', 'Unica', 189.00, 100 "
        "WHERE NOT EXISTS (SELECT 1 FROM produto WHERE nome='NEXUS WASTED FUR HOODIE' AND tamanho='G' AND cor='Unica') "

        "UNION ALL SELECT 'NEXUS WASTED FUR HOODIE', 'GG', 'Unica', 189.00, 100 "
        "WHERE NOT EXISTS (SELECT 1 FROM produto WHERE nome='NEXUS WASTED FUR HOODIE' AND tamanho='GG' AND cor='Unica') "

        "UNION ALL SELECT '5-PANEL PIET - OLIVE MINIMAL', 'Unico', 'Olive Minimal', 219.00, 100 "
        "WHERE NOT EXISTS (SELECT 1 FROM produto WHERE nome='5-PANEL PIET - OLIVE MINIMAL' AND tamanho='Unico' AND cor='Olive Minimal') "

        "UNION ALL SELECT 'NEXUS PATCHWORK BAGGY', '38', 'Unica', 329.00, 100 "
        "WHERE NOT EXISTS (SELECT 1 FROM produto WHERE nome='NEXUS PATCHWORK BAGGY' AND tamanho='38' AND cor='Unica') "

        "UNION ALL SELECT 'NEXUS PATCHWORK BAGGY', '40', 'Unica', 329.00, 100 "
        "WHERE NOT EXISTS (SELECT 1 FROM produto WHERE nome='NEXUS PATCHWORK BAGGY' AND tamanho='40' AND cor='Unica') "

        "UNION ALL SELECT 'NEXUS PATCHWORK BAGGY', '42', 'Unica', 329.00, 100 "
        "WHERE NOT EXISTS (SELECT 1 FROM produto WHERE nome='NEXUS PATCHWORK BAGGY' AND tamanho='42' AND cor='Unica') "

        "UNION ALL SELECT 'NEXUS PATCHWORK BAGGY', '44', 'Unica', 329.00, 100 "
        "WHERE NOT EXISTS (SELECT 1 FROM produto WHERE nome='NEXUS PATCHWORK BAGGY' AND tamanho='44' AND cor='Unica') "

        "UNION ALL SELECT 'NEXUS PATCHWORK BAGGY', '46', 'Unica', 329.00, 100 "
        "WHERE NOT EXISTS (SELECT 1 FROM produto WHERE nome='NEXUS PATCHWORK BAGGY' AND tamanho='46' AND cor='Unica') "

        "UNION ALL SELECT 'BEANIE DESTROYED NEON', 'Unico', 'Neon', 249.00, 100 "
        "WHERE NOT EXISTS (SELECT 1 FROM produto WHERE nome='BEANIE DESTROYED NEON' AND tamanho='Unico' AND cor='Neon')";

    if (mysql_query(conn, sql)) {
        printf("Erro ao cadastrar produtos: %s\n", mysql_error(conn));
        mysql_close(conn);
        return;
    }

    printf("\nProdutos iniciais cadastrados com sucesso!\n");
    printf("Novos produtos inseridos: %llu\n",
           (unsigned long long)mysql_affected_rows(conn));

    mysql_close(conn);
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
