import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const databasePath = process.env.DB_PATH
  ? resolve(process.env.DB_PATH)
  : fileURLToPath(new URL('./data/managewallet.sqlite', import.meta.url));
mkdirSync(dirname(databasePath), { recursive: true });
const db = new DatabaseSync(databasePath);
const MAX_CENTS = 99_999_999_999;

db.exec(`
  PRAGMA busy_timeout = 5000;
  CREATE TABLE IF NOT EXISTS movimentacoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    descricao TEXT NOT NULL CHECK(length(trim(descricao)) BETWEEN 1 AND 80),
    valor_centavos INTEGER NOT NULL
      CHECK(typeof(valor_centavos) = 'integer' AND valor_centavos BETWEEN 1 AND 99999999999),
    data TEXT NOT NULL,
    tipo TEXT NOT NULL CHECK(tipo IN ('receita', 'despesa'))
  );
`);

const fields = 'id, descricao, valor_centavos AS valorCentavos, data, tipo';
const listAll = db.prepare(`SELECT ${fields} FROM movimentacoes ORDER BY data DESC, id DESC`);
const listType = db.prepare(`SELECT ${fields} FROM movimentacoes WHERE tipo = ? ORDER BY data DESC, id DESC`);
const find = db.prepare(`SELECT ${fields} FROM movimentacoes WHERE id = ? AND tipo = ?`);
const insert = db.prepare('INSERT INTO movimentacoes (descricao, valor_centavos, data, tipo) VALUES (?, ?, ?, ?)');
const remove = db.prepare('DELETE FROM movimentacoes WHERE id = ? AND tipo = ?');
const update = db.prepare('UPDATE movimentacoes SET descricao = ?, valor_centavos = ?, data = ? WHERE id = ? AND tipo = ?');
const totals = db.prepare(`SELECT
  COALESCE(SUM(CASE WHEN tipo = 'receita' THEN valor_centavos ELSE 0 END), 0) AS receitasCentavos,
  COALESCE(SUM(CASE WHEN tipo = 'despesa' THEN valor_centavos ELSE 0 END), 0) AS despesasCentavos
  FROM movimentacoes`);

function fail(message, status = 400) {
  throw Object.assign(new Error(message), { status });
}

function validate(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail('Informe os dados da movimentação.');
  if (Object.keys(body).some(key => !['descricao', 'valorCentavos', 'data'].includes(key))) {
    fail('Campos inválidos. Use descrição, valor em centavos e data.');
  }
  const descricao = typeof body.descricao === 'string' ? body.descricao.trim() : '';
  if (!descricao || descricao.length > 80) fail('Informe uma descrição de até 80 caracteres.');
  if (!Number.isSafeInteger(body.valorCentavos) || body.valorCentavos <= 0 || body.valorCentavos > MAX_CENTS) {
    fail('Informe um valor positivo de até R$ 999.999.999,99, em centavos inteiros.');
  }
  const date = typeof body.data === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.data)
    ? new Date(`${body.data}T00:00:00Z`) : new Date(NaN);
  if (!Number.isFinite(date.getTime()) || body.data < '0001-01-01' || date.toISOString().slice(0, 10) !== body.data) {
    fail('Informe uma data válida.');
  }
  return { descricao, valorCentavos: body.valorCentavos, data: body.data };
}

function get(tipo, id) {
  if (!/^[1-9]\d*$/.test(String(id)) || !Number.isSafeInteger(Number(id))) fail('Identificador inválido.');
  const row = find.get(Number(id), tipo);
  if (!row) fail('Movimentação não encontrada.', 404);
  return row;
}

export default {
  list: tipo => listType.all(tipo),
  state() {
    const totais = totals.get();
    totais.saldoCentavos = totais.receitasCentavos - totais.despesasCentavos;
    return { movimentacoes: listAll.all(), totais };
  },
  create(tipo, body) {
    const row = validate(body);
    const result = insert.run(row.descricao, row.valorCentavos, row.data, tipo);
    return find.get(Number(result.lastInsertRowid), tipo);
  },
  remove(tipo, id) {
    const row = get(tipo, id);
    remove.run(row.id, tipo);
  },
  update(tipo, id, body) {
    const current = get(tipo, id);
    if (!body || typeof body !== 'object' || Array.isArray(body)) fail('Informe os dados da movimentação.');
    const row = validate({
      descricao: current.descricao, valorCentavos: current.valorCentavos, data: current.data, ...body,
    });
    update.run(row.descricao, row.valorCentavos, row.data, current.id, tipo);
    return find.get(current.id, tipo);
  },
  close: () => db.close(),
};
