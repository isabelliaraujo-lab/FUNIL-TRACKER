/* ============================================================
   pagination.js — utilitário de paginação compartilhado
   ============================================================ */

const Pagination = (() => {

  function paginate(items, page, perPage) {
    const total      = items.length;
    const totalPages = Math.max(1, Math.ceil(total / perPage));
    const safePage   = Math.min(Math.max(1, page), totalPages);
    const start      = (safePage - 1) * perPage;
    const slice      = items.slice(start, start + perPage);
    return { items: slice, page: safePage, totalPages, total, start, end: start + slice.length };
  }

  function controlsHTML(page, totalPages, total, perPage, section) {
    if (totalPages <= 1 && total <= perPage) return '';
    const sa = section ? ` data-pg-section="${section}"` : '';
    const options = [10, 25, 50, 100].map(n =>
      `<option value="${n}" ${perPage === n ? 'selected' : ''}>${n} por página</option>`
    ).join('');
    return `<div class="pagination-bar">
      <div class="pagination-info">${total} itens</div>
      <div class="pagination-controls">
        <button class="pg-btn pg-first" ${page <= 1 ? 'disabled' : ''}${sa} data-pg="first">«</button>
        <button class="pg-btn" ${page <= 1 ? 'disabled' : ''}${sa} data-pg="prev">‹</button>
        <span class="pg-current">${page} / ${totalPages}</span>
        <button class="pg-btn" ${page >= totalPages ? 'disabled' : ''}${sa} data-pg="next">›</button>
        <button class="pg-btn pg-last" ${page >= totalPages ? 'disabled' : ''}${sa} data-pg="last">»</button>
      </div>
      <select class="pg-per-page"${sa}>${options}</select>
    </div>`;
  }

  return { paginate, controlsHTML };
})();
