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

  function renderCardsTotais(funis) {
    const totais = calcularTotaisPorMoeda(funis);
    if (!Object.keys(totais).length) return '';
    return Object.entries(totais).map(([moeda, t]) => {
      const s   = t.simbolo;
      const fmt = v => v > 0
        ? `${s} ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
        : '—';
      return `
        <div class="analysis-metric" style="border-top:2px solid #ff4d4d">
          <div class="analysis-metric__val" style="color:#ff4d4d">${fmt(t.gasto)}</div>
          <div class="analysis-metric__lbl">gasto total ${esc(moeda)}</div>
        </div>
        <div class="analysis-metric" style="border-top:2px solid #00c47a">
          <div class="analysis-metric__val" style="color:#00c47a">${fmt(t.conversao)}</div>
          <div class="analysis-metric__lbl">conversão total ${esc(moeda)}</div>
        </div>`;
    }).join('');
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

  // ── Linha de funil no corpo expandido ────────────────────────────────

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

    return `<div class="af-funil-row" data-funnel-id="${esc(f.id)}">
      <span class="af-funil-meta">${meta}</span>
      ${perf}${url}
    </div>`;
  }

  // ── Modal de detalhe ──────────────────────────────────────────────────

  function abrirModalFunil(id) {
    const f = _getFunnels().find(x => x.id === id);
    if (!f) return;

    const s   = SIMBOLOS[f.moeda || 'BRL'] || 'R$';
    const fmt = v => v != null
      ? `${s} ${parseFloat(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
      : '—';

    const urlA  = f.urlAnuncioFull || f.urlAnuncio || '';
    const urlDA = f.domAnuncioFull || '';
    const urlF  = (f.domFinalFull || '').split('\n')[0] || '';

    document.getElementById('mfd-titulo').textContent = f.conta || '—';
    document.getElementById('mfd-conteudo').innerHTML = `
      <div class="mfd-grid">
        <div class="mfd-campo">
          <span class="mfd-label">Data</span>
          <span class="mfd-valor">${esc(f.data || '—')}</span>
        </div>
        <div class="mfd-campo">
          <span class="mfd-label">Nicho</span>
          <span class="mfd-valor">${esc(f.nicho || '—')}</span>
        </div>
        <div class="mfd-campo">
          <span class="mfd-label">Produto</span>
          <span class="mfd-valor">${esc(f.produto || '—')}</span>
        </div>
        <div class="mfd-campo">
          <span class="mfd-label">Views</span>
          <span class="mfd-valor">${f.views ? esc(Parser.formatViews(f.views)) : '—'}</span>
        </div>
        <div class="mfd-campo">
          <span class="mfd-label">Famoso</span>
          <span class="mfd-valor">${f.famoso === 'sim' ? 'Sim' : f.famoso === 'nao' ? 'Não' : '—'}</span>
        </div>
        <div class="mfd-campo">
          <span class="mfd-label">Split</span>
          <span class="mfd-valor">${(f.split === true || f.split === 'true') ? 'Sim' : 'Não'}</span>
        </div>
        <div class="mfd-campo mfd-campo--full">
          <span class="mfd-label">URL do anúncio</span>
          ${urlA ? `<a class="mfd-link" href="${esc(urlA)}" target="_blank" rel="noopener">${esc(urlA)}</a>` : '<span class="mfd-valor">—</span>'}
        </div>
        <div class="mfd-campo">
          <span class="mfd-label">Dom. anúncio</span>
          <span class="mfd-valor">${esc(f.domAnuncio || '—')}</span>
        </div>
        <div class="mfd-campo mfd-campo--full">
          <span class="mfd-label">URL nativa (dom. anúncio)</span>
          ${urlDA ? `<a class="mfd-link" href="${esc(urlDA)}" target="_blank" rel="noopener">${esc(urlDA)}</a>` : '<span class="mfd-valor">—</span>'}
        </div>
        <div class="mfd-campo">
          <span class="mfd-label">Dom. final</span>
          <span class="mfd-valor">${esc(f.domFinal || '—')}</span>
        </div>
        <div class="mfd-campo mfd-campo--full">
          <span class="mfd-label">URL final</span>
          ${urlF ? `<a class="mfd-link" href="${esc(urlF)}" target="_blank" rel="noopener">${esc(urlF)}</a>` : '<span class="mfd-valor">—</span>'}
        </div>
        <div class="mfd-campo">
          <span class="mfd-label">Gasto</span>
          <span class="mfd-valor mfd-gasto">${esc(fmt(f.gasto))}</span>
        </div>
        <div class="mfd-campo">
          <span class="mfd-label">Conversão</span>
          <span class="mfd-valor mfd-conv">${esc(fmt(f.conversao))}</span>
        </div>
        ${f.obs ? `<div class="mfd-campo mfd-campo--full">
          <span class="mfd-label">Obs.</span>
          <span class="mfd-valor">${esc(f.obs)}</span>
        </div>` : ''}
      </div>`;

    document.getElementById('modal-funil-detalhe').hidden = false;
  }

  function fecharModalFunil() {
    document.getElementById('modal-funil-detalhe').hidden = true;
  }

  // ── Componentes HTML ──────────────────────────────────────────────────

  function metricsHtml(metrics, extraHtml = '') {
    return `<div class="analysis-metrics">
      ${metrics.map(m => `
        <div class="analysis-metric">
          <div class="analysis-metric__val">${m.val}</div>
          <div class="analysis-metric__lbl">${esc(m.lbl)}</div>
        </div>`).join('')}
      ${extraHtml}
    </div>`;
  }

  // pills: Array de string | { label, funnelId }
  // items: [{ title, titleFunnelId?, pills, funnels }]
  function listHtml(items) {
    if (!items.length) return '<p class="analysis-no-results">Nenhum resultado.</p>';
    return `<div class="analysis-list">
      ${items.map(item => {
        const perfHtml = renderTotaisPerf(item.funnels || []);
        const hasBody  = (item.funnels || []).length > 0;
        const bodyHtml = hasBody ? item.funnels.map(funilRowHtml).join('') : '';

        const titleEl = item.titleFunnelId
          ? `<span class="analysis-item__title conta-clicavel" data-funnel-id="${esc(item.titleFunnelId)}">${esc(item.title)}</span>`
          : `<span class="analysis-item__title">${esc(item.title)}</span>`;

        const pillsHtml = item.pills.map(p => {
          if (typeof p === 'string') {
            return `<span class="analysis-item__pill">${esc(p)}</span>`;
          }
          return p.funnelId
            ? `<span class="analysis-item__pill conta-clicavel" data-funnel-id="${esc(p.funnelId)}">${esc(p.label)}</span>`
            : `<span class="analysis-item__pill">${esc(p.label)}</span>`;
        }).join('');

        return `
        <div class="analysis-item${hasBody ? ' analysis-item--expandable' : ''}">
          <div class="analysis-item__header">
            <div class="analysis-item__title-row">
              ${titleEl}
              ${hasBody ? '<span class="analysis-item__toggle">▸</span>' : ''}
            </div>
            <div class="analysis-item__meta">
              ${pillsHtml}
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

  // ── Delegação de eventos ──────────────────────────────────────────────

  function onAnaliseClick(e) {
    // Abrir modal de detalhe do funil
    const funiRow = e.target.closest('.af-funil-row[data-funnel-id]');
    if (funiRow && !e.target.closest('a')) {
      abrirModalFunil(funiRow.dataset.funnelId);
      return;
    }

    const contaBtn = e.target.closest('.conta-clicavel[data-funnel-id]');
    if (contaBtn) {
      abrirModalFunil(contaBtn.dataset.funnelId);
      return;
    }

    // Expand/collapse do card
    const header = e.target.closest('.analysis-item--expandable .analysis-item__header');
    if (header) {
      const item     = header.closest('.analysis-item');
      const expanded = item.classList.toggle('analysis-item--expanded');
      header.querySelector('.analysis-item__toggle').textContent = expanded ? '▾' : '▸';
    }
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
    const produtos = new Set(matched.map(f => f.produto).filter(p => !Storage.isProdutoDesconhecido(p)));
    const destinos = new Set();
    matched.forEach(f => finalDomains(f).forEach(d => destinos.add(d)));

    const byContas = {};
    matched.forEach(f => {
      const k = f.conta || '(sem conta)';
      if (!byContas[k]) byContas[k] = { produtos: new Set(), funnels: [] };
      byContas[k].funnels.push(f);
      if (!Storage.isProdutoDesconhecido(f.produto)) byContas[k].produtos.add(f.produto);
    });

    const items = Object.entries(byContas)
      .sort((a, b) => b[1].funnels.length - a[1].funnels.length)
      .map(([conta, d]) => ({
        title:        conta,
        titleFunnelId: d.funnels[0]?.id,
        pills:        [`${d.funnels.length} funil(s)`, ...[...d.produtos]],
        funnels:      d.funnels,
      }));

    el.innerHTML =
      metricsHtml([
        { val: contas.size,    lbl: 'Contas'          },
        { val: matched.length, lbl: 'Funis'           },
        { val: produtos.size,  lbl: 'Produtos'        },
        { val: destinos.size,  lbl: 'Destinos finais' },
      ], renderCardsTotais(matched)) + listHtml(items);
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
    const produtos = new Set(matched.map(f => f.produto).filter(p => !Storage.isProdutoDesconhecido(p)));
    const domsAn   = new Set(matched.map(f => f.domAnuncio).filter(Boolean));

    const byContas = {};
    matched.forEach(f => {
      const k = f.conta || '(sem conta)';
      if (!byContas[k]) byContas[k] = { domsAn: new Set(), produtos: new Set(), funnels: [] };
      byContas[k].funnels.push(f);
      if (f.domAnuncio) byContas[k].domsAn.add(f.domAnuncio);
      if (!Storage.isProdutoDesconhecido(f.produto)) byContas[k].produtos.add(f.produto);
    });

    const items = Object.entries(byContas)
      .sort((a, b) => b[1].funnels.length - a[1].funnels.length)
      .map(([conta, d]) => ({
        title:         conta,
        titleFunnelId: d.funnels[0]?.id,
        pills:         [`${d.funnels.length} funil(s)`, ...[...d.domsAn], ...[...d.produtos]],
        funnels:       d.funnels,
      }));

    el.innerHTML =
      metricsHtml([
        { val: contas.size,    lbl: 'Contas'        },
        { val: matched.length, lbl: 'Funis'         },
        { val: domsAn.size,    lbl: 'Dom. anúncio'  },
        { val: produtos.size,  lbl: 'Produtos'      },
      ], renderCardsTotais(matched)) + listHtml(items);
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
      if (!byDomAn[k]) byDomAn[k] = { contas: new Map(), funnels: [] };
      byDomAn[k].funnels.push(f);
      if (f.conta && !byDomAn[k].contas.has(f.conta)) byDomAn[k].contas.set(f.conta, f.id);
    });

    const byDomFin = {};
    matched.forEach(f => {
      finalDomains(f).forEach(d => {
        if (!byDomFin[d]) byDomFin[d] = { contas: new Map(), funnels: [] };
        byDomFin[d].funnels.push(f);
        if (f.conta && !byDomFin[d].contas.has(f.conta)) byDomFin[d].contas.set(f.conta, f.id);
      });
    });

    const domAnItems = Object.entries(byDomAn)
      .sort((a, b) => b[1].funnels.length - a[1].funnels.length)
      .map(([dom, d]) => ({
        title:   dom,
        pills:   [...d.contas.entries()].map(([label, funnelId]) => ({ label, funnelId })),
        funnels: d.funnels,
      }));

    const domFinItems = Object.entries(byDomFin)
      .sort((a, b) => b[1].funnels.length - a[1].funnels.length)
      .map(([dom, d]) => ({
        title:   dom,
        pills:   [...d.contas.entries()].map(([label, funnelId]) => ({ label, funnelId })),
        funnels: d.funnels,
      }));

    el.innerHTML =
      metricsHtml([
        { val: contas.size,    lbl: 'Contas'        },
        { val: domsAn.size,    lbl: 'Dom. anúncio'  },
        { val: domsFinal.size, lbl: 'Dom. finais'   },
        { val: matched.length, lbl: 'Funis'         },
      ], renderCardsTotais(matched)) + twoColHtml(
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

    ['result-dom-anuncio', 'result-dom-final', 'result-produto'].forEach(id => {
      document.getElementById(id).addEventListener('click', onAnaliseClick);
    });

    document.getElementById('btn-fechar-mfd').addEventListener('click', fecharModalFunil);
    document.getElementById('modal-funil-detalhe').addEventListener('click', e => {
      if (e.target === document.getElementById('modal-funil-detalhe')) fecharModalFunil();
    });
  }

  return { init, refresh, searchDomAnuncio, searchDomFinal, searchProduto };
})();
