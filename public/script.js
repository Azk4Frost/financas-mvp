/* Manage Wallet — os registros exibidos vêm sempre da API e do SQLite local. */
const money = cents => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const form = document.getElementById('entry-form');
const dialog = document.getElementById('entry');
const list = document.getElementById('transactions');
const search = document.getElementById('search');
const retry = document.getElementById('retry');
const formError = document.getElementById('form-error');
const period = document.getElementById('period');
let rows = []; // Cópia para exibição; a persistência continua no servidor.
let busy = false;
let loaded = false;

const today = new Date();
let selectedPeriod = String(today.getFullYear()).padStart(4, '0') + '-' + String(today.getMonth() + 1).padStart(2, '0');
period.value = selectedPeriod;
function updatePeriodLabel() {
  document.getElementById('current-date').textContent = new Date(selectedPeriod + '-01T00:00:00Z')
    .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}
updatePeriodLabel();
document.getElementById('greeting').textContent =
  today.getHours() < 12 ? 'Bom dia,' : today.getHours() < 18 ? 'Boa tarde,' : 'Boa noite,';

function status(message, error = false) {
  const element = document.getElementById('status');
  element.textContent = message;
  element.className = error ? 'error' : 'muted';
}

function connection(state) {
  document.getElementById('connection-state').dataset.state = state;
  const labels = {
    connected: ['Modo offline', 'Dados salvos neste dispositivo'],
    disconnected: ['Servidor desconectado', 'Verifique o servidor local'],
    error: ['Dados indisponíveis', 'Tente conectar novamente'],
  };
  const [label, detail] = labels[state];
  document.getElementById('connection-label').textContent = label;
  document.getElementById('connection-detail').textContent = detail;
}

function setBusy(value) {
  busy = value;
  form.setAttribute('aria-busy', String(value));
  list.setAttribute('aria-busy', String(value));
  form.querySelectorAll('input, select, button').forEach(element => { element.disabled = value; });
  document.querySelectorAll('[data-type], .delete, #new-transaction').forEach(button => {
    button.disabled = value || !loaded;
  });
  period.disabled = value;
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
    connection('disconnected');
    throw new Error('Sem conexão com o servidor. Verifique se a aplicação está em execução.');
  }
  const data = await response.json().catch(() => {
    connection('error');
    throw new Error('Resposta inválida do servidor. Tente novamente.');
  });
  if (!response.ok) {
    if (response.status >= 500) connection('error');
    throw new Error(data.message || 'Não foi possível concluir a operação.');
  }
  connection('connected');
  return data;
}

function applyState(data) {
  rows = data.movimentacoes;
  loaded = true;
  render();
}

// Os totais mensais e o gráfico usam os lançamentos reais já fornecidos pela API.
function periodData() {
  const start = selectedPeriod + '-01';
  const date = new Date(start + 'T00:00:00Z');
  const end = new Date(date);
  end.setUTCMonth(end.getUTCMonth() + 1);
  end.setUTCDate(0);
  const days = end.getUTCDate();
  const last = selectedPeriod + '-' + String(days).padStart(2, '0');
  const daily = Array(days + 1).fill(0);
  const monthRows = [];
  let opening = 0;
  let income = 0;
  let expense = 0;
  for (const row of rows) {
    const signed = row.tipo === 'receita' ? row.valorCentavos : -row.valorCentavos;
    if (row.data < start) opening += signed;
    else if (row.data <= last) {
      monthRows.push(row);
      if (row.tipo === 'receita') income += row.valorCentavos;
      else expense += row.valorCentavos;
      daily[Number(row.data.slice(8, 10))] += signed;
    }
  }
  let accumulated = opening;
  const balances = daily.map(delta => { accumulated += delta; return accumulated; });
  return {
    monthRows, income, expense, opening, balances, last, days,
    balance: opening + income - expense,
    label: date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
    hasHistory: rows.some(row => row.data <= last),
  };
}

function drawChart(data) {
  const chart = document.getElementById('balance-chart');
  const empty = document.getElementById('chart-empty');
  chart.toggleAttribute('hidden', !data.hasHistory);
  document.getElementById('chart-labels').hidden = !data.hasHistory;
  empty.hidden = data.hasHistory;
  if (!data.hasHistory) {
    empty.textContent = 'Registre uma movimentação para acompanhar a evolução do saldo.';
    document.getElementById('chart-line').setAttribute('points', '');
    return;
  }
  const min = Math.min(...data.balances);
  const range = Math.max(...data.balances) - min;
  const points = data.balances.map((balance, index) => {
    const x = 8 + (index / data.days) * 624;
    const y = range ? 104 - ((balance - min) / range) * 96 : 56;
    return x.toFixed(2) + ',' + y.toFixed(2);
  });
  document.getElementById('chart-line').setAttribute('points', points.join(' '));
  document.getElementById('chart-description').textContent =
    'Saldo acumulado em ' + data.label + '. Início: ' + money(data.opening) + '. Fim: ' + money(data.balance) + '.';
  document.getElementById('chart-start').textContent = '01/' + selectedPeriod.slice(5);
  document.getElementById('chart-end').textContent = String(data.days).padStart(2, '0') + '/' + selectedPeriod.slice(5);
}

function renderList(target, entries, deletable) {
  target.replaceChildren();
  for (const row of entries) {
    const li = document.createElement('li');
    const details = document.createElement('div');
    const name = document.createElement('p');
    const type = document.createElement('small');
    const right = document.createElement('div');
    const value = document.createElement('p');
    const date = document.createElement('time');
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
    li.append(details, right);
    if (deletable) {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'delete';
      remove.textContent = 'Excluir';
      remove.setAttribute('aria-label', 'Excluir ' + row.descricao);
      remove.disabled = busy;
      remove.addEventListener('click', () => deleteEntry(row));
      li.append(remove);
    }
    target.append(li);
  }
}

function render() {
  if (!loaded) return;
  const data = periodData();
  document.getElementById('balance').textContent = money(data.balance);
  document.getElementById('balance').classList.toggle('negative', data.balance < 0);
  document.getElementById('balance-note').textContent = 'Acumulado até ' + data.last.split('-').reverse().join('/');
  document.getElementById('income').textContent = money(data.income);
  document.getElementById('expense').textContent = money(data.expense);
  const change = document.getElementById('balance-change');
  const difference = data.balance - data.opening;
  change.className = data.opening === 0 || difference === 0 ? 'muted' : difference > 0 ? 'positive' : 'negative';
  change.textContent = data.opening === 0 ? 'Sem comparação'
    : (difference > 0 ? '+' : '') + ((difference / Math.abs(data.opening)) * 100)
      .toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
  change.title = data.opening === 0 ? 'O saldo ao fim do mês anterior é zero.'
    : 'Saldo ao fim do mês anterior: ' + money(data.opening);
  drawChart(data);
  renderList(document.getElementById('recent-transactions'), data.monthRows.slice(0, 5), false);
  document.getElementById('recent-empty').hidden = data.monthRows.length > 0;
  const query = search.value.trim().toLocaleLowerCase('pt-BR');
  const filtered = data.monthRows.filter(row =>
    (row.descricao + ' ' + row.tipo).toLocaleLowerCase('pt-BR').includes(query));
  renderList(list, filtered, true);
  document.getElementById('transactions-period').textContent =
    data.monthRows.length + (data.monthRows.length === 1 ? ' movimentação · ' : ' movimentações · ') + data.label;
  const empty = document.getElementById('empty');
  empty.textContent = query ? 'Nenhuma movimentação encontrada.' : 'Nenhuma movimentação neste mês.';
  empty.hidden = filtered.length > 0;
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
    if (!loaded) document.getElementById('chart-empty').textContent = 'A evolução aparecerá quando seus dados estiverem disponíveis.';
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
    retry.hidden = false;
  } finally {
    setBusy(false);
  }
}

function updateTitle() {
  document.getElementById('entry-title').textContent =
    form.elements.tipo.value === 'receita' ? 'Adicionar receita' : 'Adicionar despesa';
}

function openEntry(tipo = 'receita') {
  if (busy || !loaded) return;
  form.reset();
  formError.textContent = '';
  form.elements.tipo.value = tipo;
  updateTitle();
  const date = new Date();
  const currentMonth = String(date.getFullYear()).padStart(4, '0') + '-' + String(date.getMonth() + 1).padStart(2, '0');
  form.elements.date.value = selectedPeriod === currentMonth
    ? currentMonth + '-' + String(date.getDate()).padStart(2, '0') : selectedPeriod + '-01';
  dialog.showModal();
}

document.querySelectorAll('[data-type]').forEach(button => button.addEventListener('click', () => openEntry(button.dataset.type)));
document.getElementById('new-transaction').addEventListener('click', () => openEntry());
form.elements.tipo.addEventListener('change', updateTitle);
document.getElementById('cancel').addEventListener('click', () => dialog.close());
dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
search.addEventListener('input', render);
retry.addEventListener('click', load);
period.addEventListener('click', () => {
  if (typeof period.showPicker === 'function') {
    try { period.showPicker(); } catch { /* O controle nativo continua acessível pelo teclado. */ }
  }
});
period.addEventListener('change', () => {
  if (!/^\d{4}-\d{2}$/.test(period.value) || !period.checkValidity()) {
    period.value = selectedPeriod;
    status('Selecione um mês válido.', true);
    return;
  }
  selectedPeriod = period.value;
  updatePeriodLabel();
  search.value = '';
  if (document.getElementById('status').textContent === 'Selecione um mês válido.') status('');
  render();
});

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
    selectedPeriod = String(data.get('date')).slice(0, 7);
    period.value = selectedPeriod;
    updatePeriodLabel();
    search.value = '';
    applyState(result);
    retry.hidden = true;
    dialog.close();
    status('Movimentação salva.');
  } catch (error) {
    formError.textContent = error.message;
  } finally {
    setBusy(false);
  }
});

/* Navegação local: cada endereço pode ser aberto diretamente ou revisitado. */
const viewNames = {
  inicio: 'Início', transacoes: 'Transações', categorias: 'Categorias',
  metas: 'Metas', relatorios: 'Relatórios', configuracoes: 'Configurações',
};
const sidebar = document.getElementById('sidebar');
const menuToggle = document.getElementById('menu-toggle');
const backdrop = document.getElementById('menu-backdrop');
const main = document.getElementById('main-content');
const mobile = window.matchMedia('(max-width: 1000px)');

function setMenu(open, restoreFocus = true) {
  const wasOpen = document.body.classList.contains('menu-open');
  open = open && mobile.matches;
  document.body.classList.toggle('menu-open', open);
  sidebar.inert = mobile.matches && !open;
  sidebar.setAttribute('aria-hidden', String(mobile.matches && !open));
  main.inert = open;
  backdrop.hidden = !open;
  menuToggle.setAttribute('aria-expanded', String(open));
  if (open) sidebar.querySelector('.nav-link[aria-current="page"]').focus();
  else if (wasOpen && restoreFocus) menuToggle.focus();
}

function showView(name, focus = true, updateHistory = true) {
  const view = Object.hasOwn(viewNames, name) ? name : 'inicio';
  document.querySelectorAll('[data-view-panel]').forEach(panel => { panel.hidden = panel.dataset.viewPanel !== view; });
  document.querySelectorAll('.nav-link').forEach(link => {
    if (link.dataset.view === view) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  setMenu(false, false);
  document.title = viewNames[view] + ' — Manage Wallet';
  if (updateHistory && location.hash !== '#' + view) history.pushState(null, '', '#' + view);
  if (focus) {
    document.getElementById('view-' + view).focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
}

document.querySelectorAll('a[data-view]').forEach(link => link.addEventListener('click', event => {
  if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  showView(link.dataset.view);
}));
window.addEventListener('popstate', () => showView(location.hash.slice(1), false, false));
window.addEventListener('hashchange', () => showView(location.hash.slice(1), false, false));
menuToggle.addEventListener('click', () => setMenu(!document.body.classList.contains('menu-open')));
document.getElementById('close-menu').addEventListener('click', () => setMenu(false));
backdrop.addEventListener('click', () => setMenu(false));
mobile.addEventListener('change', () => setMenu(false, false));
document.addEventListener('keydown', event => {
  if (!document.body.classList.contains('menu-open')) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    setMenu(false);
  } else if (event.key === 'Tab') {
    const elements = [...sidebar.querySelectorAll('a[href], button:not([disabled])')];
    const first = elements[0];
    const last = elements[elements.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
});

showView(location.hash.slice(1), false, false);
load();
