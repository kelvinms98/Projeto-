#ifndef CONEXAO_H
#define CONEXAO_H

#include <mysql/mysql.h>
#include <stdio.h>

inline MYSQL* conectarBanco(void) {
    MYSQL *conn = mysql_init(NULL);
    if (conn == NULL) {
        printf("Erro ao inicializar o MySQL!\n");
        return NULL;
    }

    // Conecta ao banco NEXUS rodando no XAMPP local (usuário root, sem senha)
    if (!mysql_real_connect(conn, "localhost", "root", "", "NEXUS", 3306, NULL, 0)) {
        printf("Erro de conexao: %s\n", mysql_error(conn));
        mysql_close(conn);
        return NULL;
    }

    return conn;
}

#endif