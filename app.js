'use strict';
const API = 'https://api.pokemontcg.io/v2';
const SELECT = 'id,name,number,rarity,set,images,tcgplayer,cardmarket';
const CARD_RATIO = 63 / 88;                       // largura / altura de uma carta
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- estado (salvo no aparelho) ----------
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
let collection = load('pk.collection', {});          // id -> carta
let settings = { apiKey: '', currency: 'usd', ...load('pk.settings', {}) };
const save = () => { try { localStorage.setItem('pk.collection', JSON.stringify(collection)); localStorage.setItem('pk.settings', JSON.stringify(settings)); } catch { toast('Sem espaço para salvar!'); } };
const live = () => Object.values(collection).filter(c => c.qty > 0);
const known = {};                                    // id -> carta da API (resultados de busca)

let toastTimer;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

// ---------- API (com retentativas: a pokemontcg.io oscila e devolve 500/504) ----------
const apiCache = new Map();
async function apiFetch(path) {
  if (apiCache.has(path)) return apiCache.get(path);
  let last;
  for (let i = 0; i < 4; i++) {
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 20000);
    try {
      const res = await fetch(API + path, { headers: settings.apiKey ? { 'X-Api-Key': settings.apiKey } : {}, signal: ctl.signal });
      clearTimeout(timer);
      if (res.ok) { const j = await res.json(); apiCache.set(path, j); return j; }
      last = new Error('API ' + res.status);
      if (res.status < 500 && res.status !== 429) throw last;       // erro do pedido: não adianta repetir
    } catch (e) {
      clearTimeout(timer);
      if (e === last) throw e;
      last = e.name === 'AbortError' ? new Error('a API demorou demais') : new Error('sem conexão com a API');
    }
    await sleep(600 * (i + 1));
  }
  throw last;
}
const cardsQuery = async (q, pageSize = 30) =>
  (await apiFetch(`/cards?q=${encodeURIComponent(q)}&pageSize=${pageSize}&select=${SELECT}`)).data;

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
function addCard(apiCard) {
  const s = snapshot(apiCard), cur = collection[s.id];
  collection[s.id] = cur?.qty > 0 ? { ...cur, ...s, qty: cur.qty + 1, added: cur.added } : { ...s, qty: 1, added: Date.now() };
  save(); renderAll();
  return collection[s.id].qty;
}
function setQty(id, n) {
  if (n <= 0) { if (!confirm('Remover esta carta da coleção?')) return false; delete collection[id]; }
  else collection[id].qty = n;
  save(); renderAll(); return true;
}

// ---------- render ----------
const empty = (msg, cta) => `<div class="empty">${msg}${cta ? `<br><button class="btn" data-go="scan">${cta}</button>` : ''}</div>`;
function artHtml(c, extra = '') {
  return `<div class="art" data-detail="${esc(c.id)}"><img src="${esc(c.img || c.images?.small)}" alt="${esc(c.name)}" loading="lazy">${extra}</div>`;
}
function ownedCardHtml(c, dupe) {
  const p = price(c);
  return `<article class="card">
    ${artHtml(c, `${c.qty > 1 ? `<span class="badge">×${c.qty}</span>` : ''}<span class="pchip">${money(p)}</span>`)}
    <div class="meta"><b>${esc(c.name)}</b><small>${esc(c.setName)} · #${esc(c.number)}</small></div>
    <div class="stepper"><button data-dec="${esc(c.id)}" aria-label="Menos">−</button>
      <span>${dupe ? `<em>${c.qty - 1}</em> extra${c.qty - 1 > 1 ? 's' : ''}` : c.qty}</span>
      <button data-inc="${esc(c.id)}" aria-label="Mais">+</button></div>
  </article>`;
}
function renderCollection() {
  const f = $('#filter').value.trim().toLowerCase(), sort = $('#sort').value;
  const by = {
    added: (a, b) => b.added - a.added, name: (a, b) => a.name.localeCompare(b.name),
    price: (a, b) => (price(b) ?? -1) - (price(a) ?? -1),
    set: (a, b) => a.setName.localeCompare(b.setName) || a.number.localeCompare(b.number, undefined, { numeric: true }),
  }[sort];
  const list = live().filter(c => !f || [c.name, c.setName, c.rarity, c.number].join(' ').toLowerCase().includes(f)).sort(by);
  $('#collection').innerHTML = list.map(c => ownedCardHtml(c)).join('') ||
    (f ? empty('Nada encontrado.') : empty('Sua coleção está vazia.', 'Escanear primeira carta'));
}
function renderDupes() {
  const list = live().filter(c => c.qty > 1).sort((a, b) => b.qty - a.qty);
  const extras = list.reduce((s, c) => s + c.qty - 1, 0), val = list.reduce((s, c) => s + (price(c) ?? 0) * (c.qty - 1), 0);
  $('#dupes-summary').innerHTML = list.length ? `<b>${extras}</b> ${extras > 1 ? 'cópias extras' : 'cópia extra'} em <b>${list.length}</b> ${list.length > 1 ? 'cartas' : 'carta'} · valor dos extras <b>${money(val)}</b>` : '';
  $('#dupes').innerHTML = list.map(c => ownedCardHtml(c, true)).join('') || empty('Nenhuma repetida por enquanto.');
}
function renderTotals() {
  const all = live();
  const total = all.reduce((s, c) => s + c.qty, 0);
  const val = all.reduce((s, c) => s + (price(c) ?? 0) * c.qty, 0);
  const extraVal = all.reduce((s, c) => s + (price(c) ?? 0) * (c.qty - 1), 0);
  $('#stats').innerHTML = `
    <div class="stat hl"><small>Valor da coleção</small><b>${money(val)}</b></div>
    <div class="stat"><small>Valor dos extras</small><b>${money(extraVal)}</b></div>
    <div class="stat"><small>Cartas únicas</small><b>${all.length}</b></div>
    <div class="stat"><small>Total de cartas</small><b>${total}</b></div>`;
  $('#hdr-value').textContent = all.length ? money(val) : '';
}
function renderAll() { renderCollection(); renderDupes(); renderTotals(); renderMissing(); }

// ---------- busca ----------
function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
function sim(a, b) {
  a = (a || '').toLowerCase(); b = (b || '').toLowerCase();
  if (!a || !b) return 0;
  const first = lev(a.split(' ')[0], b.split(' ')[0]) / Math.max(a.split(' ')[0].length, b.split(' ')[0].length);
  return Math.max(1 - lev(a, b) / Math.max(a.length, b.length), 1 - first);
}

/** Procura a carta: set+número → número+total → nome+número → nome (cada passo só roda se o anterior vier vazio). */
async function findCards({ name, num, total, setCode }) {
  const nm = (name || '').replace(/["*\\]/g, '').trim();
  const first = nm.split(' ')[0];
  const tries = [];
  if (setCode && num) tries.push(`set.ptcgoCode:${setCode} number:${num}`);
  if (num && total) tries.push(`number:${num} set.printedTotal:${total}`);
  if (nm && num) tries.push(`name:"${first}*" number:${num}`);
  if (nm) {
    tries.push(`name:"${nm}"`, `name:"${first}*"`);
    if (first.length > 4) tries.push(`name:"${first.slice(0, 4)}*"`);   // tolera erro de OCR no fim do nome
  }
  let lastErr, anyOk = false;
  for (const q of tries) {
    try {
      const r = await cardsQuery(q);
      anyOk = true;
      if (r.length) return rank(r, nm);
    } catch (e) { lastErr = e; }
  }
  if (!anyOk && lastErr) throw lastErr;
  return [];
}
const rank = (cards, name) => name ? [...cards].sort((a, b) => sim(name, b.name) - sim(name, a.name)) : cards;

function renderResults(cards, name) {
  const box = $('#results');
  cards.forEach(c => { known[c.id] = c; });
  if (!cards.length) { box.innerHTML = empty('Nenhuma carta encontrada. Ajuste o nome ou o número e busque de novo.'); return; }
  const best = name && sim(name, cards[0].name) >= .75 ? 0 : (cards.length === 1 ? 0 : -1);
  box.innerHTML = cards.map((c, i) => {
    const p = prices(c)[settings.currency], have = collection[c.id]?.qty || 0;
    return `<article class="card ${i === best ? 'best' : ''}">
      ${artHtml(c, `${i === best ? '<span class="tag">Melhor</span>' : ''}${have ? `<span class="badge">tenho ×${have}</span>` : ''}<span class="pchip">${money(p)}</span>`)}
      <div class="meta"><b>${esc(c.name)}</b><small>${esc(c.set?.name)} · #${esc(c.number)}/${esc(c.set?.printedTotal)}</small></div>
      <button class="btn" data-add="${esc(c.id)}">Adicionar</button></article>`;
  }).join('');
}
async function runSearch(fields) {
  const st = $('#status'); st.textContent = '🔎 Buscando carta…';
  $('#results').innerHTML = '';
  try {
    const r = await findCards(fields);
    st.textContent = r.length ? `${r.length} resultado(s) — confirme a carta certa.` : 'Nenhum resultado.';
    renderResults(r, fields.name);
    $('#results').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (e) { st.textContent = `❌ A API de cartas falhou (${e.message}). Tente de novo em instantes.`; }
}
function parseNumber(raw) {
  const m = String(raw || '').match(/(\d{1,3})\s*(?:\/|\\)?\s*(\d{2,3})?/);
  return { num: m?.[1] ? String(parseInt(m[1], 10)) : '', total: m?.[2] ? parseInt(m[2], 10) : '' };
}

// ---------- OCR ----------
let ocr;
async function getOcr() {
  if (typeof Tesseract === 'undefined') throw new Error('OCR não carregou (sem internet?)');
  return ocr ??= Tesseract.createWorker('eng').catch(e => { ocr = null; throw e; });
}
async function recog(canvas, psm = 6, whitelist = '') {
  const w = await getOcr();
  await w.setParameters({ tessedit_pageseg_mode: String(psm), tessedit_char_whitelist: whitelist });
  return (await w.recognize(canvas)).data.text || '';
}
/** Recorta uma região (em frações da carta), amplia e normaliza o contraste para o OCR. */
function region(src, x0, y0, x1, y1, { invert = false } = {}) {
  const sx = src.width * x0, sy = src.height * y0, sw = src.width * (x1 - x0), sh = src.height * (y1 - y0);
  const w = Math.round(Math.min(Math.max(sw * 2, 700), 1600)), h = Math.round(sh * w / sw);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(src, sx, sy, sw, sh, 0, 0, w, h);
  const im = g.getImageData(0, 0, w, h), d = im.data, hist = new Uint32Array(256), n = w * h;
  for (let i = 0; i < d.length; i += 4) { const v = (d[i] * .299 + d[i + 1] * .587 + d[i + 2] * .114) | 0; d[i] = v; hist[v]++; }
  let lo = 0, hi = 255, acc = 0;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc > n * .02) { lo = v; break; } }
  acc = 0;
  for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc > n * .02) { hi = v; break; } }
  const k = 255 / Math.max(hi - lo, 1);
  for (let i = 0; i < d.length; i += 4) {
    let v = (d[i] - lo) * k; v = v < 0 ? 0 : v > 255 ? 255 : v;
    d[i] = d[i + 1] = d[i + 2] = invert ? 255 - v : v; d[i + 3] = 255;
  }
  g.putImageData(im, 0, 0);
  return c;
}
const SKIP = /^(stage\w*|basic|trainer|item|supporter|stadium|tool|hp\w*|evolves|from|pok[eé]mon|ancient|future)$/i;
function pickName(text) {
  for (const line of text.split('\n')) {
    const words = line.replace(/[^A-Za-zÀ-ÿ'’.\- ]/g, ' ').split(/\s+/)
      .filter(w => w.replace(/[^A-Za-z]/g, '').length >= 2 && !SKIP.test(w));
    const name = words.slice(0, 3).join(' ');
    if (name.replace(/[^A-Za-z]/g, '').length >= 3) return name;
  }
  return '';
}
function pickNumber(text) {
  const m = text.match(/(\d{1,3})\s*[\/|\\]\s*(\d{2,3})/);
  const code = text.match(/\b([A-Z]{2,4})\s*(?:EN|PT|FR|ES|DE|IT)\b/);
  return { num: m ? String(parseInt(m[1], 10)) : '', total: m ? parseInt(m[2], 10) : '', setCode: code?.[1] || '' };
}

/** Lê nome, número, total e código do set a partir da imagem da carta já enquadrada. */
async function readCard(card, say) {
  let name = '', n = { num: '', total: '', setCode: '' };
  say('Lendo o nome…');
  for (const [reg, inv] of [[[.05, .02, .76, .12], false], [[.05, .02, .76, .12], true], [[0, 0, .8, .2], false]]) {
    name = pickName(await recog(region(card, ...reg, { invert: inv }), 6));
    if (name) break;
  }
  say('Lendo o número…');
  const strips = [[0, .9, .62, 1], [.38, .9, 1, 1], [0, .86, 1, 1]];
  for (const inv of [false, true]) {
    for (const s of strips) {
      const img = region(card, ...s, { invert: inv });
      const r = pickNumber(await recog(img, 6) + '\n' + await recog(img, 6, '0123456789/ ABCDEFGHIJKLMNOPQRSTUVWXYZ'));
      if (r.num && !n.num) n = { ...n, num: r.num, total: r.total };
      if (r.setCode && !n.setCode) n.setCode = r.setCode;
      if (n.num && n.total) break;
    }
    if (n.num && n.total) break;
  }
  return { name, ...n };
}
async function scanCard(card) {
  const thumb = $('#scan-thumb'); thumb.width = 168; thumb.height = Math.round(168 / CARD_RATIO);
  thumb.getContext('2d').drawImage(card, 0, 0, thumb.width, thumb.height);
  $('#scan-panel').hidden = false; $('#read').innerHTML = ''; $('#results').innerHTML = '';
  go('scan');
  const st = $('#status'), say = t => { st.textContent = '🧠 ' + t; };
  let f;
  try { f = await readCard(card, say); }
  catch (e) { st.textContent = `❌ ${e.message}. Digite nome/número abaixo.`; return; }
  $('#q-name').value = f.name; $('#q-number').value = f.num ? f.num + (f.total ? '/' + f.total : '') : '';
  $('#read').innerHTML = [f.name && `nome: ${f.name}`, f.num && `nº ${f.num}${f.total ? '/' + f.total : ''}`, f.setCode && `set ${f.setCode}`]
    .filter(Boolean).map(t => `<span>${esc(t)}</span>`).join('') || '<span>nada legível</span>';
  if (!f.name && !f.num) { st.textContent = 'Não consegui ler. Tente de novo com mais luz, ou digite abaixo.'; return; }
  await runSearch(f);
}

// ---------- câmera com moldura ----------
let stream = null, torchOn = false;
function layoutFrame() {
  const cw = innerWidth, ch = innerHeight, top = 90, bottom = 190;
  const availH = ch - top - bottom;
  const fh = Math.min(availH, cw * .9 / CARD_RATIO), fw = fh * CARD_RATIO;
  Object.assign($('#cam-frame').style, { width: fw + 'px', height: fh + 'px', left: (cw - fw) / 2 + 'px', top: top + (availH - fh) / 2 + 'px' });
}
async function openCamera() {
  getOcr().catch(() => {});                           // já vai aquecendo o OCR
  if (!navigator.mediaDevices?.getUserMedia) { toast('Câmera indisponível — usando o app de fotos'); $('#photo-native').click(); return; }
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
  } catch { toast('Permita o acesso à câmera ou use a galeria'); $('#photo-native').click(); return; }
  const v = $('#cam-video'); v.srcObject = stream;
  $('#cam').hidden = false; layoutFrame();
  await v.play().catch(() => {});
  const track = stream.getVideoTracks()[0], caps = track.getCapabilities?.() || {};
  if (caps.focusMode?.includes?.('continuous')) track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});
  $('#cam-torch').hidden = !caps.torch; torchOn = false; $('#cam-torch').classList.remove('on');
}
function closeCamera() {
  stream?.getTracks().forEach(t => t.stop()); stream = null;
  $('#cam-video').srcObject = null; $('#cam').hidden = true;
}
function shoot() {
  const v = $('#cam-video'), vr = v.getBoundingClientRect(), fr = $('#cam-frame').getBoundingClientRect();
  const vw = v.videoWidth, vh = v.videoHeight; if (!vw) return;
  const s = Math.max(vr.width / vw, vr.height / vh);                    // object-fit: cover
  const ox = (vw * s - vr.width) / 2, oy = (vh * s - vr.height) / 2;
  const sx = (fr.left - vr.left + ox) / s, sy = (fr.top - vr.top + oy) / s, sw = fr.width / s, sh = fr.height / s;
  const c = document.createElement('canvas'); c.width = Math.round(Math.min(sw, 1100)); c.height = Math.round(c.width / CARD_RATIO);
  c.getContext('2d').drawImage(v, sx, sy, sw, sh, 0, 0, c.width, c.height);
  closeCamera(); scanCard(c);
}
/** Foto da galeria: usa o recorte central com proporção de carta. */
async function fromFile(file) {
  const img = new Image(); img.src = URL.createObjectURL(file);
  try { await img.decode(); } catch { toast('Não consegui abrir a imagem'); return; }
  let sw = img.naturalWidth, sh = img.naturalHeight;
  if (sw / sh > CARD_RATIO) sw = sh * CARD_RATIO; else sh = sw / CARD_RATIO;
  const c = document.createElement('canvas'); c.width = Math.round(Math.min(sw, 1100)); c.height = Math.round(c.width / CARD_RATIO);
  c.getContext('2d').drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, 0, 0, c.width, c.height);
  closeCamera(); scanCard(c);
}

// ---------- detalhe ----------
function showDetail(id) {
  const c = collection[id] || known[id]; if (!c) return;
  const own = collection[id], d = $('#dlg');
  const cur = own ?? snapshot(c);
  d.innerHTML = `<div class="sheet">
    <img src="${esc(cur.imgLarge || cur.img)}" alt="">
    <h3>${esc(cur.name)}</h3><div class="sub">${esc(cur.setName)} · #${esc(cur.number)} · ${esc(cur.rarity)}</div>
    <dl>
      <dt>TCGplayer (USD)</dt><dd>${cur.usd != null ? '$' + cur.usd.toFixed(2) : '—'} ${cur.tcgUrl ? `<a href="${esc(cur.tcgUrl)}" target="_blank" rel="noopener">ver</a>` : ''}</dd>
      <dt>Cardmarket (EUR)</dt><dd>${cur.eur != null ? '€' + cur.eur.toFixed(2) : '—'} ${cur.cmUrl ? `<a href="${esc(cur.cmUrl)}" target="_blank" rel="noopener">ver</a>` : ''}</dd>
      ${own ? `<dt>Quantidade</dt><dd>${own.qty}</dd><dt>Preço atualizado</dt><dd>${new Date(own.updated).toLocaleDateString('pt-BR')}</dd>` : ''}
    </dl>
    <div class="row">
      ${own ? `<button class="btn ghost danger" data-remove="${esc(id)}">Remover</button>` : `<button class="btn" data-add="${esc(id)}">Adicionar</button>`}
      <button class="btn ghost" onclick="this.closest('dialog').close()">Fechar</button>
    </div></div>`;
  d.showModal();
}

// ---------- backup / preços ----------
function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click();
}
async function refreshPrices() {
  const ids = live().map(c => c.id), st = $('#refresh-status'); let ok = 0;
  for (const [i, id] of ids.entries()) {
    st.textContent = `Atualizando ${i + 1}/${ids.length}…`;
    try {
      const n = snapshot((await apiFetch('/cards/' + id)).data);
      Object.assign(collection[id], { usd: n.usd, eur: n.eur, updated: n.updated, tcgUrl: n.tcgUrl, cmUrl: n.cmUrl }); ok++;
    } catch {}
  }
  save(); renderAll(); st.textContent = `✅ ${ok}/${ids.length} cartas atualizadas.`;
}

// ---------- cartas faltantes ----------
let setsList = null; const setCards = {};
let missingSet = load('pk.missingSet', '');
async function loadSets() {
  const sel = $('#set-select');
  try { setsList = (await apiFetch('/sets?select=id,name,series,printedTotal,total,releaseDate&orderBy=-releaseDate&pageSize=250')).data; }
  catch (e) { sel.innerHTML = `<option>Erro ao carregar sets (${esc(e.message)})</option>`; return; }
  const mine = {}; live().forEach(c => { mine[c.setId] = (mine[c.setId] || 0) + 1; });
  const opt = s => `<option value="${esc(s.id)}">${esc(s.name)} (${esc(s.series)})${mine[s.id] ? ' · tenho ' + mine[s.id] : ''}</option>`;
  const mineSets = setsList.filter(s => mine[s.id]);
  sel.innerHTML = '<option value="">— escolha um set —</option>' +
    (mineSets.length ? `<optgroup label="Meus sets">${mineSets.map(opt).join('')}</optgroup>` : '') +
    `<optgroup label="Todos os sets">${setsList.map(opt).join('')}</optgroup>`;
  sel.value = missingSet;
  renderMissing();
}
async function fetchSetCards(id) {
  if (setCards[id]) return setCards[id];
  const all = [];
  for (let page = 1; ; page++) {
    const j = await apiFetch(`/cards?q=${encodeURIComponent('set.id:' + id)}&page=${page}&pageSize=250&select=${SELECT}`);
    all.push(...j.data);
    if (!j.data.length || all.length >= j.totalCount) break;
  }
  return (setCards[id] = all.sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true })));
}
async function renderMissing() {
  const id = missingSet; if (!id || !setsList) return;
  const sum = $('#missing-summary'), box = $('#missing');
  if (!setCards[id]) { sum.textContent = '⏳ Carregando cartas do set…'; box.innerHTML = ''; }
  let cards;
  try { cards = await fetchSetCards(id); } catch (e) { sum.textContent = '❌ ' + e.message; return; }
  if (id !== missingSet) return;
  const secret = $('#m-secret').checked, showAll = $('#m-all').checked;
  const inSet = cards.filter(c => secret || !c.set?.printedTotal || !(parseInt(c.number, 10) > c.set.printedTotal));
  const has = c => (collection[c.id]?.qty || 0) > 0;
  const missing = inSet.filter(c => !has(c));
  const owned = inSet.length - missing.length, pct = inSet.length ? Math.round(owned / inSet.length * 100) : 0;
  const cost = missing.reduce((t, c) => t + (prices(c)[settings.currency] ?? 0), 0);
  sum.innerHTML = `<b>${owned}/${inSet.length}</b> cartas (${pct}%) · faltam <b>${missing.length}</b><br>Custo estimado para completar: <b>${money(cost)}</b><div class="bar-p"><i style="width:${pct}%"></i></div>`;
  cards.forEach(c => { known[c.id] = c; });
  box.innerHTML = (showAll ? inSet : missing).map(c => `<article class="card ${has(c) ? 'owned' : ''}">
      ${artHtml(c, `${has(c) ? `<span class="badge">×${collection[c.id].qty}</span>` : ''}<span class="pchip">${money(prices(c)[settings.currency])}</span>`)}
      <div class="meta"><b>${esc(c.name)}</b><small>#${esc(c.number)} · ${esc(c.rarity || '')}</small></div>
      <button class="btn ${has(c) ? 'ghost' : ''}" data-add="${esc(c.id)}">${has(c) ? '+ outra cópia' : 'Adicionar'}</button></article>`).join('') || empty('🎉 Set completo!');
}

// ---------- navegação e eventos ----------
function go(tab) {
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('active', b.dataset.go === tab));
  document.querySelectorAll('.tab').forEach(s => s.classList.toggle('active', s.id === 'tab-' + tab));
  if (tab === 'missing' && !setsList) loadSets();
  scrollTo({ top: 0 });
}
document.addEventListener('click', e => {
  const t = e.target.closest('button, [data-detail]'); if (!t) return;
  const d = t.dataset;
  if (d.go) go(d.go);
  if (d.add) {
    const q = addCard(known[d.add]);
    t.textContent = q > 1 ? `✓ Repetida · agora ×${q}` : '✓ Adicionada';
    toast(`${known[d.add].name} adicionada${q > 1 ? ` (×${q})` : ''}`);
    if (t.closest('dialog')) t.closest('dialog').close();
  }
  if (d.inc) setQty(d.inc, collection[d.inc].qty + 1);
  if (d.dec) setQty(d.dec, collection[d.dec].qty - 1);
  if (d.remove && setQty(d.remove, 0)) $('#dlg').close();
  if (d.detail) showDetail(d.detail);
  if (d.cur) { settings.currency = d.cur; save(); syncCurrency(); renderAll(); }
});
const syncCurrency = () => document.querySelectorAll('#currency-seg button').forEach(b => b.classList.toggle('on', b.dataset.cur === settings.currency));

$('#open-cam').addEventListener('click', openCamera);
$('#cam-close').addEventListener('click', closeCamera);
$('#cam-shoot').addEventListener('click', shoot);
$('#cam-torch').addEventListener('click', async () => {
  torchOn = !torchOn;
  try { await stream.getVideoTracks()[0].applyConstraints({ advanced: [{ torch: torchOn }] }); $('#cam-torch').classList.toggle('on', torchOn); } catch {}
});
for (const id of ['#photo', '#photo-native', '#cam-photo']) $(id).addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) fromFile(f); });
addEventListener('resize', () => { if (!$('#cam').hidden) layoutFrame(); });

$('#search-form').addEventListener('submit', e => {
  e.preventDefault();
  const { num, total } = parseNumber($('#q-number').value);
  runSearch({ name: $('#q-name').value, num, total });
});
$('#filter').addEventListener('input', renderCollection);
$('#sort').addEventListener('change', renderCollection);
$('#refresh-prices').addEventListener('click', refreshPrices);
$('#set-select').addEventListener('change', e => { missingSet = e.target.value; localStorage.setItem('pk.missingSet', JSON.stringify(missingSet)); renderMissing(); });
$('#m-all').addEventListener('change', renderMissing);
$('#m-secret').addEventListener('change', renderMissing);
$('#export-json').addEventListener('click', () => download('colecao-pokemon.json', JSON.stringify(collection, null, 2), 'application/json'));
$('#export-csv').addEventListener('click', () => {
  const rows = [['id', 'nome', 'set', 'numero', 'raridade', 'qtd', 'usd', 'eur']];
  live().forEach(c => rows.push([c.id, c.name, c.setName, c.number, c.rarity, c.qty, c.usd ?? '', c.eur ?? '']));
  download('colecao-pokemon.csv', rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n'), 'text/csv');
});
$('#import-json').addEventListener('change', async e => {
  try {
    const data = JSON.parse(await e.target.files[0].text());
    for (const c of Object.values(data)) {
      if (!c?.id || !Number.isInteger(c.qty) || c.qty < 1) continue;
      const cur = collection[c.id];
      collection[c.id] = cur ? { ...cur, qty: cur.qty + c.qty } : c;
    }
    save(); renderAll(); toast('Importado! Quantidades somadas.');
  } catch { toast('Arquivo inválido'); }
  e.target.value = '';
});
$('#api-key').value = settings.apiKey;
$('#api-key').addEventListener('change', e => { settings.apiKey = e.target.value.trim(); save(); });

syncCurrency();
renderAll();
navigator.storage?.persist?.();                      // pede ao navegador para não apagar os dados salvos
