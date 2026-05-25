/* ============================================================
   analise.js — aba de análise e cruzamento de dados
   ============================================================ */

const Analise = (() => {

  let _getFunnels   = () => [];
  let _intelPeriodo = 'tudo';

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

  // ── Painel de inteligência do período ────────────────────────────────

  function filtrarPorPeriodo(funis, tipo) {
    if (!tipo || tipo === 'tudo') return funis;
    const hoje = new Date();
    hoje.setHours(23, 59, 59, 999);
    let de;
    if (tipo === 'mes') {
      de = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    } else {
      const dias = { '7d': 7, '15d': 15, '30d': 30 }[tipo] || 7;
      de = new Date(hoje);
      de.setDate(de.getDate() - dias + 1);
      de.setHours(0, 0, 0, 0);
    }
    return funis.filter(f => {
      if (!f.data) return false;
      const d = new Date(f.data + (f.data.includes('T') ? '' : 'T00:00:00'));
      return d >= de && d <= hoje;
    });
  }

  function intelPeriodoBtnsHTML() {
    const opts = [
      { v: '7d',   l: '7 dias'   },
      { v: '15d',  l: '15 dias'  },
      { v: '30d',  l: '30 dias'  },
      { v: 'mes',  l: 'Este mês' },
      { v: 'tudo', l: 'Tudo'     },
    ];
    return `<div class="escalada-filtros__rapidos" style="margin-bottom:20px">
      ${opts.map(o =>
        `<button class="filtro-rapido${_intelPeriodo === o.v ? ' ativo' : ''}"
                 data-intel-periodo="${esc(o.v)}" type="button">${esc(o.l)}</button>`
      ).join('')}
    </div>`;
  }

  function intelNichosHTML(funis) {
    const counts = {};
    funis.forEach(f => { if (f.nicho) counts[f.nicho] = (counts[f.nicho] || 0) + 1; });
    const items = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    if (!items.length) return '<p class="analysis-no-results">Nenhum funil no período.</p>';
    const max = items[0][1];
    return items.map(([nicho, count]) => {
      const pct = Math.round((count / max) * 100);
      return `<div style="margin-bottom:9px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px">
          <span class="tag tag-nicho nicho-${esc(nicho)}" style="font-size:10px;padding:1px 7px;min-width:34px;text-align:center">${esc(nicho)}</span>
          <span style="font-size:12px;color:var(--text);font-weight:600">${count}</span>
        </div>
        <div style="background:var(--border);border-radius:4px;height:5px;overflow:hidden">
          <div style="width:${pct}%;height:100%;background:var(--accent);border-radius:4px"></div>
        </div>
      </div>`;
    }).join('');
  }

  function intelDomFinalHTML(funis) {
    const domMap = {};
    funis.forEach(f => {
      if (!f.domFinal) return;
      const doms = (f.split === true || f.split === 'true')
        ? f.domFinal.split(' / ').map(d => d.trim()).filter(Boolean)
        : [f.domFinal.trim()];
      doms.forEach(d => {
        if (!domMap[d]) domMap[d] = { count: 0, produtos: new Set() };
        domMap[d].count++;
        if (!Storage.isProdutoDesconhecido(f.produto)) domMap[d].produtos.add(f.produto);
      });
    });
    const items = Object.entries(domMap).sort((a, b) => b[1].count - a[1].count).slice(0, 10);
    if (!items.length) return '<p class="analysis-no-results">Nenhum domínio final no período.</p>';
    return items.map(([dom, d], i) => {
      const prodTags = [...d.produtos].map(p =>
        `<span class="tag" style="font-size:10px;padding:1px 5px">${esc(p)}</span>`
      ).join('');
      return `<div class="rank-item">
        <span class="rank-pos ${i < 3 ? 'top' : ''}">#${i + 1}</span>
        <div style="flex:1;min-width:0;overflow:hidden">
          <div style="font-weight:600;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(dom)}">${esc(dom)}</div>
          ${prodTags ? `<div style="margin-top:3px;display:flex;flex-wrap:wrap;gap:3px">${prodTags}</div>` : ''}
        </div>
        <span style="font-size:13px;font-weight:700;color:var(--accent);flex-shrink:0;margin-left:6px">${d.count}</span>
      </div>`;
    }).join('');
  }

  function intelTopViewsHTML(funis) {
    const items = [...funis].filter(f => f.views > 0).sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 10);
    if (!items.length) return '<p class="analysis-no-results">Nenhum funil com views no período.</p>';
    return items.map((f, i) => {
      const url      = f.urlAnuncioFull || f.urlAnuncio || '';
      const prodLabel = Storage.isProdutoDesconhecido(f.produto) ? '—' : esc(f.produto || '—');
      const nichoTag  = f.nicho
        ? `<span class="tag tag-nicho nicho-${esc(f.nicho)}" style="font-size:10px;padding:1px 5px">${esc(f.nicho)}</span>`
        : '';
      const row = `<div class="rank-item"${url ? ' style="cursor:pointer"' : ''}>
        <span class="rank-pos ${i < 3 ? 'top' : ''}">#${i + 1}</span>
        <div style="flex:1;min-width:0;overflow:hidden">
          <div style="font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(f.conta || '—')}">${esc(f.conta || '—')}</div>
          <div style="display:flex;flex-wrap:wrap;align-items:center;gap:3px;margin-top:2px">
            ${nichoTag}
            <span style="font-size:10px;color:var(--text-muted)">${prodLabel}</span>
          </div>
        </div>
        <div style="font-size:13px;font-weight:700;color:#a78bfa;flex-shrink:0;margin-left:6px">${Parser.formatViews(f.views)}</div>
      </div>`;
      return url
        ? `<a href="${esc(url)}" target="_blank" rel="noopener" style="text-decoration:none;color:inherit;display:block">${row}</a>`
        : row;
    }).join('');
  }

  function intelProdutosNovosHTML(allFunis) {
    const hoje = new Date();
    hoje.setHours(23, 59, 59, 999);
    const limite = new Date(hoje);
    limite.setDate(limite.getDate() - 6);
    limite.setHours(0, 0, 0, 0);

    const recentes   = new Set();
    const anteriores = new Set();
    allFunis.forEach(f => {
      if (Storage.isProdutoDesconhecido(f.produto) || !f.data) return;
      const d = new Date(f.data + (f.data.includes('T') ? '' : 'T00:00:00'));
      if (d >= limite) recentes.add(f.produto);
      else             anteriores.add(f.produto);
    });
    const novos = [...recentes].filter(p => !anteriores.has(p)).sort();
    if (!novos.length) return '<p class="analysis-no-results">Nenhum produto novo identificado no período.</p>';
    return novos.map(p =>
      `<div class="rank-item">
        <span style="font-size:11px;color:#00c47a;flex-shrink:0">★</span>
        <span style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(p)}">${esc(p)}</span>
      </div>`
    ).join('');
  }

  function intelContasAtivasHTML(funis) {
    const map = {};
    funis.forEach(f => {
      if (!f.conta) return;
      if (!map[f.conta]) map[f.conta] = { count: 0, nichos: new Set(), produtos: new Set() };
      map[f.conta].count++;
      if (f.nicho) map[f.conta].nichos.add(f.nicho);
      if (!Storage.isProdutoDesconhecido(f.produto)) map[f.conta].produtos.add(f.produto);
    });
    const items = Object.entries(map).sort((a, b) => b[1].count - a[1].count).slice(0, 10);
    if (!items.length) return '<p class="analysis-no-results">Nenhuma conta no período.</p>';
    return items.map(([conta, d], i) => {
      const nichoTags = [...d.nichos].map(n =>
        `<span class="tag tag-nicho nicho-${esc(n)}" style="font-size:10px;padding:1px 5px">${esc(n)}</span>`
      ).join('');
      const prodTags = [...d.produtos].map(p =>
        `<span class="tag" style="font-size:10px;padding:1px 5px">${esc(p)}</span>`
      ).join('');
      return `<div class="rank-item" style="align-items:flex-start">
        <span class="rank-pos ${i < 3 ? 'top' : ''}" style="padding-top:1px">#${i + 1}</span>
        <div style="flex:1;min-width:0;overflow:hidden">
          <div style="font-weight:600;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(conta)}">${esc(conta)}</div>
          ${nichoTags || prodTags ? `<div style="margin-top:4px;display:flex;flex-wrap:wrap;gap:3px">${nichoTags}${prodTags}</div>` : ''}
        </div>
        <span style="font-size:12px;font-weight:700;color:var(--accent);flex-shrink:0;white-space:nowrap;margin-left:8px;padding-top:1px">${d.count} funil(s)</span>
      </div>`;
    }).join('');
  }

  function renderIntel() {
    const el = document.getElementById('analise-intel');
    if (!el) return;
    const allFunis = _getFunnels();
    const funis    = filtrarPorPeriodo(allFunis, _intelPeriodo);
    el.innerHTML = `
      <div class="escalada-section">
        <h3 class="escalada-section__title">🧠 Inteligência do período</h3>
        ${intelPeriodoBtnsHTML()}
        <div class="escalada-grid">
          <div class="escalada-card">
            <div class="escalada-card__title">Nichos em volume</div>
            ${intelNichosHTML(funis)}
          </div>
          <div class="escalada-card">
            <div class="escalada-card__title">Domínios finais mais repetidos</div>
            ${intelDomFinalHTML(funis)}
          </div>
          <div class="escalada-card">
            <div class="escalada-card__title">Ads com mais views</div>
            ${intelTopViewsHTML(funis)}
          </div>
          <div class="escalada-card">
            <div class="escalada-card__title">Produtos novos na semana</div>
            ${intelProdutosNovosHTML(allFunis)}
          </div>
          <div class="escalada-card" style="grid-column:span 2">
            <div class="escalada-card__title">Contas mais ativas</div>
            ${intelContasAtivasHTML(funis)}
          </div>
        </div>
      </div>`;
  }

  // ── Re-executa todas as buscas ativas ─────────────────────────────────
  function refresh() {
    renderIntel();
    searchDomAnuncio();
    searchDomFinal();
    searchProduto();
  }

  // ── Inicialização ─────────────────────────────────────────────────────
  function init(getFunnels) {
    _getFunnels = getFunnels;

    document.getElementById('tab-analise').addEventListener('click', e => {
      const btn = e.target.closest('[data-intel-periodo]');
      if (!btn) return;
      _intelPeriodo = btn.dataset.intelPeriodo;
      renderIntel();
    });

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
