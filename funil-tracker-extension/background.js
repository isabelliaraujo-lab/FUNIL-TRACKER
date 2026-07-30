/* ============================================================
   background.js — service worker (Manifest V3)
   Único ponto do projeto que fala com o Supabase. O content script
   roda dentro da página do anúncio e está sujeito ao CSP dela — em
   muitos sites isso bloqueia fetch para domínios externos e derruba
   com "TypeError: Failed to fetch". O service worker roda num
   contexto isolado, imune ao CSP da página, então é ele quem grava
   na tabela `analises_extensao` via REST API (PostgREST).
   ============================================================ */

importScripts('supabase-config.js');

// Mesma normalização de domínio usada no parser.js do FUNIL-TRACKER:
// hostname sem "www." e em maiúsculas — garante que o `dom_final`
// gravado aqui bata com o `domFinal` já salvo na tabela `funis`.
function extrairDominio(url) {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./i, '').toUpperCase();
  } catch {
    return null;
  }
}

// keepalive:true mesmo aqui no background: a corrida com o unload da
// aba ainda pode existir (ex.: a aba fecha bem no instante em que o
// PATCH do back-redirect está sendo enviado).

async function inserirAnalise(dados) {
  const dom_final = extrairDominio(dados.url_final);

  const resposta = await fetch(`${SUPABASE_URL}/rest/v1/analises_extensao`, {
    method: 'POST',
    keepalive: true,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      url_original: dados.url_original,
      url_final: dados.url_final,
      dom_final,
      links_pagina: dados.links_pagina,
      exit_intent_detectado: dados.exit_intent_detectado,
      backredirect_detectado: dados.backredirect_detectado,
      backredirect_confirmado: dados.backredirect_confirmado,
      backredirect_url: dados.backredirect_url || null,
      backredirect_tipo: dados.backredirect_tipo,
    }),
  });

  if (!resposta.ok) {
    throw new Error(`Supabase respondeu ${resposta.status}: ${await resposta.text()}`);
  }

  const linhas = await resposta.json();
  return Array.isArray(linhas) ? linhas[0] : linhas;
}

async function atualizarBackredirect(id, campos) {
  const resposta = await fetch(`${SUPABASE_URL}/rest/v1/analises_extensao?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    keepalive: true,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(campos),
  });

  if (!resposta.ok) {
    throw new Error(`Supabase respondeu ${resposta.status}: ${await resposta.text()}`);
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || typeof msg.tipo !== 'string') return;

  if (msg.tipo === 'inserir_analise') {
    inserirAnalise(msg.payload)
      .then(registro => sendResponse({ id: registro && registro.id }))
      .catch(err => {
        console.error('[Funil Tracker] erro ao inserir análise no Supabase:', err);
        sendResponse({ erro: String(err) });
      });
    return true; // mantém o canal aberto para a resposta assíncrona
  }

  if (msg.tipo === 'atualizar_backredirect') {
    atualizarBackredirect(msg.id, msg.campos)
      .then(() => sendResponse({ ok: true }))
      .catch(err => {
        console.error('[Funil Tracker] erro ao atualizar back-redirect no Supabase:', err);
        sendResponse({ ok: false, erro: String(err) });
      });
    return true;
  }
});
