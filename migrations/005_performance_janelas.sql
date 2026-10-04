-- ============================================================
-- Adiciona performance por janela de tempo (7 e 14 dias) na
-- tabela `funis`.
--
-- As colunas já existentes `gasto` e `conversao` passam a
-- representar a janela de 30 dias — nenhum dado é migrado ou
-- movido. Aqui só criamos os campos das janelas menores:
--   gasto_7d / conversao_7d    → últimos 7 dias
--   gasto_14d / conversao_14d  → últimos 14 dias
-- Ficam NULL quando a janela não foi preenchida. O ROAS é
-- calculado no front (conversão ÷ gasto), não é gravado.
--
-- Rode este script uma vez no SQL Editor do Supabase ANTES de
-- subir o código (senão o save falha com coluna inexistente).
-- É seguro rodar mais de uma vez (IF NOT EXISTS).
-- ============================================================

ALTER TABLE public.funis
  ADD COLUMN IF NOT EXISTS gasto_7d       numeric,
  ADD COLUMN IF NOT EXISTS conversao_7d   numeric,
  ADD COLUMN IF NOT EXISTS gasto_14d      numeric,
  ADD COLUMN IF NOT EXISTS conversao_14d  numeric;
