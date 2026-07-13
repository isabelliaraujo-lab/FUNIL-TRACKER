-- ============================================================
-- Adiciona a coluna `nicho` na tabela `relatorios`.
--
-- Antes desta migration, um relatório semanal era salvo como UM
-- único registro contendo todos os nichos preenchidos na sessão
-- (campo conteudo.activeNichos + conteudo.nichoData).
--
-- A partir desta mudança, cada nicho é preenchido e salvo
-- separadamente: um registro por nicho por semana. A coluna
-- `nicho` (ex: 'WL', 'DB', 'MM'...) identifica a qual nicho aquele
-- registro pertence. Fica NULL para registros antigos (multi-nicho)
-- e para relatórios diários, que não usam nicho.
--
-- É seguro rodar mais de uma vez (ADD COLUMN IF NOT EXISTS).
-- ============================================================

ALTER TABLE public.relatorios ADD COLUMN IF NOT EXISTS nicho text;

CREATE INDEX IF NOT EXISTS idx_relatorios_nicho ON public.relatorios (nicho);
