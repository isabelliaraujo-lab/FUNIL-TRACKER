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
   d) Envio automático (INSERT) após 8s ou no unload, via mensagem para
      o background.js (service worker — não afetado pelo CSP da
      página). Isso é suficiente para o caso comum, mas não para o
      back-redirect real: nesse caso a própria página costuma navegar
      embora (location.href = destino) tão rápido que o content script
      é destruído antes de chrome.runtime.sendMessage conseguir
      entregar a mensagem — na prática, nenhum envio chega no
      background. Por isso o popstate real usa um mecanismo à parte:
      navigator.sendBeacon pra uma Edge Function do Supabase
      (registrar-backredirect, ver supabase/functions/), a única API
      do navegador com garantia de sobreviver ao descarte da página.
      Essa function foi deployada com --no-verify-jwt e usa a service
      role key internamente, então o cliente não precisa mandar
      nenhuma credencial — o que também deixa o corpo como
      text/plain (comportamento padrão do sendBeacon com uma string),
      uma requisição CORS "simples" que não depende de um preflight
      correndo a tempo antes da página descarregar.
      (Tentativa anterior: sendBeacon direto pro REST do PostgREST com
      apikey na query string. Não persistiu em teste real — o registro
      dos 8s existia, mas backredirect_confirmado nunca chegava a
      true — por isso a migração pra Edge Function.)
   ============================================================ */

(function () {
  'use strict';

  if (window.__funilTrackerInjetado) return;
  window.__funilTrackerInjetado = true;

  // URL conhecida no instante do carregamento, comparada a cada popstate
  // real (ver listener mais abaixo) pra decidir se a navegação por history
  // mudou o destino de verdade. Inicializada aqui, incondicionalmente —
  // não reaproveita estado.urlOriginal, que serve a um propósito
  // diferente (o valor enviado como url_original no payload).
  let urlConhecidaAntes = window.location.href;

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
    // Lida na hora, sem setTimeout: por definição o popstate já dispara
    // depois que a navegação por history aconteceu, então
    // window.location.href já reflete o destino real nesse exato instante.
    const urlAntes  = urlConhecidaAntes;
    const urlDepois = window.location.href;

    // Comparação estrita entre as duas strings completas (URL + query
    // string). Bug corrigido aqui: a versão anterior marcava
    // backredirectConfirmado = true incondicionalmente em qualquer
    // popstate, sem nunca checar se o destino realmente mudou — por isso
    // um teste real gravou backredirect_url idêntica a url_original.
    const mudouDeVerdade = urlAntes !== urlDepois;

    // eslint-disable-next-line no-console
    console.log('[Funil Tracker] popstate disparado — URL antes:', urlAntes, '| URL depois:', urlDepois, '| mudou?', mudouDeVerdade);

    if (mudouDeVerdade) {
      estado.backredirectConfirmado = true;
      estado.backredirectUrl = urlDepois;
      if (!estado.backredirectTipos.includes('popstate-disparado')) {
        estado.backredirectTipos.push('popstate-disparado');
      }
      atualizarPainel();

      // Envio de urgência via sendBeacon — ver nota no cabeçalho do
      // arquivo sobre por que isso não pode depender do timer de 8s, do
      // beforeunload nem de chrome.runtime.sendMessage.
      const aceito = enviarBeaconUrgente(construirPayload());
      // eslint-disable-next-line no-console
      console.log('[Funil Tracker] navigator.sendBeacon aceito pelo navegador?', aceito);

      // Evita que o fluxo normal (8s/beforeunload) reenvie com dados já
      // desatualizados por cima do que o beacon acabou de mandar.
      estado.enviado = true;
    }

    // Atualiza ao final do handler — dá suporte a múltiplos disparos de
    // popstate na mesma sessão de página (ex.: back/forward mais de uma
    // vez), cada um comparado contra o destino do disparo anterior.
    urlConhecidaAntes = urlDepois;
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
  // Fluxo normal (8s/beforeunload): mensagem pro background.js, que fala
  // com o Supabase por trás — ver enviarMensagem()/enviarDados() abaixo.
  // Fluxo de urgência (popstate real): sendBeacon direto pro Supabase a
  // partir do próprio content script — ver enviarBeaconUrgente() abaixo.

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

  // Edge Function que aceita o POST sem nenhuma credencial do cliente
  // (deployada com --no-verify-jwt) e faz o UPDATE/INSERT internamente
  // com a service role key — ver supabase/functions/registrar-backredirect.
  // Manda o payload como string (não Blob/JSON) de propósito: isso faz o
  // sendBeacon usar Content-Type text/plain, que é "CORS simples" e não
  // precisa de preflight — nada que dependa de mais uma viagem de rede
  // antes da página descarregar de vez.
  function enviarBeaconUrgente(payload) {
    try {
      const url = `${SUPABASE_URL}/functions/v1/registrar-backredirect`;
      return navigator.sendBeacon(url, JSON.stringify(payload));
    } catch (err) {
      console.error('[Funil Tracker] erro ao montar/enviar o beacon de urgência:', err);
      return false;
    }
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
