const http = require("http");

const PORT = process.env.PORT || 3000;
const pedidos = [];
let nextId = 1;

const statusPermitidos = [
  "CRIADO",
  "PAGO",
  "EM_SEPARACAO",
  "ENVIADO",
  "ENTREGUE",
  "CANCELADO"
];

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data, null, 2));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", chunk => {
      body += chunk;
    });

    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error("JSON inválido."));
      }
    });
  });
}

function validarPedido(payload) {
  if (!payload.clienteId) {
    return "clienteId é obrigatório.";
  }

  if (!Array.isArray(payload.itens) || payload.itens.length === 0) {
    return "O pedido deve conter pelo menos um item.";
  }

  for (const item of payload.itens) {
    if (!item.produtoId) {
      return "produtoId é obrigatório para todos os itens.";
    }

    if (!Number.isFinite(item.quantidade) || item.quantidade <= 0) {
      return "quantidade deve ser maior que zero.";
    }

    if (!Number.isFinite(item.precoUnitario) || item.precoUnitario <= 0) {
      return "precoUnitario deve ser maior que zero.";
    }
  }

  return null;
}

function calcularTotal(itens) {
  return Number(
    itens.reduce((total, item) => total + item.quantidade * item.precoUnitario, 0).toFixed(2)
  );
}

function encontrarPedido(id) {
  return pedidos.find(pedido => pedido.id === id);
}

function publicarEvento(nome, payload) {
  console.log("[EVENTO]", nome, JSON.stringify(payload));
}

function verificarDependencias() {
  return {
    database: "UP",
    broker: "UP",
    dependenciesReady: true
  };
}

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;

  console.log("[INFO]", req.method, path);

  if (req.method === "GET" && path === "/health") {
    sendJson(res, 200, {
      status: "UP",
      service: "pedido-service",
      checks: {
        liveness: "/health/liveness",
        readiness: "/health/readiness"
      }
    });
    return;
  }

  if (req.method === "GET" && path === "/health/liveness") {
    sendJson(res, 200, {
      status: "UP",
      service: "pedido-service",
      check: "liveness"
    });
    return;
  }

  if (req.method === "GET" && path === "/health/readiness") {
    const dependencies = verificarDependencias();
    const statusCode = dependencies.dependenciesReady ? 200 : 503;

    sendJson(res, statusCode, {
      status: dependencies.dependenciesReady ? "READY" : "NOT_READY",
      service: "pedido-service",
      check: "readiness",
      dependencies: {
        database: dependencies.database,
        broker: dependencies.broker
      }
    });
    return;
  }

  if (req.method === "GET" && path === "/pedidos") {
    sendJson(res, 200, pedidos);
    return;
  }

  if (req.method === "POST" && path === "/pedidos") {
    try {
      const payload = await parseBody(req);
      const erroValidacao = validarPedido(payload);

      if (erroValidacao) {
        sendJson(res, 400, { erro: erroValidacao });
        return;
      }

      const pedido = {
        id: `ped-${nextId++}`,
        clienteId: payload.clienteId,
        itens: payload.itens,
        formaPagamento: payload.formaPagamento || "nao_informada",
        status: "CRIADO",
        valorTotal: calcularTotal(payload.itens),
        criadoEm: new Date().toISOString()
      };

      pedidos.push(pedido);
      publicarEvento("PedidoCriado", pedido);
      sendJson(res, 201, pedido);
    } catch (error) {
      sendJson(res, 400, { erro: error.message });
    }

    return;
  }

  const pedidoByIdMatch = path.match(/^\/pedidos\/([^/]+)$/);

  if (pedidoByIdMatch && req.method === "GET") {
    const pedido = encontrarPedido(pedidoByIdMatch[1]);

    if (!pedido) {
      sendJson(res, 404, { erro: "Pedido não encontrado." });
      return;
    }

    sendJson(res, 200, pedido);
    return;
  }

  if (pedidoByIdMatch && req.method === "DELETE") {
    const pedido = encontrarPedido(pedidoByIdMatch[1]);

    if (!pedido) {
      sendJson(res, 404, { erro: "Pedido não encontrado." });
      return;
    }

    if (pedido.status === "ENTREGUE") {
      sendJson(res, 409, { erro: "Pedido entregue não pode ser cancelado." });
      return;
    }

    pedido.status = "CANCELADO";
    pedido.atualizadoEm = new Date().toISOString();
    publicarEvento("PedidoCancelado", pedido);
    sendJson(res, 200, pedido);
    return;
  }

  const statusMatch = path.match(/^\/pedidos\/([^/]+)\/status$/);

  if (statusMatch && req.method === "PATCH") {
    try {
      const pedido = encontrarPedido(statusMatch[1]);

      if (!pedido) {
        sendJson(res, 404, { erro: "Pedido não encontrado." });
        return;
      }

      if (pedido.status === "CANCELADO") {
        sendJson(res, 409, { erro: "Pedido cancelado não pode ser atualizado." });
        return;
      }

      const payload = await parseBody(req);

      if (!statusPermitidos.includes(payload.status)) {
        sendJson(res, 400, { erro: "Status inválido." });
        return;
      }

      pedido.status = payload.status;
      pedido.atualizadoEm = new Date().toISOString();
      publicarEvento("PedidoStatusAtualizado", pedido);
      sendJson(res, 200, pedido);
    } catch (error) {
      sendJson(res, 400, { erro: error.message });
    }

    return;
  }

  sendJson(res, 404, { erro: "Endpoint não encontrado." });
}

const server = http.createServer(handleRequest);

server.listen(PORT, () => {
  console.log(`[INFO] pedido-service executando na porta ${PORT}`);
});
