/* ============================================================
   analise.js — aba de análise e cruzamento de dados
   ============================================================ */

const Analise = (() => {

  let _getFunnels = () => [];

  const esc = Storage.escHtml;

  // ── Helpers de domínio ────────────────────────────────────────────────

  function finalDomains(f) {
    if (!f.domFinal) return [];
    return (f.split === true || f.split === 'true')
      ? f.domFinal.split(' / ').map(d => d.trim()).filter(Boolean)
      : [f.domFinal.trim()];
  }

  // ── Helpers de performance ────────────────────────────────────────────

  const SIMBOLOS = { BRL: 'R$', USD: '$', INR: '₹' };

  function fmtMoeda(simbolo, val) {
    return `${simbolo} ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
  }

  function calcularTotaisPorMoeda(funis) {
    const totais = {};
    funis.forEach(f => {
      if (f.gasto == null && f.conversao == null) return;
      const m = f.moeda || 'BRL';
      if (!totais[m]) totais[m] = { gasto: 0, conversao: 0, simbolo: SIMBOLOS[m] || 'R$' };
      totais[m].gasto     += parseFloat(f.gasto)     || 0;
      totais[m].conversao += parseFloat(f.conversao) || 0;
    });
    return totais;
  }

  function renderTotaisPerf(funis) {
    const totais = calcularTotaisPorMoeda(funis);
    if (!Object.keys(totais).length) return '';
    return Object.entries(totais).map(([, t]) => {
      const parts = [];
      if (t.gasto     > 0) parts.push(`<span class="af-perf-gasto">${esc(fmtMoeda(t.simbolo, t.gasto))} gasto</span>`);
      if (t.conversao > 0) parts.push(`<span class="af-perf-conv">${esc(fmtMoeda(t.simbolo, t.conversao))} conv.</span>`);
      return parts.join('');
    }).join('');
  }

  function renderPerfIndividual(f) {
    if (f.gasto == null && f.conversao == null) return '';
    const s   = SIMBOLOS[f.moeda || 'BRL'] || 'R$';
    const fmt = v => fmtMoeda(s, parseFloat(v));
    let txt;
    if (f.gasto != null && f.conversao != null) txt = `${fmt(f.gasto)} / ${fmt(f.conversao)}`;
    else if (f.gasto != null)                   txt = `${fmt(f.gasto)} gasto`;
    else                                         txt = `${fmt(f.conversao)} conv.`;
    return `<span class="af-perf-individual">${esc(txt)}</span>`;
  }

  function fmtData(d) {
    if (!d) return '—';
    const p = d.split('-');
    return p.length === 3 ? `${p[2]}/${p[1]}` : d;
  }

  function funilRowHtml(f) {
    const meta = [
      fmtData(f.data),
      f.nicho   || '',
      f.produto || '',
      f.views   ? Parser.formatViews(f.views) : '',
      f.famoso  === 'sim' ? 'Famoso' : (f.famoso === 'nao' ? 'Não famoso' : ''),
    ].filter(Boolean).map(esc).join(' · ');

    const perf = renderPerfIndividual(f);
    const url  = (f.urlAnuncioFull || f.urlAnuncio)
      ? `<a class="af-funil-link" href="${esc(f.urlAnuncioFull || f.urlAnuncio)}" target="_blank" rel="noopener">Ver anúncio</a>`
      : '';

    return `<div class="af-funil-row">
      <span class="af-funil-meta">${meta}</span>
      ${perf}${url}
    </div>`;
  }

  // ── Componentes HTML ──────────────────────────────────────────────────

  function metricsHtml(metrics) {
    return `<div class="analysis-metrics">
      ${metrics.map(m => `
        <div class="analysis-metric">
          <div class="analysis-metric__val">${m.val}</div>
          <div class="analysis-metric__lbl">${esc(m.lbl)}</div>
        </div>`).join('')}
    </div>`;
  }

  // items = [{ title, pills: string[], funnels: Funnel[] }]
  function listHtml(items) {
    if (!items.length) return '<p class="analysis-no-results">Nenhum resultado.</p>';
    return `<div class="analysis-list">
      ${items.map(item => {
        const perfHtml = renderTotaisPerf(item.funnels || []);
        const hasBody  = (item.funnels || []).length > 0;
        const bodyHtml = hasBody ? (item.funnels).map(funilRowHtml).join('') : '';
        return `
        <div class="analysis-item${hasBody ? ' analysis-item--expandable' : ''}">
          <div class="analysis-item__header">
            <div class="analysis-item__title-row">
              <span class="analysis-item__title">${esc(item.title)}</span>
              ${hasBody ? '<span class="analysis-item__toggle">▸</span>' : ''}
            </div>
            <div class="analysis-item__meta">
              ${item.pills.map(p => `<span class="analysis-item__pill">${esc(p)}</span>`).join('')}
              ${perfHtml}
            </div>
          </div>
          ${hasBody ? `<div class="analysis-item__body">${bodyHtml}</div>` : ''}
        </div>`;
      }).join('')}
    </div>`;
  }

  function twoColHtml(leftTitle, leftItems, rightTitle, rightItems) {
    return `<div class="analysis-list--two-col">
      <div>
        <div class="analysis-list__heading">${esc(leftTitle)}</div>
        ${listHtml(leftItems)}
      </div>
      <div>
        <div class="analysis-list__heading">${esc(rightTitle)}</div>
        ${listHtml(rightItems)}
      </div>
    </div>`;
  }

  // ── Expand/collapse via delegação ─────────────────────────────────────

  function onAnaliseClick(e) {
    const header = e.target.closest('.analysis-item--expandable .analysis-item__header');
    if (!header) return;
    const item = header.closest('.analysis-item');
    const expanded = item.classList.toggle('analysis-item--expanded');
    header.querySelector('.analysis-item__toggle').textContent = expanded ? '▾' : '▸';
  }

  // ── Bloco 1 — por domínio de anúncio ─────────────────────────────────

  function searchDomAnuncio() {
    const q  = document.getElementById('search-dom-anuncio').value.trim().toUpperCase();
    const el = document.getElementById('result-dom-anuncio');
    if (!q) { el.innerHTML = ''; return; }

    const matched = _getFunnels().filter(
      f => (f.domAnuncio || '').toUpperCase().includes(q)
    );

    if (!matched.length) {
      el.innerHTML = '<p class="analysis-no-results">Nenhum resultado para esta busca.</p>';
      return;
    }

    const contas   = new Set(matched.map(f => f.conta).filter(Boolean));
    const produtos = new Set(matched.map(f => f.produto).filter(Boolean));
    const destinos = new Set();
    matched.forEach(f => finalDomains(f).forEach(d => destinos.add(d)));

    const byContas = {};
    matched.forEach(f => {
      const k = f.conta || '(sem conta)';
      if (!byContas[k]) byContas[k] = { produtos: new Set(), funnels: [] };
      byContas[k].funnels.push(f);
      if (f.produto) byContas[k].produtos.add(f.produto);
    });

    const items = Object.entries(byContas)
      .sort((a, b) => b[1].funnels.length - a[1].funnels.length)
      .map(([conta, d]) => ({
        title:   conta,
        pills:   [`${d.funnels.length} funil(s)`, ...[...d.produtos]],
        funnels: d.funnels,
      }));

    el.innerHTML =
      metricsHtml([
        { val: contas.size,    lbl: 'Contas'          },
        { val: matched.length, lbl: 'Funis'           },
        { val: produtos.size,  lbl: 'Produtos'        },
        { val: destinos.size,  lbl: 'Destinos finais' },
      ]) + listHtml(items);
  }

  // ── Bloco 2 — por domínio final ───────────────────────────────────────

  function searchDomFinal() {
    const q  = document.getElementById('search-dom-final').value.trim().toUpperCase();
    const el = document.getElementById('result-dom-final');
    if (!q) { el.innerHTML = ''; return; }

    const matched = _getFunnels().filter(
      f => (f.domFinal || '').toUpperCase().includes(q)
    );

    if (!matched.length) {
      el.innerHTML = '<p class="analysis-no-results">Nenhum resultado para esta busca.</p>';
      return;
    }

    const contas   = new Set(matched.map(f => f.conta).filter(Boolean));
    const produtos = new Set(matched.map(f => f.produto).filter(Boolean));
    const domsAn   = new Set(matched.map(f => f.domAnuncio).filter(Boolean));

    const byContas = {};
    matched.forEach(f => {
      const k = f.conta || '(sem conta)';
      if (!byContas[k]) byContas[k] = { domsAn: new Set(), produtos: new Set(), funnels: [] };
      byContas[k].funnels.push(f);
      if (f.domAnuncio) byContas[k].domsAn.add(f.domAnuncio);
      if (f.produto)    byContas[k].produtos.add(f.produto);
    });

    const items = Object.entries(byContas)
      .sort((a, b) => b[1].funnels.length - a[1].funnels.length)
      .map(([conta, d]) => ({
        title:   conta,
        pills:   [`${d.funnels.length} funil(s)`, ...[...d.domsAn], ...[...d.produtos]],
        funnels: d.funnels,
      }));

    el.innerHTML =
      metricsHtml([
        { val: contas.size,    lbl: 'Contas'        },
        { val: matched.length, lbl: 'Funis'         },
        { val: domsAn.size,    lbl: 'Dom. anúncio'  },
        { val: produtos.size,  lbl: 'Produtos'      },
      ]) + listHtml(items);
  }

  // ── Bloco 3 — por produto ─────────────────────────────────────────────

  function searchProduto() {
    const q  = document.getElementById('search-produto').value.trim().toUpperCase();
    const el = document.getElementById('result-produto');
    if (!q) { el.innerHTML = ''; return; }

    const matched = _getFunnels().filter(
      f => (f.produto || '').toUpperCase().includes(q)
    );

    if (!matched.length) {
      el.innerHTML = '<p class="analysis-no-results">Nenhum resultado para esta busca.</p>';
      return;
    }

    const contas    = new Set(matched.map(f => f.conta).filter(Boolean));
    const domsAn    = new Set(matched.map(f => f.domAnuncio).filter(Boolean));
    const domsFinal = new Set();
    matched.forEach(f => finalDomains(f).forEach(d => domsFinal.add(d)));

    const byDomAn = {};
    matched.forEach(f => {
      const k = f.domAnuncio || '(sem dom. anúncio)';
      if (!byDomAn[k]) byDomAn[k] = { contas: new Set(), funnels: [] };
      byDomAn[k].funnels.push(f);
      if (f.conta) byDomAn[k].contas.add(f.conta);
    });

    const byDomFin = {};
    matched.forEach(f => {
      finalDomains(f).forEach(d => {
        if (!byDomFin[d]) byDomFin[d] = { contas: new Set(), funnels: [] };
        byDomFin[d].funnels.push(f);
        if (f.conta) byDomFin[d].contas.add(f.conta);
      });
    });

    const domAnItems = Object.entries(byDomAn)
      .sort((a, b) => b[1].funnels.length - a[1].funnels.length)
      .map(([dom, d]) => ({ title: dom, pills: [...d.contas], funnels: d.funnels }));

    const domFinItems = Object.entries(byDomFin)
      .sort((a, b) => b[1].funnels.length - a[1].funnels.length)
      .map(([dom, d]) => ({ title: dom, pills: [...d.contas], funnels: d.funnels }));

    el.innerHTML =
      metricsHtml([
        { val: contas.size,    lbl: 'Contas'        },
        { val: domsAn.size,    lbl: 'Dom. anúncio'  },
        { val: domsFinal.size, lbl: 'Dom. finais'   },
        { val: matched.length, lbl: 'Funis'         },
      ]) + twoColHtml(
        'Domínios de anúncio', domAnItems,
        'Domínios finais',     domFinItems
      );
  }

  // ── Re-executa todas as buscas ativas ─────────────────────────────────
  function refresh() {
    searchDomAnuncio();
    searchDomFinal();
    searchProduto();
  }

  // ── Inicialização ─────────────────────────────────────────────────────
  function init(getFunnels) {
    _getFunnels = getFunnels;

    document.getElementById('search-dom-anuncio')
      .addEventListener('input', searchDomAnuncio);
    document.getElementById('search-dom-final')
      .addEventListener('input', searchDomFinal);
    document.getElementById('search-produto')
      .addEventListener('input', searchProduto);

    // Delegação para expand/collapse dos cards
    ['result-dom-anuncio', 'result-dom-final', 'result-produto'].forEach(id => {
      document.getElementById(id).addEventListener('click', onAnaliseClick);
    });
  }

  return { init, refresh, searchDomAnuncio, searchDomFinal, searchProduto };
})();
