# Loja NEXUS com MySQL/XAMPP

O site e o programa em C usam o banco `NEXUS` do MySQL do XAMPP.

## Estado atual do banco

Nesta instalação, o MariaDB ainda está em `innodb_force_recovery=1` após erros de
corrupção InnoDB. Não remova essa proteção nem execute a migração ou registre pedidos
até o MariaDB iniciar normalmente com `innodb_force_recovery=0`. A vitrine consegue
ler o catálogo atual, mas a tabela `delivery_options` ainda não existe nesse banco
legado, então o checkout permanece indisponível. Preserve os backups físico e lógico
existentes até validar a recuperação e o esquema migrado.

## Preparar o banco e iniciar o site

1. Inicie **MySQL** no painel do XAMPP.
2. Abra o phpMyAdmin em `http://localhost:8080/phpmyadmin/` e importe `bancodedados.sql`.
   O script cria as tabelas de produtos, funcionários, entregas e pedidos; também
   adiciona a coluna de senha e o identificador automático se o banco já existir.
   Faça isso somente depois de confirmar a recuperação normal do InnoDB e manter um
   backup atual.
3. Se o usuário/senha do MySQL forem diferentes dos padrões do XAMPP, configure
   `NEXUS_DB_HOST`, `NEXUS_DB_PORT`, `NEXUS_DB_USER`, `NEXUS_DB_PASSWORD` e
   `NEXUS_DB_NAME` no arquivo `.env`. O site carrega esse arquivo ao iniciar; o
   programa C lê as mesmas opções das variáveis de ambiente do Windows.
4. Execute `run_web.bat` e acesse `http://localhost:8081`. A porta 8080 pode
   pertencer ao Apache do XAMPP; o inicializador da loja usa a porta 8081 para evitar
   conflito. Em um celular conectado ao mesmo Wi-Fi, use `http://IP-DO-COMPUTADOR:8081`
   com o IPv4 mostrado pelo `ipconfig`. O firewall do Windows pode solicitar permissão
   para conexões na rede privada; não configure encaminhamento de porta para a internet.

## Funcionários, materiais e fornecedores de demonstração

O portal interno fica em `/login` e, após autenticação, em `/dashboard`. A migração
`bancodedados.sql` cria o cadastro de materiais, fornecedores fictícios `.example` e
pedidos internos de demonstração. Esses registros são exemplos; nenhum pedido é
enviado a um fornecedor e nenhuma compra ou pagamento externo é realizado.

Não importe a migração nem registre pedidos enquanto o MariaDB estiver em
`innodb_force_recovery=1`. A recuperação do banco precisa ser concluída primeiro.
Nesse modo o portal pode exibir os dados legados, mas operações de gravação devem
permanecer indisponíveis.

O acesso administrativo local inicial é `kelvinsoares@nexus.com.br` / `admin123`.
Troque essa senha antes de disponibilizar o site para outras pessoas. Configure
`NEXUS_SECRET_KEY` com um valor aleatório para manter a sessão administrativa entre
reinicializações.

## Pedidos e pagamento

O checkout valida preços e estoque no servidor e grava o pedido em `venda` e
`item_venda` na mesma transação que atualiza o estoque. Os pedidos ficam como
`awaiting_payment`: o site registra o pedido, mas não cobra nem processa pagamentos.
A opção PIX aplica 10% de desconto.

## Programa C

O executável C requer um compilador C e os arquivos de desenvolvimento do MySQL/MariaDB
(header `mysql.h` e biblioteca cliente). O XAMPP desta instalação não inclui esses
headers; instale o Connector/C e compile `src.c\main.c` usando os caminhos `include` e
`lib` do conector. Por padrão, a conexão usa `127.0.0.1:3306`, usuário `root`, senha
vazia e banco `NEXUS`; as variáveis `NEXUS_DB_*` permitem alterar esses valores.
