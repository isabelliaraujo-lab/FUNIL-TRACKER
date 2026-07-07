-- ============================================================
-- Renomeia os códigos de nicho ML -> MM e NP -> NR nos registros
-- já cadastrados na tabela `funis`.
--
-- O código do app (index.html, main.js, tabela.js, analise.js,
-- criativos.js, relatorio-semanal.html, style.css) já foi atualizado
-- para usar "MM" e "NR" nos filtros, badges, cores e no parser. Rode
-- este script uma vez no SQL Editor do Supabase para que os funis já
-- salvos passem a bater com os novos códigos.
--
-- É seguro rodar mais de uma vez (WHERE já não encontra nada na
-- segunda execução).
-- ============================================================

UPDATE public.funis SET nicho = 'MM' WHERE nicho = 'ML';
UPDATE public.funis SET nicho = 'NR' WHERE nicho = 'NP';
