-- Anexos do chat — DELETE sem amarração de clínica.
--
-- PROBLEMA
-- A migração 20260816090000_fix_rls_chat_anexos.sql corrigiu SELECT, INSERT e
-- DELETE do bucket `chat-anexos`, mas no banco só SELECT e INSERT ficaram com a
-- validação de clínica. A policy de DELETE continuou na versão antiga:
--
--   USING (bucket_id = 'chat-anexos' AND owner = auth.uid())
--
-- Ou seja: basta ser o dono do arquivo. Como o caminho gravado pelo app é
-- `${clinicaId}/${canal}/...` e o INSERT já exige ser membro da clínica da
-- pasta, na prática ninguém consegue criar arquivo fora da própria clínica.
-- Mas a regra fica inconsistente: se algum arquivo antigo (ou gravado por um
-- caminho administrativo) tiver dono de uma clínica e pasta de outra, o DELETE
-- deixaria apagar. É o alerta apontado pelo scan de segurança.
--
-- CORREÇÃO
-- Repetir no DELETE a mesma checagem de membership por pasta usada no SELECT e
-- no INSERT: a primeira pasta do caminho é o clinica_id e o usuário precisa ser
-- membro dela.
--
-- IMPACTO ESPERADO
-- Nenhum. O bucket está vazio e a tela do chat
-- (src/routes/_authenticated/app.chat.tsx) só faz upload e abre link assinado —
-- não existe botão de apagar anexo.
--
-- VALIDAR DEPOIS DE APLICAR
--   select policyname, cmd, qual from pg_policies
--    where schemaname = 'storage' and tablename = 'objects'
--      and policyname like 'chat_anexos%';
--   As três linhas devem conter is_member(...).

DROP POLICY IF EXISTS "chat_anexos_delete_own" ON storage.objects;
CREATE POLICY "chat_anexos_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'chat-anexos'
    AND owner = auth.uid()
    AND public.is_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );
