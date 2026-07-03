-- ============================================================
-- Corrige "erro ao salvar" ao Colar Texto / salvar funis
--
-- Causa raiz: os commits que adicionaram os campos "Mecanismo" e
-- "Print SimilarWeb/SEMrush" passaram a enviar as colunas
-- `mecanismo` e `print_trafego` em TODO upsert na tabela `funis`
-- (supabase.js → toRow), mas essas colunas nunca foram criadas na
-- tabela real no Supabase. O PostgREST rejeita o upsert inteiro com
-- "Could not find the 'mecanismo' column of 'funis' in the schema
-- cache" — por isso nenhum funil era persistido (só aparecia na tela
-- pela atualização otimista local, e sumia ao recarregar).
--
-- Rode este script uma vez no SQL Editor do Supabase (Project →
-- SQL Editor → New query) para adicionar as colunas que faltam.
-- É seguro rodar mais de uma vez (IF NOT EXISTS).
-- ============================================================

ALTER TABLE public.funis
  ADD COLUMN IF NOT EXISTS mecanismo     text,
  ADD COLUMN IF NOT EXISTS print_trafego text;

-- Confere que todas as colunas usadas pelo app (supabase.js → toRow)
-- existem na tabela. Rode este SELECT para conferir manualmente:
--
-- select column_name from information_schema.columns
-- where table_schema = 'public' and table_name = 'funis'
-- order by column_name;
--
-- Colunas esperadas: id, data, ad_id, conta, nicho, produto, mecanismo,
-- url_anuncio, url_anuncio_full, url_vsl, views, famoso, dom_anuncio,
-- dom_anuncio_full, dom_final, dom_final_full, split, obs, gasto,
-- conversao, moeda, hora, anuncios, views_historico, tag_lateral,
-- print_trafego, created_at.
