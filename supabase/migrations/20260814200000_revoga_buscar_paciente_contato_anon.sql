-- Remove o acesso de `authenticated` à função `buscar_paciente_contato`.
--
-- APLICADO EM PRODUÇÃO em 14/08/2026, com autorização do responsável.
--
-- PROBLEMA: a função é SECURITY DEFINER (ignora RLS) e retorna
-- `nome, cpf, telefone, data_nascimento, associado, convenio_nome`.
-- Verificado no banco de produção antes da correção:
--   * prosecdef = true              -> ignora o RLS
--   * não contém `is_member` nem `auth.uid()` -> NÃO confere quem chama
--   * grantees: authenticated, postgres, service_role
--
-- Como o filtro de nome é por PREFIXO (`p.nome LIKE _nome || '%'`) e os nomes
-- são gravados em maiúsculas por gatilho, qualquer usuário `authenticated`
-- conseguia enumerar a base inteira (251.908 pacientes) em blocos de 5,
-- obtendo CPF, telefone e data de nascimento. Dado pessoal sensível de saúde
-- (LGPD, art. 11).
--
-- O `authenticated` NÃO é uma barreira significativa aqui porque:
--   * existe rota de cadastro aberta (`/signup`, listada até no sitemap.xml);
--   * a função não exige vínculo com a clínica — no momento da correção havia
--     6 contas sem nenhum vínculo em `clinica_memberships`.
--
-- NOTA DE CORREÇÃO: os dumps versionados (`schema_completo.sql`, linha 12028)
-- mostram um GRANT para `anon`. Esse GRANT NÃO estava presente na produção —
-- os dumps não refletiam o estado real do banco. A exposição real era via
-- `authenticated`, não anônima.
--
-- POR QUE É SEGURO REVOGAR: a função tem um único chamador em todo o sistema —
-- `src/lib/whatsapp.server.ts` (identificação do paciente pela Nina) — e ele
-- usa a chave `service_role`, que NÃO é afetada por estes REVOKEs. Nenhuma
-- tela do sistema chama esta função pelo cliente do navegador.
--
-- ESTADO APÓS A CORREÇÃO (verificado): grantees = postgres, service_role.
--
-- ROLLBACK (não recomendado — reabre a exposição):
--   GRANT EXECUTE ON FUNCTION public.buscar_paciente_contato(uuid, text, text, text)
--     TO authenticated;

REVOKE EXECUTE ON FUNCTION public.buscar_paciente_contato(uuid, text, text, text)
  FROM PUBLIC, anon, authenticated;

-- Garante que o servidor (Nina) continua funcionando.
GRANT EXECUTE ON FUNCTION public.buscar_paciente_contato(uuid, text, text, text)
  TO service_role;
