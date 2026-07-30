/* ============================================================
   content.js — analisa a página de anúncio em tempo real
   ============================================================
   a) Varredura estática dos <script> da página (mesmos padrões do
      script Python já usado no projeto: pushState/replaceState/
      popstate → suspeita de back-redirect; mouseleave/beforeunload
      + overlay/modal → suspeita de exit-intent).
   b) Detecção comportamental real: um listener de `popstate` de
      verdade — se disparar enquanto o usuário está na página, isso
      é confirmação, não suspeita.
   c) Painel visual fixo no canto inferior direito.
   d) Envio automático (INSERT) após 8s ou no unload; se o popstate real
      disparar antes ou depois desse envio, o resultado é gravado
      imediatamente (INSERT ou PATCH, conforme o caso) — sem depender
      do timer nem do beforeunload. Quem fala com o Supabase é sempre o
      background.js (service worker): páginas de anúncio costumam ter
      um CSP que bloqueia fetch para domínios externos a partir do
      content script, então aqui só enviamos mensagens via
      chrome.runtime.sendMessage — o background roda num contexto
      isolado, não afetado pelo CSP da página.
   ============================================================ */

(function () {
  'use strict';

  if (window.__funilTrackerInjetado) return;
  window.__funilTrackerInjetado = true;

  const REGEX_BACKREDIRECT = [
    { nome: 'pushState',        re: /history\s*\.\s*pushState\s*\(/i },
    { nome: 'replaceState',     re: /history\s*\.\s*replaceState\s*\(/i },
    { nome: 'popstate-listener', re: /addEventListener\s*\(\s*['"]popstate['"]/i },
    { nome: 'onpopstate',       re: /onpopstate\s*=/i },
  ];
  const RE_MOUSELEAVE   = /mouseleave/i;
  const RE_BEFOREUNLOAD = /beforeunload/i;
  const RE_OVERLAY      = /(overlay|modal|popup)/i;

  const estado = {
    urlOriginal: window.location.href,
    links: [],
    exitIntentDetectado: false,
    backredirectDetectado: false,   // suspeita (varredura estática)
    backredirectConfirmado: false,  // confirmado (evento popstate real)
    backredirectUrl: null,
    backredirectTipos: [],
    verificandoScripts: true,
    enviado: false,     // já existe um registro salvo no Supabase para esta análise
    registroId: null,   // id do registro salvo, para permitir PATCH depois
  };

  const MAX_LINKS = 300;

  // ── a) Varredura estática ────────────────────────────────────────────

  function analisarTextoScript(texto) {
    if (!texto) return;

    for (const { nome, re } of REGEX_BACKREDIRECT) {
      if (re.test(texto)) {
        estado.backredirectDetectado = true;
        if (!estado.backredirectTipos.includes(nome)) estado.backredirectTipos.push(nome);
      }
    }

    const temExitPattern = (RE_MOUSELEAVE.test(texto) || RE_BEFOREUNLOAD.test(texto)) && RE_OVERLAY.test(texto);
    if (temExitPattern) estado.exitIntentDetectado = true;
  }

  async function varrerScripts() {
    const scripts = Array.from(document.getElementsByTagName('script'));
    const externos = [];

    for (const s of scripts) {
      if (s.src) {
        externos.push(s.src);
      } else if (s.textContent) {
        analisarTextoScript(s.textContent);
      }
    }

    await Promise.allSettled(
      externos.map(async src => {
        try {
          const resp = await fetch(src, { credentials: 'omit' });
          if (!resp.ok) return;
          const texto = await resp.text();
          analisarTextoScript(texto);
        } catch {
          // cross-origin sem CORS, bloqueado, ou rede indisponível — ignora
        }
      })
    );

    estado.verificandoScripts = false;
    atualizarPainel();
  }

  function coletarLinks() {
    const hrefs = Array.from(document.querySelectorAll('a[href]'))
      .map(a => a.getAttribute('href'))
      .filter(Boolean)
      .map(h => h.trim());
    estado.links = Array.from(new Set(hrefs)).slice(0, MAX_LINKS);
  }

  // ── b) Detecção comportamental real de back-redirect ─────────────────

  window.addEventListener('popstate', () => {
    estado.backredirectConfirmado = true;
    estado.backredirectUrl = window.location.href;
    if (!estado.backredirectTipos.includes('popstate-disparado')) {
      estado.backredirectTipos.push('popstate-disparado');
    }
    atualizarPainel();

    // Envio/atualização imediata — não espera o timer de 8s nem o
    // beforeunload, porque a página pode navegar embora de verdade a
    // qualquer momento a partir daqui (é o próprio back-redirect).
    if (estado.enviado && estado.registroId) {
      // Fire-and-forget: a página pode navegar embora logo em seguida,
      // então não faz sentido esperar a resposta do background aqui.
      enviarMensagem({
        tipo: 'atualizar_backredirect',
        id: estado.registroId,
        campos: {
          backredirect_confirmado: true,
          backredirect_url: estado.backredirectUrl,
        },
      });
    } else {
      enviarDados();
    }
  });

  // ── c) Painel visual fixo ─────────────────────────────────────────────

  let painelEl = null;
  let painelFechado = false;

  function criarPainel() {
    if (painelEl || painelFechado) return;

    painelEl = document.createElement('div');
    painelEl.id = 'funil-tracker-painel';
    painelEl.style.cssText = `
      position: fixed;
      bottom: 16px;
      right: 16px;
      z-index: 999999;
      background: #0a0a0a;
      border: 1px solid rgba(0, 212, 255, 0.35);
      border-radius: 10px;
      color: #fff;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 12px;
      line-height: 1.6;
      width: 230px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
      padding: 10px 12px;
      pointer-events: auto;
    `;

    document.documentElement.appendChild(painelEl);
    renderPainel();
  }

  function renderPainel() {
    if (!painelEl) return;

    const linhaExit = estado.exitIntentDetectado
      ? '<span style="color:#f59e0b">sim ⚠</span>'
      : '<span style="color:#888">não</span>';

    let linhaBackredirect;
    if (estado.backredirectConfirmado) {
      linhaBackredirect = `<span style="color:#00c47a">confirmado ✅</span>`;
    } else if (estado.verificandoScripts) {
      linhaBackredirect = `<span style="color:#00d4ff">verificando…</span>`;
    } else if (estado.backredirectDetectado) {
      linhaBackredirect = `<span style="color:#f59e0b">suspeita ⚠</span>`;
    } else {
      linhaBackredirect = '<span style="color:#888">não detectado</span>';
    }

    const urlLinha = estado.backredirectConfirmado && estado.backredirectUrl
      ? `<div style="margin-top:4px;word-break:break-all;font-size:10px;color:#00d4ff">${escHtml(estado.backredirectUrl)}</div>`
      : '';

    painelEl.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;border-bottom:1px solid rgba(255,255,255,0.08);padding-bottom:6px">
        <span style="font-weight:700;color:#00d4ff;letter-spacing:.02em">🎯 Funil Tracker</span>
        <button id="funil-tracker-fechar" title="Fechar" style="background:none;border:none;color:#888;font-size:16px;line-height:1;cursor:pointer;padding:0 2px">×</button>
      </div>
      <div style="display:flex;justify-content:space-between;gap:8px">
        <span style="color:#888">Links na página</span>
        <span style="font-weight:600">${estado.links.length}</span>
      </div>
      <div style="display:flex;justify-content:space-between;gap:8px">
        <span style="color:#888">Exit intent</span>
        ${linhaExit}
      </div>
      <div style="display:flex;justify-content:space-between;gap:8px">
        <span style="color:#888">Back-redirect</span>
        ${linhaBackredirect}
      </div>
      ${urlLinha}
    `;

    const btnFechar = painelEl.querySelector('#funil-tracker-fechar');
    if (btnFechar) {
      btnFechar.addEventListener('click', () => {
        painelFechado = true;
        painelEl.remove();
        painelEl = null;
      });
    }
  }

  function atualizarPainel() {
    if (painelFechado) return;
    if (!painelEl) criarPainel();
    else renderPainel();
  }

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── d) Envio automático dos dados coletados ──────────────────────────
  // Todo o acesso ao Supabase é feito pelo background.js — este content
  // script só troca mensagens com ele via chrome.runtime.sendMessage.

  function construirPayload() {
    return {
      url_original: estado.urlOriginal,
      url_final: window.location.href,
      links_pagina: estado.links,
      exit_intent_detectado: estado.exitIntentDetectado,
      backredirect_detectado: estado.backredirectDetectado,
      backredirect_confirmado: estado.backredirectConfirmado,
      backredirect_url: estado.backredirectUrl || null,
      backredirect_tipo: estado.backredirectTipos,
    };
  }

  function enviarMensagem(msg) {
    return new Promise(resolve => {
      try {
        chrome.runtime.sendMessage(msg, resposta => {
          void chrome.runtime.lastError; // nada a fazer se não houver quem responda
          resolve(resposta || null);
        });
      } catch {
        // extensão pode ter sido recarregada/desabilitada durante a navegação
        resolve(null);
      }
    });
  }

  let envioPromise = null;

  function enviarDados() {
    if (estado.enviado) return Promise.resolve();
    if (envioPromise) return envioPromise;

    const payloadEnviado = construirPayload();

    envioPromise = enviarMensagem({ tipo: 'inserir_analise', payload: payloadEnviado })
      .then(resposta => {
        if (!resposta || resposta.erro) {
          console.error('[Funil Tracker] erro ao salvar análise:', resposta && resposta.erro);
          return; // não marca como enviado — uma próxima chamada pode tentar de novo
        }

        estado.enviado = true;
        if (resposta.id) estado.registroId = resposta.id;

        // Se o back-redirect foi confirmado bem no meio dessa requisição
        // (corrida com o listener de popstate), o payload já enviado
        // ficou desatualizado — sincroniza agora com um PATCH.
        const desatualizado = estado.backredirectConfirmado && !payloadEnviado.backredirect_confirmado;
        if (desatualizado && estado.registroId) {
          enviarMensagem({
            tipo: 'atualizar_backredirect',
            id: estado.registroId,
            campos: {
              backredirect_confirmado: true,
              backredirect_url: estado.backredirectUrl,
            },
          });
        }
      })
      .finally(() => { envioPromise = null; });

    return envioPromise;
  }

  // ── Inicialização ─────────────────────────────────────────────────────

  coletarLinks();
  criarPainel();
  varrerScripts();

  setTimeout(enviarDados, 8000);
  window.addEventListener('beforeunload', enviarDados);
})();
