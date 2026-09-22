#include <stdio.h>
#include <string.h>
#include "../include/login.h"
#include "../include/conexao.h" // Inclui a função de conexão

void inicializarFuncionariosPadrao(void) {
    // Como os funcionários já estão cadastrados via script SQL no banco,
    // não precisamos mais criar o arquivo de texto local.
}

int loginFuncionario(const char *email, const char *senha, Funcionario *logado) {
    MYSQL *conn = conectarBanco();
    if (conn == NULL) return 0;

    char query[256];
    // Consulta a tabela 'funcionarios' do seu banco SQL
    sprintf(query, "SELECT email, 'senha_padrao', cargo FROM funcionarios WHERE email = '%s'", email);

    if (mysql_query(conn, query)) {
        printf("Erro na consulta: %s\n", mysql_error(conn));
        mysql_close(conn);
        return 0;
    }

    MYSQL_RES *result = mysql_store_result(conn);
    if (result == NULL) {
        mysql_close(conn);
        return 0;
    }

    MYSQL_ROW row = mysql_fetch_row(result);
    int sucesso = 0;

    if (row != NULL) {
        strcpy(logado->email, row[0]);
        strcpy(logado->tipo, row[2]); // Ex: 'Coordenador TI', 'Front-end', etc.

        // Define a comissão baseada no cargo cadastrado no banco
        if (strcmp(logado->tipo, "Coordenador TI") == 0 || strcmp(logado->tipo, "admin") == 0) {
            logado->percentualComissao = 0.0f;
        } else {
            logado->percentualComissao = 5.0f;
        }

        logado->totalVendido = 0.0f;
        logado->totalComissao = 0.0f;
        sucesso = 1;
    }

    mysql_free_result(result);
    mysql_close(conn);
    return sucesso;
}