/* ============================================================
   background.js — service worker (Manifest V3)
   Recebe os dados coletados pelo content script e grava direto
   na tabela `analises_extensao` do mesmo Supabase do FUNIL-TRACKER,
   via REST API (PostgREST).
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

async function salvarAnalise(dados) {
  const dom_final = extrairDominio(dados.url_final);

  const resposta = await fetch(`${SUPABASE_URL}/rest/v1/analises_extensao`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
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
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== 'FUNIL_TRACKER_ANALISE') return;

  salvarAnalise(msg.dados)
    .then(() => sendResponse({ ok: true }))
    .catch(err => {
      console.error('[Funil Tracker] erro ao salvar análise no Supabase:', err);
      sendResponse({ ok: false, erro: String(err) });
    });

  return true; // mantém o canal aberto para a resposta assíncrona
});
