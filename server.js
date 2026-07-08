// Servidor Node para deploy na Hostinger (compatível com Phusion Passenger).
// A Hostinger define a porta via process.env.PORT; o Next serve a build de
// produção gerada por `npm run build`.
const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");

const port = parseInt(process.env.PORT || "3000", 10);
const hostname = process.env.HOSTNAME || "0.0.0.0";

const app = next({ dev: false, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer((req, res) => {
    handle(req, res, parse(req.url, true));
  }).listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`GPS rodando em http://${hostname}:${port}`);
  });
});
