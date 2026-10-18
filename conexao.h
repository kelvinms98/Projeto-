#ifndef CONEXAO_H
#define CONEXAO_H

#ifdef _WIN32
#include <mysql.h>
#else
#include <mysql/mysql.h>
#endif
#include <stdio.h>
#include <stdlib.h>

#define NEXUS_ENV(name, fallback) \
    (getenv(name) != NULL && getenv(name)[0] != '\0' ? getenv(name) : fallback)

static MYSQL *conectarBanco(void) {
    const char *port_text = NEXUS_ENV("NEXUS_DB_PORT", "3306");
    char *port_end = NULL;
    unsigned long parsed_port = strtoul(port_text, &port_end, 10);
    unsigned int port = parsed_port > 0 && parsed_port <= 65535 && *port_end == '\0'
        ? (unsigned int)parsed_port
        : 3306;

    MYSQL *conn = mysql_init(NULL);
    if (conn == NULL) {
        printf("Erro ao inicializar o MySQL!\n");
        return NULL;
    }

    if (!mysql_real_connect(
            conn,
            NEXUS_ENV("NEXUS_DB_HOST", "127.0.0.1"),
            NEXUS_ENV("NEXUS_DB_USER", "root"),
            NEXUS_ENV("NEXUS_DB_PASSWORD", ""),
            NEXUS_ENV("NEXUS_DB_NAME", "NEXUS"),
            port,
            NULL,
            0)) {
        printf("Erro de conexao: %s\n", mysql_error(conn));
        mysql_close(conn);
        return NULL;
    }

    return conn;
}

#undef NEXUS_ENV

#endif