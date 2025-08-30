// ---------- State ----------
const state = {
  filtersDef: {},
  selectedFilters: {},
  products: [],
  services: [],
  cart: {},
  activeTab: 'filter',
  productForServices: null
};

const CART_KEY = 'mini_shop_cart_v2';

// ---------- Utils ----------
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const byId = id => document.getElementById(id);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fmtPrice = n => (Number(n || 0)).toLocaleString('de-DE', { style:'currency', currency:'EUR' });
const norm = v => (v ?? '').toString().trim();
const toLower = v => norm(v).toLowerCase();
const parseServiceIds = val => !val ? [] : val.toString().split(/[;,"]/).map(s => s.trim()).filter(Boolean);

// ---------- Sanitizers ----------
function sanitizeString(s, {max=300}={}) {
  let v = String(s ?? '');
  v = v.replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F\u007F]/g, '');
  v = v.replace(/[\u200B-\u200F\uFEFF]/g, '');
  if (v.length > max) v = v.slice(0, max);
  return v;
}
function sanitizeId(s, {max=100}={}) {
  let v = sanitizeString(s, {max}).trim();
  v = v.replace(/[^a-zA-Z0-9._\-]/g, '');
  return v;
}
function sanitizeArrayOfIds(arr) {
  return (arr || []).map(x => sanitizeId(x)).filter(Boolean);
}

// ---------- Toast ----------
function showToast(msg='Hinzugefügt') {
  const el = byId('toast');
  el.textContent = sanitizeString(msg);
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 1200);
}

// ---------- Tabs ----------
function setActiveTab(name) {
  state.activeTab = name;
  $$('.tab-panel').forEach(p => p.classList.add('tw-hidden'));
  $$('.tab-btn').forEach(b => {
    if (b.dataset.tab === name) {
      b.classList.remove('bg-gray-50');
      b.classList.add('bg-white');
    } else {
      b.classList.add('bg-gray-50');
      b.classList.remove('bg-white');
    }
  });
  byId(`panel-${name}`).classList.remove('tw-hidden');
  render();
}

// ---------- Cart Storage (Session only + validation) ----------
const storage = (() => {
  try {
    const t = '__test__';
    sessionStorage.setItem(t, '1');
    sessionStorage.removeItem(t);
    return sessionStorage;
  } catch {
    let mem = {};
    return {
      getItem: k => mem[k] ?? null,
      setItem: (k, v) => { mem[k] = v; },
      removeItem: k => { delete mem[k]; }
    };
  }
})();

function sanitizeCart(rawObj) {
  const out = {};
  if (!rawObj || typeof rawObj !== 'object') return out;
  for (const [pid, val] of Object.entries(rawObj)) {
    const id = sanitizeId(pid);
    const qty = Number(val?.qty);
    if (!id || !Number.isFinite(qty) || qty <= 0) continue;
    out[id] = { qty: Math.min(qty, 9999) };
  }
  return out;
}

function loadCart() {
  try {
    const raw = storage.getItem(CART_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    state.cart = sanitizeCart(parsed);
  } catch { state.cart = {}; }
  updateCartBadge();
}
function saveCart() {
  try {
    storage.setItem(CART_KEY, JSON.stringify(state.cart));
  } catch {}
  updateCartBadge();
}
function updateCartBadge() {
  const count = Object.values(state.cart).reduce((sum, it) => sum + (it?.qty || 0), 0);
  byId('badge-cart').textContent = String(count);
}

// ... (alle bisherigen Funktionen unverändert bis renderCart)

function renderCart() {
  const list = byId('cart-list');
  const entries = Object.entries(state.cart);
  list.innerHTML = '';

  if (!entries.length) {
    const div = document.createElement('div');
    div.className = 'text-sm text-gray-500';
    div.textContent = 'Warenkorb ist leer.';
    list.appendChild(div);
    byId('cart-total').textContent = fmtPrice(0);
    updateCartBadge();
    return;
  }

  let grandTotal = 0;

  entries.forEach(([pid, {qty}]) => {
    const p = state.products.find(x => x.id === pid) || { id: pid, name: '(unbekannt)', price: 0 };
    const unit = Number(p.price || 0);
    const sub = unit * qty;
    grandTotal += sub;

    const container = document.createElement('div');
    container.className = 'border border-gray-200 rounded-lg p-3 flex flex-col md:flex-row md:items-stretch gap-3';

    const infoDiv = document.createElement('div');
    infoDiv.className = 'flex-1 flex flex-col justify-between';
    const nameDiv = document.createElement('div');
    nameDiv.className = 'font-medium';
    nameDiv.textContent = p.name;
    const idDiv = document.createElement('div');
    idDiv.className = 'text-xs text-gray-500';
    idDiv.textContent = `ID: ${p.id}`;
    const priceDiv = document.createElement('div');
    priceDiv.className = 'text-sm mt-1';
    priceDiv.textContent = 'Einzelpreis: ';
    const unitSpan = document.createElement('span');
    unitSpan.className = 'font-medium';
    unitSpan.textContent = fmtPrice(unit);
    priceDiv.appendChild(unitSpan);
    infoDiv.appendChild(nameDiv);
    infoDiv.appendChild(idDiv);
    infoDiv.appendChild(priceDiv);
    container.appendChild(infoDiv);

    const btnDiv = document.createElement('div');
    btnDiv.className = 'flex justify-center w-40 gap-2';
    const infoBtn = document.createElement('button');
    infoBtn.className = 'flex-1 px-3 py-2 rounded bg-slate-700 text-white hover:bg-slate-600';
    infoBtn.textContent = 'Info';
    infoBtn.addEventListener('click', () => { state.productForServices = pid; setActiveTab('services'); });
    const removeBtn = document.createElement('button');
    removeBtn.className = 'flex-1 px-3 py-2 rounded bg-rose-600 text-white hover:bg-rose-700';
    removeBtn.textContent = 'Entfernen';
    removeBtn.addEventListener('click', () => removeFromCart(pid));
    btnDiv.appendChild(infoBtn);
    btnDiv.appendChild(removeBtn);
    container.appendChild(btnDiv);

    const qtyDiv = document.createElement('div');
    qtyDiv.className = 'flex items-center justify-center w-32 gap-2';
    const decBtn = document.createElement('button');
    decBtn.className = 'w-8 h-8 rounded bg-slate-200 hover:bg-slate-300';
    decBtn.textContent = '–';
    decBtn.addEventListener('click', () => addToCart(pid, -1));
    const qtySpan = document.createElement('div');
    qtySpan.className = 'px-3 py-2 border rounded bg-white min-w-[3rem] text-center';
    qtySpan.textContent = qty;
    const incBtn = document.createElement('button');
    incBtn.className = 'w-8 h-8 rounded bg-slate-200 hover:bg-slate-300';
    incBtn.textContent = '+';
    incBtn.addEventListener('click', () => addToCart(pid, 1));
    qtyDiv.appendChild(decBtn);
    qtyDiv.appendChild(qtySpan);
    qtyDiv.appendChild(incBtn);
    container.appendChild(qtyDiv);

    const sumDiv = document.createElement('div');
    sumDiv.className = 'flex flex-col justify-center items-end w-32';
    const sumLabel = document.createElement('div');
    sumLabel.className = 'text-sm';
    sumLabel.textContent = 'Zwischensumme';
    const sumVal = document.createElement('div');
    sumVal.className = 'text-lg font-semibold';
    sumVal.textContent = fmtPrice(sub);
    sumDiv.appendChild(sumLabel);
    sumDiv.appendChild(sumVal);
    container.appendChild(sumDiv);

    list.appendChild(container);
  });

  byId('cart-total').textContent = fmtPrice(grandTotal);
  updateCartBadge();
}

// ---------- Rendering orchestrator ----------
function render() {
  renderFilters();
  renderProducts();
  renderServices();
  renderCart();
}

// ---------- Data Loading ----------
async function readSheetToJsonFromWorkbook(workbook, sheetName) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json(sheet);
}
async function loadFromWorkbookArrayBuffer(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: 'array' });
  const filters = await readSheetToJsonFromWorkbook(wb, 'Filter');
  const products = await readSheetToJsonFromWorkbook(wb, 'Produkte');
  const services = await readSheetToJsonFromWorkbook(wb, 'Services');
  applyLoadedData({ filters, products, services });
}
async function loadCSVTextToRows(csvText) {
  const wb = XLSX.read(csvText, { type: 'string' });
  const first = wb.SheetNames[0];
  return XLSX.utils.sheet_to_json(wb.Sheets[first]);
}
function coerceNumber(n, fallback=0) {
  if (typeof n === 'number') return n;
  const v = Number(String(n).replace(',','.'));
  return Number.isFinite(v) ? v : fallback;
}
function applyLoadedData({ filters=[], products=[], services=[] }) {
  buildFiltersDef(filters);
  state.products = products.map(r => {
    const obj = {...r};
    obj.id = sanitizeId(r.ProduktID ?? r.id ?? r.ID ?? r.Id);
    obj.name = sanitizeString(r.Produktname ?? r.name ?? r.Name ?? r.Produkt ?? r.Product);
    obj.price = coerceNumber(r.Preis ?? r.price ?? r.Price, 0);
    obj.service_ids = sanitizeArrayOfIds(parseServiceIds(r.ServiceIDs ?? r.service_ids ?? r.services ?? r['Service IDs'] ?? r['ServiceIds']));
    obj.Projektbetrieb = sanitizeString(r.Projektbetrieb);
    obj.Geschäftsvorfall = sanitizeString(r.Geschäftsvorfall);
    return obj;
  });
  state.services = services.map(r => ({
    id: sanitizeId(r.ServiceID ?? r.id ?? r.ID ?? r.Id),
    name: sanitizeString(r.ServiceName ?? r.name ?? r.Name ?? r.Service),
    description: sanitizeString(r.Beschreibung ?? r.description ?? r.beschreibung ?? '')
  }));
  state.productForServices = null;
  setActiveTab('produkte');
  render();
}

// ---------- File Upload & Autoload ----------
async function tryAutoloadFromDataFolder() {
  try {
    const res = await fetch('data/app-data.xlsx');
    if (res.ok) {
      const buf = await res.arrayBuffer();
      await loadFromWorkbookArrayBuffer(buf);
      showToast('Excel aus /data geladen');
      return true;
    }
  } catch {}
  try {
    const [rf, rp, rs] = await Promise.allSettled([
      fetch('data/filter.csv'),
      fetch('data/produkte.csv'),
      fetch('data/services.csv'),
    ]);
    if (rp.status === 'fulfilled' && rp.value.ok) {
      const products = await loadCSVTextToRows(await rp.value.text());
      const filters  = (rf.status === 'fulfilled' && rf.value.ok) ? await loadCSVTextToRows(await rf.value.text()) : [];
      const services = (rs.status === 'fulfilled' && rs.value.ok) ? await loadCSVTextToRows(await rs.value.text()) : [];
      applyLoadedData({ filters, products, services });
      showToast('CSV aus /data geladen');
      return true;
    }
  } catch {}
  showToast('Automatisches Laden nicht möglich – bitte Dateien wählen.');
  return false;
}
function clearCart() {
  state.cart = {};
  saveCart();
  renderCart();
  showToast('Warenkorb geleert');
}
// ---------- Events ----------
function wireEvents() {
  $$('.tab-btn').forEach(btn => btn.addEventListener('click', () => setActiveTab(btn.dataset.tab)));
  byId('btn-filter-reset').addEventListener('click', () => {
    for (const k of Object.keys(state.selectedFilters)) state.selectedFilters[k]?.clear();
    renderFilters(); renderProducts();
  });
  byId('btn-to-products').addEventListener('click', () => setActiveTab('produkte'));
  byId('search-products').addEventListener('input', () => renderProducts());
  byId('btn-show-all-services').addEventListener('click', () => {
    state.productForServices = null;
    byId('search-services').value = '';
    renderServices();
  });
  byId('search-services').addEventListener('input', () => renderServices());
  byId('btn-cart-clear').addEventListener('click', clearCart);
  byId('btn-autoload').addEventListener('click', () => tryAutoloadFromDataFolder());
  byId('btn-demo').addEventListener('click', () => {
    const demo = JSON.parse(byId('demo-json').textContent);
    applyLoadedData(demo);
    showToast('Demo-Daten geladen');
  });

  byId('file-input').addEventListener('change', async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const excel = files.find(f => /\.xlsx?$/i.test(f.name));
    if (files.length === 1 && excel) {
      const buf = await excel.arrayBuffer();
      await loadFromWorkbookArrayBuffer(buf);
      showToast(`Excel geladen: ${excel.name}`);
      e.target.value = '';
      return;
    }
    const csvs = files.filter(f => /\.csv$/i.test(f.name));
    if (csvs.length) {
      let filters=[], products=[], services=[];
      for (const file of csvs) {
        const txt = await file.text();
        const rows = await loadCSVTextToRows(txt);
        if (/filter/i.test(file.name)) filters = rows;
        else if (/produkt/i.test(file.name)) products = rows;
        else if (/service/i.test(file.name)) services = rows;
      }
      if (products.length) {
        applyLoadedData({ filters, products, services });
        showToast('CSV geladen');
      } else {
        alert('Es wurde keine Produkte-CSV erkannt (Dateiname sollte "produkte" enthalten).');
      }
      e.target.value = '';
      return;
    }
    alert('Bitte eine Excel (.xlsx) oder passende CSVs auswählen.');
  });
}

// ---------- Init ----------
(function init() {
  loadCart();
  wireEvents();
  setActiveTab('filter');
})();

