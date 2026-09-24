#ifndef PRODUTOS_H
#define PRODUTOS_H

#include "sistema.h"

extern Produto produtos[MAX_PRODUTOS];
extern int totalProdutos;

void cadastrarProdutosIniciais(void);
int encontrarProduto(int id);
void cadastrarProduto(void);
void listarProdutos(void);
void alterarProduto(void);
void excluirProduto(void);
void entradaEstoque(void);
void saidaEstoque(void);
void consultarEstoque(void);

#endif
