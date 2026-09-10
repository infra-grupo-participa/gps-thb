// Servidor Node para deploy na Hostinger (compatível com Phusion Passenger).
// A Hostinger define a porta via process.env.PORT; o Next serve a build de
// produção gerada por `npm run build`.
//
// ═══════════════════════════════════════════════════════════════════════════
// 🔴 POR QUE ESTE ARQUIVO TEM TRATAMENTO DE ERRO (10/09/2026)
// ═══════════════════════════════════════════════════════════════════════════
//
// Queixa do Marcio: *"algumas rotas por nada dão um erro e a rota cai. Quando
// eu clico em uma funcionalidade, ele abre uma rota que está caída."*
//
// O log de produção da Hostinger mostrou a causa, e ela NÃO é código morto
// nem rota mal definida:
//
//   ERROR  failed to get redirect response TypeError: fetch failed
//          at node:internal/deps/undici/undici
//
// É o servidor da Hostinger não conseguindo abrir a conexão com o Supabase.
// Acontece de forma INTERMITENTE — 2 dos 3 erros registrados numa janela de
// 3 minutos eram esse. O Supabase está no ar (12 chamadas seguidas daqui:
// 0 falhas, ~390 ms constantes); é a saída de rede do plano compartilhado que
// engasga sob concorrência de CPU.
//
// A versão anterior deste arquivo não tinha NENHUM `try`, `catch`,
// `uncaughtException` ou `unhandledRejection` (medido: 0 ocorrências). Com
// isso, um `fetch` que rejeitasse fora do ciclo de request derrubava o
// PROCESSO INTEIRO — e, enquanto o Passenger reiniciava, TODAS as rotas
// ficavam fora do ar, não só a que falhou. Uma falha de rede de 1 requisição
// virava indisponibilidade geral de alguns segundos.
//
// 🔑 O QUE ESTE ARQUIVO FAZ AGORA: contém a falha no request que a causou.
// A pessoa vê um erro numa tela; as outras continuam navegando. Não é
// esconder problema — é impedir que o problema de um vire o problema de
// todos. O erro continua indo para o log, com a URL, para dar rastro.
//
// ⚠️ Isto NÃO conserta a instabilidade de rede da Hostinger. Conserta o
//    efeito dela: derrubar o portal inteiro. A causa raiz é o plano
//    compartilhado (medido: TTFB da MESMA página estática variando de 0,09 s
//    a 1,26 s, 14×, sem o banco no caminho).

const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");

const port = parseInt(process.env.PORT || "3000", 10);
const hostname = process.env.HOSTNAME || "0.0.0.0";

const app = next({ dev: false, hostname, port });
const handle = app.getRequestHandler();

/** Uma linha JSON por erro — mesmo formato de `src/lib/log.ts`. */
function logFalha(escopo, erro, extra) {
  try {
    console.error(
      JSON.stringify({
        nivel: "erro",
        escopo,
        message: erro && erro.message ? erro.message : String(erro),
        code: erro && erro.code ? erro.code : null,
        ...extra,
        em: new Date().toISOString(),
      }),
    );
  } catch {
    // Se nem logar dá, não é o log que vai derrubar o servidor.
  }
}

// 🔴 AS DUAS REDES DE SEGURANÇA DO PROCESSO.
//
// Sem elas, o Node encerra o processo por padrão. `fetch failed` do undici
// chega aqui quando a rejeição escapa do ciclo de request — e é exatamente
// o erro que o log de produção mostrou.
//
// Mantemos o processo vivo de propósito: o Next já isola a falha de UM
// request (o `error.tsx` da rota cuida da tela); derrubar o processo
// transforma isso em queda de todo o portal para todo mundo.
process.on("unhandledRejection", (motivo) => {
  logFalha("processo/unhandledRejection", motivo);
});

process.on("uncaughtException", (erro) => {
  logFalha("processo/uncaughtException", erro);
});

app
  .prepare()
  .then(() => {
    const servidor = createServer((req, res) => {
      // `handle` devolve uma Promise. Sem este `catch`, uma rejeição vira
      // `unhandledRejection` — e o cliente fica esperando até o timeout,
      // sem resposta nenhuma. É a "rota que trava" da queixa.
      Promise.resolve(handle(req, res, parse(req.url, true))).catch((erro) => {
        logFalha("request", erro, { url: req.url });
        if (!res.headersSent) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end("Erro ao carregar esta página. Tente de novo.");
        } else {
          // Cabeçalho já foi: não dá para trocar o status, só encerrar —
          // senão a conexão fica pendurada até o timeout do navegador.
          res.end();
        }
      });
    });

    // Erro de socket (cliente que desconecta no meio, conexão cortada pelo
    // LiteSpeed) não pode derrubar o servidor.
    servidor.on("clientError", (erro, socket) => {
      logFalha("servidor/clientError", erro);
      if (socket.writable) socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
    });

    servidor.listen(port, () => {
      // eslint-disable-next-line no-console
      console.log(`GPS rodando em http://${hostname}:${port}`);
    });
  })
  .catch((erro) => {
    // Falha ao PREPARAR o Next é fatal de verdade: não há o que servir.
    // Aqui sair é correto — o Passenger reinicia e tenta de novo.
    logFalha("processo/prepare", erro);
    process.exit(1);
  });
