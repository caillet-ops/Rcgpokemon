'use strict';
const API = 'https://api.pokemontcg.io/v2/cards';
const SELECT = 'id,name,number,rarity,set,images,tcgplayer,cardmarket';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// ---------- estado ----------
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
let collection = load('pk.collection', {});          // id -> carta
let settings = load('pk.settings', { apiKey: '', currency: 'usd' });
const save = () => { localStorage.setItem('pk.collection', JSON.stringify(collection)); localStorage.setItem('pk.settings', JSON.stringify(settings)); };

// ---------- API ----------
async function apiCards(q, pageSize = 24) {
  const url = `${API}?q=${encodeURIComponent(q)}&pageSize=${pageSize}&select=${SELECT}`;
  const res = await fetch(url, { headers: settings.apiKey ? { 'X-Api-Key': settings.apiKey } : {} });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return (await res.json()).data;
}
async function apiCard(id) {
  const res = await fetch(`${API}/${id}`, { headers: settings.apiKey ? { 'X-Api-Key': settings.apiKey } : {} });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return (await res.json()).data;
}

function prices(c) {
  let usd = null, eur = null;
  const p = c.tcgplayer?.prices;
  if (p) for (const v of Object.values(p)) {
    const x = v.market ?? v.mid;
    if (x != null && (usd == null || x > usd)) usd = x;
  }
  const m = c.cardmarket?.prices;
  if (m) eur = m.trendPrice ?? m.averageSellPrice ?? null;
  return { usd, eur };
}
function snapshot(c) {
  return {
    id: c.id, name: c.name, number: c.number, rarity: c.rarity || '',
    setName: c.set?.name || '', setId: c.set?.id || '', printedTotal: c.set?.printedTotal,
    img: c.images?.small, imgLarge: c.images?.large,
    tcgUrl: c.tcgplayer?.url, cmUrl: c.cardmarket?.url,
    ...prices(c), updated: Date.now(),
  };
}
const price = c => c[settings.currency];
const money = v => v == null ? '—' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: settings.currency.toUpperCase() }).format(v);

// ---------- coleção ----------
function addCard(apiCard_) {
  const s = snapshot(apiCard_);
  const cur = collection[s.id];
  collection[s.id] = cur ? { ...cur, ...s, qty: cur.qty + 1, added: cur.added } : { ...s, qty: 1, added: Date.now() };
  save(); renderAll();
  return collection[s.id].qty;
}
function setQty(id, n) {
  if (n <= 0) { if (!confirm('Remover esta carta da coleção?')) return; delete collection[id]; }
  else collection[id].qty = n;
  save(); renderAll();
}

// ---------- render ----------
function cardHtml(c, { dupe } = {}) {
  const extra = c.qty - 1;
  return `<div class="c" data-id="${esc(c.id)}">
    <img src="${esc(c.img)}" alt="${esc(c.name)}" loading="lazy" data-detail="${esc(c.id)}">
    <b>${esc(c.name)}</b>
    <span class="m">${esc(c.setName)} · #${esc(c.number)}<br>${esc(c.rarity)}</span>
    <span class="price">${money(price(c))}${c.qty > 1 ? ` <span class="m">(×${c.qty} = ${money(price(c) * c.qty)})</span>` : ''}</span>
    <div class="qty"><button data-dec="${esc(c.id)}">−</button>
      <span>${dupe ? `Extras: <span class="badge">${extra}</span>` : `Qtd: <b>${c.qty}</b>`}</span>
      <button data-inc="${esc(c.id)}">+</button></div>
  </div>`;
}
function renderCollection() {
  const f = $('#filter').value.trim().toLowerCase(), sort = $('#sort').value;
  let list = Object.values(collection).filter(c => !f || [c.name, c.setName, c.rarity, c.number].join(' ').toLowerCase().includes(f));
  const by = {
    added: (a, b) => b.added - a.added, name: (a, b) => a.name.localeCompare(b.name),
    price: (a, b) => (price(b) ?? -1) - (price(a) ?? -1), set: (a, b) => a.setName.localeCompare(b.setName) || a.number.localeCompare(b.number, undefined, { numeric: true }),
  }[sort];
  $('#collection').innerHTML = list.sort(by).map(c => cardHtml(c)).join('') || '<p class="hint">Nenhuma carta ainda. Use a aba Adicionar.</p>';
}
function renderDupes() {
  const list = Object.values(collection).filter(c => c.qty > 1).sort((a, b) => b.qty - a.qty);
  $('#dupes').innerHTML = list.map(c => cardHtml(c, { dupe: true })).join('') || '<p class="hint">Sem repetidas por enquanto.</p>';
}
function renderTotals() {
  const all = Object.values(collection);
  const total = all.reduce((s, c) => s + c.qty, 0);
  const val = all.reduce((s, c) => s + (price(c) ?? 0) * c.qty, 0);
  const extraVal = all.reduce((s, c) => s + (price(c) ?? 0) * (c.qty - 1), 0);
  $('#totals').textContent = `${all.length} únicas · ${total} no total · ${money(val)} · extras ${money(extraVal)}`;
}
function renderAll() { renderCollection(); renderDupes(); renderTotals(); }

// ---------- busca ----------
function renderResults(cards) {
  const box = $('#results');
  if (!cards.length) { box.innerHTML = '<p class="hint">Nada encontrado. Ajuste nome/número e busque de novo.</p>'; return; }
  box.innerHTML = cards.map(c => {
    const p = prices(c), have = collection[c.id]?.qty || 0;
    return `<div class="c">
      <img src="${esc(c.images?.small)}" alt="${esc(c.name)}" loading="lazy">
      <b>${esc(c.name)}</b>
      <span class="m">${esc(c.set?.name)} · #${esc(c.number)}/${esc(c.set?.printedTotal)}<br>${esc(c.rarity || '')}</span>
      <span class="price">${money(p[settings.currency])}</span>
      ${have ? `<span class="m">Você já tem ${have}</span>` : ''}
      <button data-add="${esc(c.id)}">+ Adicionar</button></div>`;
  }).join('');
  window._results = Object.fromEntries(cards.map(c => [c.id, c]));
}
async function search(name, numberRaw) {
  const m = String(numberRaw || '').match(/(\d{1,3})\s*\/?\s*(\d{1,3})?/);
  const num = m?.[1] ? String(parseInt(m[1], 10)) : '', total = m?.[2] ? parseInt(m[2], 10) : '';
  const nm = (name || '').replace(/[^\p{L}\p{N}' .:-]/gu, '').trim();
  const tries = [];
  if (nm && num) tries.push(`name:"${nm}*" number:${num}`);
  if (num && total) tries.push(`number:${num} set.printedTotal:${total}`);
  if (nm) tries.push(`name:"${nm}*"`);
  if (nm.includes(' ')) tries.push(`name:"${nm.split(' ')[0]}*"` + (num ? ` number:${num}` : ''));
  for (const q of tries) {
    const r = await apiCards(q);
    if (r.length) return r;
  }
  return [];
}
async function runSearch(name, number) {
  const st = $('#status'); st.textContent = '🔎 Buscando…';
  try {
    const r = await search(name, number);
    st.textContent = r.length ? `${r.length} resultado(s). Escolha a carta correta.` : 'Nenhum resultado.';
    renderResults(r);
  } catch (e) { st.textContent = '❌ Erro na busca: ' + e.message; }
}

// ---------- OCR da foto ----------
function crop(img, y0, y1, scale = 2) {
  const c = document.createElement('canvas');
  const sh = img.naturalHeight * (y1 - y0), sw = img.naturalWidth;
  c.width = sw * scale; c.height = sh * scale;
  const g = c.getContext('2d'); g.filter = 'grayscale(1) contrast(1.4)';
  g.drawImage(img, 0, img.naturalHeight * y0, sw, sh, 0, 0, c.width, c.height);
  return c;
}
async function ocr(canvas) {
  const { data } = await Tesseract.recognize(canvas, 'eng');
  return data.text || '';
}
async function scanPhoto(file) {
  const st = $('#status'), pv = $('#preview');
  pv.src = URL.createObjectURL(file); pv.hidden = false;
  await pv.decode().catch(() => {});
  if (typeof Tesseract === 'undefined') { st.textContent = 'OCR indisponível (sem internet?). Use a busca manual.'; return; }
  try {
    st.textContent = '🧠 Lendo nome da carta…';
    const top = await ocr(crop(pv, 0, 0.16));
    st.textContent = '🧠 Lendo número da carta…';
    const bottom = await ocr(crop(pv, 0.84, 1));
    const name = (top.split('\n').map(l => l.replace(/\b(BASIC|STAGE\s*\d|HP|VMAX|VSTAR|V|EX|GX)\b.*$/i, '').replace(/[^A-Za-z' .:-]/g, '').trim()).find(l => l.length >= 3) || '');
    const num = (bottom.match(/(\d{1,3})\s*[\/|]\s*(\d{1,3})/) || [])[0] || '';
    $('#q-name').value = name; $('#q-number').value = num.replace(/\s+/g, '');
    st.textContent = `Lido: "${name || '?'}" ${num || '(sem número)'} — buscando…`;
    await runSearch(name, num);
  } catch (e) { st.textContent = '❌ Falha no OCR: ' + e.message + '. Use a busca manual.'; }
}

// ---------- detalhes ----------
function showDetail(id) {
  const c = collection[id]; if (!c) return;
  const d = $('#dlg');
  d.innerHTML = `<img src="${esc(c.imgLarge || c.img)}" alt="">
    <h3>${esc(c.name)} <small>×${c.qty}</small></h3>
    <table>
      <tr><td>Set</td><td>${esc(c.setName)} (#${esc(c.number)})</td></tr>
      <tr><td>Raridade</td><td>${esc(c.rarity)}</td></tr>
      <tr><td>TCGplayer (USD)</td><td>${c.usd != null ? '$' + c.usd.toFixed(2) : '—'} ${c.tcgUrl ? `<a href="${esc(c.tcgUrl)}" target="_blank" rel="noopener">ver</a>` : ''}</td></tr>
      <tr><td>Cardmarket (EUR)</td><td>${c.eur != null ? '€' + c.eur.toFixed(2) : '—'} ${c.cmUrl ? `<a href="${esc(c.cmUrl)}" target="_blank" rel="noopener">ver</a>` : ''}</td></tr>
      <tr><td>Preço atualizado</td><td>${new Date(c.updated).toLocaleString('pt-BR')}</td></tr>
    </table><br><button class="sec" onclick="this.closest('dialog').close()">Fechar</button>`;
  d.showModal();
}

// ---------- backup / preços ----------
function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click();
}
async function refreshPrices() {
  const ids = Object.keys(collection), st = $('#refresh-status');
  let ok = 0;
  for (const [i, id] of ids.entries()) {
    st.textContent = `Atualizando ${i + 1}/${ids.length}…`;
    try { collection[id] = { ...collection[id], ...snapshot(await apiCard(id)) , qty: collection[id].qty, added: collection[id].added }; ok++; } catch {}
  }
  save(); renderAll(); st.textContent = `✅ ${ok}/${ids.length} cartas atualizadas.`;
}

// ---------- eventos ----------
document.addEventListener('click', e => {
  const t = e.target;
  if (t.dataset.tab) {
    document.querySelectorAll('nav button').forEach(b => b.classList.toggle('active', b === t));
    document.querySelectorAll('.tab').forEach(s => s.classList.toggle('active', s.id === 'tab-' + t.dataset.tab));
  }
  if (t.dataset.add) {
    const q = addCard(window._results[t.dataset.add]);
    t.textContent = q > 1 ? `✓ Repetida! Agora ×${q}` : '✓ Adicionada';
  }
  if (t.dataset.inc) setQty(t.dataset.inc, collection[t.dataset.inc].qty + 1);
  if (t.dataset.dec) setQty(t.dataset.dec, collection[t.dataset.dec].qty - 1);
  if (t.dataset.detail) showDetail(t.dataset.detail);
});
$('#photo').addEventListener('change', e => e.target.files[0] && scanPhoto(e.target.files[0]));
$('#search-form').addEventListener('submit', e => { e.preventDefault(); runSearch($('#q-name').value, $('#q-number').value); });
$('#filter').addEventListener('input', renderCollection);
$('#sort').addEventListener('change', renderCollection);
$('#refresh-prices').addEventListener('click', refreshPrices);
$('#export-json').addEventListener('click', () => download('colecao-pokemon.json', JSON.stringify(collection, null, 2), 'application/json'));
$('#export-csv').addEventListener('click', () => {
  const rows = [['id', 'nome', 'set', 'numero', 'raridade', 'qtd', 'usd', 'eur']];
  Object.values(collection).forEach(c => rows.push([c.id, c.name, c.setName, c.number, c.rarity, c.qty, c.usd ?? '', c.eur ?? '']));
  download('colecao-pokemon.csv', rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n'), 'text/csv');
});
$('#import-json').addEventListener('change', async e => {
  try {
    const data = JSON.parse(await e.target.files[0].text());
    for (const c of Object.values(data)) {
      if (!c?.id || !Number.isInteger(c.qty)) continue;
      const cur = collection[c.id];
      collection[c.id] = cur ? { ...cur, qty: cur.qty + c.qty } : c;
    }
    save(); renderAll(); alert('Importado! Quantidades somadas às existentes.');
  } catch { alert('Arquivo inválido.'); }
});
$('#api-key').value = settings.apiKey; $('#currency').value = settings.currency;
$('#api-key').addEventListener('change', e => { settings.apiKey = e.target.value.trim(); save(); });
$('#currency').addEventListener('change', e => { settings.currency = e.target.value; save(); renderAll(); });

renderAll();
