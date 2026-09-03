ALTER TABLE public.audit_log DROP CONSTRAINT IF EXISTS audit_log_action_check;
ALTER TABLE public.audit_log ADD CONSTRAINT audit_log_action_check CHECK (
  action = ANY (ARRAY['INSERT','UPDATE','DELETE','blocked_UPDATE','blocked_DELETE','merge_pacientes','excluir_paciente_duplicado'])
  OR action LIKE 'NINA\_%'
  OR action LIKE 'AI\_%'
);