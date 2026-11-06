import express from 'express';
import { fileURLToPath } from 'node:url';
import store from './database.js';
import rotasDespesas from './routes/despesa.js';
import rotasReceitas from './routes/receita.js';

const port = Number(process.env.PORT ?? 3333);
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  throw new Error('PORT deve ser um número entre 0 e 65535.');
}

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '16kb' }));
app.use('/api', (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

app.get('/api/movimentacoes', (_req, res) => res.json(store.state()));
app.use('/api/despesa', rotasDespesas);
app.use('/api/receita', rotasReceitas);
app.use('/api', (_req, res) => res.status(404).json({ message: 'Rota não encontrada.' }));
app.use(express.static(fileURLToPath(new URL('../public/', import.meta.url))));

app.use((error, _req, res, _next) => {
  const status = error.status === 400 || error.status === 404 || error.status === 413
    ? error.status : 500;
  if (status === 500) console.error(error);
  const message = error.type === 'entity.parse.failed'
    ? 'JSON inválido.'
    : status === 413 ? 'Solicitação muito grande.'
      : status === 500 ? 'Não foi possível acessar os dados. Tente novamente.' : error.message;
  res.status(status).json({ message });
});

const server = app.listen(port, '127.0.0.1', () => {
  console.log(`Manage Wallet: http://127.0.0.1:${server.address().port}`);
});
server.on('error', error => {
  console.error(`Não foi possível iniciar o servidor: ${error.message}`);
  store.close();
  process.exitCode = 1;
});

function shutdown() {
  server.close(() => {
    store.close();
    process.exit(0);
  });
  server.closeIdleConnections();
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
