# Loja NEXUS com Node.js e SQLite

O site e o programa `Comprar.py` usam o servidor local Node.js. O banco SQLite
fica em `data/nexus-store.sqlite3`; não é necessário iniciar XAMPP, Apache ou MySQL
para operar a loja após a migração.

## Requisitos e inicialização

1. Instale Node.js 22.13 ou superior e Python 3.
2. Para importar dados, faça a migração descrita abaixo **antes** de iniciar o site.
   Se não houver dados antigos para preservar, pule para o passo seguinte.
3. Configure o `.env` conforme a seção abaixo. Se ainda não existir, copie
   `.env.example` para `.env` e troque `NEXUS_SECRET_KEY` por uma chave privada.
4. Execute `comandos.bat` para abrir o menu de execução. Na primeira opção, o
   servidor instala as dependências necessárias e inicia o site. Também é possível
   abrir `run_web.bat` diretamente e acessar `http://localhost:8081`.
5. Para registrar uma compra pelo terminal, escolha a opção 2 do menu ou abra
   `run_comprar.bat`. O servidor precisa estar ativo.

### Comandos individuais no Windows

| Arquivo | O que executa |
| --- | --- |
| `run_web.bat` | Inicia o servidor Node.js e o site |
| `run_comprar.bat` | Testa o servidor e inicia `Comprar.py` |
| `testar_conexao.bat` | Verifica se servidor e SQLite estão respondendo |
| `testes_loja.bat` | Instala dependências se necessário e executa `npm test` |
| `importar_mysql.bat` | Importa o banco antigo após confirmação e checagem de recuperação |

As variáveis abaixo ficam no `.env`; os comandos de execução ficam nos arquivos
`.bat` acima. Abra os `.bat` com duplo clique ou execute pelo Prompt de Comando na
pasta do projeto:

```env
NEXUS_API_URL=http://127.0.0.1:8081
NEXUS_WEB_HOST=0.0.0.0
NEXUS_WEB_PORT=8081
NEXUS_SQLITE_PATH=data/nexus-store.sqlite3
NEXUS_SECRET_KEY=gere-uma-chave-aleatoria-longa-e-privada
```

O servidor escuta na rede local para que outros aparelhos no mesmo Wi-Fi possam
acessar o site. Permita conexões somente em uma rede privada confiável; não configure
redirecionamento de portas para a internet.

## Importar o banco MySQL existente

O importador transfere produtos, funcionários, entregas, pedidos, fornecedores,
materiais e solicitações de compra. Ele lê o banco de origem sem alterá-lo e grava
em uma base SQLite nova. Faça um backup antes da migração.

O repositório não inclui um arquivo de backup com os dados antigos. A documentação
existente informa que o MariaDB estava em `innodb_force_recovery=1`; nesse estado,
o importador **recusa iniciar**. Não desative a proteção nem grave no banco antigo
para contornar isso. Recupere o MariaDB e valide o InnoDB primeiro. Se o serviço não
puder ser recuperado, será necessário restaurar um backup lógico válido em uma
instância MySQL/MariaDB compatível; o importador atual lê uma instância em execução,
não arquivos de dump diretamente.

Depois de confirmar que o MySQL/MariaDB inicia normalmente e que o nível de
recuperação é zero:

1. Instale as dependências Node executando `npm install` na pasta do projeto.
2. Configure as variáveis de conexão da origem no `.env` (ou no ambiente):

   ```env
   LEGACY_DB_HOST=127.0.0.1
   LEGACY_DB_PORT=3306
   LEGACY_DB_USER=root
   LEGACY_DB_PASSWORD=
   LEGACY_DB_NAME=NEXUS
   ```

   O importador também aceita as variáveis antigas `NEXUS_DB_HOST`,
   `NEXUS_DB_PORT`, `NEXUS_DB_USER`, `NEXUS_DB_PASSWORD` e `NEXUS_DB_NAME`.
3. Antes de iniciar o servidor, execute `npm run import:mysql`. O comando falha se
   o banco de origem estiver em recuperação, se houver variantes de produto
   duplicadas ou se a base SQLite de destino já tiver dados. Corrija a origem ou
   escolha um caminho novo com `NEXUS_SQLITE_PATH` antes de tentar novamente.
4. Quando a importação terminar, inicie `run_web.bat`. Mantenha o arquivo SQLite e
   seus arquivos `-wal`/`-shm` juntos durante o uso; eles contêm o banco local.

Não apague nem altere o backup antigo até conferir catálogo, estoque, funcionários,
pedidos e materiais no painel da loja.

## Produtos, pedidos e compras

O SQLite cria um índice único em `(nome, tamanho, cor)` para impedir variantes
duplicadas. O servidor confirma preço e estoque e grava cada pedido junto com a
reserva das peças em uma única transação. O estoque mostrado como disponível já
desconta as unidades reservadas. O `Comprar.py` chama essa mesma API em vez de
conectar diretamente ao banco.

Clientes devem criar uma conta individual em `conta.html` antes de selecionar
tamanho/cor, alterar o carrinho, escolher entrega ou registrar um pedido. A senha
tem no mínimo 12 caracteres e é armazenada com scrypt no SQLite; as sessões usam o
armazenamento SQLite do servidor. A conta é criada localmente, sem confirmação por
e-mail ou recuperação automática de senha. Cada pedido é associado à conta que o
criou, e o servidor rejeita pedidos e cotações sem sessão autenticada mesmo que
sejam enviados diretamente à API. O `Comprar.py` também pede login ou criação de
conta antes de exibir os produtos para compra.

O painel interno está em `/login`. Em uma instalação sem importação, há dados
fictícios para demonstração e o acesso inicial é
criado localmente pelo comando `configurar_admin.bat` (também disponível como
opção 9 em `comandos.bat`). O configurador solicita usuário, e-mail e uma senha
nova sem mostrá-la; a senha é armazenada com scrypt no SQLite, nunca no código ou
no `.env`. Use senha diferente de qualquer senha compartilhada em mensagens.
Configure uma chave aleatória estável em `NEXUS_SECRET_KEY`; as sessões são
armazenadas no SQLite e permanecem válidas após reinicializações enquanto essa
chave não mudar.

O atalho `Ctrl+Shift+D` e o link **ADMIN** na página principal abrem `/login`;
ambos ainda exigem autenticação. O painel permite recibos internos imprimíveis
somente para pedidos com pagamento confirmado (não são NF-e e não substituem
documento fiscal), lançamentos e fechamento de caixa, além de registrar pedidos
pagos como entradas confirmadas. O caixa físico considera dinheiro; PIX/cartão
aparecem no relatório de entradas, mas não são somados ao saldo em espécie.

O relatório de fotos conta cada produto uma vez, sem repetir suas variantes. Para
cadastrar uma foto, informe um caminho local dentro do site (por exemplo,
`imagens/produto.jpg`) ou uma URL HTTPS. Até cadastrar uma imagem própria, a loja
continua exibindo suas ilustrações de categoria.

Somente o proprietário pode criar contas, escolher funções, consultar/alterar
salários, redefinir senhas ou bloquear/liberar acessos. Gerentes administram
estoque, catálogo e compras internas; gerentes e caixas operam o caixa e atualizam
pedidos. Funcionários comuns têm acesso de consulta. O painel registra alterações
administrativas e encerra sessões de funcionários assim que seus acessos são
bloqueados. O campo de salário é apenas cadastral; o sistema não processa folha nem
pagamento de salários.

O dashboard lista vendas e apresenta um relatório dos últimos 30 dias, com
faturamento de pedidos pagos e resumo diário da última semana. Cada compra gera um
link privado de acompanhamento, exibido no checkout e no terminal; o dashboard
também permite abrir esse link para pedidos anteriores.

Solicitações a fornecedores no painel continuam sendo registros internos de
demonstração: não são enviadas, pagas ou compradas automaticamente. Ao confirmar
o recebimento, o servidor atualiza o estoque de materiais. O checkout também
registra pedidos como aguardando pagamento, mas não processa cobranças. O painel
lista os pedidos dos clientes e permite atualizar o status. Cancelar um pedido
antes do envio libera as peças e devolve as unidades ao estoque; eventual reembolso
de pagamento deve ser tratado manualmente.

## Confirmação por e-mail e estimativa de frete

O programa `Comprar.py` permanece aberto após cada tentativa e oferece a opção de
iniciar outra compra ou sair. A seleção no terminal é feita por produto, tamanho e
cor, sempre conferindo estoque e preço atualizados.

Para enviar confirmações reais por e-mail, configure no seu `.env`:

```env
NEXUS_SMTP_HOST=smtp.gmail.com
NEXUS_SMTP_PORT=465
NEXUS_SMTP_SECURE=true
NEXUS_SMTP_USER=nexusstorestre@gmail.com
NEXUS_SMTP_PASSWORD=sua-senha-de-app
NEXUS_EMAIL_FROM=nexusstorestre@gmail.com
```

No Gmail, crie uma senha de app na conta remetente e coloque-a somente em
`NEXUS_SMTP_PASSWORD` no `.env` local. Não use nem compartilhe sua senha normal,
senha de app ou chave de API no código, no Git ou nesta conversa. O pedido é salvo
mesmo que o SMTP falhe; o site e o terminal informam explicitamente quando a
confirmação não foi enviada, para evitar que o cliente refaça o pedido sem querer.

Para calcular o frete antes de selecionar uma modalidade de entrega, o sistema usa
uma taxa fixa configurável no `.env`, sem depender de API de mapas:

```env
NEXUS_SHIPPING_BASE_BRL=8.00
NEXUS_SHIPPING_SERVICE_BRL=3.50
```

O valor cobrado para entrega é a soma da tarifa base de R$ 8,00 com a taxa de
serviço de R$ 3,50, totalizando R$ 11,50. O CEP continua sendo usado para preencher
o endereço, mas não altera o valor do frete. O SMTP é necessário para enviar
confirmações de qualquer pedido; sem ele, o pedido continua registrado e a interface
avisa que o e-mail não foi enviado.

Para inserir os segredos sem mostrá-los na tela ou compartilhá-los no chat, execute
`configurar_servicos.bat` ou escolha a opção 6 em `comandos.bat`. O configurador
solicita a senha de app do Gmail sem exibi-la, preserva as outras configurações do
`.env` e grava os valores localmente. Depois, reinicie o servidor com `run_web.bat`.

## Configurações do servidor

```env
NEXUS_WEB_HOST=0.0.0.0
NEXUS_WEB_PORT=8081
NEXUS_SQLITE_PATH=data/nexus-store.sqlite3
NEXUS_SECRET_KEY=gere-um-valor-aleatorio-longo
NEXUS_SMTP_HOST=smtp.gmail.com
NEXUS_SMTP_PORT=465
NEXUS_SMTP_SECURE=true
NEXUS_SMTP_USER=nexusstorestred@gmail.com
NEXUS_SMTP_PASSWORD=
NEXUS_EMAIL_FROM=nexusstorestred@gmail.com
NEXUS_SHIPPING_BASE_BRL=8.00
NEXUS_SHIPPING_SERVICE_BRL=3.50
```
