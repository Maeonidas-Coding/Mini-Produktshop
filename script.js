// ---------- State ----------
const state = {
  // { field: [values...] } aus Filtertabelle
  filtersDef: {},
  // { field: Set(values) } aktuell gewählte Filter
  selectedFilters: {},
  // Produkte & Services
  products: [],   // { id, name, price:number, service_ids:string[] , ...weitere Felder }
  services: [],   // { id, name, description }
  // Warenkorb als Map { productId: { qty:number } }
  cart: {},       // Preise & Namen kommen aus state.products (Quelle der Wahrheit)
  // UI
  activeTab: 'filter',
  productForServices: null // wenn Info geklickt wurde
};

// Persistenz-Key
const CART_KEY = 'mini_shop_cart_v2';

// ---------- Utils ----------
const $  = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const byId = id => document.getElementById(id);

const sleep = ms => new Promise(r => setTimeout(r, ms));
const fmtPrice = (n) => (Number(n || 0)).toLocaleString('de-DE', { style:'currency', currency:'EUR' });
const norm = (v) => (v ?? '').toString().trim();
const toLower = (v) => norm(v).toLowerCase();
const parseServiceIds = (val) => !val ? [] : val.toString().split(/[;,\|]/).map(s => s.trim()).filter(Boolean);

// ---------- Toast ----------
function showToast(msg='Hinzugefügt') {
  const el = byId('toast');
  el.textContent = msg;
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
  render(); // jeweils neu zeichnen
}

// ---------- Cart Storage ----------
function loadCart() {
  try {
    const raw = localStorage.getItem(CART_KEY);
    state.cart = raw ? JSON.parse(raw) : {};
  } catch { state.cart = {}; }
  updateCartBadge();
}
function saveCart() {
  localStorage.setItem(CART_KEY, JSON.stringify(state.cart));
  updateCartBadge();
}
function updateCartBadge() {
  const count = Object.values(state.cart).reduce((sum, it) => sum + (it?.qty || 0), 0);
  byId('badge-cart').textContent = String(count);
}

// ---------- Filters ----------
function buildFiltersDef(rows) {
  const map = {};
  for (const r of rows) {
    const field = norm(r.Field ?? r.field ?? r.Feld);
    const value = norm(r.Value ?? r.value ?? r.Wert);
    if (!field || !value) continue;
    if (!map[field]) map[field] = [];
    if (!map[field].includes(value)) map[field].push(value);
  }
  state.filtersDef = map;
  state.selectedFilters = Object.fromEntries(Object.keys(map).map(k => [k, new Set()]));
}

function productMatchesFilters(p) {
  for (const [field, set] of Object.entries(state.selectedFilters)) {
    if (set.size === 0) continue;
    const value = norm(p[field]);
    if (!set.has(value)) return false;
  }
  return true;
}

function filteredProducts() {
  const q = toLower(byId('search-products').value);
  const base = state.products.filter(productMatchesFilters);
  if (!q) return base;
  return base.filter(p =>
    toLower(p.name).includes(q) || toLower(p.id).includes(q)
  );
}

// ---------- Render: Filter ----------
function renderFilters() {
  const container = byId('filter-container');
  container.innerHTML = '';
  const fields = Object.keys(state.filtersDef);
  if (!fields.length) {
    container.innerHTML = `<div class="text-sm text-gray-500">Keine Filterdefinition gefunden. Lade eine Excel/CSV oder nutze Demo-Daten.</div>`;
    return;
  }

  for (const field of fields) {
    const values = state.filtersDef[field] || [];
    const box = document.createElement('div');
    box.className = 'border border-gray-200 rounded p-3 bg-gray-50';
    box.innerHTML = `<div class="font-medium mb-2">${field}</div>`;
    const list = document.createElement('div');
    list.className = 'grid grid-cols-1 sm:grid-cols-2 gap-2';

    values.forEach(val => {
      const id = `flt_${field}_${val}`.replace(/\s+/g, '_');
      const checked = state.selectedFilters[field]?.has(val);
      const item = document.createElement('label');
      item.className = 'flex items-center gap-2 text-sm';
      item.innerHTML = `
        <input type="checkbox" ${checked ? 'checked' : ''} id="${id}" />
        <span>${val}</span>
      `;
      item.querySelector('input').addEventListener('change', (e) => {
        if (!state.selectedFilters[field]) state.selectedFilters[field] = new Set();
        if (e.target.checked) state.selectedFilters[field].add(val);
        else state.selectedFilters[field].delete(val);
        renderProducts();
      });
      list.appendChild(item);
    });

    box.appendChild(list);
    container.appendChild(box);
  }
}

// ---------- Render: Produkte ----------
function productCardHTML(p) {
  const tags = Object.keys(state.filtersDef)
    .map(f => p[f] ? `<span class="text-xs bg-slate-100 border border-slate-200 rounded px-2 py-0.5">${p[f]}</span>` : '')
    .join(' ');

  return `
    <div class="border border-gray-200 rounded-lg p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
      <div>
        <div class="font-semibold">${p.name}</div>
        <div class="text-xs text-gray-500">ID: ${p.id}</div>
        <div class="text-sm mt-1">Preis: <span class="font-medium">${fmtPrice(p.price)}</span></div>
        <div class="mt-2 flex flex-wrap gap-1">${tags}</div>
      </div>
      <div class="flex items-center gap-2">
        <button class="px-3 py-2 rounded bg-slate-700 text-white hover:bg-slate-600" data-action="info" data-id="${p.id}">Info</button>
        <button class="px-3 py-2 rounded bg-blue-600 text-white hover:bg-blue-700" data-action="add" data-id="${p.id}">Hinzufügen</button>
      </div>
    </div>
  `;
}

function renderProducts() {
  const list = byId('products-list');
  const items = filteredProducts();
  byId('count-products').textContent = `${items.length} Produkt(e)`;
  list.innerHTML = items.map(productCardHTML).join('');

  // Buttons neu „verdrahten“
  list.querySelectorAll('button').forEach(btn => {
    const id = btn.dataset.id;
    if (btn.dataset.action === 'add') {
      btn.addEventListener('click', () => {
        addToCart(id, 1);
        showToast('Produkt zum Warenkorb hinzugefügt');
      });
    } else if (btn.dataset.action === 'info') {
      btn.addEventListener('click', () => {
        state.productForServices = id;
        setActiveTab('services');
      });
    }
  });
}

// ---------- Render: Services ----------
function renderServices() {
  const list = byId('services-list');
  const hint = byId('services-hint');

  let shown = state.services;
  if (state.productForServices) {
    const p = state.products.find(x => x.id === state.productForServices);
    const ids = new Set(p?.service_ids || []);
    shown = state.services.filter(s => ids.has(s.id));
    hint.textContent = `Services für Produkt: ${p?.name ?? state.productForServices}`;
  } else {
    hint.textContent = 'Alle Services';
  }

  if (!shown.length) {
    list.innerHTML = `<div class="text-sm text-gray-500">Keine Services gefunden.</div>`;
    return;
  }

  list.innerHTML = shown.map(s => `
    <div class="border border-gray-200 rounded-lg p-3">
      <div class="font-semibold">${s.name} <span class="text-xs text-gray-500">(${s.id})</span></div>
      <div class="text-sm text-gray-700 mt-1">${s.description ?? ''}</div>
    </div>
  `).join('');
}

// ---------- Cart (Menge, Summen) ----------
function addToCart(productId, qtyDelta = 1) {
  if (!state.cart[productId]) state.cart[productId] = { qty: 0 };
  state.cart[productId].qty += qtyDelta;
  if (state.cart[productId].qty <= 0) delete state.cart[productId];
  saveCart();
  renderCart();
}

function removeFromCart(productId) {
  delete state.cart[productId];
  saveCart();
  renderCart();
}

function clearCart() {
  state.cart = {};
  saveCart();
  renderCart();
  showToast('Warenkorb geleert');
}

function renderCart() {
  const list = byId('cart-list');
  const entries = Object.entries(state.cart); // [ [productId, {qty}], ... ]

  if (!entries.length) {
    list.innerHTML = `<div class="text-sm text-gray-500">Warenkorb ist leer.</div>`;
    byId('cart-total').textContent = fmtPrice(0);
    updateCartBadge();
    return;
  }

  let grandTotal = 0;

  list.innerHTML = entries.map(([pid, {qty}], idx) => {
    const p = state.products.find(x => x.id === pid) || { id: pid, name: '(unbekannt)', price: 0 };
    const unit = Number(p.price || 0);
    const sub = unit * qty;
    grandTotal += sub;

    return `
      <div class="border border-gray-200 rounded-lg p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <div class="font-medium">${p.name}</div>
          <div class="text-xs text-gray-500">ID: ${p.id}</div>
          <div class="text-sm mt-1">
            Einzelpreis: <span class="font-medium">${fmtPrice(unit)}</span>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <button class="px-3 py-2 rounded bg-slate-700 text-white hover:bg-slate-600" data-action="info" data-id="${pid}">Info</button>
          <button class="px-3 py-2 rounded bg-rose-600 text-white hover:bg-rose-700" data-action="remove" data-id="${pid}">Entfernen</button>
        </div>

        <div class="flex items-center gap-2">
          <button class="w-8 h-8 rounded bg-slate-200 hover:bg-slate-300" data-action="dec" data-id="${pid}">–</button>
          <div class="px-3 py-2 border rounded bg-white min-w-[3rem] text-center">${qty}</div>
          <button class="w-8 h-8 rounded bg-slate-200 hover:bg-slate-300" data-action="inc" data-id="${pid}">+</button>
        </div>

        <div class="text-right">
          <div class="text-sm">Zwischensumme</div>
          <div class="text-lg font-semibold">${fmtPrice(sub)}</div>
        </div>
      </div>
    `;
  }).join('');

  // Events für die Buttons innerhalb des Warenkorbs
  list.querySelectorAll('button').forEach(btn => {
    const pid = btn.dataset.id;
    const act = btn.dataset.action;
    if (act === 'inc') btn.addEventListener('click', () => addToCart(pid, +1));
    if (act === 'dec') btn.addEventListener('click', () => addToCart(pid, -1));
    if (act === 'remove') btn.addEventListener('click', () => removeFromCart(pid));
    if (act === 'info') btn.addEventListener('click', () => { state.productForServices = pid; setActiveTab('services'); });
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

// ---------- Data Loading (Excel/CSV) ----------
async function readSheetToJsonFromWorkbook(workbook, sheetName) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json(sheet);
}

async function loadFromWorkbookArrayBuffer(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: 'array' });
  const filters  = await readSheetToJsonFromWorkbook(wb, 'Filter');
  const products = await readSheetToJsonFromWorkbook(wb, 'Produkte');
  const services = await readSheetToJsonFromWorkbook(wb, 'Services');

  if (!products.length && wb.SheetNames?.length) {
    console.warn('Keine Blattnamen "Filter/Produkte/Services" gefunden. Verfügbare:', wb.SheetNames);
  }

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

function applyLoadedData({ filters = [], products = [], services = [] }) {
  // Filters
  buildFiltersDef(filters);

  // Products
  state.products = products.map(r => {
    const obj = { ...r };
    obj.id   = norm(r.id ?? r.ID ?? r.Id);
    obj.name = norm(r.name ?? r.Name ?? r.Produkt ?? r.Product);
    obj.price = coerceNumber(r.price ?? r.Preis ?? r.Price, 0);
    obj.service_ids = parseServiceIds(r.service_ids ?? r.services ?? r['Service IDs'] ?? r['ServiceIds']);
    return obj;
  });

  // Services
  state.services = services.map(r => ({
    id: norm(r.id ?? r.ID ?? r.Id),
    name: norm(r.name ?? r.Name ?? r.Service),
    description: norm(r.description ?? r.beschreibung ?? r.Beschreibung ?? '')
  }));

  // Kontext zurücksetzen
  state.productForServices = null;
  setActiveTab('produkte'); // springe auf Produkte
  render();
}

// Versuche automatisch aus /data zu laden (Excel oder CSV)
async function tryAutoloadFromDataFolder() {
  // 1) Excel: data/app-data.xlsx
  try {
    const res = await fetch('data/app-data.xlsx');
    if (res.ok) {
      const buf = await res.arrayBuffer();
      await loadFromWorkbookArrayBuffer(buf);
      showToast('Excel aus /data geladen');
      return true;
    }
  } catch (e) { /* häufig CORS bei file://, ignorieren */ }

  // 2) CSVs: filter.csv, produkte.csv, services.csv
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
  } catch (e) { /* ignorieren */ }

  showToast('Automatisches Laden nicht möglich – bitte Dateien wählen.');
  return false;
}

// ---------- Events ----------
function wireEvents() {
  // Tabs
  $$('.tab-btn').forEach(btn => btn.addEventListener('click', () => setActiveTab(btn.dataset.tab)));

  // Filter: zurücksetzen
  byId('btn-filter-reset').addEventListener('click', () => {
    for (const k of Object.keys(state.selectedFilters)) state.selectedFilters[k]?.clear();
    renderFilters(); renderProducts();
  });

  // Von Filter zu Produkte
  byId('btn-to-products').addEventListener('click', () => setActiveTab('produkte'));

  // Suche Produkte
  byId('search-products').addEventListener('input', () => renderProducts());

  // Warenkorb: alles löschen
  byId('btn-cart-clear').addEventListener('click', clearCart);

  // Autoload / Demo / Datei-Upload
  byId('btn-autoload').addEventListener('click', () => tryAutoloadFromDataFolder());

  byId('btn-demo').addEventListener('click', () => {
    const demo = JSON.parse(byId('demo-json').textContent);
    applyLoadedData(demo);
    showToast('Demo-Daten geladen');
  });

  byId('file-input').addEventListener('change', async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    // Fall A: genau 1 Excel-Datei
    const excel = files.find(f => /\.xlsx?$/i.test(f.name));
    if (files.length === 1 && excel) {
      const buf = await excel.arrayBuffer();
      await loadFromWorkbookArrayBuffer(buf);
      showToast(`Excel geladen: ${excel.name}`);
      e.target.value = '';
      return;
    }

    // Fall B: mehrere CSVs (beliebige Reihenfolge)
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
  // Optional: auto-try /data beim Start
  // tryAutoloadFromDataFolder();
})();
