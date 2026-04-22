/* ============================================================
   escalada.js — aba de produtos em escalada e contas monitoradas
   ============================================================ */

const Escalada = (() => {

  let _getFunnels     = () => [];
  let _getMonitoradas = () => [];
  let _toggleMonitorar = () => {};

  const esc = Storage.escHtml;

  // ── Seções ────────────────────────────────────────────────────────────

  function secaoProdutos() {
    return `
      <div class="escalada-section">
        <h3 class="escalada-section__title">🔥 Produtos em escalada</h3>
        <div class="escalada-grid">
          <div class="escalada-card">
            <div class="escalada-card__title">Ranking por views</div>
            <p class="analysis-no-results">Em breve.</p>
          </div>
          <div class="escalada-card">
            <div class="escalada-card__title">Ranking por ROI</div>
            <p class="analysis-no-results">Em breve.</p>
          </div>
        </div>
      </div>`;
  }

  function secaoContasROI() {
    return `
      <div class="escalada-section">
        <h3 class="escalada-section__title">💰 Contas com melhor ROI</h3>
        <div class="escalada-card">
          <p class="analysis-no-results">Em breve.</p>
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

    el.innerHTML =
      secaoProdutos() +
      secaoContasROI() +
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
