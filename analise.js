/* ============================================================
   analise.js — aba de análise e cruzamento de dados
   ============================================================ */

const Analise = (() => {

  let _getFunnels   = () => [];
  let _domFinalSort = 'funis';

  let _pgDomAnuncio = 1;
  let _pgDomFinal   = 1;
  let _pgProduto    = 1;
  const _ANALISE_PER = 10;

  const esc      = Storage.escHtml;
  const fmtViews = v => Parser.formatViews(v);

  // ── Ads na biblioteca (Supabase + localStorage fallback) ─────────────

  let _dominiosBibliotecaCache = null;

  async function _ensureDominiosCache() {
    if (!_dominiosBibliotecaCache) {
      _dominiosBibliotecaCache = await SupabaseStorage.loadDominiosBiblioteca();
    }
    return _dominiosBibliotecaCache;
  }

  function getAdsLibraryCounts() {
    if (_dominiosBibliotecaCache) {
      const map = {};
      Object.entries(_dominiosBibliotecaCache).forEach(([dom, v]) => {
        if (v.adsAtivos > 0) map[dom] = v.adsAtivos;
      });
      return map;
    }
    try { return JSON.parse(localStorage.getItem('funil-tracker-ads-library-counts') || '{}'); }
    catch { return {}; }
  }

  function saveAdsLibraryCount(domain, val) {
    const n = parseInt(val, 10);
    const safeVal = !isNaN(n) && n > 0 ? n : 0;

    // Atualizar cache local imediatamente
    if (!_dominiosBibliotecaCache) _dominiosBibliotecaCache = {};
    if (!_dominiosBibliotecaCache[domain]) _dominiosBibliotecaCache[domain] = { adsAtivos: 0, historico: [] };
    const cacheEntry   = _dominiosBibliotecaCache[domain];
    const valorAnterior = cacheEntry.adsAtivos;
    cacheEntry.adsAtivos = safeVal;
    if (valorAnterior !== safeVal) {
      cacheEntry.historico = [...(cacheEntry.historico || []), {
        data: new Date().toISOString().slice(0, 10),
        hora: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        anterior: valorAnterior,
        novo: safeVal,
      }];
    }

    // Persistir no Supabase (async, sem bloquear UI)
    SupabaseStorage.salvarAdsAtivos(domain, safeVal).catch(console.error);

    // Re-renderizar a lista para refletir a tag de tendência imediatamente
    refreshDomAnuncioList(GlobalFilters.filter(_getFunnels()));
  }

  // ── Helpers de domínio ────────────────────────────────────────────────

  function finalDomains(f) {
    if (!f.domFinal) return [];
    return (f.split === true || f.split === 'true')
      ? f.domFinal.split('\n').map(d => d.trim()).filter(Boolean)
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
      <button class="btn btn-sm btn-secondary" onclick="abrirDetalhe('${esc(f.id)}')" title="Ver detalhes">👁</button>
    </div>`;
  }

  // ── Modal de detalhe (v1) ─────────────────────────────────────────────

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
    const funiRow = e.target.closest('.af-funil-row[data-funnel-id]');
    if (funiRow && !e.target.closest('a') && !e.target.closest('button')) {
      abrirModalFunil(funiRow.dataset.funnelId);
      return;
    }

    const contaBtn = e.target.closest('.conta-clicavel[data-funnel-id]');
    if (contaBtn) {
      abrirModalFunil(contaBtn.dataset.funnelId);
      return;
    }

    const header = e.target.closest('.analysis-item--expandable .analysis-item__header');
    if (header) {
      const item     = header.closest('.analysis-item');
      const expanded = item.classList.toggle('analysis-item--expanded');
      header.querySelector('.analysis-item__toggle').textContent = expanded ? '▾' : '▸';
    }
  }

  // ── Busca por domínio de anúncio ──────────────────────────────────────

  function searchDomAnuncio() {
    const q  = document.getElementById('search-dom-anuncio').value.trim().toUpperCase();
    const el = document.getElementById('result-dom-anuncio');
    if (!q) { el.innerHTML = ''; return; }

    const matched = GlobalFilters.filter(_getFunnels()).filter(
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

    const allItems = Object.entries(byContas)
      .sort((a, b) => b[1].funnels.length - a[1].funnels.length)
      .map(([conta, d]) => ({
        title:         conta,
        titleFunnelId: d.funnels[0]?.id,
        pills:         [`${d.funnels.length} funil(s)`, ...[...d.produtos]],
        funnels:       d.funnels,
      }));

    const { items: pageItems, page: pg, totalPages, total } = Pagination.paginate(allItems, _pgDomAnuncio, _ANALISE_PER);
    _pgDomAnuncio = pg;

    el.innerHTML =
      metricsHtml([
        { val: contas.size,    lbl: 'Contas'          },
        { val: matched.length, lbl: 'Funis'           },
        { val: produtos.size,  lbl: 'Produtos'        },
        { val: destinos.size,  lbl: 'Destinos finais' },
      ], renderCardsTotais(matched)) +
      listHtml(pageItems) +
      Pagination.controlsHTML(pg, totalPages, total, _ANALISE_PER, 'dom-anuncio');
  }

  // ── Busca por domínio final ───────────────────────────────────────────

  function searchDomFinal() {
    const q  = document.getElementById('search-dom-final').value.trim().toUpperCase();
    const el = document.getElementById('result-dom-final');
    if (!q) { el.innerHTML = ''; return; }

    const matched = GlobalFilters.filter(_getFunnels()).filter(
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

    const allItems = Object.entries(byContas)
      .sort((a, b) => b[1].funnels.length - a[1].funnels.length)
      .map(([conta, d]) => ({
        title:         conta,
        titleFunnelId: d.funnels[0]?.id,
        pills:         [`${d.funnels.length} funil(s)`, ...[...d.domsAn], ...[...d.produtos]],
        funnels:       d.funnels,
      }));

    const { items: pageItems, page: pg, totalPages, total } = Pagination.paginate(allItems, _pgDomFinal, _ANALISE_PER);
    _pgDomFinal = pg;

    el.innerHTML =
      metricsHtml([
        { val: contas.size,    lbl: 'Contas'        },
        { val: matched.length, lbl: 'Funis'         },
        { val: domsAn.size,    lbl: 'Dom. anúncio'  },
        { val: produtos.size,  lbl: 'Produtos'      },
      ], renderCardsTotais(matched)) +
      listHtml(pageItems) +
      Pagination.controlsHTML(pg, totalPages, total, _ANALISE_PER, 'dom-final');
  }

  // ── Busca por produto ─────────────────────────────────────────────────

  function searchProduto() {
    const q  = document.getElementById('search-produto').value.trim().toUpperCase();
    const el = document.getElementById('result-produto');
    if (!q) { el.innerHTML = ''; return; }

    const matched = GlobalFilters.filter(_getFunnels()).filter(
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

  // ── BLOCO 1: Nichos em volume ─────────────────────────────────────────

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

  // ── BLOCO 2: Domínios do anúncio (sortable + ads na biblioteca) ──────

  // Tendência de ads ativos com base no último registro do histórico do domínio
  function trendTagHTML(dom, libCount) {
    if (libCount === '') return '';

    const hist = _dominiosBibliotecaCache?.[dom]?.historico || [];
    if (!hist.length) {
      return `<span title="Primeiro registro de ads ativos para este domínio" style="font-size:9px;font-weight:700;padding:1px 6px;border-radius:10px;background:#00143a;color:#60a5fa;white-space:nowrap">🆕 Novo</span>`;
    }

    const anterior = hist[hist.length - 1].anterior;
    const atual    = Number(libCount);
    if (atual > anterior) {
      return `<span title="Subiu em relação ao registro anterior (${anterior})" style="font-size:9px;font-weight:700;padding:1px 6px;border-radius:10px;background:#002a1a;color:#00c47a;white-space:nowrap">📈 Subindo</span>`;
    }
    if (atual < anterior) {
      return `<span title="Caiu em relação ao registro anterior (${anterior})" style="font-size:9px;font-weight:700;padding:1px 6px;border-radius:10px;background:#2a0a0a;color:#ff4d4d;white-space:nowrap">📉 Caindo</span>`;
    }
    return `<span title="Igual ao registro anterior" style="font-size:9px;font-weight:700;padding:1px 6px;border-radius:10px;background:#1e1e1e;color:#9ca3af;white-space:nowrap">➡️ Estável</span>`;
  }

  function intelDomFinalSortableHTML(funis) {
    const domMap = {};
    funis.forEach(f => {
      if (!f.domAnuncio) return;
      const d = f.domAnuncio.trim();
      if (!domMap[d]) domMap[d] = { count: 0, produtos: new Set(), url: null };
      domMap[d].count++;
      if (f.produto && !Storage.isProdutoDesconhecido(f.produto)) domMap[d].produtos.add(f.produto);
      if (!domMap[d].url && f.domAnuncioFull) domMap[d].url = f.domAnuncioFull;
    });

    const counts = getAdsLibraryCounts();
    let items = Object.entries(domMap);

    if (_domFinalSort === 'biblioteca') {
      items.sort((a, b) => {
        const ca = counts[a[0]] != null ? counts[a[0]] : -1;
        const cb = counts[b[0]] != null ? counts[b[0]] : -1;
        if (ca === -1 && cb === -1) return b[1].count - a[1].count;
        if (ca === -1) return 1;
        if (cb === -1) return -1;
        return cb - ca;
      });
    } else {
      items.sort((a, b) => b[1].count - a[1].count);
    }

    if (!items.length) return '<p class="analysis-no-results">Nenhum domínio final no período.</p>';

    return items.map(([dom, d], i) => {
      const prodTags = [...d.produtos].map(p =>
        `<span class="tag" style="font-size:10px;padding:1px 5px">${esc(p)}</span>`
      ).join('');
      const libCount = counts[dom] != null ? counts[dom] : '';
      const domLower = dom.toLowerCase().replace(/^www\./i, '');
      const fbLibUrl = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&q=${encodeURIComponent(domLower)}&search_type=keyword_unordered`;
      const domUrl   = d.url || ('https://' + domLower);

      return `<div class="rank-item" style="align-items:flex-start;gap:6px">
        <span class="rank-pos ${i < 3 ? 'top' : ''}">#${i + 1}</span>
        <div style="flex:1;min-width:0;overflow:hidden">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:2px">
            <span class="dom-anuncio-link" onclick="abrirFunisDodominio('${esc(dom)}')" style="font-weight:600;font-size:12px;color:var(--accent);cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:130px;display:inline-block" title="${esc(dom)}">${esc(dom)}</span>
            <span style="font-size:10px;color:var(--text-muted);flex-shrink:0">${d.count} funis</span>
          </div>
          ${prodTags ? `<div style="display:flex;flex-wrap:wrap;gap:3px;margin-bottom:4px">${prodTags}</div>` : ''}
          <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap">
            <span style="font-size:10px;color:var(--text-muted);white-space:nowrap">Ads ativos:</span>
            <input type="number" min="0" class="dom-lib-input" data-dom="${esc(dom)}" value="${esc(String(libCount))}" placeholder="—" style="width:56px;padding:2px 5px;font-size:11px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text)">
            ${trendTagHTML(dom, libCount)}
            <a href="${esc(fbLibUrl)}" target="_blank" rel="noopener" title="Buscar na Biblioteca de Anúncios" style="text-decoration:none;line-height:1;font-size:14px">🔍</a>
            <span style="cursor:pointer;font-size:14px;line-height:1" onclick="abrirHistoricoDominio('${esc(dom)}')" title="Ver histórico de Ads ativos">📋</span>
          </div>
        </div>
      </div>`;
    }).join('');
  }

  // ── BLOCO 3: Top 3 produtos por nicho ─────────────────────────────────

  function top3ProdutosPorNichoHTML(funis) {
    const nichoMap = {};
    funis.forEach(f => {
      if (!f.nicho) return;
      if (!nichoMap[f.nicho]) nichoMap[f.nicho] = { total: 0, produtos: {} };
      nichoMap[f.nicho].total++;
      if (f.produto && !Storage.isProdutoDesconhecido(f.produto)) {
        nichoMap[f.nicho].produtos[f.produto] = (nichoMap[f.nicho].produtos[f.produto] || 0) + 1;
      }
    });

    const nichos = Object.entries(nichoMap).sort((a, b) => b[1].total - a[1].total);
    if (!nichos.length) return '<p class="analysis-no-results">Nenhum nicho no período.</p>';

    return `<div style="display:flex;flex-direction:column;gap:10px">
      ${nichos.map(([nicho, d]) => {
        const top3 = Object.entries(d.produtos).sort((a, b) => b[1] - a[1]).slice(0, 3);
        return `<div style="background:var(--bg);border-radius:6px;padding:8px 10px">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
            <span class="tag tag-nicho nicho-${esc(nicho)}" style="font-size:10px;padding:2px 8px">${esc(nicho)}</span>
            <span style="font-size:10px;color:var(--text-muted)">${d.total} funis</span>
          </div>
          ${top3.length
            ? top3.map(([prod, cnt]) => `
              <div style="display:flex;align-items:center;justify-content:space-between;gap:4px;padding:3px 0;border-top:1px solid var(--border)">
                <span style="font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1" title="${esc(prod)}">${esc(prod)}</span>
                <span style="font-size:11px;font-weight:700;color:var(--accent);flex-shrink:0;margin-left:6px">${cnt}</span>
              </div>`).join('')
            : `<div style="font-size:10px;color:var(--text-muted);padding-top:4px;border-top:1px solid var(--border)">sem produtos identificados</div>`
          }
        </div>`;
      }).join('')}
    </div>`;
  }

  // ── BLOCO 4: Top 3 ads por views por nicho ────────────────────────────

  function top3ViewsPorNichoHTML(funis) {
    const nichoMap = {};
    funis.filter(f => f.views > 0 && f.nicho).forEach(f => {
      if (!nichoMap[f.nicho]) nichoMap[f.nicho] = { maxViews: 0, funnels: [] };
      if (f.views > nichoMap[f.nicho].maxViews) nichoMap[f.nicho].maxViews = f.views;
      nichoMap[f.nicho].funnels.push(f);
    });

    const nichos = Object.entries(nichoMap).sort((a, b) => b[1].maxViews - a[1].maxViews);
    if (!nichos.length) return '<p class="analysis-no-results">Nenhum funil com views no período.</p>';

    return `<div style="display:flex;flex-direction:column;gap:10px">
      ${nichos.map(([nicho, d]) => {
        const top3 = [...d.funnels].sort((a, b) => b.views - a.views).slice(0, 3);
        return `<div style="background:var(--bg);border-radius:6px;padding:8px 10px">
          <div style="margin-bottom:6px">
            <span class="tag tag-nicho nicho-${esc(nicho)}" style="font-size:10px;padding:2px 8px">${esc(nicho)}</span>
          </div>
          ${top3.map(f => {
            const prod = (!f.produto || Storage.isProdutoDesconhecido(f.produto)) ? '' : f.produto;
            return `<div style="display:flex;align-items:center;gap:4px;padding:3px 0;border-top:1px solid var(--border)">
              <div style="flex:1;min-width:0;overflow:hidden">
                <div style="font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(f.conta || '—')}">${esc(f.conta || '—')}</div>
                ${prod ? `<div style="font-size:10px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(prod)}</div>` : ''}
              </div>
              <div style="display:flex;align-items:center;gap:3px;flex-shrink:0">
                <span style="font-size:11px;font-weight:700;color:#a78bfa">${Parser.formatViews(f.views)}</span>
                <button class="btn btn-sm btn-secondary" onclick="abrirDetalhe('${esc(f.id)}')" title="Ver detalhes" style="padding:1px 4px;font-size:11px;min-width:auto">👁</button>
              </div>
            </div>`;
          }).join('')}
        </div>`;
      }).join('')}
    </div>`;
  }

  // ── BLOCO 5: VSLs em destaque ─────────────────────────────────────────

  function intelVslHTML(funis) {
    const nichoFiltro = document.getElementById('analise-vsl-nicho')?.value || '';
    const funisFiltrados = nichoFiltro ? funis.filter(f => f.nicho === nichoFiltro) : funis;
    const map = {};
    funisFiltrados.forEach(f => {
      if (!f.urlVsl) return;
      const key = f.urlVsl.trim();
      if (!map[key]) map[key] = { urlVsl: key, funis: 0, views: 0, nichos: new Set(), produtos: new Set(), ids: [] };
      map[key].funis++;
      map[key].views += f.views || 0;
      if (f.nicho) map[key].nichos.add(f.nicho);
      if (f.produto && !Storage.isProdutoDesconhecido(f.produto)) map[key].produtos.add(f.produto);
      map[key].ids.push(f.id);
    });

    const items = Object.values(map)
      .map(v => ({ ...v, score: v.funis * 10 + Math.floor(v.views / 1000) + v.nichos.size * 5 }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    if (!items.length) return '<p class="analysis-no-results">Nenhuma VSL cadastrada nos funis do período.</p>';

    return items.map((v, i) => {
      const nichoTags = [...v.nichos].map(n =>
        `<span class="tag tag-nicho nicho-${esc(n)}" style="font-size:10px;padding:1px 6px">${esc(n)}</span>`
      ).join('');
      const prodTags = [...v.produtos].slice(0, 4).map(p =>
        `<span class="tag" style="font-size:10px">${esc(p)}</span>`
      ).join('');
      const verFunisIds = v.ids.join(',');
      return `
        <div class="rank-item" style="align-items:flex-start;gap:14px;padding:14px 0">
          <span class="rank-pos ${i < 3 ? 'top' : ''}">#${i + 1}</span>
          <div style="flex-shrink:0;width:160px;height:90px;background:#000;border-radius:8px;overflow:hidden;position:relative"
               data-vsl-url="${esc(v.urlVsl)}">
            <canvas style="width:100%;height:100%;display:none"></canvas>
            <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#ffffff66;font-size:10px;font-family:monospace">carregando...</div>
          </div>
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px">
              ${nichoTags}
              <span style="font-family:monospace;font-size:10px;color:var(--text-muted)">${v.funis} funil(s)</span>
              <span style="font-family:monospace;font-size:10px;color:#a78bfa">${fmtViews(v.views)} views</span>
            </div>
            ${prodTags ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px">${prodTags}</div>` : ''}
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              <a href="${esc(v.urlVsl)}" target="_blank"
                 style="font-family:monospace;font-size:10px;color:var(--accent);word-break:break-all;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block"
                 title="${esc(v.urlVsl)}">${esc(v.urlVsl)}</a>
              <button class="btn btn-sm btn-secondary" style="flex-shrink:0;font-size:11px"
                onclick="analiseVerFunisVsl('${esc(verFunisIds)}')">Ver funis</button>
            </div>
          </div>
          <div style="text-align:right;flex-shrink:0">
            <div style="font-size:13px;font-weight:700;color:var(--accent)">Score ${v.score}</div>
            <div style="font-size:10px;color:var(--text-muted);margin-top:2px">${v.nichos.size} nicho(s)</div>
          </div>
        </div>`;
    }).join('');
  }

  function capturarFrameVslEmContainer(url, container) {
    if (!window.Hls || !Hls.isSupported()) return;
    const canvas  = container.querySelector('canvas');
    const loading = container.querySelector('div');
    if (!canvas) return;

    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.style.display = 'none';
    document.body.appendChild(video);

    const hls = new Hls({ enableWorker: false });
    hls.loadSource(url);
    hls.attachMedia(video);

    let done = false;

    function capture() {
      if (done) return;
      done = true;
      try {
        canvas.width  = video.videoWidth  || 320;
        canvas.height = video.videoHeight || 180;
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.style.display = 'block';
        if (loading) loading.style.display = 'none';
      } catch {
        if (loading) loading.textContent = 'CORS';
      }
      cleanup();
    }

    hls.on(Hls.Events.MANIFEST_PARSED, () => { video.currentTime = 1; video.play().catch(() => {}); });
    video.addEventListener('seeked', capture);
    video.addEventListener('loadeddata', () => setTimeout(capture, 300));

    const t = setTimeout(() => { if (loading) loading.textContent = '—'; cleanup(); }, 10000);

    function cleanup() { clearTimeout(t); try { hls.destroy(); } catch {} video.remove(); }

    hls.on(Hls.Events.ERROR, (_, d) => { if (d.fatal) { if (loading) loading.textContent = '—'; cleanup(); } });
  }

  function initVslFrames() {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const container = entry.target;
        const url = container.dataset.vslUrl;
        if (!url || container.dataset.vslLoaded) return;
        container.dataset.vslLoaded = '1';
        observer.unobserve(container);
        capturarFrameVslEmContainer(url, container);
      });
    }, { threshold: 0.1 });
    document.querySelectorAll('[data-vsl-url]').forEach(el => observer.observe(el));
  }

  // ── Atualiza apenas a lista do BLOCO 2 ───────────────────────────────

  function refreshDomAnuncioList(allFunis) {
    const listEl = document.getElementById('analise-dom-anuncio-list');
    if (!listEl) return;
    const nichoFiltro = document.getElementById('analise-dom-nicho')?.value || '';
    const funisFiltrados = nichoFiltro ? allFunis.filter(f => f.nicho === nichoFiltro) : allFunis;
    listEl.innerHTML = intelDomFinalSortableHTML(funisFiltrados);
  }

  // ── Atualiza apenas a lista do BLOCO 5 ───────────────────────────────

  function refreshVslList(allFunis) {
    const listEl = document.getElementById('analise-vsl-list');
    if (!listEl) return;
    listEl.innerHTML = intelVslHTML(allFunis);
    initVslFrames();
  }

  // ── Painel de inteligência do período ────────────────────────────────

  function renderIntel() {
    const el = document.getElementById('analise-intel');
    if (!el) return;
    const funis = GlobalFilters.filter(_getFunnels());
    const sortCls = v => `btn btn-sm ${_domFinalSort === v ? 'btn-primary' : 'btn-secondary'}`;

    el.innerHTML = `
      <div class="escalada-section">
        <h3 class="escalada-section__title">🧠 Inteligência do período</h3>
        <div class="escalada-grid">
          <div class="escalada-card">
            <div class="escalada-card__title">Nichos em volume</div>
            ${intelNichosHTML(funis)}
          </div>
          <div class="escalada-card">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:14px;flex-wrap:wrap">
              <span class="escalada-card__title" style="margin-bottom:0">Domínios do anúncio</span>
              <div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap">
                <button class="${sortCls('funis')}" data-sort-dom-final="funis" style="font-size:10px;padding:2px 8px">Por funis</button>
                <button class="${sortCls('biblioteca')}" data-sort-dom-final="biblioteca" style="font-size:10px;padding:2px 8px">Por biblioteca</button>
                <select id="analise-dom-nicho" style="background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:11px;padding:4px 8px;cursor:pointer;margin-left:4px">
                  <option value="">Todos os nichos</option>
                  <option>WL</option><option>DB</option><option>MM</option>
                  <option>ED</option><option>NR</option><option>DA</option>
                  <option>PT</option><option>VL</option><option>TN</option>
                  <option>LG</option><option>RJ</option><option>RE</option><option>BP</option>
                </select>
              </div>
            </div>
            <div id="analise-dom-anuncio-list">${intelDomFinalSortableHTML(funis)}</div>
          </div>
          <div class="escalada-card">
            <div class="escalada-card__title">Top 3 produtos por nicho</div>
            ${top3ProdutosPorNichoHTML(funis)}
          </div>
          <div class="escalada-card">
            <div class="escalada-card__title">Top 3 ads por views por nicho</div>
            ${top3ViewsPorNichoHTML(funis)}
          </div>
          <div class="escalada-card" style="grid-column:span 2">
            <div style="display:flex;align-items:center;margin-bottom:14px">
              <span class="escalada-card__title" style="margin-bottom:0">🎬 VSLs em destaque</span>
              <select id="analise-vsl-nicho" style="background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:11px;padding:4px 8px;cursor:pointer;margin-left:8px">
                <option value="">Todos os nichos</option>
                <option>WL</option><option>DB</option><option>MM</option>
                <option>ED</option><option>NR</option><option>DA</option>
                <option>PT</option><option>VL</option><option>TN</option>
                <option>LG</option><option>RJ</option><option>RE</option><option>BP</option>
              </select>
            </div>
            <div id="analise-vsl-list">${intelVslHTML(funis)}</div>
          </div>
        </div>
      </div>`;
  }

  // ── Re-executa todas as buscas ativas ─────────────────────────────────

  function refresh() {
    renderIntel();
    initVslFrames();
    searchDomAnuncio();
    searchDomFinal();
    searchProduto();
  }

  // ── Inicialização ─────────────────────────────────────────────────────

  function init(getFunnels) {
    _getFunnels = getFunnels;

    // Pré-carregar dados do Supabase para ter ads_ativos disponíveis no primeiro render
    _ensureDominiosCache().then(() => refresh()).catch(console.error);

    document.getElementById('search-dom-anuncio')
      .addEventListener('input', () => { _pgDomAnuncio = 1; searchDomAnuncio(); });
    document.getElementById('search-dom-final')
      .addEventListener('input', () => { _pgDomFinal = 1; searchDomFinal(); });
    document.getElementById('search-produto')
      .addEventListener('input', () => { _pgProduto = 1; searchProduto(); });

    ['result-dom-anuncio', 'result-dom-final', 'result-produto'].forEach(id => {
      document.getElementById(id).addEventListener('click', onAnaliseClick);
    });

    document.getElementById('tab-analise').addEventListener('click', e => {
      const btn = e.target.closest('.pg-btn[data-pg]');
      if (!btn) return;
      const section = btn.dataset.pgSection;
      const action  = btn.dataset.pg;
      if (section === 'dom-anuncio') {
        if      (action === 'first') _pgDomAnuncio = 1;
        else if (action === 'prev')  _pgDomAnuncio = Math.max(1, _pgDomAnuncio - 1);
        else if (action === 'next')  _pgDomAnuncio++;
        else if (action === 'last')  _pgDomAnuncio = 9999;
        searchDomAnuncio();
      } else if (section === 'dom-final') {
        if      (action === 'first') _pgDomFinal = 1;
        else if (action === 'prev')  _pgDomFinal = Math.max(1, _pgDomFinal - 1);
        else if (action === 'next')  _pgDomFinal++;
        else if (action === 'last')  _pgDomFinal = 9999;
        searchDomFinal();
      }
    });

    const intelEl = document.getElementById('analise-intel');
    intelEl.addEventListener('click', e => {
      const sortBtn = e.target.closest('[data-sort-dom-final]');
      if (!sortBtn) return;
      _domFinalSort = sortBtn.dataset.sortDomFinal;
      intelEl.querySelectorAll('[data-sort-dom-final]').forEach(btn => {
        btn.className = `btn btn-sm ${btn.dataset.sortDomFinal === _domFinalSort ? 'btn-primary' : 'btn-secondary'}`;
      });
      refreshDomAnuncioList(GlobalFilters.filter(_getFunnels()));
    });
    intelEl.addEventListener('change', e => {
      if (e.target.id === 'analise-dom-nicho') {
        refreshDomAnuncioList(GlobalFilters.filter(_getFunnels()));
        return;
      }
      if (e.target.id === 'analise-vsl-nicho') {
        refreshVslList(GlobalFilters.filter(_getFunnels()));
        return;
      }
      const inp = e.target.closest('.dom-lib-input');
      if (!inp) return;
      saveAdsLibraryCount(inp.dataset.dom, inp.value.trim());
    });

    document.getElementById('btn-fechar-mfd').addEventListener('click', fecharModalFunil);
    document.getElementById('modal-funil-detalhe').addEventListener('click', e => {
      if (e.target === document.getElementById('modal-funil-detalhe')) fecharModalFunil();
    });
  }

  return { init, refresh, searchDomAnuncio, searchDomFinal, searchProduto };
})();

function analiseVerFunisVsl(idsStr) {
  const ids   = idsStr.split(',');
  const funis = (window._funnelsGlobal || []).filter(f => ids.includes(f.id));
  if (!funis.length) return;

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:999;display:flex;align-items:center;justify-content:center;padding:20px';
  overlay.innerHTML = `
    <div style="background:var(--bg);border:1px solid var(--border);border-radius:14px;padding:24px;max-width:600px;width:100%;max-height:80vh;overflow-y:auto">
      <div style="font-size:13px;font-weight:700;margin-bottom:16px">Funis com esta VSL (${funis.length})</div>
      ${funis.map(f => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);gap:8px">
          <div>
            <div style="font-size:12px;font-weight:600">${Storage.escHtml(f.conta || '—')}</div>
            <div style="font-size:11px;color:var(--text-muted)">${Storage.escHtml(f.nicho || '')} · ${Storage.escHtml(f.produto || '—')} · ${f.views ? Parser.formatViews(f.views) + ' views' : 'sem views'}</div>
          </div>
          <button class="btn btn-sm btn-secondary" onclick="abrirDetalhe('${f.id}');this.closest('div[style*=fixed]').remove()">👁</button>
        </div>`).join('')}
      <button class="btn btn-secondary" style="width:100%;margin-top:16px" onclick="this.closest('div[style*=fixed]').remove()">Fechar</button>
    </div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}
