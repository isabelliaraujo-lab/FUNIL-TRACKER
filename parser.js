/* ============================================================
   parser.js — extração de dados do bloco de texto colado
   ============================================================ */

const Parser = (() => {

  // ── Invisible Unicode characters common in Google Docs copy-paste ──
  const INVISIBLE_RE = /[\u200B\uFEFF\u202A\uFEFF\u202B\u202C\u202D\u202E\u200C\u200D\u200E\u200F\u00AD\u2028\u2029\u034F\u115F\u1160\u17B4\u17B5\u3164\uFFA0]/g;

  function stripInvisible(str) {
    return str.replace(INVISIBLE_RE, '');
  }

  // ── Views parsing ──
  // Suporta: "4,4K" → 4400 | "458K" → 458000 | "1.2M" → 1200000 | "4400" → 4400
  function parseViews(str) {
    if (!str) return null;
    str = str.trim().toUpperCase().replace(/\s/g, '');

    let mult = 1;
    if      (str.endsWith('M')) { mult = 1_000_000; str = str.slice(0, -1); }
    else if (str.endsWith('K')) { mult = 1_000;     str = str.slice(0, -1); }

    // Vírgula como separador decimal (pt-BR: "4,4")
    const num = parseFloat(str.replace(',', '.'));
    return isNaN(num) ? null : Math.round(num * mult);
  }

  // ── Views formatting ──
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

  // ── Extract uppercase hostname from a URL ──
  function domainFromUrl(url) {
    try {
      return new URL(url.trim()).hostname.replace(/^www\./i, '').toUpperCase();
    } catch {
      return url.trim().toUpperCase();
    }
  }

  // ── Main parser ──
  // Recebe o bloco de texto bruto colado do Google Docs e retorna um objeto
  // com todos os campos do funil extraídos.
  function parse(raw) {
    const text  = stripInvisible(raw);
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    const result = {
      data:          new Date().toISOString().slice(0, 10),
      conta:         null,
      nicho:         null,
      produto:       null,
      urlAnuncio:    null,
      urlAnuncioFull: null,
      views:         null,
      famoso:        null,
      domAnuncio:    null,
      domAnuncioFull: null,
      domFinal:      null,
      domFinalFull:  null,
      split:         false,
      obs:           '',
      gasto:         null,
      conversao:     null,
      moeda:         'BRL',
    };

    const finalUrls = [];

    for (const line of lines) {

      // ── Linha 1: ID - Nome | NICHO | PRODUTO ──────────────────────────
      // Ex: "436439506228034 - Dr. Danielle Morgan | WL | LEAN DROPS"
      if (!result.conta && /^\d+\s*-\s*/.test(line) && line.includes('|')) {
        const afterDash = line.slice(line.indexOf('-') + 1).trim();
        const parts     = afterDash.split('|').map(p => p.trim());
        result.conta    = parts[0] || null;
        result.nicho    = (parts[1] || '').toUpperCase().trim() || null;
        result.produto  = (parts[2] || '').toUpperCase().trim() || null;
        continue;
      }

      // ── Linhas com __URL__ ────────────────────────────────────────────
      // Usamos match greedy para não parar em underscores dentro da URL.
      const urlMatch = line.match(/__(.+)__/);
      if (urlMatch) {
        const url = urlMatch[1].trim();

        if (/facebook\.com/i.test(url)) {
          // URL do anúncio no Facebook + views + famoso
          result.urlAnuncio     = url;
          result.urlAnuncioFull = url;

          // Tudo após o fechamento __ (Ex: "4,4K F")
          const afterTag = line.slice(line.lastIndexOf('__') + 2).trim();
          if (afterTag) {
            // Views: primeiro token numérico com sufixo K/M opcional
            const vm = afterTag.match(/^([\d,.]+\s*[KkMm]?)/);
            if (vm) result.views = parseViews(vm[1]);

            // Famoso: último token deve ser F ou S isolado
            const tokens    = afterTag.trim().split(/\s+/);
            const lastToken = tokens[tokens.length - 1];
            if (/^[Ff]$/i.test(lastToken)) result.famoso = 'sim';
            else if (/^[Ss]$/i.test(lastToken)) result.famoso = 'não';
          }
        } else {
          // URL final do funil (pode haver mais de uma → split)
          finalUrls.push(url);
        }
        continue;
      }

      // ── Linha de domínio em maiúsculas sem http ───────────────────────
      // Ex: "TWR.HEALTHOFBRAIN.COM"
      // Critérios: sem espaços, sem "http", parece um domínio válido
      if (
        !result.domAnuncio &&
        !line.includes(' ') &&
        !/https?:/i.test(line) &&
        /^[A-Z0-9][A-Z0-9._-]*\.[A-Z]{2,}$/i.test(line)
      ) {
        result.domAnuncio     = line.toUpperCase();
        result.domAnuncioFull = 'https://' + line.toLowerCase();
        continue;
      }

      // Demais linhas (descrições, CTAs, etc.) → ignorar
    }

    // ── Processar URLs finais ──────────────────────────────────────────
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

  // ── Preview fields config ─────────────────────────────────────────────
  // Descreve quais campos mostrar na pré-visualização e como formatá-los.
  const PREVIEW_FIELDS = [
    { key: 'conta',         label: 'Conta' },
    { key: 'nicho',         label: 'Nicho' },
    { key: 'produto',       label: 'Produto' },
    { key: 'urlAnuncio',    label: 'URL Anúncio',    truncate: 50 },
    { key: 'views',         label: 'Views',          fmt: v => formatViews(v) },
    { key: 'famoso',        label: 'Famoso' },
    { key: 'domAnuncio',    label: 'Dom. Anúncio' },
    { key: 'domAnuncioFull',label: 'URL Dom. Anúncio', truncate: 50 },
    { key: 'domFinal',      label: 'Dom. Final' },
    { key: 'domFinalFull',  label: 'URL Final',      truncate: 60 },
    { key: 'split',         label: 'Split',          fmt: v => v ? 'Sim' : 'Não' },
  ];

  // Constrói o HTML do grid de pré-visualização
  function buildPreviewHTML(data) {
    return PREVIEW_FIELDS.map(f => {
      const raw   = data[f.key];
      const isEmpty = raw === null || raw === undefined || raw === '' || raw === false;
      let display = isEmpty
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

  // Pequeno helper de escape — usado apenas aqui dentro
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
