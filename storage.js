/* ============================================================
   storage.js — persistência (localStorage) + utilitários de dados
   ============================================================ */

const Storage = (() => {

  const KEY = 'funil-tracker-v1';

  // ── CRUD básico ───────────────────────────────────────────────────────

  function load() {
    try {
      return JSON.parse(localStorage.getItem(KEY) || '[]');
    } catch {
      return [];
    }
  }

  function save(funnels) {
    localStorage.setItem(KEY, JSON.stringify(funnels));
  }

  function genId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  // ── Métricas de domínio ───────────────────────────────────────────────

  // Retorna { 'DOMINIO.COM': n } — quantos funis cada dom. final aparece.
  // Funis com split contam separadamente para cada domínio.
  function getDomainCounts(funnels) {
    const counts = {};
    for (const f of funnels) {
      if (!f.domFinal) continue;
      const domains = f.split
        ? f.domFinal.split(' / ').map(d => d.trim()).filter(Boolean)
        : [f.domFinal.trim()];
      for (const d of domains) {
        counts[d] = (counts[d] || 0) + 1;
      }
    }
    return counts;
  }

  // Verifica se algum domínio final do funil está repetido (count > 1)
  function isRepeated(funnel, domCounts) {
    if (!funnel.domFinal) return false;
    const domains = funnel.split
      ? funnel.domFinal.split(' / ').map(d => d.trim()).filter(Boolean)
      : [funnel.domFinal.trim()];
    return domains.some(d => (domCounts[d] || 0) > 1);
  }

  // ── Formatação de valores ────────────────────────────────────────────

  const CURRENCY_LOCALES = { BRL: 'pt-BR', USD: 'en-US', INR: 'en-IN' };
  const CURRENCY_SYMBOLS = { BRL: 'R$',    USD: '$',     INR: '₹'     };

  function formatCurrency(amount, moeda) {
    if (amount == null || amount === '') return '';
    const locale    = CURRENCY_LOCALES[moeda] || 'pt-BR';
    const symbol    = CURRENCY_SYMBOLS[moeda] || moeda;
    const formatted = parseFloat(amount).toLocaleString(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return `${symbol} ${formatted}`;
  }

  // ── CSV Export ────────────────────────────────────────────────────────

  const CSV_HEADERS = [
    'Data',
    'Hora',
    'Conta',
    'Nicho',
    'Produto',
    'URL anúncio',
    'Visualizações',
    'Famoso',
    'Domínio anúncio',
    'URL anúncio completa',
    'Domínio final',
    'URL final completa',
    'Split',
    'Obs',
    'Moeda',
    'Gasto total',
    'Valor conversão',
  ];

  function csvCell(val) {
    return '"' + String(val ?? '').replace(/"/g, '""') + '"';
  }

  function exportCSV(funnels) {
    if (!funnels.length) return false;

    const rows = funnels.map(f => [
      f.data,
      f.hora ?? '',
      f.conta,
      f.nicho,
      f.produto,
      f.urlAnuncio,
      f.views ?? '',
      f.famoso ?? '',
      f.domAnuncio,
      f.urlAnuncioFull ?? f.urlAnuncio,
      f.domFinal,
      f.domFinalFull,
      f.split ? 'sim' : 'não',
      f.obs ?? '',
      f.moeda ?? 'BRL',
      f.gasto  ?? '',
      f.conversao ?? '',
    ].map(csvCell).join(','));

    const csv  = [CSV_HEADERS.join(','), ...rows].join('\r\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href     = url;
    link.download = `funil-tracker-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return true;
  }

  // ── CSV Import ────────────────────────────────────────────────────────

  // Parser de linha CSV respeitando campos entre aspas e aspas duplas escapadas
  function parseCSVLine(line) {
    const cells = [];
    let cur  = '';
    let inQ  = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; }  // "" → "
        else inQ = !inQ;
      } else if (ch === ',' && !inQ) {
        cells.push(cur); cur = '';
      } else {
        cur += ch;
      }
    }
    cells.push(cur);
    return cells;
  }

  // Normaliza header para busca robusta: remove acentos e converte para minúsculas
  function normalizeHeader(h) {
    return h.toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')   // strip combining marks
      .trim();
  }

  function importCSV(text) {
    const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return { funnels: [], errors: 0 };

    const rawHeaders  = parseCSVLine(lines[0]);
    const normHeaders = rawHeaders.map(normalizeHeader);

    // Localizar colunas pelo conteúdo normalizado do header
    const col = (test) => normHeaders.findIndex(test);

    const iData      = col(h => h === 'data');
    const iHora      = col(h => h === 'hora');
    const iConta     = col(h => h === 'conta');
    const iNicho     = col(h => h === 'nicho');
    const iProduto   = col(h => h === 'produto');
    const iUrlAn     = col(h => h.includes('url an') && !h.includes('complet'));
    const iViews     = col(h => h.includes('visual'));
    const iFamoso    = col(h => h === 'famoso');
    const iDomAn     = col(h => h.includes('dominio') && h.includes('anun'));
    const iUrlAnFull = col(h => h.includes('url an') &&  h.includes('complet'));
    const iDomFin    = col(h => h.includes('dominio') && h.includes('fin'));
    const iUrlFin    = col(h => h.includes('url fin'));
    const iSplit     = col(h => h === 'split');
    const iObs       = col(h => h === 'obs');
    const iMoeda     = col(h => h === 'moeda');
    const iGasto     = col(h => h.includes('gasto'));
    const iConv      = col(h => h.includes('convers'));

    const get = (row, i) => (i >= 0 && i < row.length ? row[i].trim() : '');

    const funnels = [];
    let errors    = 0;

    for (let i = 1; i < lines.length; i++) {
      const row = parseCSVLine(lines[i]);
      if (row.every(c => !c.trim())) continue;  // linha vazia

      try {
        const domAnuncio = get(row, iDomAn);
        const splitVal   = get(row, iSplit).toLowerCase() === 'sim';
        const viewsStr   = get(row, iViews);
        const gastoStr   = get(row, iGasto);
        const convStr    = get(row, iConv);

        funnels.push({
          id:            genId(),
          data:          get(row, iData),
          hora:          get(row, iHora) || null,
          conta:         get(row, iConta),
          nicho:         get(row, iNicho),
          produto:       normalizeProduto(get(row, iProduto)),
          urlAnuncio:    get(row, iUrlAn),
          urlAnuncioFull: get(row, iUrlAnFull) || get(row, iUrlAn),
          views:         viewsStr ? (parseInt(viewsStr, 10) || null) : null,
          famoso:        get(row, iFamoso) || null,
          domAnuncio,
          domAnuncioFull: domAnuncio ? 'https://' + domAnuncio.toLowerCase() : '',
          domFinal:      get(row, iDomFin),
          domFinalFull:  get(row, iUrlFin),
          split:         splitVal,
          obs:           get(row, iObs),
          moeda:         get(row, iMoeda) || 'BRL',
          gasto:         gastoStr ? (parseFloat(gastoStr)  || null) : null,
          conversao:     convStr  ? (parseFloat(convStr)   || null) : null,
        });
      } catch {
        errors++;
      }
    }

    return { funnels, errors };
  }

  // ── Produto desconhecido ──────────────────────────────────────────────

  function isProdutoDesconhecido(produto) {
    return !produto || produto.trim().toUpperCase() === 'S';
  }

  function normalizeProduto(produto) {
    return isProdutoDesconhecido(produto) ? null : produto.trim().toUpperCase();
  }

  // ── Utilitário HTML ───────────────────────────────────────────────────
  // Centralizado aqui para ser compartilhado por tabela.js e analise.js

  function escHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  return {
    load,
    save,
    genId,
    getDomainCounts,
    isRepeated,
    formatCurrency,
    exportCSV,
    importCSV,
    escHtml,
    isProdutoDesconhecido,
    normalizeProduto,
  };
})();
