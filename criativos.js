/* ============================================================
   criativos.js — aba de análise de criativos semanais
   ============================================================ */

const Criativos = (() => {

  const KEY = 'funil-tracker-criativos-v1';

  // ── Storage próprio ───────────────────────────────────────────────────

  function loadAds() {
    try { return JSON.parse(localStorage.getItem(KEY) || '[]'); }
    catch { return []; }
  }

  function saveAds(ads) {
    localStorage.setItem(KEY, JSON.stringify(ads));
  }

  let _ads         = loadAds();
  let _showToast   = null;
  let _currentDups = [];

  // ── Constantes ────────────────────────────────────────────────────────

  const NICHOS = ['WL','DB','ML','ED','NP','DA','PT','VL','TN','LG','RJ','RE'];

  const ANGULOS = [
    'Transformação','Revelação','Autoridade','Urgência',
    'Receita secreta','Familiar','Descoberta','Dor','Outro'
  ];

  const FORMATOS = ['Reel','Post vídeo','Post imagem','Story','Carrossel'];

  const NICHO_COLORS = {
    WL:'#378ADD', DB:'#639922', ML:'#7F77DD', PT:'#BA7517',
    DA:'#1D9E75', ED:'#E24B4A', NP:'#D85A30', VL:'#D4537E',
    TN:'#888780', LG:'#888780', RJ:'#888780', RE:'#888780'
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

  function filteredAds(semana, nicho, angulo) {
    return _ads.filter(a => {
      if (semana && semana !== 'Todas as semanas' && getWeekLabel(a.data) !== semana) return false;
      if (nicho  && a.nicho   !== nicho)  return false;
      if (angulo && a.angulo  !== angulo) return false;
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
      border-radius:20px;padding:2px 8px;font-size:11px;font-weight:500">${esc(nicho)}</span>`;
  }

  function formatViews(v) {
    if (!v && v !== 0) return '—';
    const n = Number(v);
    if (n >= 1000000) return (n/1000000).toFixed(1) + 'M';
    if (n >= 1000)    return (n/1000).toFixed(1) + 'K';
    return String(n);
  }

  function optionsHtml(arr, selected = '') {
    return arr.map(v =>
      `<option value="${esc(v)}" ${selected === v ? 'selected' : ''}>${esc(v)}</option>`
    ).join('');
  }

  // ── Inline editing ────────────────────────────────────────────────────

  function rerenderRow(id) {
    const tr = document.querySelector(`#cr-table tr[data-id="${CSS.escape(id)}"]`);
    if (!tr) return;
    const ad = _ads.find(a => a.id === id);
    if (!ad) return;
    const tmp = document.createElement('tbody');
    tmp.innerHTML = renderRow(ad, _currentDups);
    tr.replaceWith(tmp.firstElementChild);
  }

  function makeEditable(td) {
    if (td.querySelector('input, select, textarea')) return;
    const tr = td.closest('tr');
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

      if (field === 'produto' && val) val = val.toUpperCase();
      if (field === 'hook' && val && !ad.hookFingerprint) {
        ad.hookFingerprint = val.toLowerCase().slice(0, 60);
      }

      ad[field] = val;
      saveAds(_ads);
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
    const nichoAtual  = container.dataset.nicho  || '';
    const anguloAtual = container.dataset.angulo || '';

    const ads  = filteredAds(semAtual, nichoAtual, anguloAtual);
    const dups = getDuplicates(filteredAds(semAtual, '', ''));
    _currentDups = dups;

    // Métricas
    const totalAds    = ads.length;
    const totalContas = new Set(ads.map(a => a.conta).filter(Boolean)).size;
    const topViews    = ads.reduce((max, a) => Math.max(max, Number(a.views)||0), 0);
    const laterais    = dups.length;

    container.innerHTML = `

      <!-- Filtros de semana + nicho + ângulo -->
      <div class="filters-bar" style="margin-bottom:16px;flex-wrap:wrap;gap:8px">
        <select id="cr-filter-semana" class="filter-input" style="min-width:180px">
          ${semanas.map(s =>
            `<option value="${esc(s)}" ${s===semAtual?'selected':''}>${esc(s)}</option>`
          ).join('')}
        </select>
        <select id="cr-filter-nicho" class="filter-input">
          <option value="">Todos os nichos</option>
          ${NICHOS.map(n => `<option value="${esc(n)}" ${n===nichoAtual?'selected':''}>${esc(n)}</option>`).join('')}
        </select>
        <select id="cr-filter-angulo" class="filter-input">
          <option value="">Todos os ângulos</option>
          ${ANGULOS.map(a => `<option value="${esc(a)}" ${a===anguloAtual?'selected':''}>${esc(a)}</option>`).join('')}
        </select>
        <button class="btn btn-primary btn-sm" id="cr-btn-novo">+ Novo criativo</button>
        <button class="btn btn-secondary btn-sm" id="cr-btn-export">↓ Exportar CSV</button>
      </div>

      <!-- Métricas rápidas -->
      <div class="dashboard-grid" style="margin-bottom:20px">
        <div class="stat-card">
          <div class="stat-label">Criativos na semana</div>
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
          <div class="stat-label">Criativos lateralizados</div>
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
                    ${esc(a.conta||'—')} ${nichoBadge(a.nicho)}
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
      <div class="table-wrapper">
        <table id="cr-table">
          <thead>
            <tr>
              <th>Data</th>
              <th>Nicho</th>
              <th>Produto</th>
              <th>Conta</th>
              <th>Hook (primeiros 3s)</th>
              <th>Ângulo</th>
              <th>Formato</th>
              <th>Views</th>
              <th>Contas c/ mesmo criativo</th>
              <th>Destaque</th>
              <th>Link do anúncio</th>
              <th aria-label="Ações"></th>
            </tr>
          </thead>
          <tbody>
            ${ads.length === 0 ? `
              <tr>
                <td colspan="12">
                  <div class="empty-state">
                    <div class="empty-icon">🎬</div>
                    <h3>Nenhum criativo cadastrado</h3>
                    <p>Clique em "+ Novo criativo" para começar a registrar os ads da semana.</p>
                  </div>
                </td>
              </tr>
            ` : ads
                .sort((a,b) => calcScore(b) - calcScore(a))
                .map(ad => renderRow(ad, dups))
                .join('')}
          </tbody>
        </table>
      </div>
    `;

    // Bind filtros
    document.getElementById('cr-filter-semana').addEventListener('change', e => {
      container.dataset.semana = e.target.value;
      render();
    });
    document.getElementById('cr-filter-nicho').addEventListener('change', e => {
      container.dataset.nicho = e.target.value;
      render();
    });
    document.getElementById('cr-filter-angulo').addEventListener('change', e => {
      container.dataset.angulo = e.target.value;
      render();
    });

    document.getElementById('cr-btn-novo').addEventListener('click', () => openModal(null));
    document.getElementById('cr-btn-export').addEventListener('click', exportCSV);

    // Delegação de eventos na tabela
    document.getElementById('cr-table')?.addEventListener('click', e => {
      // Ignore clicks on active inputs / links
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

      const td = e.target.closest('td[data-field]');
      if (td) makeEditable(td);
    });
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
    const isLateral  = dups.some(g => g.length > 1 && g.some(a => a.id === ad.id));
    const needsHook  = ad._importado && !ad.hook;
    const rowBg      = ad.destaque   ? 'background:rgba(255,200,0,0.07)'
                     : needsHook     ? 'background:rgba(255,180,0,0.05)'
                     : '';

    return `
      <tr data-id="${esc(ad.id)}" style="${rowBg}">
        <td data-field="data">${esc(ad.data || '—')}</td>
        <td data-field="nicho">${ad.nicho ? nichoBadge(ad.nicho) : '<span style="color:var(--text-muted)">—</span>'}</td>
        <td data-field="produto" style="font-weight:500">${esc(ad.produto || '—')}</td>
        <td data-field="conta" style="font-size:12px">${esc(ad.conta || '—')}</td>
        <td data-field="hook" style="font-size:12px;max-width:200px">
          ${needsHook
            ? `<span style="color:#F59E0B;font-size:11px;font-weight:600">⚠ preencher hook</span>`
            : `<span title="${esc(ad.hook||'')}">${esc((ad.hook||'').slice(0,60))}${(ad.hook||'').length>60?'…':''}</span>`}
        </td>
        <td data-field="angulo">
          ${ad.angulo
            ? `<span style="background:var(--bg-card);border:0.5px solid var(--border);
                border-radius:20px;padding:2px 8px;font-size:11px">${esc(ad.angulo)}</span>`
            : '<span style="color:var(--text-muted)">—</span>'}
        </td>
        <td data-field="formato" style="font-size:12px">${esc(ad.formato || '—')}</td>
        <td data-field="views" style="font-weight:500;text-align:right">${formatViews(ad.views)}</td>
        <td style="text-align:center">
          ${isLateral
            ? `<span style="color:#D85A30;font-weight:600;font-size:12px">🔄 lateralizado</span>`
            : '<span style="color:var(--text-muted);font-size:12px">—</span>'}
        </td>
        <td style="text-align:center">
          <button class="btn btn-sm" data-action="star" data-id="${esc(ad.id)}"
            title="${ad.destaque ? 'Remover destaque' : 'Marcar como destaque'}"
            style="font-size:16px;border:none;background:none;cursor:pointer;padding:2px 6px">
            ${ad.destaque ? '⭐' : '☆'}
          </button>
        </td>
        <td data-field="urlAnuncio">
          ${ad.urlAnuncio
            ? `<a href="${esc(ad.urlAnuncio)}" target="_blank" rel="noopener"
                style="font-size:11px;color:var(--accent)">↗ ver ad</a>`
            : '<span style="color:var(--text-muted)">—</span>'}
        </td>
        <td>
          <div style="display:flex;gap:4px">
            <button class="btn btn-sm btn-secondary" data-action="edit" data-id="${esc(ad.id)}">✏</button>
            <button class="btn btn-sm btn-secondary" data-action="delete" data-id="${esc(ad.id)}"
              style="color:#e55">✕</button>
          </div>
        </td>
      </tr>
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
        produto:         document.getElementById('cr-produto').value.trim().toUpperCase(),
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
    _ads = loadAds();

    // Inject hover styles for editable cells
    if (!document.getElementById('cr-inline-styles')) {
      const s = document.createElement('style');
      s.id = 'cr-inline-styles';
      s.textContent = '#cr-table td[data-field]{cursor:pointer}#cr-table td[data-field]:hover{background:rgba(0,212,255,.04)}';
      document.head.appendChild(s);
    }

    // Auto-import funnels that don't already have a criativo entry
    const funis = getFunnelsFn ? getFunnelsFn() : Storage.load();
    if (funis && funis.length) {
      const existingUrls = new Set(_ads.map(a => a.urlAnuncio).filter(Boolean));
      let imported = 0;
      funis.forEach(funil => {
        if (!funil.urlAnuncio || existingUrls.has(funil.urlAnuncio)) return;
        existingUrls.add(funil.urlAnuncio);
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
        _showToast?.(`${imported} funil(s) importado(s) automaticamente para Criativos!`);
      }
    }
  }

  function refresh() {
    _ads = loadAds();
    render();
  }

  return { init, refresh };

})();
