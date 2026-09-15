-- =============================================================================
-- Auditoria de segurança (14/09/2026) — três apontamentos
--
-- 1. [CRÍTICO] Backups por clínica
--    As regras do bucket `backups-diarios` e da tabela `backup_execucoes`
--    conferiam "é admin desta clínica", mas não conferiam se o vínculo ainda
--    está ATIVO. Um administrador desligado (ativo = false) continuava podendo
--    listar e baixar os CSVs da clínica direto pela API de storage. Além disso,
--    qualquer admin podia gravar/apagar/sobrescrever arquivos de backup — só o
--    servidor (chave de serviço, que ignora RLS) precisa escrever ali.
--
-- 2. [WARNING] Dados clínicos só para quem é da equipe clínica
--    Prontuário: só o médico do próprio registro (medicos.user_id = usuário)
--    ou a supervisão autorizada (pode_autorizar) grava. Laudos/resultados de
--    exame, documentos emitidos, anamnese, prontuário odontológico e triagem:
--    só médico, enfermagem ou supervisão autorizada. Recepção, caixa,
--    financeiro, telefonia e admins sem alçada continuam editando o cadastro
--    do paciente (tabela `pacientes`), mas não o conteúdo clínico.
--    Conferido em produção antes: todas as gravações de prontuário registradas
--    na auditoria foram feitas pelo próprio médico do registro; as outras
--    tabelas clínicas não recebem gravação há meses (ou estão vazias).
--
-- 3. [WARNING] Biometria facial do médico
--    Qualquer admin/gestor podia cadastrar o rosto de um médico. Agora só o
--    próprio médico, logado com a conta dele, registra a biometria; a
--    supervisão autorizada pode apenas revogar ou apagar. O descritor facial
--    nunca pode ser trocado por UPDATE (redefinir = revogar + novo cadastro
--    feito pelo próprio médico).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Funções auxiliares
-- ---------------------------------------------------------------------------

-- Supervisão autorizada: alçada marcada pessoa a pessoa (pode_autorizar), não
-- deduzida do perfil admin.
CREATE OR REPLACE FUNCTION public.eh_supervisao_clinica(_user_id uuid, _clinica_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.clinica_memberships m
     WHERE m.user_id = _user_id
       AND m.clinica_id = _clinica_id
       AND m.ativo
       AND m.pode_autorizar
       AND m.role IN ('admin', 'gestor', 'supervisor')
  );
$$;

-- O usuário é o médico dono do registro (e continua com vínculo ativo).
CREATE OR REPLACE FUNCTION public.eh_medico_do_registro(_user_id uuid, _medico_id uuid, _clinica_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT _medico_id IS NOT NULL
     AND EXISTS (
       SELECT 1
         FROM public.medicos md
         JOIN public.clinica_memberships m
           ON m.user_id = md.user_id
          AND m.clinica_id = md.clinica_id
          AND m.ativo
        WHERE md.id = _medico_id
          AND md.clinica_id = _clinica_id
          AND md.user_id = _user_id
     );
$$;

-- Equipe clínica: médico, enfermagem ou supervisão autorizada.
CREATE OR REPLACE FUNCTION public.eh_equipe_clinica(_user_id uuid, _clinica_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.has_any_role(_user_id, _clinica_id, ARRAY['medico', 'enfermeiro']::public.app_role[])
      OR public.eh_supervisao_clinica(_user_id, _clinica_id);
$$;

REVOKE ALL ON FUNCTION public.eh_supervisao_clinica(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.eh_medico_do_registro(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.eh_equipe_clinica(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.eh_supervisao_clinica(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.eh_medico_do_registro(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.eh_equipe_clinica(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 1. Backups
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "backups admin read"   ON storage.objects;
DROP POLICY IF EXISTS "backups admin insert" ON storage.objects;
DROP POLICY IF EXISTS "backups admin update" ON storage.objects;
DROP POLICY IF EXISTS "backups admin delete" ON storage.objects;

-- Leitura: só admin com vínculo ATIVO na clínica dona da pasta.
-- Escrita/remoção: nenhuma política — só o servidor (chave de serviço) grava.
CREATE POLICY "backups admin read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'backups-diarios'
    AND EXISTS (
      SELECT 1
        FROM public.clinica_memberships m
       WHERE m.user_id = auth.uid()
         AND m.role = 'admin'::public.app_role
         AND m.ativo
         AND (storage.foldername(objects.name))[1] = m.clinica_id::text
    )
  );

DROP POLICY IF EXISTS "backup_execucoes admin read" ON public.backup_execucoes;
CREATE POLICY "backup_execucoes admin read" ON public.backup_execucoes
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.clinica_memberships m
       WHERE m.user_id = auth.uid()
         AND m.role = 'admin'::public.app_role
         AND m.ativo
         AND m.clinica_id = backup_execucoes.clinica_id
    )
  );

-- ---------------------------------------------------------------------------
-- 2. Prontuário médico
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS pron_insert ON public.prontuarios;
DROP POLICY IF EXISTS pron_update ON public.prontuarios;
DROP POLICY IF EXISTS pron_delete ON public.prontuarios;

CREATE POLICY pron_insert ON public.prontuarios
  FOR INSERT TO authenticated
  WITH CHECK (
    (public.eh_medico_do_registro(auth.uid(), medico_id, clinica_id)
      OR public.eh_supervisao_clinica(auth.uid(), clinica_id))
    AND EXISTS (
      SELECT 1 FROM public.pacientes pa
       WHERE pa.id = prontuarios.paciente_id
         AND pa.clinica_id = prontuarios.clinica_id
    )
  );

CREATE POLICY pron_update ON public.prontuarios
  FOR UPDATE TO authenticated
  USING (
    public.eh_medico_do_registro(auth.uid(), medico_id, clinica_id)
    OR public.eh_supervisao_clinica(auth.uid(), clinica_id)
  )
  WITH CHECK (
    (public.eh_medico_do_registro(auth.uid(), medico_id, clinica_id)
      OR public.eh_supervisao_clinica(auth.uid(), clinica_id))
    AND EXISTS (
      SELECT 1 FROM public.pacientes pa
       WHERE pa.id = prontuarios.paciente_id
         AND pa.clinica_id = prontuarios.clinica_id
    )
  );

CREATE POLICY pron_delete ON public.prontuarios
  FOR DELETE TO authenticated
  USING (public.eh_supervisao_clinica(auth.uid(), clinica_id));

-- ---------------------------------------------------------------------------
-- 2b. Laudos, documentos, anamnese, odontologia e triagem
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "membros criam resultados"   ON public.exame_resultados;
DROP POLICY IF EXISTS "membros editam resultados"  ON public.exame_resultados;
DROP POLICY IF EXISTS "gestores apagam resultados" ON public.exame_resultados;
CREATE POLICY "equipe clinica cria resultados" ON public.exame_resultados
  FOR INSERT TO authenticated
  WITH CHECK (public.eh_equipe_clinica(auth.uid(), clinica_id));
CREATE POLICY "equipe clinica edita resultados" ON public.exame_resultados
  FOR UPDATE TO authenticated
  USING (public.eh_equipe_clinica(auth.uid(), clinica_id))
  WITH CHECK (public.eh_equipe_clinica(auth.uid(), clinica_id));
CREATE POLICY "supervisao apaga resultados" ON public.exame_resultados
  FOR DELETE TO authenticated
  USING (public.eh_supervisao_clinica(auth.uid(), clinica_id));

DROP POLICY IF EXISTS de_insert ON public.documentos_emitidos;
DROP POLICY IF EXISTS de_update ON public.documentos_emitidos;
DROP POLICY IF EXISTS de_delete ON public.documentos_emitidos;
CREATE POLICY de_insert ON public.documentos_emitidos
  FOR INSERT TO authenticated
  WITH CHECK (public.eh_equipe_clinica(auth.uid(), clinica_id));
CREATE POLICY de_update ON public.documentos_emitidos
  FOR UPDATE TO authenticated
  USING (public.eh_equipe_clinica(auth.uid(), clinica_id))
  WITH CHECK (public.eh_equipe_clinica(auth.uid(), clinica_id));
CREATE POLICY de_delete ON public.documentos_emitidos
  FOR DELETE TO authenticated
  USING (public.eh_supervisao_clinica(auth.uid(), clinica_id));

DROP POLICY IF EXISTS ar_insert ON public.anamnese_respostas;
DROP POLICY IF EXISTS ar_update ON public.anamnese_respostas;
DROP POLICY IF EXISTS ar_delete ON public.anamnese_respostas;
CREATE POLICY ar_insert ON public.anamnese_respostas
  FOR INSERT TO authenticated
  WITH CHECK (public.eh_equipe_clinica(auth.uid(), clinica_id));
CREATE POLICY ar_update ON public.anamnese_respostas
  FOR UPDATE TO authenticated
  USING (public.eh_equipe_clinica(auth.uid(), clinica_id))
  WITH CHECK (public.eh_equipe_clinica(auth.uid(), clinica_id));
CREATE POLICY ar_delete ON public.anamnese_respostas
  FOR DELETE TO authenticated
  USING (public.eh_supervisao_clinica(auth.uid(), clinica_id));

DROP POLICY IF EXISTS op_insert ON public.odonto_prontuarios;
DROP POLICY IF EXISTS op_update ON public.odonto_prontuarios;
DROP POLICY IF EXISTS op_delete ON public.odonto_prontuarios;
CREATE POLICY op_insert ON public.odonto_prontuarios
  FOR INSERT TO authenticated
  WITH CHECK (public.eh_equipe_clinica(auth.uid(), clinica_id));
CREATE POLICY op_update ON public.odonto_prontuarios
  FOR UPDATE TO authenticated
  USING (public.eh_equipe_clinica(auth.uid(), clinica_id))
  WITH CHECK (public.eh_equipe_clinica(auth.uid(), clinica_id));
CREATE POLICY op_delete ON public.odonto_prontuarios
  FOR DELETE TO authenticated
  USING (public.eh_supervisao_clinica(auth.uid(), clinica_id));

DROP POLICY IF EXISTS te_insert ON public.triagens_enfermagem;
DROP POLICY IF EXISTS te_update ON public.triagens_enfermagem;
DROP POLICY IF EXISTS te_delete ON public.triagens_enfermagem;
CREATE POLICY te_insert ON public.triagens_enfermagem
  FOR INSERT TO authenticated
  WITH CHECK (public.eh_equipe_clinica(auth.uid(), clinica_id));
CREATE POLICY te_update ON public.triagens_enfermagem
  FOR UPDATE TO authenticated
  USING (public.eh_equipe_clinica(auth.uid(), clinica_id))
  WITH CHECK (public.eh_equipe_clinica(auth.uid(), clinica_id));
CREATE POLICY te_delete ON public.triagens_enfermagem
  FOR DELETE TO authenticated
  USING (public.eh_supervisao_clinica(auth.uid(), clinica_id));

-- ---------------------------------------------------------------------------
-- 3. Biometria facial do médico
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS mb_select ON public.medico_biometria;
DROP POLICY IF EXISTS mb_insert ON public.medico_biometria;
DROP POLICY IF EXISTS mb_update ON public.medico_biometria;
DROP POLICY IF EXISTS mb_delete ON public.medico_biometria;

-- Ver o descritor: o próprio médico ou a supervisão autorizada.
CREATE POLICY mb_select ON public.medico_biometria
  FOR SELECT TO authenticated
  USING (
    public.eh_medico_do_registro(auth.uid(), medico_id, clinica_id)
    OR public.eh_supervisao_clinica(auth.uid(), clinica_id)
  );

-- Cadastrar: SOMENTE o próprio médico, autenticado com a conta dele.
CREATE POLICY mb_insert ON public.medico_biometria
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.eh_medico_do_registro(auth.uid(), medico_id, clinica_id)
  );

-- Alterar (na prática, só revogar — o gatilho abaixo trava o resto).
CREATE POLICY mb_update ON public.medico_biometria
  FOR UPDATE TO authenticated
  USING (
    public.eh_medico_do_registro(auth.uid(), medico_id, clinica_id)
    OR public.eh_supervisao_clinica(auth.uid(), clinica_id)
  )
  WITH CHECK (
    public.eh_medico_do_registro(auth.uid(), medico_id, clinica_id)
    OR public.eh_supervisao_clinica(auth.uid(), clinica_id)
  );

CREATE POLICY mb_delete ON public.medico_biometria
  FOR DELETE TO authenticated
  USING (public.eh_supervisao_clinica(auth.uid(), clinica_id));

CREATE OR REPLACE FUNCTION public.medico_biometria_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Chave de serviço (servidor) não tem auth.uid(): fica de fora da trava.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.user_id IS DISTINCT FROM auth.uid()
       OR NOT public.eh_medico_do_registro(auth.uid(), NEW.medico_id, NEW.clinica_id) THEN
      RAISE EXCEPTION
        'A biometria facial só pode ser cadastrada pelo próprio médico, logado com a conta dele.'
        USING ERRCODE = '42501';
    END IF;
    NEW.consentimento_em := coalesce(NEW.consentimento_em, now());
    RETURN NEW;
  END IF;

  -- UPDATE: nada muda além de revogar.
  IF NEW.descriptor IS DISTINCT FROM OLD.descriptor
     OR NEW.medico_id IS DISTINCT FROM OLD.medico_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.clinica_id IS DISTINCT FROM OLD.clinica_id
     OR NEW.consentimento_em IS DISTINCT FROM OLD.consentimento_em THEN
    RAISE EXCEPTION
      'A biometria facial não pode ser alterada. Revogue e peça ao médico para cadastrar de novo.'
      USING ERRCODE = '42501';
  END IF;

  IF OLD.revogado_em IS NOT NULL AND NEW.revogado_em IS DISTINCT FROM OLD.revogado_em THEN
    RAISE EXCEPTION 'Biometria revogada não pode ser reativada.' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_medico_biometria_guard ON public.medico_biometria;
CREATE TRIGGER trg_medico_biometria_guard
  BEFORE INSERT OR UPDATE ON public.medico_biometria
  FOR EACH ROW EXECUTE FUNCTION public.medico_biometria_guard();
