-- ============================================================
-- Cria a tabela `analises_extensao`, onde a extensão de navegador
-- funil-tracker-extension grava os resultados da análise em tempo
-- real de páginas de anúncio (exit intent, back-redirect).
--
-- Também adiciona a coluna `analise_extensao` (jsonb) na tabela
-- `funis`, usada para guardar o resumo da análise correspondente
-- quando um funil é salvo (ver main.js: tentarAnexarAnaliseExtensao).
-- Fica NULL quando nenhuma análise da extensão foi encontrada para
-- o `dom_final` daquele funil.
--
-- Rode este script uma vez no SQL Editor do Supabase ANTES de testar
-- a extensão. É seguro rodar mais de uma vez (IF NOT EXISTS).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.analises_extensao (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  url_original text,
  url_final text,
  dom_final text,
  links_pagina jsonb,
  exit_intent_detectado boolean DEFAULT false,
  backredirect_detectado boolean DEFAULT false,
  backredirect_confirmado boolean DEFAULT false,
  backredirect_url text,
  backredirect_tipo jsonb,
  data date DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.analises_extensao ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "leitura publica" ON public.analises_extensao;
CREATE POLICY "leitura publica" ON public.analises_extensao FOR SELECT USING (true);

DROP POLICY IF EXISTS "insercao publica" ON public.analises_extensao;
CREATE POLICY "insercao publica" ON public.analises_extensao FOR INSERT WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_analises_extensao_dom_final ON public.analises_extensao (dom_final);

ALTER TABLE public.funis ADD COLUMN IF NOT EXISTS analise_extensao jsonb;
