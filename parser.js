/* ============================================================
   parser.js — extração de dados do bloco de texto colado
   ============================================================ */

const Parser = (() => {

  // REGRA 0 — caracteres invisíveis a remover
  const INVISIBLE_RE = /[\u200B\u200C\u200D\u200E\u200F\u202A\u202B\u202C\u202D\u202E\uFEFF\u2060\u2061\u2062\u2063\u2064\u00AD]/g;

  function stripInvisible(str) {
    return str.replace(INVISIBLE_RE, '');
  }

  // ── Views parsing ──────────────────────────────────────────────────────
  // "4,4K" → 4400 | "1K" → 1000 | "1.2M" → 1200000 | "458000" → 458000
  function parseViews(str) {
    if (!str) return null;
    str = str.trim().toUpperCase().replace(/\s/g, '');

    let mult = 1;
    if      (str.endsWith('M')) { mult = 1_000_000; str = str.slice(0, -1); }
    else if (str.endsWith('K')) { mult = 1_000;     str = str.slice(0, -1); }

    const num = parseFloat(str.replace(',', '.'));
    return isNaN(num) ? null : Math.round(num * mult);
  }

  // ── Views formatting ───────────────────────────────────────────────────
  // 4400 → "4.4k" | 1200000 → "1.2M" | 500 → "500"
  function formatViews(n) {
    if (n == null || n === '') return '';
    n = parseInt(n, 10);
    if (isNaN(n)) return '';

    if (n >= 1_000_000) {
      const v = n / 1_000_000;
      return (Number.isInteger(v) ? v : parseFloat(v.toFixed(1))) + 'M';
    }
    if (n >= 1_000) {
      const v = n / 1_000;
      return (Number.isInteger(v) ? v : parseFloat(v.toFixed(1))) + 'k';
    }
    return String(n);
  }

  function domainFromUrl(url) {
    try {
      return new URL(url.trim()).hostname.replace(/^www\./i, '').toUpperCase();
    } catch {
      return url.trim().toUpperCase();
    }
  }

  // Detecta se uma linha contém URL (com ou sem underscores)
  function isUrlLine(line) {
    return /__https?:\/\//i.test(line) || /^\s*https?:\/\//i.test(line);
  }

  function isFacebookLine(line) {
    return isUrlLine(line) && /facebook\.com/i.test(line);
  }

  function extractUrl(line) {
    // Com underscores: __https://...__ ou __https://...
    const m1 = line.match(/__+(https?:\/\/.+?)__+\s*$/i) ||
                line.match(/__+(https?:\/\/.+?)__*/i);
    if (m1) return m1[1].replace(/_+$/, '').trim();

    // Sem underscores (mammoth): linha começa com https://
    const m2 = line.match(/^\s*(https?:\/\/[^\s]+)/i);
    if (m2) return m2[1].replace(/_+$/, '').trim();

    return null;
  }

  // ── Main parser ────────────────────────────────────────────────────────
  function parse(raw) {
    // REGRA 0 — pré-processamento
    const lines = raw
      .split('\n')
      .map(l => stripInvisible(l).trim())
      .filter(l => l.length > 0);

    let adId = null, data = new Date().toISOString().slice(0, 10);
    let conta = null, nicho = null, produto = null;
    let urlAnuncio = null, urlAnuncioFull = null;
    let views = null, famoso = null;
    let domAnuncio = null, domAnuncioFull = null;
    let domFinal = null, domFinalFull = null, split = false;
    let obs = '', gasto = null, conversao = null, moeda = 'BRL';

    // REGRA 1 — linha 0: adId | conta | nicho | produto
    if (lines.length > 0) {
      const m = lines[0].match(/^([\d]+)\s*-\s*(.+?)\s*\|\s*([A-Z]{2})\s*\|\s*(.+)$/i);
      if (m) {
        adId    = m[1];
        conta   = m[1].trim() + ' - ' + m[2].trim();
        nicho   = m[3].trim().toUpperCase();
        produto = m[4].trim().toUpperCase();
      }
    }

    // REGRA 3 — domínio no anúncio (primeira linha que bata, exceto linha 0 e URL lines)
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (isUrlLine(line)) continue;
      if (!domAnuncio) {
        const token = line.split(/\s+/)[0];
        if (/^[A-Z0-9][A-Z0-9\-]*\.[A-Z]{2,}/i.test(token)) {
          domAnuncio     = token.toUpperCase();
          domAnuncioFull = 'https://' + token.toLowerCase();
        }
      }
    }

    // REGRA 2 — URL do anúncio (Facebook)
    const fbLine = lines.find(isFacebookLine);
    if (fbLine) {
      urlAnuncio = extractUrl(fbLine) || '';
      urlAnuncioFull = urlAnuncio;

      // Remove a URL da linha para buscar views e famoso no restante
      const after = fbLine
        .replace(/__+(https?:\/\/.+?)(__+)?/i, '')
        .replace(/^\s*https?:\/\/[^\s]+/i, '')
        .trim();

      const vm = after.match(/([\d]+[,.][\d]+\s*[KkMm]?|[\d]+\s*[KkMm]+)/i);
      if (vm) views = parseViews(vm[1]);

      const tokens = after.replace(vm ? vm[0] : '', '').trim().split(/\s+/);
      for (const t of tokens) {
        const c = stripInvisible(t).toUpperCase();
        if (c === 'F') { famoso = 'sim'; break; }
        if (c === 'S') { famoso = 'nao'; break; }
      }
    }

    // REGRA 4 — URLs finais (não Facebook)
    const finalLines = lines.filter(l => isUrlLine(l) && !isFacebookLine(l));
    const finalUrls  = finalLines.map(extractUrl).filter(Boolean);

    if (finalUrls.length === 1) {
      domFinalFull = finalUrls[0];
      domFinal     = domainFromUrl(finalUrls[0]);
      split        = false;
    } else if (finalUrls.length >= 2) {
      const domains = [...new Set(finalUrls.map(domainFromUrl))];
      domFinal     = domains.join(' / ');
      domFinalFull = finalUrls.join('\n');
      split        = true;
    }

    return { adId, data, conta, nicho, produto, urlAnuncio, urlAnuncioFull, views, famoso,
             domAnuncio, domAnuncioFull, domFinal, domFinalFull, split, obs, gasto, conversao, moeda };
  }

  // ── Preview dos campos extraídos ───────────────────────────────────────
  const PREVIEW_FIELDS = [
    { key: 'adId',           label: 'Ad ID' },
    { key: 'conta',          label: 'Conta' },
    { key: 'nicho',          label: 'Nicho' },
    { key: 'produto',        label: 'Produto' },
    { key: 'urlAnuncio',     label: 'URL Anúncio',       truncate: 50 },
    { key: 'views',          label: 'Views',             fmt: v => formatViews(v) },
    { key: 'famoso',         label: 'Famoso' },
    { key: 'domAnuncio',     label: 'Dom. Anúncio' },
    { key: 'domAnuncioFull', label: 'URL Dom. Anúncio',  truncate: 50 },
    { key: 'domFinal',       label: 'Dom. Final' },
    { key: 'domFinalFull',   label: 'URL Final',         truncate: 60 },
    { key: 'split',          label: 'Split',             fmt: v => v ? 'Sim' : 'Não' },
  ];

  function buildPreviewHTML(data) {
    return PREVIEW_FIELDS.map(f => {
      const raw     = data[f.key];
      const isEmpty = raw === null || raw === undefined || raw === '' || raw === false;
      let display   = isEmpty
        ? '(não encontrado)'
        : (f.fmt ? f.fmt(raw) : String(raw));

      if (!isEmpty && f.truncate && display.length > f.truncate) {
        display = display.slice(0, f.truncate) + '…';
      }

      const cls = isEmpty ? 'missing' : 'found';
      return `<div class="preview-field ${cls}">
        <div class="preview-field__label">${f.label}</div>
        <div class="preview-field__value">${escHtml(display)}</div>
      </div>`;
    }).join('');
  }

  function escHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  return {
    parse,
    parseViews,
    formatViews,
    stripInvisible,
    buildPreviewHTML,
  };
})();
