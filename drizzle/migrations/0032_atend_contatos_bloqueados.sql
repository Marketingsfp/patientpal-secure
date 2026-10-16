-- Contatos bloqueados no atendimento (decisão do usuário, 16/10/2026).
--
-- Bloqueio no sistema: as mensagens do número continuam sendo guardadas
-- (histórico e LGPD), mas a Nina não responde, a conversa não entra na fila nem
-- nos contadores e ninguém é notificado. Só supervisão e administração
-- bloqueiam e desbloqueiam. O número fica só com dígitos.

CREATE TABLE IF NOT EXISTS public.atend_contatos_bloqueados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  telefone text NOT NULL CHECK (telefone ~ '^[0-9]{8,15}$'),
  motivo text NOT NULL CHECK (char_length(btrim(motivo)) BETWEEN 3 AND 500),
  bloqueado_por uuid NOT NULL,
  bloqueado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinica_id, telefone)
);

-- Acesso pela API do sistema (sem isso a tela recebe erro de permissão).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.atend_contatos_bloqueados TO authenticated;
GRANT ALL ON public.atend_contatos_bloqueados TO service_role;

-- Mesma regra de supervisão usada pelo servidor (acesso-conversa.server.ts):
-- gestor da clínica, administração do atendimento ou supervisão de departamento.
CREATE OR REPLACE FUNCTION public.atend_pode_bloquear_contato(_user_id uuid, _clinica_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _user_id IS NOT NULL AND (
    public.can_manage_clinica(_user_id, _clinica_id)
    OR public.atend_usuario_e_admin(_user_id, _clinica_id)
    OR EXISTS (
      SELECT 1 FROM public.atend_departamento_membros m
      WHERE m.clinica_id = _clinica_id
        AND m.user_id = _user_id
        AND m.role IN ('supervisor', 'gestor', 'admin')
    )
  );
$$;

REVOKE ALL ON FUNCTION public.atend_pode_bloquear_contato(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.atend_pode_bloquear_contato(uuid, uuid) TO authenticated;

ALTER TABLE public.atend_contatos_bloqueados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS atend_contatos_bloqueados_supervisao ON public.atend_contatos_bloqueados;
CREATE POLICY atend_contatos_bloqueados_supervisao ON public.atend_contatos_bloqueados
  FOR ALL TO authenticated
  USING (public.atend_pode_bloquear_contato(auth.uid(), clinica_id))
  WITH CHECK (
    public.atend_pode_bloquear_contato(auth.uid(), clinica_id)
    AND bloqueado_por = auth.uid()
  );

-- Histórico de quem bloqueou/desbloqueou (mesma auditoria das outras tabelas).
DROP TRIGGER IF EXISTS trg_audit_atend_contatos_bloqueados ON public.atend_contatos_bloqueados;
CREATE TRIGGER trg_audit_atend_contatos_bloqueados
  AFTER INSERT OR UPDATE OR DELETE ON public.atend_contatos_bloqueados
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();
