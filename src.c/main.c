#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "../conexao.h"

static void removerQuebraLinha(char *texto) {
    texto[strcspn(texto, "\r\n")] = '\0';
}

static int realizarLogin(MYSQL *db) {
    char email[256];
    char senha[129];

    printf("E-mail do funcionario: ");
    if (fgets(email, sizeof(email), stdin) == NULL) return 0;
    removerQuebraLinha(email);
    printf("Senha: ");
    if (fgets(senha, sizeof(senha), stdin) == NULL) return 0;
    removerQuebraLinha(senha);

    const char *sql =
        "SELECT id_funcionario FROM funcionarios "
        "WHERE email = ? AND senha = SHA2(?, 256) LIMIT 1";
    MYSQL_STMT *stmt = mysql_stmt_init(db);
    if (stmt == NULL) {
        fprintf(stderr, "Erro ao preparar o login: %s\n", mysql_error(db));
        return 0;
    }

    int autorizado = 0;
    if (mysql_stmt_prepare(stmt, sql, (unsigned long)strlen(sql)) != 0) {
        fprintf(stderr, "Erro ao preparar o login: %s\n", mysql_stmt_error(stmt));
        mysql_stmt_close(stmt);
        return 0;
    }

    unsigned long email_length = (unsigned long)strlen(email);
    unsigned long password_length = (unsigned long)strlen(senha);
    MYSQL_BIND parameters[2] = {0};
    parameters[0].buffer_type = MYSQL_TYPE_STRING;
    parameters[0].buffer = email;
    parameters[0].buffer_length = email_length;
    parameters[0].length = &email_length;
    parameters[1].buffer_type = MYSQL_TYPE_STRING;
    parameters[1].buffer = senha;
    parameters[1].buffer_length = password_length;
    parameters[1].length = &password_length;

    if (mysql_stmt_bind_param(stmt, parameters) != 0 || mysql_stmt_execute(stmt) != 0) {
        fprintf(stderr, "Erro ao consultar o login: %s\n", mysql_stmt_error(stmt));
    } else {
        unsigned int employee_id = 0;
        MYSQL_BIND result = {0};
        result.buffer_type = MYSQL_TYPE_LONG;
        result.buffer = &employee_id;
        if (mysql_stmt_bind_result(stmt, &result) == 0 && mysql_stmt_fetch(stmt) == 0) {
            autorizado = 1;
        }
    }

    mysql_stmt_close(stmt);
    return autorizado;
}

static void listarDados(MYSQL *db, const char *titulo, const char *consulta) {
    if (mysql_query(db, consulta) != 0) {
        fprintf(stderr, "Erro ao consultar %s: %s\n", titulo, mysql_error(db));
        return;
    }

    MYSQL_RES *resultado = mysql_store_result(db);
    if (resultado == NULL) {
        fprintf(stderr, "Erro ao ler %s: %s\n", titulo, mysql_error(db));
        return;
    }

    MYSQL_FIELD *campos = mysql_fetch_fields(resultado);
    unsigned int total_campos = mysql_num_fields(resultado);
    printf("\n=== %s ===\n", titulo);
    for (unsigned int i = 0; i < total_campos; i++) {
        printf("%s%s", campos[i].name, i + 1 == total_campos ? "\n" : " | ");
    }
    printf("----------------------------------------------------------------\n");

    MYSQL_ROW linha;
    while ((linha = mysql_fetch_row(resultado)) != NULL) {
        for (unsigned int i = 0; i < total_campos; i++) {
            printf("%s%s", linha[i] != NULL ? linha[i] : "NULL",
                   i + 1 == total_campos ? "\n" : " | ");
        }
    }
    mysql_free_result(resultado);
}

static int lerOpcao(void) {
    char entrada[32];
    char *fim = NULL;
    long opcao;

    if (fgets(entrada, sizeof(entrada), stdin) == NULL) return 0;
    opcao = strtol(entrada, &fim, 10);
    if (fim == entrada || (*fim != '\n' && *fim != '\r' && *fim != '\0')) return -1;
    if (opcao < 0 || opcao > 3) return -1;
    return (int)opcao;
}

int main(void) {
    MYSQL *db = conectarBanco();
    if (db == NULL) return 1;

    printf("=== SISTEMA NEXUS - MYSQL/XAMPP ===\n");
    if (!realizarLogin(db)) {
        printf("Acesso negado. Verifique o e-mail e a senha.\n");
        mysql_close(db);
        return 1;
    }

    int opcao;
    do {
        printf("\n1. Consultar produtos e estoque\n");
        printf("2. Consultar clientes\n");
        printf("3. Consultar funcionarios\n");
        printf("0. Sair\n");
        printf("Escolha: ");

        opcao = lerOpcao();
        switch (opcao) {
            case 1:
                listarDados(
                    db,
                    "PRODUTOS E ESTOQUE",
                    "SELECT id_produto, nome, tamanho, cor, preco, estoque FROM produto ORDER BY id_produto"
                );
                break;
            case 2:
                listarDados(
                    db,
                    "CLIENTES",
                    "SELECT id_cliente, nome, telefone, cpf, email, endereco, status FROM clientes ORDER BY id_cliente"
                );
                break;
            case 3:
                listarDados(
                    db,
                    "FUNCIONARIOS",
                    "SELECT id_funcionario, nome, telefone, cpf, email, endereco, cargo FROM funcionarios ORDER BY id_funcionario"
                );
                break;
            case 0:
                break;
            default:
                printf("Opcao invalida. Digite um numero de 0 a 3.\n");
        }
    } while (opcao != 0);

    mysql_close(db);
    return 0;
}
