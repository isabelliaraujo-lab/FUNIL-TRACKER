/* ============================================================
   tabela.js — dashboard, tabela, filtros, performance popup
   ============================================================ */

const Tabela = (() => {

  // ── Referências injetadas pelo main.js ────────────────────────────────
  let _getFunnels      = () => [];
  let _saveFunnels     = () => {};
  let _showToast       = () => {};
  let _getMonitoradas  = () => [];
  let _toggleMonitorar = () => {};

  // ── Ordenação ─────────────────────────────────────────────────────────
  let sortOrder = 'desc';   // 'desc' = mais recente primeiro

  // ── Paginação ─────────────────────────────────────────────────────────
  let _page       = 1;
  let _perPage    = 25;
  let _totalPages = 1;

  function ordenarPorData(funis, ordem) {
    return [...funis].sort((a, b) => {
      const da = new Date(a.data || '1970-01-01');
      const db = new Date(b.data || '1970-01-01');
      return ordem === 'desc' ? db - da : da - db;
    });
  }

  function toggleSort() {
    sortOrder = sortOrder === 'desc' ? 'asc' : 'desc';
    document.getElementById('sort-icon').textContent = sortOrder === 'desc' ? '↓' : '↑';
    renderTable();
  }

  // ── Estado do modal de performance ───────────────────────────────────
  let _perfModalId = null;

  // ── Atalhos ───────────────────────────────────────────────────────────
  const esc = Storage.escHtml;

  function isSplit(f) {
    return f.split === true || f.split === 'true';
  }

  function truncate(str, max) {
    str = String(str || '');
    return str.length > max ? str.slice(0, max) + '…' : str;
  }

  function dash() {
    return '<span style="color:var(--text-subtle)">—</span>';
  }

  function formatarData(data) {
    if (!data) return '—';
    const partes = data.split('-');
    if (partes.length < 3) return data;
    return `${partes[2]}/${partes[1]}`;
  }

  // ── Células de URL ────────────────────────────────────────────────────
  // Gera: link clicável truncado + tooltip CSS + botão copiar
  function urlCell(label, fullUrl, maxLen = 22) {
    if (!fullUrl && !label) return dash();
    const href    = fullUrl || '#';
    const display = truncate(label || href, maxLen);
    return `<div class="url-cell">
      <a class="url-link"
         href="${esc(href)}"
         target="_blank"
         rel="noopener noreferrer">${esc(display)}</a>
      <button class="url-copy-btn"
              data-copy="${esc(fullUrl || href)}"
              type="button">copiar</button>
      <span class="url-tooltip">${esc(fullUrl || href)}</span>
    </div>`;
  }

  // ── Tags ──────────────────────────────────────────────────────────────
  function nichoTag(nicho) {
    if (!nicho) return dash();
    return `<span class="tag tag-nicho nicho-${esc(nicho)}">${esc(nicho)}</span>`;
  }

  function famosoTag(famoso) {
    if (famoso === 'sim') return '<span class="tag tag-famoso-sim">Sim</span>';
    if (famoso === 'não') return '<span class="tag tag-famoso-nao">Não</span>';
    return dash();
  }

  function viewsTag(views, id) {
    if (views == null) return dash();
    if (id) {
      return `<span class="tag tag-views" style="cursor:pointer" onclick="abrirHistoricoViews('${esc(id)}')" title="Ver histórico">${esc(Parser.formatViews(views))}</span>`;
    }
    return `<span class="tag tag-views">${esc(Parser.formatViews(views))}</span>`;
  }

  // ── Célula de domínio final (suporta split) ───────────────────────────
  function domFinalCell(f, domCounts) {
    if (!f.domFinal) return dash();

    if (isSplit(f)) {
      const domains  = f.domFinal.split('\n');
      const urls     = (f.domFinalFull || '').split('\n');
      const splitTag = '<span class="tag tag-split" style="margin-bottom:4px;">split</span>';
      const links    = domains.map((raw, i) => {
        const d       = raw.trim();
        const fullUrl = (urls[i] || '').trim() || 'https://' + d.toLowerCase();
        const cnt     = domCounts[d] || 0;
        const label   = d + (cnt > 1 ? ` (${cnt}×)` : '');
        return urlCell(label, fullUrl, 30);
      }).join('');
      return `<div class="dom-final-stack">${splitTag}${links}</div>`;
    }

    const d       = f.domFinal.trim();
    const cnt     = domCounts[d] || 0;
    const label   = d + (cnt > 1 ? ` (${cnt}×)` : '');
    const fullUrl = (f.domFinalFull || '').trim() || 'https://' + d.toLowerCase();
    return urlCell(label, fullUrl, 30);
  }

  // ── Célula de performance ─────────────────────────────────────────────
  function perfCellContent(f) {
    const hasPerf = f.gasto != null || f.conversao != null;
    if (!hasPerf) {
      return `<button class="perf-add-btn" data-perf-id="${esc(f.id)}" type="button">
                + adicionar
              </button>`;
    }
    const moeda = f.moeda || 'BRL';
    const g = f.gasto     != null
      ? `<span class="tag tag-gasto"     data-perf-id="${esc(f.id)}">${esc(Storage.formatCurrency(f.gasto,     moeda))}</span>`
      : '';
    const cv = f.conversao != null
      ? `<span class="tag tag-conversao" data-perf-id="${esc(f.id)}">${esc(Storage.formatCurrency(f.conversao, moeda))}</span>`
      : '';
    return `<div class="perf-tags">${g}${cv}</div>`;
  }

  // ── Status column ─────────────────────────────────────────────────────

  // Top N produtos por soma de views (para tag 🔥 escalando)
  function computeTopViews(n = 3) {
    const map = {};
    _getFunnels().forEach(f => {
      if (Storage.isProdutoDesconhecido(f.produto)) return;
      map[f.produto] = (map[f.produto] || 0) + (f.views || 0);
    });
    return new Set(
      Object.entries(map)
        .sort((a, b) => b[1] - a[1])
        .slice(0, n)
        .map(([p]) => p)
    );
  }

  // Badges vindos da análise da funil-tracker-extension (extensão de
  // navegador), quando existir uma correspondência por dom_final.
  function analiseExtensaoTagsHtml(analise) {
    if (!analise) return [];
    const tags = [];
    if (analise.backredirect_confirmado) {
      tags.push('<span class="tag-status" style="background:#002a1a;color:#00c47a" title="' +
        esc(analise.backredirect_url || '') + '">🔙 BR confirmado</span>');
    } else if (analise.backredirect_detectado) {
      tags.push('<span class="tag-status" style="background:#2a1400;color:#f59e0b">🔙 BR suspeita</span>');
    }
    if (analise.exit_intent_detectado) {
      tags.push('<span class="tag-status" style="background:#2a1400;color:#f59e0b">🚪 Exit intent</span>');
    }
    return tags;
  }

  function statusCellContent(f, topViews) {
    const tags = [];
    if (topViews.has(f.produto)) {
      tags.push('<span class="tag-status" style="background:#2a1400;color:#f59e0b">🔥 escalando</span>');
    }
    if (f.gasto > 0 && f.conversao != null && f.conversao > f.gasto) {
      tags.push('<span class="tag-status" style="background:#002a1a;color:#00c47a">💰 ROI+</span>');
    }
    if (_getMonitoradas().includes(f.conta)) {
      tags.push('<span class="tag-status" style="background:#00143a;color:#00d4ff">👁</span>');
    }
    tags.push(...analiseExtensaoTagsHtml(f.analiseExtensao));
    return tags.length
      ? `<div style="display:flex;flex-direction:column;gap:3px">${tags.join('')}</div>`
      : '';
  }

  // ── Dashboard ─────────────────────────────────────────────────────────
  function renderDashboard(funnels) {
    const domCounts = Storage.getDomainCounts(funnels);

    const uniqueDoms = new Set();
    funnels.forEach(f => {
      if (!f.domFinal) return;
      (isSplit(f) ? f.domFinal.split('\n') : [f.domFinal])
        .forEach(d => uniqueDoms.add(d.trim()));
    });

    const repeated     = Object.values(domCounts).filter(n => n > 1).length;
    const uniqueContas = new Set(funnels.map(f => f.conta).filter(Boolean)).size;

    document.getElementById('stat-total-val').textContent     = funnels.length;
    document.getElementById('stat-doms-val').textContent      = uniqueDoms.size;
    document.getElementById('stat-contas-val').textContent    = uniqueContas;
    document.getElementById('stat-repetidos-val').textContent = repeated;
  }

  // ── Filtros ───────────────────────────────────────────────────────────
  function readFilters() {
    return {
      search:   (document.getElementById('filter-search').value   || '').toLowerCase().trim(),
      repetido:  document.getElementById('filter-repetido').value,
    };
  }

  function applyFilters(funnels, f, domCounts) {
    return GlobalFilters.filter(funnels).filter(row => {
      if (f.repetido !== '') {
        const rep = Storage.isRepeated(row, domCounts);
        if (f.repetido === 'sim' && !rep) return false;
        if (f.repetido === 'nao' &&  rep) return false;
      }

      if (f.search) {
        const hay = [row.conta, row.nicho, row.produto, row.urlAnuncio,
                     row.domAnuncio, row.domFinal, row.obs]
          .filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(f.search)) return false;
      }

      return true;
    });
  }

  // ── Render da tabela ──────────────────────────────────────────────────
  function renderTable() {
    _page = 1;
    _renderPage();
  }

  function _renderPage() {
    const funnels   = _getFunnels();
    const domCounts = Storage.getDomainCounts(funnels);
    const filters   = readFilters();
    const filtered  = ordenarPorData(applyFilters(funnels, filters, domCounts), sortOrder);

    renderDashboard(filtered);

    const { items, page, totalPages, total } = Pagination.paginate(filtered, _page, _perPage);
    _page       = page;
    _totalPages = totalPages;

    const pgTop    = document.getElementById('tabela-pg-top');
    const pgBottom = document.getElementById('tabela-pg-bottom');
    const pgHtml   = Pagination.controlsHTML(_page, _totalPages, total, _perPage);
    if (pgTop)    pgTop.innerHTML    = pgHtml;
    if (pgBottom) pgBottom.innerHTML = pgHtml;

    const tbody = document.getElementById('table-body');

    if (filtered.length === 0) {
      const msg = funnels.length === 0
        ? `<h3>Nenhum funil cadastrado ainda</h3>
           <p>Cole um texto ou adicione manualmente para começar.</p>`
        : `<h3>Nenhum resultado para os filtros ativos</h3>
           <p>Tente ampliar a busca ou clique em "Limpar filtros".</p>`;
      tbody.innerHTML = `<tr><td colspan="13">
        <div class="empty-state">
          <div class="empty-icon">📋</div>${msg}
        </div>
      </td></tr>`;
      return;
    }

    const topViews = computeTopViews(3);

    tbody.innerHTML = items.map(f => {
      const repeated   = Storage.isRepeated(f, domCounts);
      const monitorada = _getMonitoradas().includes(f.conta);

      const totalAnuncios  = f.anuncios?.length || (f.urlAnuncio ? 1 : 0);
      const urlAnuncioCell = f.urlAnuncio
        ? urlCell('Ver anúncio', f.urlAnuncioFull || f.urlAnuncio) +
          (totalAnuncios > 1
            ? `<span style="display:block;font-size:10px;background:#1a1040;color:#a78bfa;padding:1px 6px;border-radius:10px;margin-top:3px;width:fit-content">+${totalAnuncios - 1}</span>`
            : '')
        : dash();

      const domAnuncioCell = f.domAnuncio
        ? urlCell(
            f.domAnuncio,
            f.domAnuncioFull || ('https://' + f.domAnuncio.toLowerCase()),
            26
          )
        : dash();

      return `<tr class="${repeated ? 'row-repeated' : ''}" data-id="${esc(f.id)}">
        <td style="white-space:nowrap;">${esc(formatarData(f.data))}</td>
        <td title="${esc(f.conta || '')}"
            style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
          ${esc(truncate(f.conta || '—', 32))}
        </td>
        <td>${nichoTag(f.nicho)}</td>
        <td title="${esc(f.produto || '')}"
            style="font-size:12px;max-width:130px;">
          ${Storage.isProdutoDesconhecido(f.produto)
            ? '<span style="color:var(--text-muted);font-style:italic">—</span>'
            : esc(truncate(f.produto, 18))}
        </td>
        <td>${urlAnuncioCell}</td>
        <td>${viewsTag(f.views, f.id)}</td>
        <td>${famosoTag(f.famoso)}</td>
        <td>${domAnuncioCell}</td>
        <td>${domFinalCell(f, domCounts)}</td>
        <td style="min-width:90px;">
          <input class="obs-input"
                 data-id="${esc(f.id)}"
                 value="${esc(f.obs || '')}"
                 placeholder="…" />
        </td>
        <td class="status-cell" style="min-width:80px;white-space:nowrap;">
          ${statusCellContent(f, topViews)}
        </td>
        <td class="perf-cell" data-id="${esc(f.id)}" style="min-width:120px;position:relative;">
          ${perfCellContent(f)}
        </td>
        <td style="white-space:nowrap;">
          <button class="btn btn-sm btn-secondary"
                  onclick="abrirDetalhe('${esc(f.id)}')"
                  title="Ver detalhes"
                  type="button">👁</button>
          <button class="btn btn-icon edit-btn"
                  data-id="${esc(f.id)}"
                  title="Editar funil"
                  type="button">✏</button>
          <button class="btn-monitor ${monitorada ? 'ativo' : ''}"
                  data-monitor-conta="${esc(f.conta)}"
                  title="${monitorada ? 'Parar de monitorar' : 'Monitorar esta conta'}"
                  type="button">${monitorada ? '👁' : '+👁'}</button>
          <button class="btn btn-icon del-btn"
                  data-id="${esc(f.id)}"
                  title="Excluir funil"
                  type="button">✕</button>
        </td>
      </tr>`;
    }).join('');
  }

  // ── Sync views → criativos ────────────────────────────────────────────
  function syncViewsParaCriativos(funil) {
    const CRIATIVOS_KEY = 'funil-tracker-criativos-v1';
    if (!funil.urlAnuncio) return;
    try {
      const ads = JSON.parse(localStorage.getItem(CRIATIVOS_KEY) || '[]');
      let alterou = false;
      const updated = ads.map(a => {
        if (a.urlAnuncio && a.urlAnuncio === funil.urlAnuncio && a.views !== funil.views) {
          alterou = true;
          return { ...a, views: funil.views };
        }
        return a;
      });
      if (alterou) localStorage.setItem(CRIATIVOS_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error('Erro ao sincronizar views para criativos:', e);
    }
  }

  // ── Modal de edição ───────────────────────────────────────────────────

  function closeEditModal() {
    document.getElementById('edit-modal').hidden = true;
  }

  function openEditModal(id) {
    const f = _getFunnels().find(x => x.id === id);
    if (!f) return;

    const set = (fieldId, val) => {
      const el = document.getElementById(fieldId);
      if (el) el.value = val != null ? String(val) : '';
    };

    set('e-id',           f.id);
    set('e-data',         f.data         || '');
    set('e-hora',         f.hora         || '');
    set('e-conta',        f.conta        || '');
    set('e-nicho',        f.nicho        || '');
    set('e-produto',      f.produto      || '');
    // Reconstrói anuncios para compatibilidade com dados antigos
    const anunciosEdit = (f.anuncios && f.anuncios.length > 0)
      ? f.anuncios
      : (f.urlAnuncio ? [{ url: f.urlAnuncio, views: f.views, famoso: f.famoso }] : []);

    [1, 2, 3].forEach(i => {
      const a = anunciosEdit[i - 1] || { url: '', views: null, famoso: null };
      const urlEl    = document.getElementById(`e-url-${i}`);
      const viewsEl  = document.getElementById(`e-views-${i}`);
      const famosoEl = document.getElementById(`e-famoso-${i}`);
      if (urlEl)    urlEl.value    = a.url || '';
      if (viewsEl)  viewsEl.value  = a.views != null ? a.views : '';
      if (famosoEl) famosoEl.value = a.famoso === 'nao' ? 'não' : (a.famoso || '');
    });
    set('e-domAnuncio',   f.domAnuncio   || '');
    set('e-domAnuncioFull', f.domAnuncioFull || '');
    set('e-domFinal',     f.domFinal     || '');
    set('e-domFinalFull', f.domFinalFull || '');
    set('e-urlVsl',       f.urlVsl      || '');
    set('e-split',        isSplit(f) ? 'true' : 'false');
    set('e-obs',          f.obs          || '');

    document.getElementById('edit-modal').hidden = false;
    setTimeout(() => document.getElementById('e-conta').focus(), 30);
  }

  // ── Modal de performance ──────────────────────────────────────────────

  function closePerfModal() {
    document.getElementById('modal-performance').hidden = true;
    _perfModalId = null;
  }

  function openPerfModal(id) {
    const f = _getFunnels().find(x => x.id === id);
    if (!f) return;

    document.getElementById('perf-modal-moeda').value = f.moeda    || 'BRL';
    document.getElementById('perf-modal-gasto').value = f.gasto    != null ? f.gasto    : '';
    document.getElementById('perf-modal-conv').value  = f.conversao != null ? f.conversao : '';
    document.getElementById('perf-modal-id').value    = id;

    _perfModalId = id;
    document.getElementById('modal-performance').hidden = false;
    setTimeout(() => document.getElementById('perf-modal-gasto').focus(), 30);
  }

  function savePerfModal() {
    const id    = document.getElementById('perf-modal-id').value;
    const moeda = document.getElementById('perf-modal-moeda').value;
    const gasto = document.getElementById('perf-modal-gasto').value;
    const conv  = document.getElementById('perf-modal-conv').value;

    const funnels = _getFunnels();
    const f = funnels.find(x => x.id === id);
    if (!f) return;

    f.moeda     = moeda;
    f.gasto     = gasto !== '' ? parseFloat(gasto) : null;
    f.conversao = conv  !== '' ? parseFloat(conv)  : null;

    _saveFunnels(funnels);
    closePerfModal();
    renderTable();
    _showToast('Performance salva!');
  }

  // ── Clipboard ─────────────────────────────────────────────────────────
  function copyToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text)
        .then(() => _showToast('Copiado!'))
        .catch(() => _copyFallback(text));
    } else {
      _copyFallback(text);
    }
  }

  function _copyFallback(text) {
    const ta = Object.assign(document.createElement('textarea'), {
      value: text,
      style: 'position:fixed;opacity:0;pointer-events:none;',
    });
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); _showToast('Copiado!'); }
    catch { _showToast('Não foi possível copiar.'); }
    document.body.removeChild(ta);
  }

  // ── Delegação de eventos na tabela ────────────────────────────────────
  function onTableClick(e) {
    // Botão copiar URL
    const copyBtn = e.target.closest('.url-copy-btn');
    if (copyBtn) {
      e.preventDefault();
      e.stopPropagation();
      copyToClipboard(copyBtn.dataset.copy);
      return;
    }

    // Toggle monitorar conta — atualiza botões e células de status in-place
    const monitorBtn = e.target.closest('.btn-monitor[data-monitor-conta]');
    if (monitorBtn) {
      e.stopPropagation();
      const conta = monitorBtn.dataset.monitorConta;
      _toggleMonitorar(conta);   // atualiza monitoradas[] + Supabase + Escalada
      const nowMonitored = _getMonitoradas().includes(conta);
      // Atualizar todos os botões monitor desta conta
      document.querySelectorAll(`.btn-monitor[data-monitor-conta="${CSS.escape(conta)}"]`).forEach(btn => {
        btn.classList.toggle('ativo', nowMonitored);
        btn.title       = nowMonitored ? 'Parar de monitorar' : 'Monitorar esta conta';
        btn.textContent = nowMonitored ? '👁' : '+👁';
      });
      // Atualizar células de status das linhas desta conta
      const topViews = computeTopViews(3);
      _getFunnels().filter(f => f.conta === conta).forEach(f => {
        const cell = document.querySelector(`tr[data-id="${f.id}"] .status-cell`);
        if (cell) cell.innerHTML = statusCellContent(f, topViews);
      });
      return;
    }

    // Abrir modal de performance (botão "+ adicionar" ou tags)
    const perfTrigger = e.target.closest('[data-perf-id]');
    if (perfTrigger) {
      e.stopPropagation();
      openPerfModal(perfTrigger.dataset.perfId);
      return;
    }

    // Botão editar linha
    const editBtn = e.target.closest('.edit-btn');
    if (editBtn) {
      openEditModal(editBtn.dataset.id);
      return;
    }

    // Botão excluir linha
    const delBtn = e.target.closest('.del-btn');
    if (delBtn) {
      const id = delBtn.dataset.id;
      if (confirm('Excluir este funil? Esta ação não pode ser desfeita.')) {
        const updated = _getFunnels().filter(f => f.id !== id);
        _saveFunnels(updated);
        renderTable();
        _showToast('Funil excluído.');
      }
    }
  }

  // Salvar obs ao perder foco ou pressionar Enter
  function onObsChange(e) {
    const input = e.target.closest('.obs-input');
    if (!input) return;
    const id  = input.dataset.id;
    const val = input.value;
    const funnels = _getFunnels();
    const f = funnels.find(x => x.id === id);
    if (f && f.obs !== val) {
      f.obs = val;
      _saveFunnels(funnels);
      // Sem re-render para não perder foco durante edição
    }
  }

  // ── Inicialização ─────────────────────────────────────────────────────
  function init(getFunnels, saveFunnels, showToast, getMonitoradas, toggleMonitorar) {
    _getFunnels      = getFunnels;
    _saveFunnels     = saveFunnels;
    _showToast       = showToast;
    _getMonitoradas  = getMonitoradas  || (() => []);
    _toggleMonitorar = toggleMonitorar || (() => {});

    // Delegação no tbody
    const tbody = document.getElementById('table-body');
    tbody.addEventListener('click',  onTableClick);
    tbody.addEventListener('change', onObsChange);
    tbody.addEventListener('keydown', e => {
      if (e.target.matches('.obs-input') && e.key === 'Enter') e.target.blur();
    });

    // Paginação — tabela de funis
    document.getElementById('tab-funis').addEventListener('click', e => {
      const btn = e.target.closest('.pg-btn[data-pg]');
      if (!btn || btn.closest('#table-body')) return;
      const action = btn.dataset.pg;
      if      (action === 'first') _page = 1;
      else if (action === 'prev')  _page = Math.max(1, _page - 1);
      else if (action === 'next')  _page = Math.min(_totalPages, _page + 1);
      else if (action === 'last')  _page = _totalPages;
      _renderPage();
    });
    document.getElementById('tab-funis').addEventListener('change', e => {
      if (!e.target.classList.contains('pg-per-page')) return;
      _perPage = parseInt(e.target.value);
      _page = 1;
      _renderPage();
    });

    // Escape fecha modal de performance ou modal de edição
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        if (!document.getElementById('modal-performance').hidden) { closePerfModal(); return; }
        if (!document.getElementById('edit-modal').hidden) closeEditModal();
      }
    });

    // Modal de performance
    document.getElementById('btn-perf-save').addEventListener('click', savePerfModal);
    document.getElementById('btn-perf-cancel').addEventListener('click', closePerfModal);
    document.getElementById('modal-performance').addEventListener('click', e => {
      if (e.target === document.getElementById('modal-performance')) closePerfModal();
    });
    ['perf-modal-gasto', 'perf-modal-conv'].forEach(id => {
      document.getElementById(id).addEventListener('keydown', e => {
        if (e.key === 'Enter')  savePerfModal();
        if (e.key === 'Escape') closePerfModal();
      });
    });

    // Fechar modal de edição ao clicar no overlay
    document.getElementById('edit-modal').addEventListener('click', e => {
      if (e.target === document.getElementById('edit-modal')) closeEditModal();
    });

    // Cancelar edição
    document.getElementById('btn-cancel-edit').addEventListener('click', closeEditModal);

    // Submit do formulário de edição
    document.getElementById('edit-form').addEventListener('submit', e => {
      e.preventDefault();

      const id = document.getElementById('e-id').value;
      const funnels = _getFunnels();
      const f = funnels.find(x => x.id === id);
      if (!f) return;

      const val = fieldId => (document.getElementById(fieldId).value || '').trim();

      const domAnuncio   = val('e-domAnuncio').toUpperCase();
      const domFinalFull = val('e-domFinalFull');
      const splitVal     = document.getElementById('e-split').value === 'true';

      const anunciosRaw = [1, 2, 3].map(i => ({
        url:    (document.getElementById(`e-url-${i}`)?.value || '').trim(),
        views:  document.getElementById(`e-views-${i}`)?.value ? parseInt(document.getElementById(`e-views-${i}`).value, 10) : null,
        famoso: document.getElementById(`e-famoso-${i}`)?.value || null,
      }));

      // Registrar histórico de views por anúncio
      const hoje = new Date().toISOString().slice(0, 10);
      const anunciosAnteriores = Array.isArray(f.anuncios) && f.anuncios.length > 0
        ? f.anuncios
        : (f.urlAnuncio ? [{ url: f.urlAnuncio, views: f.views, famoso: f.famoso }] : []);

      const anuncios = anunciosRaw.filter(a => a.url).map((a, i) => {
        const anterior = anunciosAnteriores[i] || {};
        const viewsNovo = a.views;
        const viewsAnterior = anterior.views != null ? anterior.views : null;
        let historico = Array.isArray(anterior.viewsHistorico) ? [...anterior.viewsHistorico] : [];

        if (viewsNovo != null && viewsNovo !== viewsAnterior) {
          if (historico.length === 0 && viewsAnterior != null) {
            historico.push({ data: f.data || hoje, views: viewsAnterior });
          }
          historico.push({ data: hoje, views: viewsNovo });
        }

        return { ...a, viewsHistorico: historico };
      });

      const urlAn = anuncios.length > 0 ? anuncios[0].url : '';

      let domFinal = val('e-domFinal').toUpperCase();
      if (!domFinal && domFinalFull) {
        domFinal = domFinalFull
          .split('\n').map(u => u.trim()).filter(Boolean)
          .map(u => {
            try { return new URL(u).hostname.replace(/^www\./i, '').toUpperCase(); }
            catch { return u.toUpperCase(); }
          }).join('\n');
      }

      Object.assign(f, {
        data:            val('e-data'),
        hora:            val('e-hora') || null,
        conta:           val('e-conta'),
        nicho:           val('e-nicho'),
        produto:         Storage.normalizeProduto(val('e-produto')),
        anuncios,
        urlAnuncio:      urlAn,
        urlAnuncioFull:  urlAn,
        views:           anuncios.length > 0 ? anuncios[0].views : null,
        viewsHistorico:  anuncios.length > 0 ? (anuncios[0].viewsHistorico || []) : (f.viewsHistorico || []),
        famoso:          anuncios.length > 0 ? anuncios[0].famoso : null,
        domAnuncio,
        domAnuncioFull: val('e-domAnuncioFull') || (domAnuncio ? 'https://' + domAnuncio.toLowerCase() : ''),
        domFinal,
        domFinalFull,
        urlVsl:         val('e-urlVsl') || null,
        split:          splitVal,
        obs:            val('e-obs'),
      });

      _saveFunnels(funnels);
      syncViewsParaCriativos(f);
      if (!document.getElementById('tab-criativos')?.hidden) Criativos.refresh();
      closeEditModal();
      renderTable();
      _showToast('Funil atualizado!');
    });

    // Filtros — atualizam tabela em tempo real (resetam para página 1)
    const filterIds = ['filter-search', 'filter-repetido'];
    filterIds.forEach(id => {
      const el = document.getElementById(id);
      el.addEventListener('input',  renderTable);
      el.addEventListener('change', renderTable);
    });

    // Botão limpar filtros
    document.getElementById('btn-clear-filters').addEventListener('click', () => {
      filterIds.forEach(id => { document.getElementById(id).value = ''; });
      renderTable();
    });

    // Render inicial
    renderTable();
  }

  function openEditModalById(id) {
    openEditModal(id);
  }

  // ── API pública ───────────────────────────────────────────────────────
  return { init, renderTable, renderDashboard, toggleSort, openEditModalById };
})();
