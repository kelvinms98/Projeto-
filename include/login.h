#ifndef LOGIN_H
#define LOGIN_H

#include "sistema.h"

void inicializarFuncionariosPadrao(void);
void cadastrarFuncionario(void);
int loginFuncionario(const char *email, const char *senha, Funcionario *logado);

#endif
