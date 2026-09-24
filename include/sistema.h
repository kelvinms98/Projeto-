#ifndef SISTEMA_H
#define SISTEMA_H

#define MAX_PRODUTOS 100
#define MAX_VENDAS 500
#define MAX_EMAIL 50
#define MAX_SENHA 20
#define MAX_TIPO 20

typedef struct {
    int id;
    char nome[50];
    char categoria[30];
    float preco;
    int quantidade;
} Produto;

typedef struct {
    char email[MAX_EMAIL];
    char senha[MAX_SENHA];
    char tipo[MAX_TIPO];
    float percentualComissao;
    float totalVendido;
    float totalComissao;
} Funcionario;

typedef struct {
    int codigoVenda;
    int idProduto;
    char produto[50];
    char categoria[30];
    int quantidade;
    float valorUnitario;
    float valorTotal;
    float comissao;
    char vendedorEmail[MAX_EMAIL];
} Venda;

#endif
