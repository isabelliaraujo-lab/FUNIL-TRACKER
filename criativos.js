/* ============================================================
   criativos.js — aba de análise de criativos semanais
   ============================================================ */

const Criativos = (() => {

  const KEY     = 'funil-tracker-criativos-v1';
  const COL_KEY = 'funil-tracker-criativos-colunas';
  const VIEW_KEY = 'funil-tracker-criativos-view';

  // ── Storage próprio ───────────────────────────────────────────────────

  function loadAds() {
    try { return JSON.parse(localStorage.getItem(KEY) || '[]'); }
    catch { return []; }
  }

  function saveAds(ads) {
    localStorage.setItem(KEY, JSON.stringify(ads));
  }

  // ── Ligação criativo ↔ funil (por link do anúncio) ────────────────────

  const normUrl = Storage.normUrl;

  // Funis carregados do Supabase; Storage.load() só como fallback.
  function getFunis() {
    const g = window._funnelsGlobal;
    return Array.isArray(g) && g.length ? g : Storage.load();
  }

  // Índice normUrl → [{ funil, idx, url }] com todos os anúncios de cada
  // funil (idx 0 = principal). Refeito quando a lista de funis muda.
  let _idxSrc = null;
  let _idx    = new Map();
  function funisIndex() {
    const funis = getFunis();
    if (funis !== _idxSrc) {
      _idxSrc = funis;
      _idx = new Map();
      funis.forEach(funil => {
        const vistos = new Set();
        Storage.anunciosDoFunil(funil).forEach(({ idx, url }) => {
          const k = normUrl(url);
          if (vistos.has(k)) return;
          vistos.add(k);
          if (!_idx.has(k)) _idx.set(k, []);
          _idx.get(k).push({ funil, idx, url });
        });
      });
    }
    return _idx;
  }

  function funisDoAnuncio(ad) {
    const k = normUrl(ad?.urlAnuncio);
    return k ? (funisIndex().get(k) || []) : [];
  }

  // Funil do criativo: prefere link idêntico, depois anúncio principal,
  // depois o primeiro (funis vêm do mais recente para o mais antigo).
  function findMatch(ad) {
    const ms = funisDoAnuncio(ad);
    return ms.find(m => m.url === ad.urlAnuncio)
        || ms.find(m => m.idx === 0)
        || ms[0] || null;
  }

  function findFunil(ad) {
    return findMatch(ad)?.funil || null;
  }

  function semFunilHtml(ad) {
    const motivo = ad.urlAnuncio ? 'Nenhum funil com este link' : 'Criativo sem link do anúncio';
    return `<span style="color:var(--text-muted)" title="${motivo}">—</span>`;
  }

  function comHistorico(historico, anterior, novo, dataBase) {
    const h = Array.isArray(historico) ? [...historico] : [];
    const hoje = new Date().toISOString().slice(0, 10);
    if (h.length === 0 && anterior != null) h.push({ data: dataBase || hoje, views: anterior });
    h.push({ data: hoje, views: novo });
    return h;
  }

  // Leva views editadas no criativo para o funil de findFunil (com histórico).
  // Só age quando o valor mudou em relação ao anterior do criativo.
  function syncViewsParaFunis(ad, viewsAnterior) {
    // Views apagadas (null) não vão para o funil: ele mantém o último número.
    if (ad.views == null || ad.views === viewsAnterior) return;
    if (!window._saveFunnelsGlobal) return;
    const m = findMatch(ad);
    if (!m) return;
    const f = m.funil;
    const novo = { ...f };
    let alterou = false;

    if (m.idx === 0 && f.views !== ad.views) {
      novo.views = ad.views;
      novo.viewsHistorico = comHistorico(f.viewsHistorico, f.views, ad.views, f.data);
      alterou = true;
    }
    const an = Array.isArray(f.anuncios) ? f.anuncios[m.idx] : null;
    if (an && an.views !== ad.views) {
      novo.anuncios = f.anuncios.map((a, i) => i !== m.idx ? a : {
        ...a,
        views: ad.views,
        viewsHistorico: comHistorico(a.viewsHistorico, a.views, ad.views, f.data),
      });
      alterou = true;
    }
    if (!alterou) return;
    window._saveFunnelsGlobal(getFunis().map(x => x.id === f.id ? novo : x));
  }

  // ── Colunas visíveis ──────────────────────────────────────────────────

  const COLUMNS = [
    { key: 'data',       label: 'Data',                     default: true  },
    { key: 'nicho',      label: 'Nicho',                    default: true  },
    { key: 'produto',    label: 'Produto',                  default: true  },
    { key: 'conta',      label: 'Conta',                    default: true  },
    { key: 'hook',       label: 'Hook',                     default: true  },
    { key: 'angulo',     label: 'Ângulo',                   default: true  },
    { key: 'formato',    label: 'Formato',                  default: false },
    { key: 'views',      label: 'Views',                    default: true  },
    { key: 'contas',     label: 'Contas c/ mesmo criativo', default: false },
    { key: 'destaque',   label: 'Destaque',                 default: false },
    { key: 'tagLateral', label: 'Tag lateral',              default: true  },
    { key: 'urlAnuncio', label: 'Link do anúncio',          default: true  },
  ];

  function loadCols() {
    try {
      const saved = JSON.parse(localStorage.getItem(COL_KEY));
      if (saved && typeof saved === 'object') {
        const defaults = Object.fromEntries(COLUMNS.map(c => [c.key, c.default]));
        return Object.assign(defaults, saved);
      }
    } catch {}
    return Object.fromEntries(COLUMNS.map(c => [c.key, c.default]));
  }

  function saveCols(cols) {
    localStorage.setItem(COL_KEY, JSON.stringify(cols));
  }

  function loadView() {
    try { return localStorage.getItem(VIEW_KEY) === 'grade' ? 'grade' : 'lista'; }
    catch { return 'lista'; }
  }

  function saveView(v) {
    try { localStorage.setItem(VIEW_KEY, v); } catch {}
  }

  let _ads         = loadAds();
  let _showToast   = null;
  let _currentDups = [];
  let _cols        = loadCols();
  let _closeColsDd = null;
  let _crPage       = 1;
  let _crPerPage    = 25;
  let _crTotalPages = 1;
  let _view         = loadView();

  // ── Constantes ────────────────────────────────────────────────────────

  const NICHOS = ['WL','DB','MM','ED','NR','DA','PT','VL','TN','LG','RJ','RE','BP','PA','LF'];

  const ANGULOS = [
    'Transformação','Revelação','Autoridade','Urgência',
    'Receita secreta','Familiar','Descoberta','Dor','Outro'
  ];

  const FORMATOS = ['Reel','Post vídeo','Post imagem','Story','Carrossel'];

  const NICHO_COLORS = {
    WL:'#378ADD', DB:'#639922', MM:'#7F77DD', PT:'#BA7517',
    DA:'#1D9E75', ED:'#E24B4A', NR:'#D85A30', VL:'#D4537E',
    TN:'#888780', LG:'#888780', RJ:'#888780', RE:'#888780', BP:'#14B8A6',
    PA:'#14B8A6', LF:'#8B5CF6'
  };

  // ── Geração de semanas ────────────────────────────────────────────────

  function getWeekLabel(dateStr) {
    if (!dateStr) return 'Sem data';
    const d    = new Date(dateStr + 'T00:00:00');
    const day  = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const mon  = new Date(d.setDate(diff));
    const sun  = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    const fmt = dt => dt.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit' });
    return `${fmt(mon)} – ${fmt(sun)}`;
  }

  function getWeeks() {
    const weeks = new Set(_ads.map(a => getWeekLabel(a.data)));
    return ['Todas as semanas', ...Array.from(weeks).reverse()];
  }

  // ── Filtro de semana ──────────────────────────────────────────────────

  function filteredAds(pool, semana, angulo) {
    return pool.filter(a => {
      if (semana && semana !== 'Todas as semanas' && getWeekLabel(a.data) !== semana) return false;
      if (angulo && a.angulo !== angulo) return false;
      return true;
    });
  }

  // ── Score ─────────────────────────────────────────────────────────────

  function calcScore(ad) {
    const views    = Number(ad.views)    || 0;
    const contas   = Number(ad.contas)   || 1;
    const destaque = ad.destaque ? 1 : 0;
    return Math.round(views / 1000 * 2 + contas * 15 + destaque * 20);
  }

  // ── Detectar criativos duplicados (mesmo hook em contas diferentes) ───

  function getDuplicates(ads) {
    const groups = {};
    ads.forEach(ad => {
      const key = (ad.hookFingerprint || ad.hook || '').trim().toLowerCase().slice(0, 60);
      if (!key) return;
      if (!groups[key]) groups[key] = [];
      groups[key].push(ad);
    });
    return Object.values(groups).filter(g => g.length > 1);
  }

  // ── HTML helpers ──────────────────────────────────────────────────────

  function esc(s) { return Storage.escHtml(s); }

  function nichoBadge(nicho) {
    const c = NICHO_COLORS[nicho] || '#888';
    return `<span style="background:${c}22;color:${c};border:1px solid ${c}44;
      border-radius:20px;padding:2px 7px;font-size:11px;font-weight:500">${esc(nicho)}</span>`;
  }

  function formatViews(v) {
    if (!v && v !== 0) return '—';
    const n = Number(v);
    if (n >= 1000000) return (n/1000000).toFixed(1) + 'M';
    if (n >= 1000)    return (n/1000).toFixed(1) + 'K';
    return String(n);
  }

  function formatDateShort(dateStr) {
    if (!dateStr) return '—';
    const p = dateStr.split('-');
    return p.length === 3 ? `${p[2]}/${p[1]}` : dateStr;
  }

  function cleanConta(conta) {
    if (!conta) return null;
    const m = conta.match(/^[\d]+\s*-\s*(.+)$/);
    if (m && m[1].trim()) return m[1].trim();
    return conta.trim();
  }

  function optionsHtml(arr, selected = '') {
    return arr.map(v =>
      `<option value="${esc(v)}" ${selected === v ? 'selected' : ''}>${esc(v)}</option>`
    ).join('');
  }

  // ── Inline editing ────────────────────────────────────────────────────

  function rerenderRow(id) {
    const tr = document.querySelector(`#cr-table tr[data-id="${CSS.escape(id)}"]`);
    if (!tr) {
      const card = document.querySelector(`#cr-grid .cr-card[data-id="${CSS.escape(id)}"]`);
      if (!card) return;
      const adCard = _ads.find(a => a.id === id);
      if (!adCard) return;
      const tmpCard = document.createElement('div');
      tmpCard.innerHTML = renderCard(adCard, _currentDups);
      card.replaceWith(tmpCard.firstElementChild);
      return;
    }
    const ad = _ads.find(a => a.id === id);
    if (!ad) return;
    const tmp = document.createElement('tbody');
    tmp.innerHTML = renderRow(ad, _currentDups);
    tr.replaceWith(tmp.firstElementChild);
  }

  function makeEditable(td) {
    if (td.querySelector('input, select, textarea')) return;
    const tr = td.closest('[data-id]');
    const id = tr?.dataset.id;
    if (!id) return;
    const field = td.dataset.field;
    if (!field) return;
    const ad = _ads.find(a => a.id === id);
    if (!ad) return;

    let cancelled = false;
    let saved     = false;

    function applyAndSave() {
      if (saved || cancelled) return;
      saved = true;

      let val;
      if (input.tagName === 'SELECT') {
        val = input.value;
      } else if (input.type === 'number') {
        val = parseInt(input.value) || 1;
      } else {
        val = input.value.trim();
      }

      if (field === 'views') {
        if (!val) {
          val = null;
        } else {
          const raw = String(val);
          const n = parseFloat(raw.replace(/[kKmM]/, '')) *
            (/[mM]/.test(raw) ? 1000000 : /[kK]/.test(raw) ? 1000 : 1);
          val = isNaN(n) ? null : Math.round(n);
        }
      } else if (val === '' && field !== 'contas') {
        val = null;
      }

      if (field === 'produto') val = Storage.normalizeProduto(val);
      if (field === 'hook' && val && !ad.hookFingerprint) {
        ad.hookFingerprint = val.toLowerCase().slice(0, 60);
      }

      const viewsAnterior = field === 'views' ? ad.views : undefined;
      ad[field] = val;
      saveAds(_ads);
      if (field === 'views') syncViewsParaFunis(ad, viewsAnterior);
      rerenderRow(id);
    }

    let input;

    if (['nicho', 'angulo', 'formato'].includes(field)) {
      input = document.createElement('select');
      const opts = field === 'nicho' ? NICHOS : field === 'angulo' ? ANGULOS : FORMATOS;
      input.innerHTML = `<option value="">—</option>` + optionsHtml(opts, ad[field] || '');
      input.style.cssText = 'width:100%;font-size:12px;background:var(--surface);color:var(--text);border:1px solid var(--accent);border-radius:4px;padding:2px 4px';
      let committed = false;
      input.addEventListener('change', () => { committed = true; applyAndSave(); });
      input.addEventListener('blur',   () => { if (!committed && !cancelled) rerenderRow(id); });
      input.addEventListener('keydown', e => {
        if (e.key === 'Escape') { cancelled = true; rerenderRow(id); }
      });

    } else if (field === 'data') {
      input = document.createElement('input');
      input.type  = 'date';
      input.value = ad.data || '';
      input.style.cssText = 'font-size:12px;background:var(--surface);color:var(--text);border:1px solid var(--accent);border-radius:4px;padding:2px 6px;color-scheme:dark';
      let committed = false;
      input.addEventListener('change', () => { committed = true; applyAndSave(); });
      input.addEventListener('blur',   () => { if (!committed && !cancelled) rerenderRow(id); });
      input.addEventListener('keydown', e => {
        if (e.key === 'Escape') { cancelled = true; rerenderRow(id); }
      });

    } else if (field === 'hook') {
      input = document.createElement('textarea');
      input.value = ad[field] || '';
      input.rows  = 2;
      input.style.cssText = 'width:100%;min-width:160px;font-size:12px;background:var(--surface);color:var(--text);border:1px solid var(--accent);border-radius:4px;padding:4px 6px;resize:vertical';
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); applyAndSave(); }
        if (e.key === 'Escape') { cancelled = true; rerenderRow(id); }
      });
      input.addEventListener('blur', applyAndSave);

    } else {
      input = document.createElement('input');
      input.type  = field === 'urlAnuncio' ? 'url' : 'text';
      input.value = ad[field] != null ? String(ad[field]) : '';
      input.style.cssText = 'width:100%;font-size:12px;background:var(--surface);color:var(--text);border:1px solid var(--accent);border-radius:4px;padding:2px 6px';
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') applyAndSave();
        if (e.key === 'Escape') { cancelled = true; rerenderRow(id); }
      });
      input.addEventListener('blur', applyAndSave);
    }

    td.innerHTML = '';
    td.appendChild(input);
    input.focus();
    if (typeof input.select === 'function') input.select();
  }

  // ── Render principal ──────────────────────────────────────────────────

  function render() {
    const container = document.getElementById('tab-criativos');
    if (!container) return;

    const semanas     = getWeeks();
    const semAtual    = container.dataset.semana || semanas[1] || 'Todas as semanas';
    const anguloAtual = container.dataset.angulo || '';

    // "Sem funil" mostra todos os órfãos, ignorando semana/ângulo/filtro global.
    const orfaos   = _ads.filter(a => !findFunil(a));
    const semFunil = container.dataset.semFunil === '1';

    const gfPool = GlobalFilters.filter(_ads);
    const ads    = semFunil ? orfaos : filteredAds(gfPool, semAtual, anguloAtual);
    const dups = getDuplicates(ads);
    _currentDups = dups;

    const totalAds    = ads.length;
    const totalContas = new Set(ads.map(a => a.conta).filter(Boolean)).size;
    const topViews    = ads.reduce((max, a) => Math.max(max, Number(a.views)||0), 0);
    const laterais    = dups.length;

    const sortedAds = ads.slice().sort((a, b) => calcScore(b) - calcScore(a));
    const { items: pageAds, page: pg, totalPages, total } =
      Pagination.paginate(sortedAds, _crPage, _crPerPage);
    _crPage       = pg;
    _crTotalPages = totalPages;
    const pgHtml  = Pagination.controlsHTML(_crPage, _crTotalPages, total, _crPerPage);

    container.innerHTML = `

      <!-- Filtros -->
      <div class="filters-bar" style="margin-bottom:16px;flex-wrap:wrap;gap:8px;align-items:center">
        <select id="cr-filter-semana" class="filter-input" style="min-width:180px"${semFunil ? ' disabled' : ''}>
          ${semanas.map(s =>
            `<option value="${esc(s)}" ${s===semAtual?'selected':''}>${esc(s)}</option>`
          ).join('')}
        </select>
        <select id="cr-filter-angulo" class="filter-input"${semFunil ? ' disabled' : ''}>
          <option value="">Todos os ângulos</option>
          ${ANGULOS.map(a => `<option value="${esc(a)}" ${a===anguloAtual?'selected':''}>${esc(a)}</option>`).join('')}
        </select>
        ${orfaos.length || semFunil ? `
          <button class="btn btn-secondary btn-sm" id="cr-btn-sem-funil"
            title="${semFunil ? 'Voltar aos filtros normais' : 'Criativos sem funil correspondente (de todas as semanas): corrija o link ou exclua'}"
            style="white-space:nowrap${semFunil ? ';border-color:#BA7517;color:#BA7517' : ''}">
            ⚠ Sem funil: ${orfaos.length}${semFunil ? ' ✕' : ''}
          </button>` : ''}
        <div style="position:relative" id="cr-cols-wrapper">
          <button class="btn btn-secondary btn-sm" id="cr-cols-btn" style="white-space:nowrap">⊞ Colunas</button>
          <div id="cr-cols-dropdown" style="display:none;position:absolute;top:calc(100% + 4px);right:0;
            z-index:200;background:var(--surface2);border:1px solid var(--border);border-radius:8px;
            padding:10px 14px;min-width:220px;box-shadow:0 6px 24px rgba(0,0,0,.5)">
            ${COLUMNS.map(c => `
              <label style="display:flex;align-items:center;gap:8px;padding:5px 0;cursor:pointer;
                font-size:13px;color:var(--text);user-select:none">
                <input type="checkbox" data-col-toggle="${esc(c.key)}"
                  ${_cols[c.key] !== false ? 'checked' : ''}
                  style="accent-color:var(--accent);width:14px;height:14px;cursor:pointer">
                ${esc(c.label)}
              </label>
            `).join('')}
          </div>
        </div>
        <div style="display:flex;gap:4px" id="cr-view-toggle">
          ${[['lista', '☰ Lista'], ['grade', '▦ Grade']].map(([v, label]) => `
            <button class="btn btn-secondary btn-sm" data-view="${v}" style="white-space:nowrap${_view === v
              ? ';border-color:var(--accent);color:var(--accent)' : ''}">${label}</button>
          `).join('')}
        </div>
        <button class="btn btn-primary btn-sm" id="cr-btn-novo" style="margin-left:auto">+ Novo</button>
        <button class="btn btn-secondary btn-sm" id="cr-btn-export">↓ CSV</button>
      </div>

      <!-- Métricas rápidas -->
      <div class="dashboard-grid" style="margin-bottom:20px">
        <div class="stat-card">
          <div class="stat-label">Criativos</div>
          <div class="stat-value">${totalAds}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Contas únicas</div>
          <div class="stat-value">${totalContas}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Maior views</div>
          <div class="stat-value">${formatViews(topViews)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Lateralizados</div>
          <div class="stat-value" style="color:${laterais>0?'#D85A30':'inherit'}">${laterais}</div>
        </div>
      </div>

      <!-- Alerta de lateralizados -->
      ${dups.length ? `
        <div class="analysis-block" style="margin-bottom:20px">
          <h3 class="analysis-block__title">
            <span class="analysis-block__icon">🔄</span>
            Criativos rodando em múltiplas contas
          </h3>
          ${dups.map(group => `
            <div style="border:0.5px solid var(--border);border-radius:8px;padding:12px;margin-bottom:10px">
              <div style="font-size:12px;font-weight:500;color:var(--text-muted);margin-bottom:8px">
                Hook: <span style="color:var(--text)">"${esc((group[0].hook||'').slice(0,80))}${(group[0].hook||'').length>80?'…':''}"</span>
                &nbsp;·&nbsp; <span style="color:#D85A30;font-weight:600">${group.length} contas</span>
              </div>
              <div style="display:flex;flex-wrap:wrap;gap:6px">
                ${group.map(a => `
                  <span style="background:var(--bg-card);border:0.5px solid var(--border);
                    border-radius:6px;padding:4px 10px;font-size:12px">
                    ${esc(cleanConta(a.conta)||'—')} ${a.nicho ? nichoBadge(a.nicho) : ''}
                    ${a.views ? `<span style="color:var(--text-muted);margin-left:4px">${formatViews(a.views)}</span>` : ''}
                  </span>
                `).join('')}
              </div>
            </div>
          `).join('')}
        </div>
      ` : ''}

      <!-- Ranking por ângulo -->
      ${renderAnguloChart(ads)}

      <!-- Tabela de criativos -->
      ${pgHtml}
      ${_view === 'grade' ? renderGrid(ads, pageAds, dups) : `
      <div class="table-wrapper">
        <table id="cr-table">
          <thead>
            <tr>
              ${_cols['data']       !== false ? '<th>Data</th>'                                  : ''}
              ${_cols['nicho']      !== false ? '<th style="width:44px">Nicho</th>'                : ''}
              ${_cols['produto']    !== false ? '<th style="min-width:100px">Produto</th>'       : ''}
              ${_cols['conta']      !== false ? '<th>Conta</th>'                                 : ''}
              ${_cols['hook']       !== false ? '<th>Hook</th>'                                  : ''}
              ${_cols['angulo']     !== false ? '<th>Ângulo</th>'                                : ''}
              ${_cols['formato']    !== false ? '<th>Formato</th>'                               : ''}
              ${_cols['views']      !== false ? '<th style="text-align:right">Views</th>'        : ''}
              ${_cols['contas']     !== false ? '<th style="text-align:center">Lateral.</th>'    : ''}
              ${_cols['destaque']   !== false ? '<th style="text-align:center">⭐</th>'          : ''}
              ${_cols['tagLateral'] !== false ? '<th>Tag lateral</th>'                          : ''}
              ${_cols['urlAnuncio'] !== false ? '<th style="text-align:center">Link</th>'        : ''}
              <th style="width:52px"></th>
            </tr>
          </thead>
          <tbody>
            ${ads.length === 0 ? `
              <tr><td colspan="${COLUMNS.filter(c => _cols[c.key] !== false).length + 1}">
                <div class="empty-state">
                  <div class="empty-icon">🎬</div>
                  <h3>Nenhum criativo cadastrado</h3>
                  <p>Clique em "+ Novo" para começar a registrar os ads da semana.</p>
                </div>
              </td></tr>
            ` : pageAds.map(ad => renderRow(ad, dups)).join('')}
          </tbody>
        </table>
      </div>
      `}
      ${pgHtml}
    `;

    // Bind filtros
    document.getElementById('cr-filter-semana').addEventListener('change', e => {
      container.dataset.semana = e.target.value; _crPage = 1; render();
    });
    document.getElementById('cr-filter-angulo').addEventListener('change', e => {
      container.dataset.angulo = e.target.value; _crPage = 1; render();
    });

    document.getElementById('cr-btn-sem-funil')?.addEventListener('click', () => {
      container.dataset.semFunil = semFunil ? '' : '1'; _crPage = 1; render();
    });

    document.getElementById('cr-btn-novo').addEventListener('click', () => openModal(null));
    document.getElementById('cr-btn-export').addEventListener('click', exportCSV);

    // Seletor de colunas
    if (_closeColsDd) { document.removeEventListener('click', _closeColsDd); _closeColsDd = null; }
    const colsBtn = document.getElementById('cr-cols-btn');
    const colsDd  = document.getElementById('cr-cols-dropdown');
    colsBtn.addEventListener('click', e => {
      e.stopPropagation();
      colsDd.style.display = colsDd.style.display === 'none' ? 'block' : 'none';
    });
    colsDd.addEventListener('click', e => {
      e.stopPropagation();
      const cb = e.target.closest('input[data-col-toggle]');
      if (!cb) return;
      _cols[cb.dataset.colToggle] = cb.checked;
      saveCols(_cols);
      render();
      const dd = document.getElementById('cr-cols-dropdown');
      if (dd) dd.style.display = 'block';
    });
    _closeColsDd = () => {
      const dd = document.getElementById('cr-cols-dropdown');
      if (dd) dd.style.display = 'none';
    };
    document.addEventListener('click', _closeColsDd);

    // Alternância Lista / Grade
    document.getElementById('cr-view-toggle').addEventListener('click', e => {
      const b = e.target.closest('[data-view]');
      if (!b || b.dataset.view === _view) return;
      _view = b.dataset.view === 'grade' ? 'grade' : 'lista';
      saveView(_view);
      render();
    });

    // Delegação de eventos na tabela / grade
    document.getElementById(_view === 'grade' ? 'cr-grid' : 'cr-table')?.addEventListener('click', onListClick);
  }

  function onListClick(e) {
    if (e.target.matches('input, select, textarea')) return;
    if (e.target.closest('a[href]')) return;

    const btn = e.target.closest('[data-action]');
    if (btn) {
      const id = btn.dataset.id;
      if (btn.dataset.action === 'edit')   openModal(id);
      if (btn.dataset.action === 'delete') confirmDelete(id);
      if (btn.dataset.action === 'star') {
        const ad = _ads.find(a => a.id === id);
        if (ad) { ad.destaque = !ad.destaque; saveAds(_ads); rerenderRow(id); }
      }
      return;
    }

    const td = e.target.closest('td[data-field], .cr-card [data-field]');
    if (td) makeEditable(td);
  }

  // ── Gráfico de ângulos ────────────────────────────────────────────────

  function renderAnguloChart(ads) {
    if (!ads.length) return '';
    const counts = {};
    ads.forEach(a => { if (a.angulo) counts[a.angulo] = (counts[a.angulo]||0) + 1; });
    const sorted = Object.entries(counts).sort((a,b) => b[1]-a[1]);
    if (!sorted.length) return '';
    const max = sorted[0][1];

    return `
      <div class="analysis-block" style="margin-bottom:20px">
        <h3 class="analysis-block__title">
          <span class="analysis-block__icon">📊</span>
          Ângulos da semana
        </h3>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${sorted.map(([ang, count]) => `
            <div style="display:flex;align-items:center;gap:10px">
              <div style="width:120px;font-size:12px;color:var(--text);text-align:right;flex-shrink:0">${esc(ang)}</div>
              <div style="flex:1;background:var(--bg-card);border-radius:4px;height:22px;overflow:hidden">
                <div style="width:${Math.round(count/max*100)}%;height:100%;background:#378ADD;
                  border-radius:4px;display:flex;align-items:center;padding-left:8px;
                  transition:width .3s">
                  <span style="font-size:11px;font-weight:500;color:#fff">${count}</span>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // ── Linha da tabela ───────────────────────────────────────────────────

  function renderRow(ad, dups) {
    const isLateral    = dups.some(g => g.length > 1 && g.some(a => a.id === ad.id));
    const needsHook    = ad._importado && !ad.hook;
    const rowStyle     = ad.destaque ? 'background:rgba(255,200,0,0.07)'
                       : needsHook   ? 'background:rgba(255,160,0,0.05)'
                       : '';
    const cleanedConta = cleanConta(ad.conta);
    const hookText     = (ad.hook || '').slice(0, 50);
    const hookTrunc    = (ad.hook || '').length > 50;

    const show = k => _cols[k] !== false;
    return `
      <tr data-id="${esc(ad.id)}"${needsHook ? ' class="cr-needs-hook"' : ''}${rowStyle ? ` style="${rowStyle}"` : ''}>
        ${show('data') ? `<td data-field="data">${formatDateShort(ad.data)}</td>` : ''}
        ${show('nicho') ? `<td data-field="nicho">
          ${ad.nicho ? nichoBadge(ad.nicho) : '<span style="color:var(--text-muted)">—</span>'}
        </td>` : ''}
        ${show('produto') ? `<td data-field="produto" style="min-width:100px">
          ${(ad.produtoDesconhecido || Storage.isProdutoDesconhecido(ad.produto))
            ? '<em style="color:var(--text-muted);font-style:italic">—</em>'
            : `<span style="font-weight:500">${esc(ad.produto)}</span>`}
        </td>` : ''}
        ${show('conta') ? `<td data-field="conta" style="font-size:12px">
          ${cleanedConta ? esc(cleanedConta) : '<span style="color:var(--text-muted)">—</span>'}
        </td>` : ''}
        ${show('hook') ? `<td data-field="hook" class="cr-hook-cell">
          ${needsHook
            ? `<span style="color:#BA7517;font-size:11px;font-weight:600">⚠ preencher</span>`
            : ad.hook
              ? `<span title="${esc(ad.hook)}">${esc(hookText)}${hookTrunc ? '…' : ''}</span>`
              : '<span style="color:var(--text-muted)">—</span>'}
        </td>` : ''}
        ${show('angulo') ? `<td data-field="angulo">
          ${ad.angulo
            ? `<span style="background:var(--bg-card);border:0.5px solid var(--border);
                border-radius:20px;padding:2px 7px;font-size:11px">${esc(ad.angulo)}</span>`
            : '<span style="color:var(--text-muted)">—</span>'}
        </td>` : ''}
        ${show('formato') ? `<td data-field="formato">
          ${ad.formato
            ? `<span style="background:var(--bg-card);border:0.5px solid var(--border);
                border-radius:20px;padding:2px 7px;font-size:11px">${esc(ad.formato)}</span>`
            : '<span style="color:var(--text-muted)">—</span>'}
        </td>` : ''}
        ${show('views') ? (() => {
          const funilId = findFunil(ad)?.id;
          const histBtn = funilId
            ? `<span onclick="event.stopPropagation();abrirHistoricoViews('${funilId}')" title="Ver histórico" style="cursor:pointer;font-size:11px;opacity:0.6;margin-left:4px">📋</span>`
            : '';
          return `<td data-field="views" style="text-align:right;font-weight:500">${formatViews(ad.views)}${histBtn}</td>`;
        })() : ''}
        ${show('contas') ? `<td style="text-align:center">
          ${isLateral
            ? `<span style="color:#D85A30;font-size:12px;font-weight:600">🔄</span>`
            : '<span style="color:var(--text-muted);font-size:12px">—</span>'}
        </td>` : ''}
        ${show('destaque') ? `<td style="text-align:center">
          <button class="btn btn-sm" data-action="star" data-id="${esc(ad.id)}"
            title="${ad.destaque ? 'Remover destaque' : 'Marcar como destaque'}"
            style="font-size:15px;border:none;background:none;cursor:pointer;padding:2px 4px;line-height:1">
            ${ad.destaque ? '⭐' : '☆'}
          </button>
        </td>` : ''}
        ${show('tagLateral') ? (() => {
          const funil   = findFunil(ad);
          const funilId = funil?.id;
          const tag = funil?.tagLateral || '';
          return `<td>${tag
            ? `<span class="tag-lateral" onclick="editarTagLateral('${funilId}')" title="Clique para editar">${esc(tag)}</span>`
            : (funilId ? `<button class="btn-add-lateral" onclick="editarTagLateral('${funilId}')">+</button>` : semFunilHtml(ad))
          }</td>`;
        })() : ''}
        ${show('urlAnuncio') ? `<td data-field="urlAnuncio" style="text-align:center">
          ${ad.urlAnuncio
            ? `<a href="${esc(ad.urlAnuncio)}" target="_blank" rel="noopener"
                style="font-size:15px;color:var(--accent);text-decoration:none;line-height:1"
                title="${esc(ad.urlAnuncio)}">↗</a>`
            : '<span style="color:var(--text-muted)">—</span>'}
        </td>` : ''}
        <td>
          <div class="cr-actions" style="display:flex;gap:2px;justify-content:flex-end">
            ${(() => { const funilId = findFunil(ad)?.id; return funilId ? `<button class="btn btn-sm btn-secondary" onclick="abrirDetalhe('${funilId}')" title="Ver funil">🔗 funil</button>` : ''; })()}
            <button data-action="edit" data-id="${esc(ad.id)}" title="Editar"
              style="border:none;background:none;color:var(--text-muted);padding:3px 5px;
                font-size:13px;cursor:pointer;line-height:1;border-radius:4px">✏</button>
            <button data-action="delete" data-id="${esc(ad.id)}" title="Excluir"
              style="border:none;background:none;color:#c44;padding:3px 5px;
                font-size:13px;cursor:pointer;line-height:1;border-radius:4px">✕</button>
          </div>
        </td>
      </tr>
    `;
  }

  // ── Modo Grade ────────────────────────────────────────────────────────

  // Thumb mora no funil (sincroniza com o Supabase), nunca no registro do criativo.
  function getImgCriativo(ad) {
    let best = null;
    funisDoAnuncio(ad).forEach(({ funil: f, idx }) => {
      if (idx !== 0 || !f.imgCriativo) return;
      if (!best || (f.data || '') > (best.data || '')) best = f;
    });
    return best ? best.imgCriativo : null;
  }

  function renderGrid(ads, pageAds, dups) {
    return `
      <div id="cr-grid">
        ${ads.length === 0 ? `
          <div style="grid-column:1/-1">
            <div class="empty-state">
              <div class="empty-icon">🎬</div>
              <h3>Nenhum criativo cadastrado</h3>
              <p>Clique em "+ Novo" para começar a registrar os ads da semana.</p>
            </div>
          </div>
        ` : pageAds.map(ad => renderCard(ad, dups)).join('')}
      </div>
    `;
  }

  function renderCard(ad, dups) {
    const isLateral    = dups.some(g => g.length > 1 && g.some(a => a.id === ad.id));
    const needsHook    = ad._importado && !ad.hook;
    const cleanedConta = cleanConta(ad.conta);
    const funil        = findFunil(ad);
    const funilId      = funil?.id;
    const img          = getImgCriativo(ad);
    const muted        = '<span style="color:var(--text-muted)">—</span>';
    const pill = v => `<span style="background:var(--bg-card, var(--surface));border:0.5px solid var(--border);
      border-radius:20px;padding:2px 7px;font-size:11px">${esc(v)}</span>`;

    const placeholder = `<div class="cr-card-ph"${img ? ' style="display:none"' : ''}>
        <span style="font-size:28px">🎬</span><span style="font-size:11px">sem imagem</span></div>`;
    const thumbInner = (img
      ? `<img src="${esc(img)}" loading="lazy" alt=""
          onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
      : '') + placeholder;
    const thumb = ad.urlAnuncio
      ? `<a class="cr-card-thumb" href="${esc(ad.urlAnuncio)}" target="_blank" rel="noopener" title="Abrir anúncio">${thumbInner}</a>`
      : `<div class="cr-card-thumb">${thumbInner}</div>`;

    const show = k => _cols[k] !== false;
    const cls  = 'cr-card' + (needsHook ? ' cr-needs-hook' : '') + (ad.destaque ? ' cr-destaque' : '');

    const histBtn = funilId
      ? `<span onclick="event.stopPropagation();abrirHistoricoViews('${funilId}')" title="Ver histórico" style="cursor:pointer;font-size:11px;opacity:0.6;margin-left:4px">📋</span>`
      : '';
    const tag = funil?.tagLateral || '';

    return `
      <div class="${cls}" data-id="${esc(ad.id)}">
        ${thumb}
        <div class="cr-actions">
          ${funilId ? `<button class="btn btn-sm btn-secondary" onclick="abrirDetalhe('${funilId}')" title="Ver funil">🔗 funil</button>` : ''}
          <button data-action="edit" data-id="${esc(ad.id)}" title="Editar"
            style="border:none;background:none;color:var(--text);padding:3px 5px;
              font-size:13px;cursor:pointer;line-height:1;border-radius:4px">✏</button>
          <button data-action="delete" data-id="${esc(ad.id)}" title="Excluir"
            style="border:none;background:none;color:#c44;padding:3px 5px;
              font-size:13px;cursor:pointer;line-height:1;border-radius:4px">✕</button>
        </div>
        <div class="cr-card-body">
          ${show('nicho') || show('data') ? `<div class="cr-card-row">
            ${show('nicho') ? `<div data-field="nicho">${ad.nicho ? nichoBadge(ad.nicho) : muted}</div>` : ''}
            ${show('data') ? `<div data-field="data" style="font-size:12px;color:var(--text-muted)">${formatDateShort(ad.data)}</div>` : ''}
          </div>` : ''}
          ${show('produto') ? `<div data-field="produto">
            ${(ad.produtoDesconhecido || Storage.isProdutoDesconhecido(ad.produto))
              ? '<em style="color:var(--text-muted);font-style:italic">—</em>'
              : `<span style="font-weight:500">${esc(ad.produto)}</span>`}
          </div>` : ''}
          ${show('conta') ? `<div data-field="conta" style="font-size:12px">
            ${cleanedConta ? esc(cleanedConta) : muted}
          </div>` : ''}
          ${show('hook') ? `<div data-field="hook" class="cr-card-hook">
            ${needsHook
              ? `<span style="color:#BA7517;font-size:11px;font-weight:600">⚠ preencher</span>`
              : ad.hook ? `<span title="${esc(ad.hook)}">${esc(ad.hook)}</span>` : muted}
          </div>` : ''}
          ${show('angulo') || show('formato') ? `<div class="cr-card-row">
            ${show('angulo') ? `<div data-field="angulo">${ad.angulo ? pill(ad.angulo) : muted}</div>` : ''}
            ${show('formato') ? `<div data-field="formato">${ad.formato ? pill(ad.formato) : muted}</div>` : ''}
          </div>` : ''}
          <div class="cr-card-row">
            ${show('views') ? `<div data-field="views" style="font-weight:500">${formatViews(ad.views)}${histBtn}</div>` : ''}
            ${show('contas') && isLateral ? `<span style="color:#D85A30;font-size:12px;font-weight:600" title="Lateralizado">🔄</span>` : ''}
            ${show('tagLateral') ? `<div>${tag
              ? `<span class="tag-lateral" onclick="editarTagLateral('${funilId}')" title="Clique para editar">${esc(tag)}</span>`
              : (funilId ? `<button class="btn-add-lateral" onclick="editarTagLateral('${funilId}')">+</button>` : semFunilHtml(ad))
            }</div>` : ''}
            <div style="margin-left:auto;display:flex;align-items:center;gap:6px">
              ${show('destaque') ? `<button class="btn btn-sm" data-action="star" data-id="${esc(ad.id)}"
                title="${ad.destaque ? 'Remover destaque' : 'Marcar como destaque'}"
                style="font-size:15px;border:none;background:none;cursor:pointer;padding:2px 4px;line-height:1">
                ${ad.destaque ? '⭐' : '☆'}
              </button>` : ''}
              ${show('urlAnuncio') && ad.urlAnuncio ? `<a href="${esc(ad.urlAnuncio)}" target="_blank" rel="noopener"
                style="font-size:15px;color:var(--accent);text-decoration:none;line-height:1"
                title="${esc(ad.urlAnuncio)}">↗</a>` : ''}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // ── Modal de criativo ─────────────────────────────────────────────────

  function openModal(id) {
    const ad     = id ? _ads.find(a => a.id === id) : null;
    const isEdit = !!ad;
    const today  = new Date().toISOString().slice(0,10);

    const html = `
      <div class="modal-overlay" id="cr-modal" role="dialog" aria-modal="true"
           style="display:flex">
        <div class="modal-box modal-box--wide" style="max-height:90vh;overflow-y:auto">
          <div class="modal-box__title">${isEdit ? 'Editar criativo' : 'Novo criativo'}</div>
          <div class="form-grid">

            <div class="form-group">
              <label class="field-label" for="cr-data">Data *</label>
              <input type="date" id="cr-data" value="${esc(ad?.data || today)}" />
            </div>

            <div class="form-group">
              <label class="field-label" for="cr-nicho">Nicho *</label>
              <select id="cr-nicho">
                <option value="">Selecionar…</option>
                ${NICHOS.map(n => `<option value="${n}" ${ad?.nicho===n?'selected':''}>${n}</option>`).join('')}
              </select>
            </div>

            <div class="form-group">
              <label class="field-label" for="cr-produto">Produto</label>
              <input type="text" id="cr-produto" value="${esc(ad?.produto||'')}" placeholder="Ex: SlimTide" />
            </div>

            <div class="form-group">
              <label class="field-label" for="cr-conta">Conta anunciante</label>
              <input type="text" id="cr-conta" value="${esc(ad?.conta||'')}" placeholder="Ex: Jessica Brown" />
            </div>

            <div class="form-group form-group--wide">
              <label class="field-label" for="cr-hook">
                Hook — primeiros 3 segundos *
                <span class="field-hint">O que aparece na tela/áudio antes do primeiro corte</span>
              </label>
              <textarea id="cr-hook" rows="2"
                placeholder="Ex: 'I was tired of feeling embarrassed every day…'"
              >${esc(ad?.hook||'')}</textarea>
            </div>

            <div class="form-group form-group--wide">
              <label class="field-label" for="cr-copy">Copy do anúncio (primary text)</label>
              <textarea id="cr-copy" rows="3"
                placeholder="Cole aqui o texto completo do anúncio…"
              >${esc(ad?.copy||'')}</textarea>
            </div>

            <div class="form-group">
              <label class="field-label" for="cr-angulo">Ângulo</label>
              <select id="cr-angulo">
                <option value="">Selecionar…</option>
                ${ANGULOS.map(a => `<option value="${a}" ${ad?.angulo===a?'selected':''}>${a}</option>`).join('')}
              </select>
            </div>

            <div class="form-group">
              <label class="field-label" for="cr-formato">Formato</label>
              <select id="cr-formato">
                <option value="">Selecionar…</option>
                ${FORMATOS.map(f => `<option value="${f}" ${ad?.formato===f?'selected':''}>${f}</option>`).join('')}
              </select>
            </div>

            <div class="form-group">
              <label class="field-label" for="cr-views">Views</label>
              <input type="text" id="cr-views" value="${esc(ad?.views||'')}"
                placeholder="Ex: 154000 ou 154K" />
            </div>

            <div class="form-group">
              <label class="field-label" for="cr-contas">
                Nº de contas rodando
                <span class="field-hint">Quantas fanpages com este criativo</span>
              </label>
              <input type="number" id="cr-contas" min="1" value="${esc(ad?.contas||1)}" />
            </div>

            <div class="form-group form-group--wide">
              <label class="field-label" for="cr-fingerprint">
                Hook fingerprint
                <span class="field-hint">Cole o hook idêntico ao de outro ad pra detectar lateralização automática</span>
              </label>
              <input type="text" id="cr-fingerprint"
                value="${esc(ad?.hookFingerprint||'')}"
                placeholder="Deixe em branco — preenchido automaticamente pelo hook" />
            </div>

            <div class="form-group form-group--wide">
              <label class="field-label" for="cr-url">Link do anúncio (Facebook)</label>
              <input type="url" id="cr-url" value="${esc(ad?.urlAnuncio||'')}"
                placeholder="https://www.facebook.com/…" />
            </div>

            <div class="form-group form-group--wide">
              <label class="field-label" for="cr-obs">Observações</label>
              <input type="text" id="cr-obs" value="${esc(ad?.obs||'')}"
                placeholder="Mecanismo do VSL, preço, algo que chamou atenção…" />
            </div>

          </div>

          <div class="btn-row" style="margin-top:16px">
            <button class="btn btn-primary" id="cr-modal-save">✓ Salvar</button>
            <button class="btn btn-secondary" id="cr-modal-cancel">Cancelar</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);
    const modal = document.getElementById('cr-modal');

    const close = () => modal.remove();

    document.getElementById('cr-modal-cancel').addEventListener('click', close);
    modal.addEventListener('click', e => { if (e.target === modal) close(); });

    document.getElementById('cr-modal-save').addEventListener('click', () => {
      const hook = document.getElementById('cr-hook').value.trim();
      if (!hook) { _showToast?.('Preencha o hook do criativo.'); return; }

      const viewsRaw = document.getElementById('cr-views').value.trim();
      const views    = viewsRaw
        ? (parseFloat(viewsRaw.replace(/[kK]/, '')) * (viewsRaw.match(/[kK]/) ? 1000 : 1)) || null
        : null;

      const record = {
        id:              id || Storage.genId(),
        data:            document.getElementById('cr-data').value,
        nicho:           document.getElementById('cr-nicho').value,
        produto:         Storage.normalizeProduto(document.getElementById('cr-produto').value),
        conta:           document.getElementById('cr-conta').value.trim(),
        hook,
        copy:            document.getElementById('cr-copy').value.trim(),
        angulo:          document.getElementById('cr-angulo').value,
        formato:         document.getElementById('cr-formato').value,
        views,
        contas:          parseInt(document.getElementById('cr-contas').value) || 1,
        hookFingerprint: document.getElementById('cr-fingerprint').value.trim() || hook.toLowerCase().slice(0,60),
        urlAnuncio:      document.getElementById('cr-url').value.trim(),
        obs:             document.getElementById('cr-obs').value.trim(),
        destaque:        ad?.destaque || false,
      };

      if (isEdit) {
        const idx = _ads.findIndex(a => a.id === id);
        if (idx >= 0) _ads[idx] = record;
      } else {
        _ads.unshift(record);
      }

      saveAds(_ads);
      syncViewsParaFunis(record, ad ? ad.views : null);
      close();
      render();
      _showToast?.(isEdit ? 'Criativo atualizado!' : 'Criativo salvo!');
    });
  }

  // ── Confirmação de exclusão ───────────────────────────────────────────

  function confirmDelete(id) {
    const ad = _ads.find(a => a.id === id);
    if (!ad) return;
    if (!confirm(`Excluir criativo "${(ad.hook||'').slice(0,50)}"?`)) return;
    _ads = _ads.filter(a => a.id !== id);
    saveAds(_ads);
    render();
    _showToast?.('Criativo excluído.');
  }

  // ── Export CSV ────────────────────────────────────────────────────────

  function exportCSV() {
    if (!_ads.length) { _showToast?.('Nenhum criativo para exportar.'); return; }
    const headers = ['Data','Semana','Nicho','Produto','Conta','Hook','Copy','Ângulo','Formato','Views','Contas','URL anúncio','Obs'];
    const rows = _ads.map(a => [
      a.data, getWeekLabel(a.data), a.nicho, a.produto, a.conta,
      a.hook, a.copy, a.angulo, a.formato, a.views ?? '',
      a.contas ?? 1, a.urlAnuncio, a.obs
    ].map(v => '"' + String(v??'').replace(/"/g,'""') + '"').join(','));

    const csv  = [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob(['﻿' + csv], { type:'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `criativos-${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ── API pública ───────────────────────────────────────────────────────

  function init(showToastFn, getFunnelsFn) {
    _showToast = showToastFn;
    _ads  = loadAds();
    _cols = loadCols();

    const criativosTab = document.getElementById('tab-criativos');
    criativosTab.addEventListener('click', e => {
      const btn = e.target.closest('.pg-btn[data-pg]');
      if (!btn || e.target.closest('#cr-table, #cr-grid')) return;
      const action = btn.dataset.pg;
      if      (action === 'first') _crPage = 1;
      else if (action === 'prev')  _crPage = Math.max(1, _crPage - 1);
      else if (action === 'next')  _crPage = Math.min(_crTotalPages, _crPage + 1);
      else if (action === 'last')  _crPage = _crTotalPages;
      render();
    });
    criativosTab.addEventListener('change', e => {
      if (!e.target.classList.contains('pg-per-page')) return;
      _crPerPage = parseInt(e.target.value);
      _crPage = 1;
      render();
    });

    if (!document.getElementById('cr-inline-styles')) {
      const s = document.createElement('style');
      s.id = 'cr-inline-styles';
      s.textContent = [
        '#cr-table td[data-field]{cursor:pointer}',
        '#cr-table td[data-field]:hover{background:rgba(0,212,255,.04)}',
        '#cr-table tbody tr .cr-actions{visibility:hidden}',
        '#cr-table tbody tr:hover .cr-actions{visibility:visible}',
        '#cr-table tbody tr:nth-child(even){background:rgba(255,255,255,.018)}',
        '#cr-table tbody td{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;vertical-align:middle}',
        '#cr-table td.cr-hook-cell{white-space:normal;max-width:220px}',
        '#cr-table tr.cr-needs-hook td:first-child{border-left:2px solid #BA7517}',
        '#cr-table thead th{white-space:nowrap}',
        '#cr-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px}',
        '#cr-grid .cr-card{position:relative;background:var(--bg-card, var(--surface));border:0.5px solid var(--border);border-radius:10px;overflow:hidden;display:flex;flex-direction:column}',
        '#cr-grid .cr-card.cr-needs-hook{border-left:2px solid #BA7517;background:rgba(255,160,0,0.05)}',
        '#cr-grid .cr-card.cr-destaque{background:rgba(255,200,0,0.07);border-color:rgba(255,200,0,0.35)}',
        '#cr-grid .cr-card-thumb{display:block;width:100%;aspect-ratio:4/5;background:var(--surface2);overflow:hidden}',
        '#cr-grid .cr-card-thumb img{display:block;width:100%;height:100%;object-fit:cover}',
        '#cr-grid .cr-card-ph{width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;color:var(--text-muted);opacity:.6}',
        '#cr-grid .cr-card-body{padding:8px 10px 10px;display:flex;flex-direction:column;gap:6px;font-size:13px;min-width:0}',
        '#cr-grid .cr-card-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap}',
        '#cr-grid .cr-card-hook{font-size:12px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}',
        '#cr-grid [data-field]{cursor:pointer;border-radius:4px}',
        '#cr-grid [data-field]:hover{background:rgba(0,212,255,.04)}',
        '#cr-grid .cr-actions{position:absolute;top:6px;right:6px;display:flex;gap:2px;align-items:center;background:rgba(0,0,0,.65);border-radius:6px;padding:2px;visibility:hidden}',
        '#cr-grid .cr-card:hover .cr-actions{visibility:visible}',
      ].join('');
      document.head.appendChild(s);
    }

    const funis = getFunnelsFn ? getFunnelsFn() : Storage.load();
    const imported = sincronizarComFunis(funis);
    if (imported > 0) {
      _showToast?.(`${imported} funil(s) importado(s) automaticamente para Criativos!`);
    }
  }

  // Cria criativos (_importado) para funis cuja URL de anúncio ainda não existe.
  // Retorna quantos foram criados.
  function sincronizarComFunis(funis) {
    _ads = loadAds();
    let imported = 0;
    if (funis && funis.length) {
      const existingUrls = new Set(_ads.map(a => normUrl(a.urlAnuncio)).filter(Boolean));
      funis.forEach(funil => {
        const key = normUrl(funil.urlAnuncio);
        if (!key || existingUrls.has(key)) return;
        existingUrls.add(key);
        _ads.push({
          id:              Storage.genId(),
          data:            funil.data    || null,
          nicho:           funil.nicho   || null,
          produto:         funil.produto || null,
          conta:           funil.conta   || null,
          urlAnuncio:      funil.urlAnuncio,
          views:           funil.views   || null,
          hook:            '',
          copy:            '',
          angulo:          '',
          formato:         '',
          contas:          1,
          hookFingerprint: '',
          obs:             '',
          destaque:        false,
          _importado:      true,
        });
        imported++;
      });
      if (imported > 0) {
        saveAds(_ads);
      }
    }
    return imported;
  }

  function refresh() {
    _ads = loadAds();
    _crPage = 1;
    render();
  }

  return { init, refresh, sincronizarComFunis };

})();
