// ============================================================
// registrar-backredirect — Supabase Edge Function
// ============================================================
// Recebe a confirmação de back-redirect enviada pelo content.js via
// navigator.sendBeacon (fluxo de urgência do popstate — ver content.js).
// sendBeacon não permite headers customizados, então esta function não
// exige nenhuma credencial do cliente: ela roda com a
// SUPABASE_SERVICE_ROLE_KEY (injetada automaticamente pelo runtime da
// Edge Function, nunca exposta no client) para gravar direto no banco.
//
// Deploy: supabase functions deploy registrar-backredirect --no-verify-jwt
// (--no-verify-jwt desativa a checagem de JWT/apikey do gateway, já que
// o cliente não consegue enviar Authorization via sendBeacon)
//
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já existem automaticamente
// como variáveis de ambiente em toda Edge Function — não é preciso (e
// não é possível: nomes começando com SUPABASE_ são reservados pelo
// próprio Supabase) rodar `supabase secrets set` para elas.
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

// Requisição pode chegar como CORS "simples" (text/plain, sem headers
// customizados — é assim que content.js manda via sendBeacon, de
// propósito, pra não precisar de preflight). Por isso lemos o corpo como
// texto puro e fazemos o parse manualmente, em vez de exigir
// Content-Type: application/json.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

// Mesma normalização usada em background.js/parser.js do FUNIL-TRACKER:
// hostname sem "www." e em maiúsculas.
function extrairDominio(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname.replace(/^www\./i, '').toUpperCase()
  } catch {
    return null
  }
}

interface Payload {
  url_original?: string
  url_final?: string
  dom_final?: string
  links_pagina?: unknown
  exit_intent_detectado?: boolean
  backredirect_detectado?: boolean
  backredirect_confirmado?: boolean
  backredirect_url?: string | null
  backredirect_tipo?: unknown
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ erro: 'method not allowed' }, 405)
  }

  let payload: Payload
  try {
    // req.json() também funcionaria, mas fazemos o parse manual do texto
    // porque o corpo pode chegar com Content-Type: text/plain (sendBeacon).
    payload = JSON.parse(await req.text())
  } catch {
    return jsonResponse({ erro: 'corpo invalido' }, 400)
  }

  const url_original = payload.url_original
  if (!url_original) {
    return jsonResponse({ erro: 'url_original é obrigatório' }, 400)
  }

  const backredirect_confirmado = payload.backredirect_confirmado ?? true
  const backredirect_url = payload.backredirect_url ?? null

  // Pega o registro mais recente com esse url_original (o envio normal
  // dos 8s pode ter criado mais de um, em recarregamentos da mesma
  // página) pra atualizar exatamente esse.
  const { data: existente, error: erroSelect } = await supabase
    .from('analises_extensao')
    .select('id')
    .eq('url_original', url_original)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (erroSelect) {
    console.error('[registrar-backredirect] erro ao buscar registro existente:', erroSelect)
    return jsonResponse({ erro: erroSelect.message }, 500)
  }

  if (existente) {
    const { error: erroUpdate } = await supabase
      .from('analises_extensao')
      .update({ backredirect_confirmado, backredirect_url })
      .eq('id', existente.id)

    if (erroUpdate) {
      console.error('[registrar-backredirect] erro ao atualizar:', erroUpdate)
      return jsonResponse({ erro: erroUpdate.message }, 500)
    }

    return jsonResponse({ ok: true, modo: 'update', id: existente.id })
  }

  // Nenhuma linha encontrada — o envio normal dos 8s ainda não rodou (ou
  // falhou). Faz o INSERT completo como fallback, pra não perder a
  // confirmação do back-redirect.
  const dom_final = payload.dom_final || extrairDominio(payload.url_final || url_original)

  const { data: inserido, error: erroInsert } = await supabase
    .from('analises_extensao')
    .insert({
      url_original,
      url_final: payload.url_final || url_original,
      dom_final,
      links_pagina: payload.links_pagina ?? [],
      exit_intent_detectado: payload.exit_intent_detectado ?? false,
      backredirect_detectado: true,
      backredirect_confirmado,
      backredirect_url,
      backredirect_tipo: payload.backredirect_tipo ?? [],
    })
    .select('id')
    .single()

  if (erroInsert) {
    console.error('[registrar-backredirect] erro ao inserir (fallback):', erroInsert)
    return jsonResponse({ erro: erroInsert.message }, 500)
  }

  return jsonResponse({ ok: true, modo: 'insert', id: inserido?.id })
})
