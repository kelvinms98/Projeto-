# Cotação Export

Sistema simples de cotação de exportação para calcular valores em USD e converter para reais.

## Funcionalidades

- Cadastro de cliente e produto
- Cálculo automático de FOB, frete, seguro, CIF, taxa e margem
- Conversão para reais com câmbio informado
- Histórico salvo no navegador
- Botão para imprimir em PDF
- Pronto para hospedar como página estática no GitHub Pages

## Como usar localmente

1. Abra a pasta `cotacao` no navegador.
2. Preencha os dados da cotação.
3. Clique em **Gerar cotação**.
4. O histórico será salvo no navegador.

## Como publicar no GitHub Pages

1. Faça upload desta pasta para o seu repositório no GitHub.
2. Vá em **Settings > Pages**.
3. Selecione a branch principal e a pasta raiz do projeto.
4. Salve.
5. O site ficará disponível em um link do tipo:
   `https://seu-usuario.github.io/seu-repositorio/cotacao/`

## Observação

Como é uma aplicação estática, os dados ficam no navegador do usuário. Se quiser um sistema com login, banco e sincronização real, é possível evoluir para Supabase mais tarde.
