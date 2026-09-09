-- ============================================================================
-- Clientes: lista dos cadastros mais recentes, com o atendente que cadastrou
-- Data: 09/09/2026
--
-- O QUE ESTE ARQUIVO FAZ
-- Cria a função que alimenta a tela "Cadastros recentes". É só leitura: não
-- altera nem apaga nada.
--
-- POR QUE
-- A supervisão precisa bater o olho nas últimas fichas criadas no dia e ver se
-- a numeração está andando de um em um, sem desvio. Hoje isso só dá para
-- conferir consultando o banco.
--
-- DE ONDE SAI O ATENDENTE
-- A tabela `pacientes` não guarda quem cadastrou. O nome vem do histórico
-- (`audit_log`), que registra o INSERT com o usuário logado. Quando o cadastro
-- veio da importação do sistema antigo não há usuário, e a tela mostra
-- "não identificado" — é o correto, não um defeito.
--
-- QUEM PODE USAR
-- Admin, gestor, supervisor e recepção da própria clínica.
--
-- COMO RODAR
-- Cole este arquivo inteiro no SQL editor do Lovable Cloud e execute.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.pacientes_cadastros_recentes(
  _clinica_id uuid,
  _limite int DEFAULT 100
)
RETURNS TABLE (
  paciente_id       uuid,
  nome              text,
  codigo_prontuario text,
  criado_em         timestamptz,
  atendente         text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _n int;
BEGIN
  IF NOT public.has_any_role(
       auth.uid(), _clinica_id,
       ARRAY['admin','gestor','supervisor','recepcao']::app_role[]) THEN
    RAISE EXCEPTION 'Voce nao tem permissao para ver os cadastros desta clinica.';
  END IF;

  -- Teto de segurança: a tela nunca precisa de mais que isso, e um limite
  -- absurdo vindo do navegador nao pode virar uma varredura de 252 mil linhas.
  _n := least(greatest(coalesce(_limite, 100), 1), 500);

  RETURN QUERY
  SELECT p.id,
         p.nome,
         p.codigo_prontuario,
         p.created_at,
         COALESCE(pf.nome, a.user_email, 'nao identificado')::text
    FROM public.pacientes p
    -- LATERAL com LIMIT 1 usa o indice idx_audit_record e para no primeiro
    -- registro; sem isso a juncao varreria o historico inteiro.
    LEFT JOIN LATERAL (
      SELECT al.user_email, al.user_id
        FROM public.audit_log al
       WHERE al.record_id = p.id::text
         AND al.table_name = 'pacientes'
         AND al.action = 'INSERT'
       ORDER BY al.created_at
       LIMIT 1
    ) a ON true
    LEFT JOIN public.profiles pf ON pf.id = a.user_id
   WHERE p.clinica_id = _clinica_id
   ORDER BY p.created_at DESC
   LIMIT _n;
END;
$function$;

REVOKE ALL ON FUNCTION public.pacientes_cadastros_recentes(uuid, int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.pacientes_cadastros_recentes(uuid, int) TO authenticated;

COMMIT;

-- ============================================================================
-- CONFERÊNCIA (rode depois; é só leitura)
-- ============================================================================
-- SELECT * FROM public.pacientes_cadastros_recentes('7570ddde-8c1c-4b55-ba72-cf12b2a6c940', 10);
