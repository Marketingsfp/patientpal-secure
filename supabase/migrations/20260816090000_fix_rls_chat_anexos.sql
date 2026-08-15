-- BLOQUEADOR 1 — anexos do chat interno visíveis para qualquer conta autenticada.
--
-- PROBLEMA
-- A policy criada em 20260812140208 libera o bucket inteiro para o role
-- `authenticated`, sem amarrar clínica nem dono:
--
--   USING (bucket_id = 'chat-anexos')
--
-- Como o cadastro é público (src/routes/signup.tsx faz supabase.auth.signUp
-- sem convite, em rota fora de _authenticated), qualquer pessoa cria uma conta,
-- passa a ser `authenticated` e, com a chave publicável que já vai no bundle,
-- lista e baixa os anexos do chat de TODAS as clínicas — exames, documentos e
-- fotos que a equipe troca. Dado de saúde (LGPD art. 11) exposto a quem não é
-- sequer funcionário.
--
-- CORREÇÃO
-- Aplicar o mesmo padrão já usado nos buckets `pacientes-fotos` e
-- `odonto-imagens`: a primeira pasta do caminho é o clinica_id, e o acesso
-- exige que o usuário seja membro daquela clínica. O caminho gravado pelo app
-- já é `${clinicaId}/${canal}/...` (src/routes/_authenticated/app.chat.tsx),
-- então nenhum arquivo existente precisa ser movido.
--
-- IMPACTO ESPERADO
-- Nenhuma mudança para quem usa o chat da própria clínica. Contas sem vínculo
-- ativo em clinica_memberships deixam de enxergar qualquer anexo.
--
-- VALIDAR DEPOIS DE APLICAR
--   select policyname, qual from pg_policies
--    where schemaname = 'storage' and tablename = 'objects'
--      and policyname like 'chat_anexos%';

DROP POLICY IF EXISTS "chat_anexos_select_auth" ON storage.objects;
CREATE POLICY "chat_anexos_select_auth" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'chat-anexos'
    AND public.is_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

-- No INSERT, além de ser o dono do arquivo, o usuário precisa ser membro da
-- clínica cuja pasta ele está usando — senão dá para gravar dentro da pasta
-- de outra clínica.
DROP POLICY IF EXISTS "chat_anexos_insert_auth" ON storage.objects;
CREATE POLICY "chat_anexos_insert_auth" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'chat-anexos'
    AND owner = auth.uid()
    AND public.is_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

-- DELETE continua restrito ao dono do arquivo, agora também limitado à
-- clínica correspondente.
DROP POLICY IF EXISTS "chat_anexos_delete_own" ON storage.objects;
CREATE POLICY "chat_anexos_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'chat-anexos'
    AND owner = auth.uid()
    AND public.is_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );
