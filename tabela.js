/* ============================================================
   tabela.js — dashboard, tabela, filtros, performance popup
   ============================================================ */

const Tabela = (() => {

  // ── Referências injetadas pelo main.js ────────────────────────────────
  let _getFunnels  = () => [];
  let _saveFunnels = () => {};
  let _showToast   = () => {};

  // ── Estado do popup de performance ────────────────────────────────────
  let _perfId  = null;   // id do funil com popup aberto
  let _perfEl  = null;   // elemento DOM do popup

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

  function viewsTag(views) {
    if (views == null) return dash();
    return `<span class="tag tag-views">${esc(Parser.formatViews(views))}</span>`;
  }

  // ── Célula de domínio final (suporta split) ───────────────────────────
  function domFinalCell(f, domCounts) {
    if (!f.domFinal) return dash();

    if (isSplit(f)) {
      const domains  = f.domFinal.split(' / ');
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

  // ── Dashboard ─────────────────────────────────────────────────────────
  function renderDashboard(funnels) {
    const domCounts = Storage.getDomainCounts(funnels);

    const uniqueDoms = new Set();
    funnels.forEach(f => {
      if (!f.domFinal) return;
      (isSplit(f) ? f.domFinal.split(' / ') : [f.domFinal])
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
      nicho:     document.getElementById('filter-nicho').value,
      famoso:    document.getElementById('filter-famoso').value,
      split:     document.getElementById('filter-split').value,
      repetido:  document.getElementById('filter-repetido').value,
    };
  }

  function applyFilters(funnels, f, domCounts) {
    return funnels.filter(row => {
      if (f.nicho  && row.nicho  !== f.nicho)  return false;
      if (f.famoso && row.famoso !== f.famoso) return false;

      if (f.split !== '') {
        const s = isSplit(row);
        if (f.split === 'true'  && !s) return false;
        if (f.split === 'false' &&  s) return false;
      }

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
    closePerfPopup();   // limpar popup antes de substituir DOM

    const funnels   = _getFunnels();
    const domCounts = Storage.getDomainCounts(funnels);
    const filters   = readFilters();
    const filtered  = applyFilters(funnels, filters, domCounts);
    const tbody     = document.getElementById('table-body');

    renderDashboard(funnels);

    if (filtered.length === 0) {
      const msg = funnels.length === 0
        ? `<h3>Nenhum funil cadastrado ainda</h3>
           <p>Cole um texto ou adicione manualmente para começar.</p>`
        : `<h3>Nenhum resultado para os filtros ativos</h3>
           <p>Tente ampliar a busca ou clique em "Limpar filtros".</p>`;
      tbody.innerHTML = `<tr><td colspan="12">
        <div class="empty-state">
          <div class="empty-icon">📋</div>${msg}
        </div>
      </td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(f => {
      const repeated = Storage.isRepeated(f, domCounts);

      const urlAnuncioCell = f.urlAnuncio
        ? urlCell('Ver anúncio', f.urlAnuncioFull || f.urlAnuncio)
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
            style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
          ${esc(truncate(f.conta || '—', 26))}
        </td>
        <td>${nichoTag(f.nicho)}</td>
        <td title="${esc(f.produto || '')}"
            style="font-size:12px;max-width:130px;">
          ${esc(truncate(f.produto || '—', 18))}
        </td>
        <td>${urlAnuncioCell}</td>
        <td>${viewsTag(f.views)}</td>
        <td>${famosoTag(f.famoso)}</td>
        <td>${domAnuncioCell}</td>
        <td>${domFinalCell(f, domCounts)}</td>
        <td style="min-width:90px;">
          <input class="obs-input"
                 data-id="${esc(f.id)}"
                 value="${esc(f.obs || '')}"
                 placeholder="…" />
        </td>
        <td class="perf-cell" data-id="${esc(f.id)}" style="min-width:120px;position:relative;">
          ${perfCellContent(f)}
        </td>
        <td style="white-space:nowrap;">
          <button class="btn btn-icon edit-btn"
                  data-id="${esc(f.id)}"
                  title="Editar funil"
                  type="button">✏</button>
          <button class="btn btn-icon del-btn"
                  data-id="${esc(f.id)}"
                  title="Excluir funil"
                  type="button">✕</button>
        </td>
      </tr>`;
    }).join('');
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
    set('e-conta',        f.conta        || '');
    set('e-nicho',        f.nicho        || '');
    set('e-produto',      f.produto      || '');
    set('e-urlAnuncio',   f.urlAnuncio || f.urlAnuncioFull || '');
    set('e-views',        f.views != null ? Parser.formatViews(f.views) : '');
    // Normaliza "nao" (sem acento, vindo do parser) para o valor do <select>
    set('e-famoso',       f.famoso === 'nao' ? 'não' : (f.famoso || ''));
    set('e-domAnuncio',   f.domAnuncio   || '');
    set('e-domAnuncioFull', f.domAnuncioFull || '');
    set('e-domFinal',     f.domFinal     || '');
    set('e-domFinalFull', f.domFinalFull || '');
    set('e-split',        isSplit(f) ? 'true' : 'false');
    set('e-obs',          f.obs          || '');

    document.getElementById('edit-modal').hidden = false;
    setTimeout(() => document.getElementById('e-conta').focus(), 30);
  }

  // ── Performance popup ─────────────────────────────────────────────────

  function closePerfPopup() {
    if (_perfEl && _perfEl.parentNode) _perfEl.parentNode.removeChild(_perfEl);
    _perfEl  = null;
    _perfId  = null;
  }

  function openPerfPopup(id) {
    // Clique no mesmo botão → toggle (fecha)
    if (_perfId === id) { closePerfPopup(); return; }
    closePerfPopup();

    const funnels = _getFunnels();
    const f = funnels.find(x => x.id === id);
    if (!f) return;

    const cell = document.querySelector(`.perf-cell[data-id="${id}"]`);
    if (!cell) return;

    // Clonar o <template> do index.html
    const tpl   = document.getElementById('tpl-perf-form');
    const popup = tpl.content.cloneNode(true).querySelector('.perf-popup');

    // Preencher valores existentes
    const selMoeda  = popup.querySelector('#pf-moeda');
    const inpGasto  = popup.querySelector('#pf-gasto');
    const inpConv   = popup.querySelector('#pf-conversao');

    selMoeda.value = f.moeda    || 'BRL';
    inpGasto.value = f.gasto    != null ? f.gasto    : '';
    inpConv.value  = f.conversao != null ? f.conversao : '';

    // Salvar
    popup.querySelector('[data-action="save"]').addEventListener('click', () => {
      const updated = _getFunnels();
      const target  = updated.find(x => x.id === id);
      if (!target) return;

      target.moeda     = selMoeda.value;
      target.gasto     = inpGasto.value !== '' ? parseFloat(inpGasto.value)  : null;
      target.conversao = inpConv.value  !== '' ? parseFloat(inpConv.value)   : null;

      _saveFunnels(updated);
      closePerfPopup();
      renderTable();
      _showToast('Performance salva!');
    });

    // Cancelar
    popup.querySelector('[data-action="cancel"]').addEventListener('click', closePerfPopup);

    // Fechar com Enter nos inputs de número
    [inpGasto, inpConv].forEach(inp => {
      inp.addEventListener('keydown', e => {
        if (e.key === 'Enter') popup.querySelector('[data-action="save"]').click();
        if (e.key === 'Escape') closePerfPopup();
      });
    });

    // Anexar ao body para escapar do overflow da tabela e posicionar com fixed
    document.body.appendChild(popup);
    const rect = cell.getBoundingClientRect();
    popup.style.top   = (rect.bottom + 6) + 'px';
    popup.style.right = (window.innerWidth - rect.right) + 'px';
    popup.style.left  = 'auto';

    _perfEl = popup;
    _perfId = id;

    // Fechar ao rolar a página
    window.addEventListener('scroll', closePerfPopup, { once: true, passive: true });

    // Focar primeiro campo relevante
    setTimeout(() => inpGasto.focus(), 30);
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

    // Abrir/fechar popup de performance (botão "+ adicionar" ou tags)
    const perfTrigger = e.target.closest('[data-perf-id]');
    if (perfTrigger) {
      e.stopPropagation();
      openPerfPopup(perfTrigger.dataset.perfId);
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

  // Fechar popup ao clicar fora dele
  function onDocClick(e) {
    if (!_perfEl) return;
    const clickedInsidePopup  = _perfEl.contains(e.target);
    const clickedPerfTrigger  = Boolean(e.target.closest('[data-perf-id]'));
    if (!clickedInsidePopup && !clickedPerfTrigger) closePerfPopup();
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
  function init(getFunnels, saveFunnels, showToast) {
    _getFunnels  = getFunnels;
    _saveFunnels = saveFunnels;
    _showToast   = showToast;

    // Delegação no tbody
    const tbody = document.getElementById('table-body');
    tbody.addEventListener('click',  onTableClick);
    tbody.addEventListener('change', onObsChange);
    tbody.addEventListener('keydown', e => {
      if (e.target.matches('.obs-input') && e.key === 'Enter') e.target.blur();
    });

    // Fechar popup ao clicar fora (captura no document, após todos os outros handlers)
    document.addEventListener('click', onDocClick);

    // Escape fecha popup de performance ou modal de edição
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        if (_perfEl) closePerfPopup();
        if (!document.getElementById('edit-modal').hidden) closeEditModal();
      }
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
      const viewsRaw     = val('e-views');
      const urlAn        = val('e-urlAnuncio');

      let domFinal = val('e-domFinal').toUpperCase();
      if (!domFinal && domFinalFull) {
        domFinal = domFinalFull
          .split('\n').map(u => u.trim()).filter(Boolean)
          .map(u => {
            try { return new URL(u).hostname.replace(/^www\./i, '').toUpperCase(); }
            catch { return u.toUpperCase(); }
          }).join(' / ');
      }

      Object.assign(f, {
        data:           val('e-data'),
        conta:          val('e-conta'),
        nicho:          val('e-nicho'),
        produto:        val('e-produto').toUpperCase(),
        urlAnuncio:     urlAn,
        urlAnuncioFull: urlAn,
        views:          viewsRaw ? Parser.parseViews(viewsRaw) : null,
        famoso:         val('e-famoso') || null,
        domAnuncio,
        domAnuncioFull: val('e-domAnuncioFull') || (domAnuncio ? 'https://' + domAnuncio.toLowerCase() : ''),
        domFinal,
        domFinalFull,
        split:          splitVal,
        obs:            val('e-obs'),
      });

      _saveFunnels(funnels);
      closeEditModal();
      renderTable();
      _showToast('Funil atualizado!');
    });

    // Filtros — atualizam tabela em tempo real
    const filterIds = [
      'filter-search', 'filter-nicho', 'filter-famoso',
      'filter-split',  'filter-repetido',
    ];
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

  // ── API pública ───────────────────────────────────────────────────────
  return { init, renderTable, renderDashboard };
})();
