/* Manage Wallet — a interface sempre recebe seus registros e totais do SQLite. */
const money = cents => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const form = document.getElementById('entry-form');
const dialog = document.getElementById('entry');
const list = document.getElementById('transactions');
const search = document.getElementById('search');
const retry = document.getElementById('retry');
const formError = document.getElementById('form-error');
let rows = []; // Apenas a cópia exibida dos registros recebidos da API.
let busy = false;
let loaded = false;

const today = new Date();
document.getElementById('greeting').textContent =
  today.getHours() < 12 ? 'Bom dia,' : today.getHours() < 18 ? 'Boa tarde,' : 'Boa noite,';
document.getElementById('current-date').textContent =
  today.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

function status(message, error = false) {
  const element = document.getElementById('status');
  element.textContent = message;
  element.className = error ? 'error' : 'muted';
}

function setBusy(value) {
  busy = value;
  form.setAttribute('aria-busy', String(value));
  list.setAttribute('aria-busy', String(value));
  form.querySelectorAll('input, select, button').forEach(element => { element.disabled = value; });
  document.querySelectorAll('[data-type], .delete').forEach(button => { button.disabled = value || !loaded; });
  retry.disabled = value;
}

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch('/api/' + path, {
      cache: 'no-store',
      ...options,
      headers: options.body ? { 'Content-Type': 'application/json' } : {},
    });
  } catch {
    throw new Error('Sem conexão com o servidor. Verifique se a aplicação está em execução.');
  }
  const data = await response.json().catch(() => {
    throw new Error('Resposta inválida do servidor. Tente novamente.');
  });
  if (!response.ok) throw new Error(data.message || 'Não foi possível concluir a operação.');
  return data;
}

function applyState(data) {
  rows = data.movimentacoes;
  loaded = true;
  document.getElementById('balance').textContent = money(data.totais.saldoCentavos);
  document.getElementById('balance').classList.toggle('negative', data.totais.saldoCentavos < 0);
  document.getElementById('income').textContent = money(data.totais.receitasCentavos);
  document.getElementById('expense').textContent = money(data.totais.despesasCentavos);
  render();
}

function render() {
  const query = search.value.trim().toLocaleLowerCase('pt-BR');
  const filtered = rows.filter(row =>
    (row.descricao + ' ' + row.tipo).toLocaleLowerCase('pt-BR').includes(query));
  list.replaceChildren();
  for (const row of filtered) {
    const li = document.createElement('li');
    const details = document.createElement('div');
    const name = document.createElement('p');
    const type = document.createElement('small');
    const right = document.createElement('div');
    const value = document.createElement('p');
    const date = document.createElement('time');
    const remove = document.createElement('button');

    details.className = 'transaction-details';
    name.textContent = row.descricao;
    type.textContent = row.tipo === 'receita' ? 'Receita' : 'Despesa';
    details.append(name, type);
    right.className = 'right';
    value.className = row.tipo === 'receita' ? 'positive' : 'negative';
    value.textContent = (row.tipo === 'receita' ? '+ ' : '− ') + money(row.valorCentavos);
    date.dateTime = row.data;
    date.textContent = row.data.slice(8, 10) + '/' + row.data.slice(5, 7) + '/' + row.data.slice(0, 4);
    right.append(value, date);
    remove.type = 'button';
    remove.className = 'delete';
    remove.textContent = 'Excluir';
    remove.setAttribute('aria-label', 'Excluir ' + row.descricao);
    remove.disabled = busy;
    remove.addEventListener('click', () => deleteEntry(row));
    li.append(details, right, remove);
    list.append(li);
  }
  const empty = document.getElementById('empty');
  empty.textContent = query ? 'Nenhuma movimentação encontrada.' : 'Nenhuma movimentação registrada.';
  empty.hidden = !loaded || filtered.length > 0;
}

async function load() {
  setBusy(true);
  retry.hidden = true;
  status('Carregando movimentações…');
  try {
    applyState(await request('movimentacoes'));
    status('');
  } catch (error) {
    status(error.message, true);
    retry.hidden = false;
  } finally {
    setBusy(false);
  }
}

async function deleteEntry(row) {
  if (busy || !window.confirm('Excluir "' + row.descricao + '" de ' + money(row.valorCentavos) + '?')) return;
  setBusy(true);
  try {
    applyState(await request(row.tipo + '/' + row.id, { method: 'DELETE' }));
    status('Movimentação excluída.');
  } catch (error) {
    status(error.message, true);
  } finally {
    setBusy(false);
  }
}

function updateTitle() {
  document.getElementById('entry-title').textContent =
    form.elements.tipo.value === 'receita' ? 'Adicionar receita' : 'Adicionar despesa';
}

document.querySelectorAll('[data-type]').forEach(button => button.addEventListener('click', () => {
  if (busy) return;
  form.reset();
  formError.textContent = '';
  form.elements.tipo.value = button.dataset.type;
  updateTitle();
  const date = new Date();
  form.elements.date.value = [
    date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0'),
  ].join('-');
  dialog.showModal();
}));
form.elements.tipo.addEventListener('change', updateTitle);
document.getElementById('cancel').addEventListener('click', () => dialog.close());
dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
search.addEventListener('input', render);
retry.addEventListener('click', load);

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (busy || !form.reportValidity()) return;
  const data = new FormData(form);
  const match = String(data.get('amount')).trim().match(/^(\d+)(?:[.,](\d{1,2}))?$/);
  const cents = match ? Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0')) : NaN;
  const descricao = String(data.get('description')).trim();
  if (!descricao || !Number.isSafeInteger(cents) || cents <= 0 || cents > 99_999_999_999) {
    formError.textContent = 'Informe uma descrição e um valor positivo de até R$ 999.999.999,99.';
    return;
  }
  const tipo = String(data.get('tipo'));
  if (!['receita', 'despesa'].includes(tipo)) {
    formError.textContent = 'Selecione receita ou despesa.';
    return;
  }
  formError.textContent = '';
  setBusy(true);
  try {
    const result = await request(tipo, {
      method: 'POST',
      body: JSON.stringify({ descricao, valorCentavos: cents, data: String(data.get('date')) }),
    });
    search.value = '';
    applyState(result);
    dialog.close();
    status('Movimentação salva.');
  } catch (error) {
    formError.textContent = error.message;
  } finally {
    setBusy(false);
  }
});

load();
