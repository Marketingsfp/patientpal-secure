
-- Tighten chat_mensagens SELECT to also verify clinic membership of channel
DROP POLICY IF EXISTS msg_select ON public.chat_mensagens;
CREATE POLICY msg_select ON public.chat_mensagens
FOR SELECT TO authenticated
USING (
  is_chat_member(auth.uid(), canal_id)
  AND EXISTS (
    SELECT 1 FROM public.chat_canais c
    WHERE c.id = chat_mensagens.canal_id
      AND public.is_member(auth.uid(), c.clinica_id)
  )
);

-- Remove denormalized CPF from orcamentos (derive via pacientes join when needed)
ALTER TABLE public.orcamentos DROP COLUMN IF EXISTS paciente_cpf;
