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

  function badgesHtml(registro) {
    const badges = [];

    if (registro.backredirect_confirmado) {
      const href = registro.backredirect_url || '#';
      badges.push(
        `<a class="badge" href="${escHtml(href)}" target="_blank" rel="noopener noreferrer" ` +
        `style="background:#002a1a;color:#00c47a;text-decoration:none" ` +
        `title="${escHtml(registro.backredirect_url || '')}">🔙 BR confirmado</a>`
      );
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
        <div class="card-links">🔗 ${totalLinks} link(s) na página</div>
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

  inputData.value = hojeISO();
  inputData.addEventListener('change', carregar);
  carregar();
})();
