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

  // ── Main parser ────────────────────────────────────────────────────────
  function parse(raw) {
    // REGRA 0 — pré-processamento
    const lines = raw
      .split('\n')
      .map(l => stripInvisible(l).trim())
      .filter(l => l.length > 0);

    const result = {
      adId:           null,
      data:           new Date().toISOString().slice(0, 10),
      conta:          null,
      nicho:          null,
      produto:        null,
      urlAnuncio:     null,
      urlAnuncioFull: null,
      views:          null,
      famoso:         null,
      domAnuncio:     null,
      domAnuncioFull: null,
      domFinal:       null,
      domFinalFull:   null,
      split:          false,
      obs:            '',
      gasto:          null,
      conversao:      null,
      moeda:          'BRL',
    };

    const finalUrls = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // REGRA 1 — linha 0: adId | conta | nicho | produto
      if (i === 0) {
        const m = line.match(/^([\d]+)\s*-\s*(.+?)\s*\|\s*([A-Z]{2})\s*\|\s*(.+)$/i);
        if (m) {
          result.adId    = m[1];
          result.conta   = m[2].trim();
          result.nicho   = m[3].trim().toUpperCase();
          result.produto = m[4].trim().toUpperCase();
        }
        continue;
      }

      // REGRA 2 / 4 — linhas com __https://
      if (line.includes('__https://')) {
        if (/facebook\.com/i.test(line)) {
          // REGRA 2 — URL do anúncio no Facebook
          // non-greedy: Facebook URLs não contêm __ internamente
          const m = line.match(/__(.+?)__\s*(.*)/);
          if (m) {
            result.urlAnuncio     = m[1].replace(/^_+|_+$/g, '').trim();
            result.urlAnuncioFull = result.urlAnuncio;

            const rest = (m[2] || '').trim();
            if (rest) {
              // Views: número com separador decimal e/ou sufixo K/M
              const vm = rest.match(/([\d]+[,.][\d]+\s*[KkMm]?|[\d]+\s*[KkMm]+)/i);
              if (vm) result.views = parseViews(vm[1]);

              // Famoso: último token isolado F → "sim", S → "nao"
              const tokens = rest.trim().split(/\s+/);
              const last   = tokens[tokens.length - 1];
              if      (/^F$/i.test(last)) result.famoso = 'sim';
              else if (/^S$/i.test(last)) result.famoso = 'nao';
            }
          }
        } else {
          // REGRA 4 — URL final do funil (strip leading/trailing underscores)
          const url = line.replace(/^_+|_+$/g, '').trim();
          if (url) finalUrls.push(url);
        }
        continue;
      }

      // REGRA 3 — domínio no anúncio (primeira linha que bata, exceto linha 0 e URL lines)
      if (!result.domAnuncio && !/https?:/i.test(line)) {
        const token = line.split(/\s+/)[0];
        if (/^[A-Z0-9][A-Z0-9\-]*\.[A-Z]{2,}/i.test(token)) {
          result.domAnuncio     = token.toUpperCase();
          result.domAnuncioFull = 'https://' + token.toLowerCase();
        }
      }
    }

    // REGRA 4 — processar URLs finais coletadas
    if (finalUrls.length === 1) {
      result.domFinalFull = finalUrls[0];
      result.domFinal     = domainFromUrl(finalUrls[0]);
      result.split        = false;
    } else if (finalUrls.length > 1) {
      result.domFinalFull = finalUrls.join('\n');
      result.domFinal     = finalUrls.map(domainFromUrl).join(' / ');
      result.split        = true;
    }

    return result;
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
