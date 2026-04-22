/* ============================================================
   escalada.js — aba de produtos em escalada e contas monitoradas
   ============================================================ */

const Escalada = (() => {

  let _getFunnels     = () => [];
  let _getMonitoradas = () => [];
  let _toggleMonitorar = () => {};

  const esc = Storage.escHtml;

  // ── Formatação ────────────────────────────────────────────────────────

  function fmtViews(v) {
    if (!v) return '—';
    if (v >= 1_000_000) return (v / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (v >= 1_000)     return (v / 1_000).toFixed(1).replace(/\.0$/, '') + 'k';
    return String(v);
  }

  function fmtROI(roi) {
    return (roi >= 0 ? '+' : '') + roi.toFixed(1) + '%';
  }

  function fmtMoeda(val, moeda = 'BRL') {
    const s = { BRL: 'R$', USD: '$', INR: '₹' }[moeda] || 'R$';
    return `${s} ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
  }

  // ── Rankings ──────────────────────────────────────────────────────────

  function rankProdutosPorViews(funis) {
    const map = {};
    funis.forEach(f => {
      if (!f.produto) return;
      if (!map[f.produto]) map[f.produto] = { produto: f.produto, views: 0, funis: 0, nichos: new Set() };
      map[f.produto].views += f.views || 0;
      map[f.produto].funis++;
      if (f.nicho) map[f.produto].nichos.add(f.nicho);
    });
    return Object.values(map)
      .sort((a, b) => b.views - a.views)
      .slice(0, 10);
  }

  function rankProdutosPorROI(funis) {
    const map = {};
    funis.forEach(f => {
      if (!f.produto || f.gasto == null || f.conversao == null) return;
      const g = parseFloat(f.gasto)     || 0;
      const c = parseFloat(f.conversao) || 0;
      if (!map[f.produto]) map[f.produto] = { produto: f.produto, gasto: 0, conversao: 0, funis: 0, moeda: f.moeda || 'BRL' };
      map[f.produto].gasto     += g;
      map[f.produto].conversao += c;
      map[f.produto].funis++;
    });
    return Object.values(map)
      .filter(p => p.gasto > 0)
      .map(p => ({ ...p, roi: ((p.conversao - p.gasto) / p.gasto) * 100 }))
      .sort((a, b) => b.roi - a.roi)
      .slice(0, 10);
  }

  // ── Render: Seção 1 — Produtos em escalada ────────────────────────────

  function rankViewsHTML(funis) {
    const items = rankProdutosPorViews(funis);
    if (!items.length) return '<p class="analysis-no-results">Nenhum produto cadastrado ainda.</p>';

    return items.map((p, i) => {
      const nichoTags = [...p.nichos].map(n =>
        `<span class="tag tag-nicho nicho-${esc(n)}" style="font-size:10px;padding:1px 6px">${esc(n)}</span>`
      ).join('');

      return `<div class="rank-item">
        <span class="rank-pos ${i < 3 ? 'top' : ''}">#${i + 1}</span>
        <div style="flex:1;min-width:0;overflow:hidden">
          <div style="font-weight:600;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
               title="${esc(p.produto)}">${esc(p.produto)}</div>
          ${nichoTags ? `<div style="margin-top:3px;display:flex;flex-wrap:wrap;gap:3px">${nichoTags}</div>` : ''}
        </div>
        <div style="text-align:right;white-space:nowrap;flex-shrink:0;margin-left:8px">
          <div style="font-weight:700;color:#a78bfa;font-size:14px">${fmtViews(p.views)}</div>
          <div style="font-size:11px;color:var(--text-muted)">${p.funis} funil(s)</div>
        </div>
      </div>`;
    }).join('');
  }

  function rankROIProdutosHTML(funis) {
    const items = rankProdutosPorROI(funis);
    if (!items.length) return '<p class="analysis-no-results">Nenhum produto com gasto e conversão preenchidos.</p>';

    return items.map((p, i) => {
      const cor = p.roi >= 0 ? '#00c47a' : '#ff4d4d';

      return `<div class="rank-item">
        <span class="rank-pos ${i < 3 ? 'top' : ''}">#${i + 1}</span>
        <div style="flex:1;min-width:0;overflow:hidden">
          <div style="font-weight:600;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
               title="${esc(p.produto)}">${esc(p.produto)}</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:2px">
            ${fmtMoeda(p.gasto, p.moeda)} gasto · ${fmtMoeda(p.conversao, p.moeda)} conv.
          </div>
        </div>
        <div style="text-align:right;white-space:nowrap;flex-shrink:0;margin-left:8px">
          <div style="font-weight:700;color:${cor};font-size:14px">${fmtROI(p.roi)}</div>
          <div style="font-size:11px;color:var(--text-muted)">${p.funis} funil(s)</div>
        </div>
      </div>`;
    }).join('');
  }

  // ── Seções ────────────────────────────────────────────────────────────

  function secaoProdutos(funis) {
    return `
      <div class="escalada-section">
        <h3 class="escalada-section__title">🔥 Produtos em escalada</h3>
        <div class="escalada-grid">
          <div class="escalada-card">
            <div class="escalada-card__title">Ranking por views</div>
            ${rankViewsHTML(funis)}
          </div>
          <div class="escalada-card">
            <div class="escalada-card__title">Ranking por ROI</div>
            ${rankROIProdutosHTML(funis)}
          </div>
        </div>
      </div>`;
  }

  function rankContasPorROI(funis) {
    const map = {};
    funis.forEach(f => {
      if (!f.conta || f.gasto == null || f.conversao == null) return;
      if (!map[f.conta]) map[f.conta] = { conta: f.conta, gasto: 0, conversao: 0, funis: 0, produtos: new Set(), nichos: new Set(), moeda: f.moeda || 'BRL' };
      map[f.conta].gasto     += parseFloat(f.gasto)     || 0;
      map[f.conta].conversao += parseFloat(f.conversao) || 0;
      map[f.conta].funis++;
      if (f.produto) map[f.conta].produtos.add(f.produto);
      if (f.nicho)   map[f.conta].nichos.add(f.nicho);
    });
    return Object.values(map)
      .filter(c => c.gasto > 0)
      .map(c => ({ ...c, roi: ((c.conversao - c.gasto) / c.gasto) * 100 }))
      .sort((a, b) => b.roi - a.roi);
  }

  // ── Render: Seção 2 — Contas com melhor ROI ───────────────────────────

  function rankROIContasHTML(funis) {
    const items = rankContasPorROI(funis);
    if (!items.length) return '<p class="analysis-no-results">Nenhuma conta com dados de performance ainda.</p>';

    return items.map(c => {
      const cor   = c.roi >= 0 ? '#00c47a' : '#ff4d4d';
      const badge = c.roi >= 0
        ? `<span class="tag-status" style="background:rgba(0,196,122,.15);color:#00c47a">💰 ROI+</span>`
        : `<span class="tag-status" style="background:rgba(255,77,77,.15);color:#ff4d4d">📉 ROI−</span>`;

      const nichoTags = [...c.nichos].map(n =>
        `<span class="tag tag-nicho nicho-${esc(n)}" style="font-size:10px;padding:1px 6px">${esc(n)}</span>`
      ).join('');

      const prodCount = c.produtos.size;

      return `<div class="rank-item" style="align-items:flex-start;gap:12px">
        <div style="flex:1;min-width:0;overflow:hidden">
          <div style="display:flex;align-items:center;flex-wrap:wrap;gap:6px;margin-bottom:4px">
            <span style="font-weight:600;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:240px"
                  title="${esc(c.conta)}">${esc(c.conta)}</span>
            ${badge}
          </div>
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:${nichoTags ? '5px' : '0'}">
            ${c.funis} funil(s) · ${prodCount} produto(s) ·
            ${fmtMoeda(c.gasto, c.moeda)} gasto · ${fmtMoeda(c.conversao, c.moeda)} conv.
          </div>
          ${nichoTags ? `<div style="display:flex;flex-wrap:wrap;gap:3px">${nichoTags}</div>` : ''}
        </div>
        <div style="font-weight:700;color:${cor};font-size:16px;white-space:nowrap;flex-shrink:0;padding-top:1px">
          ${fmtROI(c.roi)}
        </div>
      </div>`;
    }).join('');
  }

  function secaoContasROI(funis) {
    return `
      <div class="escalada-section">
        <h3 class="escalada-section__title">💰 Contas com melhor ROI</h3>
        <div class="escalada-card">
          ${rankROIContasHTML(funis)}
        </div>
      </div>`;
  }

  function secaoDominioPorProduto() {
    return `
      <div class="escalada-section">
        <h3 class="escalada-section__title">🏆 Melhor domínio por produto</h3>
        <p class="analysis-no-results">Em breve.</p>
      </div>`;
  }

  function secaoMonitoradas() {
    return `
      <div class="escalada-section">
        <h3 class="escalada-section__title">👁 Contas monitoradas</h3>
        <p class="analysis-no-results">Em breve. Use o botão +👁 na tabela de funis para monitorar contas.</p>
      </div>`;
  }

  // ── Render principal ──────────────────────────────────────────────────

  function refresh() {
    const el = document.getElementById('tab-escalada');
    if (!el) return;

    const funis = _getFunnels();

    el.innerHTML =
      secaoProdutos(funis) +
      secaoContasROI(funis) +
      secaoDominioPorProduto() +
      secaoMonitoradas();
  }

  // ── Inicialização ─────────────────────────────────────────────────────

  function init(getFunnels, getMonitoradas, toggleMonitorar) {
    _getFunnels      = getFunnels;
    _getMonitoradas  = getMonitoradas  || (() => []);
    _toggleMonitorar = toggleMonitorar || (() => {});
  }

  return { init, refresh };

})();
