-- Remove o resíduo da importação do sistema legado da Menino Jesus (jun/2026).
--
-- MOTIVO (LGPD): `_mj_import_csv` e `_mj_dedup` guardam a carga bruta do CSV
-- legado em texto puro — nome, CPF, sexo, e-mail, telefones, data de
-- nascimento e endereço completo — de pacientes que já foram migrados para
-- `public.pacientes`. São cópias integrais de dados pessoais mantidas sem
-- finalidade ativa, o que é exatamente o que a minimização exige eliminar.
-- `_mj_dedup` ainda mantém índice sobre `cpf_digits` (CPF só com dígitos).
--
-- NÃO havia vazamento: as três tabelas têm RLS habilitada e zero policies,
-- então anon/authenticated nunca as leram pela Data API — só o service_role
-- alcançava. O problema é a retenção, não a exposição.
--
-- SEGURANÇA DA REMOÇÃO (verificado antes de escrever esta migration):
--   - Nenhum código da aplicação lê estas tabelas nem chama estas funções.
--     A única menção em src/ é o types.ts gerado pelo Supabase CLI.
--   - Nenhuma view, materialized view ou foreign key depende delas.
--   - A última migration a tocar no assunto (20260618235955) apenas ligou RLS
--     em `_mj_match_plan`, descrevendo-a como "internal staging" — ou seja, o
--     resíduo foi isolado na época, mas nunca removido.
--
-- Sem CASCADE de propósito: se algum objeto inesperado depender destas
-- tabelas, a migration falha em vez de derrubar esse objeto junto.
--
-- Reexecutar a importação, se um dia for preciso, parte do CSV original —
-- estas tabelas eram estado intermediário descartável, não fonte de verdade.

-- 1) Funções auxiliares do lote de importação (não usadas pela aplicação).
--    Identificadas por tipo de argumento; os nomes de parâmetro variaram
--    entre redefinições, mas a assinatura efetiva é uma só de cada.
DROP FUNCTION IF EXISTS public._mj_apply_batch(integer);
DROP FUNCTION IF EXISTS public._mj_set_batch(integer);
DROP FUNCTION IF EXISTS public._mj_tmp_batch(integer);
DROP FUNCTION IF EXISTS public._mj_null_all();

-- 2) Tabelas de staging. Ordem: derivadas antes da origem.
DROP TABLE IF EXISTS public._mj_match_plan;
DROP TABLE IF EXISTS public._mj_dedup;
DROP TABLE IF EXISTS public._mj_import_csv;
