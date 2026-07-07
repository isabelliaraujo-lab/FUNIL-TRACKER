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

  function isInstagramLine(line) {
    return isUrlLine(line) && /instagram\.com/i.test(line);
  }

  function extractUrl(line) {
    // Markdown: [texto](url)
    const md = line.match(/\[.*?\]\((https?:\/\/[^)]+)\)/);
    if (md) return md[1].trim();

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
  function parse(raw, linkMap = {}) {
    // REGRA 0 — pré-processamento
    const rawLines = raw
      .split('\n')
      .map(l => stripInvisible(l).trim())
      .filter(l => l.length > 0);

    // Normalizar linhas quebradas pelo mammoth: se uma linha começa com "- " ou "| ",
    // pertence à linha anterior e deve ser juntada a ela.
    const lines = [];
    for (const linha of rawLines) {
      const ultimo = lines[lines.length - 1];
      if (ultimo && (linha.startsWith('- ') || linha.startsWith('| '))) {
        lines[lines.length - 1] = ultimo + ' ' + linha;
      } else {
        lines.push(linha);
      }
    }

    let adId = null, data = new Date().toISOString().slice(0, 10);
    let conta = null, nicho = null, produto = null;
    let urlAnuncio = null, urlAnuncioFull = null;
    let views = null, famoso = null;
    let domAnuncio = null, domAnuncioFull = null;
    let domFinal = null, domFinalFull = null, split = false;
    let obs = '', gasto = null, conversao = null, moeda = 'BRL', urlVsl = null;

    // REGRA 1 — linha 0: adId | conta | nicho | produto
    if (lines.length > 0) {
      const m = lines[0].match(/^([\d]+)\s*-\s*(.+?)\s*\|\s*([A-Z]{2})\s*\|\s*(.+)$/i);
      if (m) {
        adId    = m[1];
        conta   = m[1].trim() + ' - ' + m[2].trim();
        nicho   = m[3].trim().toUpperCase();
        produto = Storage.normalizeProduto(m[4]);
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

    // REGRA 3B — URL nativa do Facebook para domAnuncioFull
    // Prioridade 1: linkMap vindo do .docx (hiperlink embutido no domínio visível)
    if (domAnuncio && linkMap[domAnuncio] &&
        /l\.facebook\.com\/l\.php/i.test(linkMap[domAnuncio])) {
      domAnuncioFull = linkMap[domAnuncio];
    } else {
      // Prioridade 2: link nativo presente no texto puro (colagem manual)
      const linkNativo = lines.find(l =>
        /https?:\/\/l\.facebook\.com\/l\.php/i.test(l)
      );
      if (linkNativo) {
        const m = linkNativo.match(/__?(https?:\/\/l\.facebook\.com\/l\.php[^\s_]+)__?/i) ||
                  linkNativo.match(/(https?:\/\/l\.facebook\.com\/l\.php[^\s]+)/i);
        if (m) domAnuncioFull = m[1].replace(/_+$/, '').trim();
      }
    }

    // REGRA 2 — URL do anúncio (Facebook ou Instagram como fallback)
    const adLine = lines.find(isFacebookLine) || lines.find(isInstagramLine);
    if (adLine) {
      urlAnuncio = extractUrl(adLine) || '';
      urlAnuncioFull = urlAnuncio;

      // Views e famoso só existem em linhas Facebook — pular se for Instagram
      if (isFacebookLine(adLine)) {
        const after = adLine
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
    }

    // REGRA 4 — URLs finais (não Facebook, não Instagram, não ig_redirect)
    const finalLines = lines.filter(l =>
      isUrlLine(l) &&
      !isFacebookLine(l) &&
      !isInstagramLine(l) &&
      !/ig_redirect/i.test(l) &&
      !/converteai\.net/i.test(l)
    );

    // REGRA 5 — URL(s) da VSL/CDN (linhas contendo converteai.net e .m3u8)
    const vslLines = lines.filter(l =>
      /converteai\.net/i.test(l) && /\.m3u8/i.test(l)
    );
    const vslUrls = vslLines
      .map(l => (l.match(/(https?:\/\/[^\s]+\.m3u8[^\s]*)/i) || [])[1])
      .filter(Boolean)
      .map(u => u.replace(/_+$/, '').trim());
    if (vslUrls.length) urlVsl = vslUrls.join('\n');

    const finalUrls  = finalLines.map(extractUrl).filter(Boolean);

    if (finalUrls.length === 1) {
      domFinalFull = finalUrls[0];
      domFinal     = domainFromUrl(finalUrls[0]);
      split        = false;
    } else if (finalUrls.length >= 2) {
      const domains = [...new Set(finalUrls.map(domainFromUrl))];
      domFinal     = domains.join('\n');
      domFinalFull = finalUrls.join('\n');
      split        = true;
    }

    return { adId, data, conta, nicho, produto, urlAnuncio, urlAnuncioFull, views, famoso,
             domAnuncio, domAnuncioFull, domFinal, domFinalFull, split, obs, gasto, conversao, moeda, urlVsl };
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
    { key: 'urlVsl',         label: 'URL VSL',           truncate: 60 },
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
