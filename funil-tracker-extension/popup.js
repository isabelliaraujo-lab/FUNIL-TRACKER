/* ============================================================
   popup.js — relatório diário das análises salvas em
   `analises_extensao`, exibido no popup do ícone da extensão.
   ============================================================ */

(function () {
  'use strict';

  const inputData = document.getElementById('input-data');
  const resumoEl  = document.getElementById('resumo');
  const listaEl   = document.getElementById('lista-analises');

  function hojeISO() {
    const d  = new Date();
    const tz = d.getTimezoneOffset() * 60000;
    return new Date(d - tz).toISOString().slice(0, 10);
  }

  function formatarHora(createdAt) {
    const d = createdAt ? new Date(createdAt) : null;
    if (!d || isNaN(d)) return '—';
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  function escHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async function buscarAnalises(data) {
    const url = `${SUPABASE_URL}/rest/v1/analises_extensao`
      + `?data=eq.${encodeURIComponent(data)}`
      + `&order=created_at.desc`
      + `&select=*`;

    const resp = await fetch(url, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });

    if (!resp.ok) throw new Error(`Supabase respondeu ${resp.status}`);
    return resp.json();
  }

  // Só http(s) vira link de verdade. Páginas de extensão (MV3) bloqueiam
  // por CSP qualquer tentativa de execução de esquema javascript:, e
  // mailto:/tel:/# ou valores relativos não fazem sentido como link aqui
  // — links_pagina vem de <a href> reais da página analisada e pode
  // conter qualquer um desses.
  function ehUrlSegura(url) {
    return typeof url === 'string' && /^https?:\/\//i.test(url.trim());
  }

  function linkTruncadoHtml(url, max = 40) {
    if (!url) return '<span style="color:#555">—</span>';
    const label = url.length > max ? url.slice(0, max - 1) + '…' : url;
    if (!ehUrlSegura(url)) {
      return `<span style="color:#666;word-break:break-all" title="${escHtml(url)}">${escHtml(label)}</span>`;
    }
    return `<a href="${escHtml(url)}" target="_blank" rel="noopener noreferrer" title="${escHtml(url)}" ` +
      `style="color:#00d4ff;text-decoration:none;word-break:break-all">${escHtml(label)}</a>`;
  }

  function linksListaHtml(links) {
    if (!Array.isArray(links) || !links.length) {
      return '<div style="color:#555;padding:4px 2px">Nenhum link coletado.</div>';
    }
    return links.map(l => `<div style="padding:2px 2px">${linkTruncadoHtml(l, 60)}</div>`).join('');
  }

  function badgesHtml(registro) {
    const badges = [];

    if (registro.backredirect_confirmado) {
      const url = registro.backredirect_url;
      if (ehUrlSegura(url)) {
        badges.push(
          `<a class="badge" href="${escHtml(url)}" target="_blank" rel="noopener noreferrer" ` +
          `style="background:#002a1a;color:#00c47a;text-decoration:none" ` +
          `title="${escHtml(url)}">🔙 BR confirmado</a>`
        );
      } else {
        badges.push(
          `<span class="badge" style="background:#002a1a;color:#00c47a" title="${escHtml(url || '')}">🔙 BR confirmado</span>`
        );
      }
    } else if (registro.backredirect_detectado) {
      badges.push(`<span class="badge" style="background:#2a1400;color:#f59e0b">🔙 BR suspeita</span>`);
    }

    if (registro.exit_intent_detectado) {
      badges.push(`<span class="badge" style="background:#1a1a1a;color:#aaa">🚪 Exit intent</span>`);
    }

    return badges.join('');
  }

  function cardHtml(registro) {
    const totalLinks = Array.isArray(registro.links_pagina) ? registro.links_pagina.length : 0;
    const dominio     = registro.dom_final || registro.url_final || '—';

    return `
      <div class="card">
        <div class="card-topo">
          <span class="card-dominio">${escHtml(dominio)}</span>
          <span class="card-hora">${formatarHora(registro.created_at)}</span>
        </div>
        <div class="card-badges">${badgesHtml(registro)}</div>
        <div class="card-urls">
          <div class="card-url-linha"><span class="card-url-label">Original</span>${linkTruncadoHtml(registro.url_original)}</div>
          <div class="card-url-linha"><span class="card-url-label">Final</span>${linkTruncadoHtml(registro.url_final)}</div>
        </div>
        <button class="links-toggle" type="button" data-id="${escHtml(registro.id)}" data-total="${totalLinks}">
          🔗 ${totalLinks} link(s) na página ▾
        </button>
        <div class="links-lista" id="links-${escHtml(registro.id)}" hidden>${linksListaHtml(registro.links_pagina)}</div>
      </div>
    `;
  }

  function renderResumo(registros) {
    const total       = registros.length;
    const confirmados = registros.filter(r => r.backredirect_confirmado).length;
    const suspeitas   = registros.filter(r => !r.backredirect_confirmado && r.backredirect_detectado).length;
    resumoEl.textContent = `${total} página(s) analisada(s) · ${confirmados} com backredirect confirmado · ${suspeitas} com suspeita`;
  }

  function renderLista(registros) {
    if (!registros.length) {
      listaEl.innerHTML = '<div class="vazio">Nenhuma análise registrada nesse dia.</div>';
      return;
    }
    listaEl.innerHTML = registros.map(cardHtml).join('');
  }

  async function carregar() {
    const data = inputData.value;
    listaEl.innerHTML  = '<div class="carregando">Carregando…</div>';
    resumoEl.textContent = '';

    try {
      const registros = await buscarAnalises(data);
      renderResumo(registros);
      renderLista(registros);
    } catch (err) {
      listaEl.innerHTML = `<div class="erro">Erro ao carregar: ${escHtml(err.message)}</div>`;
    }
  }

  listaEl.addEventListener('click', e => {
    const btn = e.target.closest('.links-toggle');
    if (!btn) return;
    const painel = document.getElementById(`links-${btn.dataset.id}`);
    if (!painel) return;
    const vaiAbrir = painel.hidden;
    painel.hidden = !vaiAbrir;
    btn.innerHTML = `🔗 ${btn.dataset.total} link(s) na página ${vaiAbrir ? '▴' : '▾'}`;
  });

  inputData.value = hojeISO();
  inputData.addEventListener('change', carregar);
  carregar();
})();
