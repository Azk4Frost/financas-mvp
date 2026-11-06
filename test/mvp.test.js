import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const project = fileURLToPath(new URL('../', import.meta.url));

async function start(databasePath) {
  const child = spawn(process.execPath, ['backend/app.js'], {
    cwd: project,
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let errors = '';
  child.stderr.on('data', chunk => { errors += chunk; });
  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error('Servidor não iniciou: ' + errors));
    }, 10000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => {
      clearTimeout(timer);
      reject(new Error('Servidor encerrou (' + code + '): ' + errors));
    });
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/http:\/\/127\.0\.0\.1:\d+/);
      if (match) { clearTimeout(timer); resolve(match[0]); }
    });
  });
  return { child, url };
}

async function stop(server) {
  if (!server || server.child.exitCode !== null) return;
  const exited = once(server.child, 'exit');
  server.child.kill('SIGTERM');
  const [code] = await exited;
  assert.equal(code, 0, 'encerramento deve fechar o banco corretamente');
}

test('MVP financeiro com SQLite temporário isolado', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'manage-wallet-test-'));
  const database = join(directory, 'data', 'test.sqlite');
  let server;
  t.after(async () => {
    await stop(server);
    await rm(directory, { recursive: true, force: true });
  });
  server = await start(database);

  const call = async (path, method = 'GET', body, expected = 200) => {
    const response = await fetch(server.url + '/api/' + path, {
      method,
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await response.json();
    assert.equal(response.status, expected, JSON.stringify(data));
    return data;
  };
  const state = () => call('movimentacoes');
  const entry = { descricao: 'Receita de teste', valorCentavos: 500000, data: '2026-11-06' };
  let income;
  let expense;

  await t.test('servidor local, HTML, CSS e JavaScript acessíveis; banco vazio', async () => {
    for (const [path, content] of [['/', 'entry-form'], ['/styles.css', '--background'], ['/script.js', 'fetch(']]) {
      const response = await fetch(server.url + path);
      assert.equal(response.status, 200);
      assert.ok((await response.text()).includes(content));
    }
    assert.deepEqual(await state(), {
      movimentacoes: [], totais: { receitasCentavos: 0, despesasCentavos: 0, saldoCentavos: 0 },
    });
    assert.equal((await readFile(database)).subarray(0, 16).toString(), 'SQLite format 3\0');
  });

  await t.test('validações rejeitam dados inválidos sem gravar registros', async () => {
    const invalid = [
      {}, null, [], { ...entry, descricao: '   ' }, { ...entry, descricao: 'x'.repeat(81) },
      { ...entry, valorCentavos: 0 }, { ...entry, valorCentavos: -10 },
      { ...entry, valorCentavos: 1.5 }, { ...entry, valorCentavos: '150' },
      { ...entry, valorCentavos: 100000000000 }, { ...entry, data: '' },
      { ...entry, data: '2026-02-29' }, { ...entry, data: '2026-04-31' },
      { ...entry, data: '0000-01-01' }, { ...entry, data: '06/11/2026' },
      { ...entry, tipo: 'transferencia' },
    ];
    for (const body of invalid) {
      await call('receita', 'POST', body, 400);
      await call('despesa', 'POST', body, 400);
    }
    const malformed = await fetch(server.url + '/api/receita', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{',
    });
    assert.equal(malformed.status, 400);
    assert.equal((await malformed.json()).message, 'JSON inválido.');
    assert.equal((await state()).movimentacoes.length, 0);
  });

  await t.test('receita e despesa são registradas e os totais são calculados pelo banco', async () => {
    income = (await call('receita', 'POST', entry, 201)).nova_receita;
    expense = (await call('despesa', 'POST', {
      descricao: 'Despesa de teste', valorCentavos: 31240, data: '2026-11-05',
    }, 201)).nova_despesa;
    const data = await state();
    assert.deepEqual(data.totais, { receitasCentavos: 500000, despesasCentavos: 31240, saldoCentavos: 468760 });
    assert.deepEqual(data.movimentacoes.map(row => row.id), [income.id, expense.id]);
    assert.equal((await call('receita'))[0].tipo, 'receita');
    assert.equal((await call('despesa'))[0].tipo, 'despesa');
  });

  await t.test('centavos mantêm precisão e consultas parametrizadas preservam texto literal', async () => {
    for (const valorCentavos of [10, 20]) {
      await call('receita', 'POST', { ...entry, descricao: 'Centavos', valorCentavos }, 201);
    }
    const text = "O'Brien'); DROP TABLE movimentacoes; --";
    const result = await call('despesa', 'POST', {
      ...entry, descricao: text, valorCentavos: 1, data: '2024-02-29',
    }, 201);
    assert.equal(result.nova_despesa.descricao, text);
    assert.deepEqual(result.totais, { receitasCentavos: 500030, despesasCentavos: 31241, saldoCentavos: 468789 });
  });

  await t.test('rotas existentes de atualização e exclusão validam campos, tipo e identificador', async () => {
    await call('receita/' + income.id, 'PATCH', { id: 900 }, 400);
    await call('receita/' + income.id, 'PATCH', { valorCentavos: -10 }, 400);
    await call('receita/' + income.id, 'PATCH', { descricao: 'Receita persistente' });
    await call('despesa/' + income.id, 'DELETE', undefined, 404);
    await call('receita/1abc', 'DELETE', undefined, 400);
    await call('receita/9999999', 'DELETE', undefined, 404);
    const data = await state();
    assert.equal(data.movimentacoes.find(row => row.id === income.id).descricao, 'Receita persistente');
    assert.equal(data.totais.saldoCentavos, 468789);
    assert.equal(data.movimentacoes.length, 5);
  });

  await t.test('registros e totais persistem após encerrar e reiniciar o processo', async () => {
    const before = await state();
    await stop(server);
    server = null;
    server = await start(database);
    assert.deepEqual(await state(), before);
  });

  await t.test('exclusão atualiza totais e permanece após reiniciar', async () => {
    const result = await call('despesa/' + expense.id, 'DELETE');
    assert.equal(result.movimentacoes.some(row => row.id === expense.id), false);
    assert.deepEqual(result.totais, { receitasCentavos: 500030, despesasCentavos: 1, saldoCentavos: 500029 });
    await call('despesa/' + expense.id, 'DELETE', undefined, 404);
    const before = await state();
    await stop(server);
    server = null;
    server = await start(database);
    assert.deepEqual(await state(), before);
    for (const row of before.movimentacoes) await call(row.tipo + '/' + row.id, 'DELETE');
    assert.deepEqual((await state()).totais, { receitasCentavos: 0, despesasCentavos: 0, saldoCentavos: 0 });
  });
});
