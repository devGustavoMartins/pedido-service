# Microsserviço de Pedidos

## 1. Descrição Funcional

**Nome do microsserviço:** `pedido-service`

O `pedido-service` é responsável por registrar, consultar, atualizar e cancelar pedidos realizados por clientes em uma plataforma de vendas.

Principais responsabilidades:

- Criar pedidos com itens, cliente e forma de pagamento.
- Consultar pedidos por identificador.
- Listar pedidos cadastrados.
- Atualizar o status de um pedido.
- Cancelar pedidos que ainda não foram finalizados.
- Publicar eventos relacionados ao ciclo de vida do pedido.

## 2. Endpoints da API

| Método HTTP | URL                    | Descrição                                                                |
| ----------- | ---------------------- | ------------------------------------------------------------------------ |
| `GET`       | `/health`              | Retorna uma visão geral dos checks de saúde do serviço.                  |
| `GET`       | `/health/liveness`     | Liveness check: verifica se o processo da aplicação está vivo.           |
| `GET`       | `/health/readiness`    | Readiness check: verifica se o serviço está pronto para receber tráfego. |
| `GET`       | `/pedidos`             | Lista todos os pedidos cadastrados.                                      |
| `GET`       | `/pedidos/{id}`        | Consulta um pedido específico pelo ID.                                   |
| `POST`      | `/pedidos`             | Cria um novo pedido.                                                     |
| `PATCH`     | `/pedidos/{id}/status` | Atualiza o status de um pedido.                                          |
| `DELETE`    | `/pedidos/{id}`        | Cancela um pedido.                                                       |

## 3. Exemplo de Requisição e Resposta

### Criar pedido

**Requisição**

```http
POST /pedidos
Content-Type: application/json
```

```json
{
  "clienteId": "cli-1001",
  "itens": [
    {
      "produtoId": "prod-200",
      "quantidade": 2,
      "precoUnitario": 59.9
    },
    {
      "produtoId": "prod-350",
      "quantidade": 1,
      "precoUnitario": 120
    }
  ],
  "formaPagamento": "cartao_credito"
}
```

**Resposta**

```json
{
  "id": "ped-1",
  "clienteId": "cli-1001",
  "itens": [
    {
      "produtoId": "prod-200",
      "quantidade": 2,
      "precoUnitario": 59.9
    },
    {
      "produtoId": "prod-350",
      "quantidade": 1,
      "precoUnitario": 120
    }
  ],
  "formaPagamento": "cartao_credito",
  "status": "CRIADO",
  "valorTotal": 239.8,
  "criadoEm": "2026-05-23T10:00:00.000Z"
}
```

## 4. Dependências Externas

| Tipo                | Dependência          | Descrição                                                  |
| ------------------- | -------------------- | ---------------------------------------------------------- |
| Microsserviço       | `cliente-service`    | Consulta dados básicos do cliente antes de criar o pedido. |
| Microsserviço       | `estoque-service`    | Verifica a disponibilidade dos produtos solicitados.       |
| Microsserviço       | `pagamento-service`  | Solicita autorização de pagamento.                         |
| Banco de dados      | PostgreSQL           | Armazena pedidos, itens e histórico de status.             |
| Broker de mensagens | RabbitMQ             | Publica eventos de pedidos para outros serviços.           |
| API externa         | Gateway de Pagamento | Processa transações de cartão, Pix ou boleto.              |

## 5. Responsável pelo Serviço

**Responsável:** Gustavo de Oliveira Martins  
**Contato:** gustavo.martins1@aluno.ifsp.edu.br

## 6. Procedimentos Básicos de Operação

### Como executar localmente

Requisitos:

- Node.js 18 ou superior.

Comandos:

```bash
npm install
npm start
```

O serviço será iniciado em:

```text
http://localhost:3000
```

### Como verificar logs

Os logs são exibidos no terminal em que o serviço foi iniciado.

Exemplo:

```text
[INFO] pedido-service executando na porta 3000
[INFO] POST /pedidos
```

### Endpoints de health check

O serviço utiliza dois conceitos importantes de observabilidade operacional:

- **Liveness:** indica se o processo da aplicação está vivo. Se falhar, a plataforma pode reiniciar o container ou processo.
- **Readiness:** indica se o serviço está pronto para receber requisições. Se falhar, a plataforma deve remover temporariamente o serviço do balanceamento de carga.

#### Visão geral

```http
GET /health
```

Resposta esperada:

```json
{
  "status": "UP",
  "service": "pedido-service",
  "checks": {
    "liveness": "/health/liveness",
    "readiness": "/health/readiness"
  }
}
```

#### Liveness check

```http
GET /health/liveness
```

Resposta esperada:

```json
{
  "status": "UP",
  "service": "pedido-service",
  "check": "liveness"
}
```

#### Readiness check

```http
GET /health/readiness
```

Resposta esperada quando o serviço está pronto:

```json
{
  "status": "READY",
  "service": "pedido-service",
  "check": "readiness",
  "dependencies": {
    "database": "UP",
    "broker": "UP"
  }
}
```

Caso alguma dependência essencial esteja indisponível, o endpoint deve retornar HTTP `503 Service Unavailable` com status `NOT_READY`.

### Como reiniciar o serviço

1. Encerrar o processo atual com `CTRL + C`.
2. Executar novamente:

```bash
npm start
```

Em ambiente produtivo, o reinício poderia ser feito por uma plataforma como Docker, Kubernetes ou systemd.

## 7. Regras de Negócio

- Um pedido deve possuir um `clienteId` válido.
- Um pedido deve conter pelo menos um item.
- Cada item deve possuir `produtoId`, `quantidade` maior que zero e `precoUnitario` maior que zero.
- O valor total do pedido é calculado pela soma de `quantidade * precoUnitario` de todos os itens.
- Todo pedido novo é criado com status `CRIADO`.
- Um pedido cancelado não pode ter seu status alterado.
- Apenas os status `CRIADO`, `PAGO`, `EM_SEPARACAO`, `ENVIADO`, `ENTREGUE` e `CANCELADO` são aceitos.
- Um pedido só pode ser cancelado se ainda não estiver `ENTREGUE`.

## 8. Eventos Publicados ou Consumidos

### Eventos publicados

| Evento                   | Descrição                                       |
| ------------------------ | ----------------------------------------------- |
| `PedidoCriado`           | Publicado quando um novo pedido é registrado.   |
| `PedidoStatusAtualizado` | Publicado quando o status do pedido é alterado. |
| `PedidoCancelado`        | Publicado quando um pedido é cancelado.         |

### Eventos consumidos

| Evento              | Descrição                                                       |
| ------------------- | --------------------------------------------------------------- |
| `PagamentoAprovado` | Atualiza o pedido para o status `PAGO`.                         |
| `PagamentoRecusado` | Mantém o pedido em aberto ou inicia o processo de cancelamento. |
| `EstoqueReservado`  | Permite avançar o pedido para separação.                        |

## 9. Métricas Monitoradas

Indicadores relevantes para a operação do serviço:

- Quantidade de pedidos criados por minuto.
- Tempo médio de resposta dos endpoints.
- Taxa de erros HTTP `4xx` e `5xx`.
- Quantidade de pedidos cancelados.
- Quantidade de pedidos por status.
- Tempo médio entre a criação e o pagamento do pedido.
- Disponibilidade do endpoint `/health`.
- Disponibilidade do liveness check `/health/liveness`.
- Disponibilidade do readiness check `/health/readiness`.

## 10. ADR Relacionado

### ADR-001: Uso de arquitetura orientada a eventos para pedidos

**Contexto:** Outros serviços, como estoque, pagamento e notificação, precisam reagir a mudanças no pedido.

**Decisão:** O `pedido-service` publicará eventos sempre que um pedido for criado, cancelado ou tiver seu status alterado.

**Consequências:**

- Reduz o acoplamento direto entre os microsserviços.
- Facilita a evolução independente dos serviços.
- Exige monitoramento do broker de mensagens e tratamento de falhas no consumo de eventos.

## Exemplos de uso com cURL

### Health check geral

```bash
curl http://localhost:3000/health
```

### Liveness check

```bash
curl http://localhost:3000/health/liveness
```

### Readiness check

```bash
curl http://localhost:3000/health/readiness
```

### Criar pedido

```bash
curl -X POST http://localhost:3000/pedidos \
  -H "Content-Type: application/json" \
  -d '{
    "clienteId": "cli-1001",
    "itens": [
      {
        "produtoId": "prod-200",
        "quantidade": 2,
        "precoUnitario": 59.9
      }
    ],
    "formaPagamento": "cartao_credito"
  }'
```

### Listar pedidos

```bash
curl http://localhost:3000/pedidos
```
