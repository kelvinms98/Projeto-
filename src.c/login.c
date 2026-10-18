#include <stdio.h>
#include <string.h>
#include "../include/login.h"
#include "../include/conexao.h"

void inicializarFuncionariosPadrao(void) {
    /* The employee records are managed in MySQL. */
}

int loginFuncionario(const char *email, const char *senha, Funcionario *logado) {
    if (email == NULL || senha == NULL || logado == NULL) return 0;

    MYSQL *conn = conectarBanco();
    if (conn == NULL) return 0;

    MYSQL_STMT *stmt = mysql_stmt_init(conn);
    if (stmt == NULL) {
        fprintf(stderr, "Erro ao preparar o login: %s\n", mysql_error(conn));
        mysql_close(conn);
        return 0;
    }

    const char *sql =
        "SELECT email, cargo FROM funcionarios "
        "WHERE email = ? AND senha = SHA2(?, 256) LIMIT 1";
    int sucesso = 0;

    if (mysql_stmt_prepare(stmt, sql, (unsigned long)strlen(sql)) != 0) {
        fprintf(stderr, "Erro ao preparar o login: %s\n", mysql_stmt_error(stmt));
        goto cleanup;
    }

    unsigned long email_length = (unsigned long)strlen(email);
    unsigned long password_length = (unsigned long)strlen(senha);
    MYSQL_BIND parameters[2] = {0};
    parameters[0].buffer_type = MYSQL_TYPE_STRING;
    parameters[0].buffer = (void *)email;
    parameters[0].buffer_length = email_length;
    parameters[0].length = &email_length;
    parameters[1].buffer_type = MYSQL_TYPE_STRING;
    parameters[1].buffer = (void *)senha;
    parameters[1].buffer_length = password_length;
    parameters[1].length = &password_length;

    if (mysql_stmt_bind_param(stmt, parameters) != 0 || mysql_stmt_execute(stmt) != 0) {
        fprintf(stderr, "Erro ao consultar o login: %s\n", mysql_stmt_error(stmt));
        goto cleanup;
    }

    char result_email[MAX_EMAIL] = {0};
    char result_cargo[MAX_TIPO] = {0};
    unsigned long result_email_length = 0;
    unsigned long result_cargo_length = 0;
    MYSQL_BIND results[2] = {0};
    results[0].buffer_type = MYSQL_TYPE_STRING;
    results[0].buffer = result_email;
    results[0].buffer_length = sizeof(result_email) - 1;
    results[0].length = &result_email_length;
    results[1].buffer_type = MYSQL_TYPE_STRING;
    results[1].buffer = result_cargo;
    results[1].buffer_length = sizeof(result_cargo) - 1;
    results[1].length = &result_cargo_length;

    if (mysql_stmt_bind_result(stmt, results) != 0) {
        fprintf(stderr, "Erro ao ler o resultado do login: %s\n", mysql_stmt_error(stmt));
        goto cleanup;
    }

    if (mysql_stmt_fetch(stmt) == 0) {
        result_email[sizeof(result_email) - 1] = '\0';
        result_cargo[sizeof(result_cargo) - 1] = '\0';
        (void)snprintf(logado->email, sizeof(logado->email), "%s", result_email);
        (void)snprintf(logado->tipo, sizeof(logado->tipo), "%s", result_cargo);
        logado->senha[0] = '\0';
        logado->percentualComissao =
            strcmp(logado->tipo, "Coordenador TI") == 0 || strcmp(logado->tipo, "admin") == 0
                ? 0.0f
                : 5.0f;
        logado->totalVendido = 0.0f;
        logado->totalComissao = 0.0f;
        sucesso = 1;
    }

cleanup:
    mysql_stmt_close(stmt);
    mysql_close(conn);
    return sucesso;
}
