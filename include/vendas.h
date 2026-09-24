#ifndef VENDAS_H
#define VENDAS_H

#include "sistema.h"

void realizarVenda(
    Produto produtos[],
    int totalProdutos,
    Funcionario *vendedor,
    Venda vendas[],
    int *totalVendas
);

void listarMinhasVendas(
    Venda vendas[],
    int totalVendas,
    const char vendedorEmail[]
);

void mostrarMinhasComissoes(Funcionario *vendedor);

void relatorioVendas(
    Venda vendas[],
    int totalVendas
);

#endif
