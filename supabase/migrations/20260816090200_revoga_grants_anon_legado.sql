-- ALTO 8 — grants antigos para `anon` em tabelas com dado de paciente.
--
-- PROBLEMA
-- As migrations do totem (jul/2026) concederam acesso direto ao role `anon`:
--
--   GRANT SELECT ON public.clinicas TO anon;
--   GRANT SELECT ON public.senhas TO anon;
--   GRANT SELECT, INSERT ON public.pacientes TO anon;
--   GRANT SELECT, INSERT ON public.paciente_biometria TO anon;
--
-- As policies abertas que acompanhavam esses grants já foram removidas e
-- substituídas por RPCs SECURITY DEFINER de superfície mínima
-- (resolver_clinica_publica, painel_senhas_publicas, totem_match_biometria,
-- totem_upsert_paciente). Hoje, portanto, o grant é inerte: todas as policies
-- dessas tabelas são TO authenticated, e anon recebe zero linhas.
--
-- O risco é futuro e silencioso: basta uma policy nova sem cláusula TO (role
-- PUBLIC implícito, que inclui anon), ou um DISABLE ROW LEVEL SECURITY durante
-- manutenção, para que o privilégio remanescente vire leitura completa da base
-- de pacientes pela chave anon — que é pública e está no bundle. Privilégio sem
-- uso é dívida: some com ele.
--
-- CORREÇÃO
-- Revogar o acesso direto. Os fluxos públicos (totem, painel de senhas, landing
-- pages) continuam funcionando porque passam por funções SECURITY DEFINER, que
-- executam com os privilégios do dono e não dependem do grant de anon.
--
-- IMPACTO ESPERADO
-- Nenhum. Se algum fluxo público quebrar depois desta migration, isso é a
-- informação útil: significa que ele estava lendo a tabela direto com a chave
-- anon, e é isso que precisa virar RPC.
--
-- VALIDAR DEPOIS DE APLICAR
--   -- não deve retornar nenhuma linha para estas tabelas:
--   select table_name, privilege_type from information_schema.role_table_grants
--    where grantee = 'anon'
--      and table_name in ('pacientes','paciente_biometria','senhas','clinicas');
--
--   -- e, do lado do app: abrir o totem, o painel de senhas e uma landing page.

REVOKE ALL ON public.pacientes FROM anon;
REVOKE ALL ON public.paciente_biometria FROM anon;
REVOKE ALL ON public.senhas FROM anon;
REVOKE ALL ON public.clinicas FROM anon;
