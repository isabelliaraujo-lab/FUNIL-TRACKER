-- ============================================================
-- Renomeia o código de nicho LG -> PU nos registros já
-- cadastrados na tabela `funis`.
--
-- O código do app (index.html, main.js, analise.js, criativos.js,
-- style.css e o parser) já foi atualizado para usar "PU" nos
-- filtros, badges, cores e no parser. Rode este script uma vez no
-- SQL Editor do Supabase para que os funis já salvos passem a
-- bater com o novo código.
--
-- É seguro rodar mais de uma vez (WHERE já não encontra nada na
-- segunda execução).
-- ============================================================

UPDATE public.funis SET nicho = 'PU' WHERE nicho = 'LG';
