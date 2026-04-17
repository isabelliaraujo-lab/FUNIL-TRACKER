/* ============================================================
   analise.js — aba de análise e cruzamento de dados
   ============================================================ */

const Analise = (() => {

  let _getFunnels = () => [];

  const esc = Storage.escHtml;

  // ── Helpers de domínio ────────────────────────────────────────────────

  // Retorna todos os domínios finais de um funil (trata split)
  function finalDomains(f) {
    if (!f.domFinal) return [];
    return (f.split === true || f.split === 'true')
      ? f.domFinal.split(' / ').map(d => d.trim()).filter(Boolean)
      : [f.domFinal.trim()];
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

  // Gera uma lista de cards; items = [{ title, pills: string[] }]
  function listHtml(items) {
    if (!items.length) {
      return '<p class="analysis-no-results">Nenhum resultado.</p>';
    }
    return `<div class="analysis-list">
      ${items.map(item => `
        <div class="analysis-item">
          <div class="analysis-item__title">${esc(item.title)}</div>
          <div class="analysis-item__meta">
            ${item.pills.map(p => `<span class="analysis-item__pill">${esc(p)}</span>`).join('')}
          </div>
        </div>`).join('')}
    </div>`;
  }

  // Dois blocos de lista lado a lado (usado no bloco de produto)
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

  // ── Bloco 1 — por domínio de anúncio ─────────────────────────────────
  // Métricas: contas distintas / funis / produtos / destinos finais
  // Lista:    contas que usam esse domínio + produtos + qtd de funis

  function searchDomAnuncio() {
    const q  = document.getElementById('search-dom-anuncio').value.toLowerCase().trim();
    const el = document.getElementById('result-dom-anuncio');
    if (!q) { el.innerHTML = ''; return; }

    const matched = _getFunnels().filter(
      f => f.domAnuncio && f.domAnuncio.toLowerCase().includes(q)
    );

    if (!matched.length) {
      el.innerHTML = '<p class="analysis-no-results">Nenhum resultado para esta busca.</p>';
      return;
    }

    const contas   = new Set(matched.map(f => f.conta).filter(Boolean));
    const produtos = new Set(matched.map(f => f.produto).filter(Boolean));
    const destinos = new Set();
    matched.forEach(f => finalDomains(f).forEach(d => destinos.add(d)));

    // Agrupar por conta
    const byContas = {};
    matched.forEach(f => {
      const k = f.conta || '(sem conta)';
      if (!byContas[k]) byContas[k] = { produtos: new Set(), count: 0 };
      byContas[k].count++;
      if (f.produto) byContas[k].produtos.add(f.produto);
    });

    const items = Object.entries(byContas)
      .sort((a, b) => b[1].count - a[1].count)
      .map(([conta, data]) => ({
        title: conta,
        pills: [
          `${data.count} funil(s)`,
          ...[...data.produtos],
        ],
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
  // Métricas: contas distintas / funis / dom. anúncio distintos / produtos
  // Lista:    contas + dom. anúncio que cada uma usa + produtos + qtd funis

  function searchDomFinal() {
    const q  = document.getElementById('search-dom-final').value.toLowerCase().trim();
    const el = document.getElementById('result-dom-final');
    if (!q) { el.innerHTML = ''; return; }

    // Busca em todos os dom. finais, incluindo cada metade de splits
    const matched = _getFunnels().filter(
      f => f.domFinal && f.domFinal.toLowerCase().includes(q)
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
      if (!byContas[k]) byContas[k] = { domsAn: new Set(), produtos: new Set(), count: 0 };
      byContas[k].count++;
      if (f.domAnuncio) byContas[k].domsAn.add(f.domAnuncio);
      if (f.produto)    byContas[k].produtos.add(f.produto);
    });

    const items = Object.entries(byContas)
      .sort((a, b) => b[1].count - a[1].count)
      .map(([conta, data]) => ({
        title: conta,
        pills: [
          `${data.count} funil(s)`,
          ...[...data.domsAn],
          ...[...data.produtos],
        ],
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
  // Métricas: contas / dom. anúncio distintos / dom. finais distintos / funis
  // Lista A:  dom. anúncio → contas que o usam
  // Lista B:  dom. finais → contas que chegam lá

  function searchProduto() {
    const q  = document.getElementById('search-produto').value.toLowerCase().trim();
    const el = document.getElementById('result-produto');
    if (!q) { el.innerHTML = ''; return; }

    const matched = _getFunnels().filter(
      f => f.produto && f.produto.toLowerCase().includes(q)
    );

    if (!matched.length) {
      el.innerHTML = '<p class="analysis-no-results">Nenhum resultado para esta busca.</p>';
      return;
    }

    const contas    = new Set(matched.map(f => f.conta).filter(Boolean));
    const domsAn    = new Set(matched.map(f => f.domAnuncio).filter(Boolean));
    const domsFinal = new Set();
    matched.forEach(f => finalDomains(f).forEach(d => domsFinal.add(d)));

    // Dom. anúncio → contas
    const byDomAn = {};
    matched.forEach(f => {
      const k = f.domAnuncio || '(sem dom. anúncio)';
      if (!byDomAn[k]) byDomAn[k] = new Set();
      if (f.conta) byDomAn[k].add(f.conta);
    });

    // Dom. final → contas
    const byDomFin = {};
    matched.forEach(f => {
      finalDomains(f).forEach(d => {
        if (!byDomFin[d]) byDomFin[d] = new Set();
        if (f.conta) byDomFin[d].add(f.conta);
      });
    });

    const domAnItems = Object.entries(byDomAn)
      .sort((a, b) => b[1].size - a[1].size)
      .map(([dom, cs]) => ({ title: dom, pills: [...cs] }));

    const domFinItems = Object.entries(byDomFin)
      .sort((a, b) => b[1].size - a[1].size)
      .map(([dom, cs]) => ({ title: dom, pills: [...cs] }));

    el.innerHTML =
      metricsHtml([
        { val: contas.size,    lbl: 'Contas'        },
        { val: domsAn.size,   lbl: 'Dom. anúncio'  },
        { val: domsFinal.size, lbl: 'Dom. finais'   },
        { val: matched.length, lbl: 'Funis'         },
      ]) + twoColHtml(
        'Domínios de anúncio', domAnItems,
        'Domínios finais',     domFinItems
      );
  }

  // ── Re-executa todas as buscas ativas ─────────────────────────────────
  // Chamado ao entrar na aba ou quando os dados mudam com a aba ativa.
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
  }

  return { init, refresh, searchDomAnuncio, searchDomFinal, searchProduto };
})();
