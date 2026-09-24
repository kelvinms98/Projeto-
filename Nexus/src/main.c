#define SQLITE_THREADSAFE 0
#define SQLITE_OMIT_LOAD_EXTENSION 1
#define SQLITE_DEFAULT_MEMSTATUS 0
#define SQLITE_OMIT_DEPRECATED 1

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "sqlite3.h"

// Função de callback para exibir resultados no terminal
int callbackExibir(void *NotUsed, int argc, char **argv, char **azColName) {
    for(int i = 0; i < argc; i++) {
        printf("%s: %s | ", azColName[i], argv[i] ? argv[i] : "NULL");
    }
    printf("\n--------------------------------------------------\n");
    return 0;
}

// Inicializa as tabelas com a estrutura correta
void inicializarBanco(sqlite3 *db) {
    char *errMessage = 0;
    
    const char *sql = 
        "CREATE TABLE IF NOT EXISTS clientes ("
        "id_cliente INTEGER PRIMARY KEY, "
        "nome TEXT, telefone TEXT, cpf TEXT, email TEXT, endereco TEXT, status TEXT);"
        
        "CREATE TABLE IF NOT EXISTS funcionarios ("
        "id_funcionario INTEGER PRIMARY KEY, "
        "nome TEXT, telefone TEXT, cpf TEXT, email TEXT, endereco TEXT, cargo TEXT, senha TEXT);"
        
        "CREATE TABLE IF NOT EXISTS produto ("
        "id_produto INTEGER PRIMARY KEY, "
        "nome TEXT, modelo TEXT, tamanho TEXT, cor TEXT, preco REAL, estoque INTEGER);";

    int rc = sqlite3_exec(db, sql, 0, 0, &errMessage);
    if (rc != SQLITE_OK) {
        printf("Erro ao criar tabelas: %s\n", errMessage);
        sqlite3_free(errMessage);
    }
}

// Insere os dados sem caracteres especiais para evitar conflitos no terminal
void popularDadosIniciais(sqlite3 *db) {
    char *errMessage = 0;
    const char *sql = 
        // Clientes
        "INSERT OR IGNORE INTO clientes VALUES (1, 'Joao Silva', '(11)99476-1582', '123.456.789-00', 'joao.silva@email.com', 'rua inglatera, 123 Sao Paulo', 'ativo');"
        "INSERT OR IGNORE INTO clientes VALUES (2, 'Maria Souza', '(21)98765-4321', '987.654.321-00', 'marizinhasoso@gmail.com', 'rua sem entrada, 1533 - Rio de Janeiro', 'inativo');"
        "INSERT OR IGNORE INTO clientes VALUES (3, 'denis silva', '(18)99845-4432', '111.222.333-44', 'bigodedeboi@gmail.com', 'rua do bigode, 123 - Andradina', 'ativo');"
        "INSERT OR IGNORE INTO clientes VALUES (4, 'Juliana Mendes', '(11) 95544-3322', '222.333.444-55', 'juliana@email.com', 'Rua Augusta, 100 - Sao Paulo', 'Ativo');"
        "INSERT OR IGNORE INTO clientes VALUES (5, 'Lucas Pereira', '(11) 94433-2211', '555.666.777-88', 'lucas@email.com', 'Av. Paulista, 500 - Sao Paulo', 'Ativo');"
        "INSERT OR IGNORE INTO clientes VALUES (6, 'Beatriz Lima', '(11) 93322-1100', '999.888.777-66', 'beatriz@email.com', 'Praca da Se, 50 - Sao Paulo', 'Inativo');"

        // Funcionarios (Com a senha padrao 'admin123')
        "INSERT OR IGNORE INTO funcionarios (id_funcionario, nome, telefone, cpf, email, endereco, cargo, senha) VALUES (1, 'joao pedro', '(11) 94760-6590', '412.385.961-82', 'joao.pedro@nexus.com.br', 'Rua Principal, 100 - Sao Paulo', 'Back-end', 'admin123');"
        "INSERT OR IGNORE INTO funcionarios (id_funcionario, nome, telefone, cpf, email, endereco, cargo, senha) VALUES (2, 'jorge lobato', '(11) 98747-6595', '785.412.963-10', 'jorge.lobato@nexus.com.br', 'Av. Central, 200 - Sao Paulo', 'Back-end', 'admin123');"
        "INSERT OR IGNORE INTO funcionarios (id_funcionario, nome, telefone, cpf, email, endereco, cargo, senha) VALUES (3, 'Kelvin Soares', '(11)99476-1582', '382.910.458-12', 'kelvinsoares@nexus.com.br', 'Av. Celso Garcia, 1200 - Sao Paulo', 'Coordenador TI', 'admin123');"
        "INSERT OR IGNORE INTO funcionarios (id_funcionario, nome, telefone, cpf, email, endereco, cargo, senha) VALUES (4, 'Isabelly alves', '(11)987803237', '123.456.789-09', 'Isabellyalves@nexus.com.br', 'Rua Augusta, 1500 - Sao Paulo', 'Recursos Humanos', 'admin123');"

        // Produtos
        "INSERT OR IGNORE INTO produto VALUES (1, 'Camiseta', 'neymar street', 'm', 'preta', 79.90, 100);"
        "INSERT OR IGNORE INTO produto VALUES (2, 'Camiseta', 'neymar street', 'g', 'preta', 79.90, 100);"
        "INSERT OR IGNORE INTO produto VALUES (3, 'Camiseta', 'neymar street', 'gg', 'preta', 79.90, 100);"
        "INSERT OR IGNORE INTO produto VALUES (4, 'Camiseta', 'neymar street', 'm', 'branca', 79.90, 100);"
        "INSERT OR IGNORE INTO produto VALUES (5, 'Camiseta', 'neymar street', 'g', 'branca', 79.90, 100);"
        "INSERT OR IGNORE INTO produto VALUES (6, 'Camiseta', 'neymar street', 'gg', 'branca', 79.90, 100);";

    int rc = sqlite3_exec(db, sql, 0, 0, &errMessage);
    if (rc != SQLITE_OK) {
        printf("Erro ao inserir dados iniciais: %s\n", errMessage);
        sqlite3_free(errMessage);
    }
}

// Sistema de Login
int realizarLogin(sqlite3 *db) {
    char cpf[30];
    char senha[30];
    sqlite3_stmt *stmt;
    int autorizado = 0;

    system("cls");
    printf("==================================================\n");
    printf("        AUTENTICACAO DE ACESSO - NEXUS\n");
    printf("==================================================\n");
    printf("Digite o CPF do funcionario: ");
    scanf("%29s", cpf);
    printf("Digite a senha: ");
    scanf("%29s", senha);

    const char *sql = "SELECT COUNT(*) FROM funcionarios WHERE cpf = ? AND senha = ?";
    
    if (sqlite3_prepare_v2(db, sql, -1, &stmt, 0) == SQLITE_OK) {
        sqlite3_bind_text(stmt, 1, cpf, -1, SQLITE_STATIC);
        sqlite3_bind_text(stmt, 2, senha, -1, SQLITE_STATIC);

        if (sqlite3_step(stmt) == SQLITE_ROW) {
            int count = sqlite3_column_int(stmt, 0);
            if (count > 0) {
                autorizado = 1;
            }
        }
        sqlite3_finalize(stmt);
    }

    return autorizado;
}

void listarProdutos(sqlite3 *db) {
    system("cls");
    printf("=== ESTOQUE DE PRODUTOS ===\n\n");
    char *errMessage = 0;
    const char *sql = "SELECT * FROM produto;";
    sqlite3_exec(db, sql, callbackExibir, 0, &errMessage);
    system("pause");
}

void listarClientes(sqlite3 *db) {
    system("cls");
    printf("=== CLIENTES CADASTRADOS ===\n\n");
    char *errMessage = 0;
    const char *sql = "SELECT * FROM clientes;";
    sqlite3_exec(db, sql, callbackExibir, 0, &errMessage);
    system("pause");
}

void listarFuncionarios(sqlite3 *db) {
    system("cls");
    printf("=== FUNCIONARIOS (INTERNO) ===\n\n");
    char *errMessage = 0;
    const char *sql = "SELECT id_funcionario, nome, telefone, cpf, email, endereco, cargo FROM funcionarios;";
    sqlite3_exec(db, sql, callbackExibir, 0, &errMessage);
    system("pause");
}

int main() {
    sqlite3 *db;
    
    // Caminho completo apontando para o arquivo "bancodedados" na pasta correta
    const char *db_path = "C:\\Users\\kelvi\\Downloads\\Nexus\\Nexus\\bancodedados";
    
    int rc = sqlite3_open(db_path, &db);
    
    if (rc) {
        printf("Erro ao abrir banco de dados: %s\n", sqlite3_errmsg(db));
        return 1;
    }

    inicializarBanco(db);
    popularDadosIniciais(db);

    if (!realizarLogin(db)) {
        printf("\n[ERRO] Acesso negado! CPF ou senha invalidos.\n\n");
        system("pause");
        sqlite3_close(db);
        return 0;
    }

    int opcao;
    do {
        system("cls");
        printf("==================================================\n");
        printf("         SISTEMA NEXUS / CSTREETWEAR (SQL)        \n");
        printf("==================================================\n");
        printf("1. Consultar Produtos (Estoque)\n");
        printf("2. Consultar Clientes\n");
        printf("3. Consultar Funcionarios\n");
        printf("0. Sair do Sistema\n");
        printf("Escolha uma opcao: ");
        scanf("%d", &opcao);

        switch(opcao) {
            case 1: listarProdutos(db); break;
            case 2: listarClientes(db); break;
            case 3: listarFuncionarios(db); break;
            case 0: printf("\nA encerrar o sistema...\n"); break;
            default:
                printf("\nOpcao invalida! Tente novamente.\n");
                system("pause");
        }
    } while(opcao != 0);

    sqlite3_close(db);
    return 0;
}