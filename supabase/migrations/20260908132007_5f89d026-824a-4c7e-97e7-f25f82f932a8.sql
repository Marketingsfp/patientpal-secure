-- 1) Rotina interna de distribuição (sem checagem de sessão): é ela que os
--    gatilhos do banco chamam. A checagem de acesso continua na função
--    pública `atend_distribuir_fila`, usada pelo aplicativo.
CREATE OR REPLACE FUNCTION public.atend_distribuir_fila_interno(_clinica_id uuid, _max integer DEFAULT 20)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _r record;
  _u uuid;
  _n integer := 0;
  _falhas integer := 0;
BEGIN
  FOR _r IN
    SELECT id, departamento_id
      FROM public.atend_conversas
     WHERE clinica_id = _clinica_id
       AND atribuida_user_id IS NULL
       AND is_teste = false
       AND (
         status = 'waiting'
         OR (
           status IN ('active', 'in_progress')
           AND (
             COALESCE(btrim(handoff_motivo), '') <> ''
             OR (
               handoff_resumo IS NOT NULL
               AND jsonb_typeof(handoff_resumo) <> 'null'
               AND COALESCE(btrim(handoff_resumo::text), '') NOT IN ('', '""', '{}', '[]')
             )
           )
         )
       )
     -- Ordem da fila: maior prioridade operacional primeiro; dentro da mesma
     -- prioridade, quem está esperando há mais tempo.
     ORDER BY prioridade DESC, aguardando_desde ASC NULLS LAST, handoff_em ASC NULLS LAST
     LIMIT GREATEST(_max, 1)
  LOOP
    _u := public.atend_auto_assign_conversa(_r.id, _clinica_id, _r.departamento_id, 'queue_distribution');
    IF _u IS NULL THEN
      -- Conversa sem atendente compatível (setor/unidade incompatível, todos
      -- lotados) NÃO trava a fila: segue para as próximas. Depois de 5
      -- tentativas seguidas sem sucesso presume-se que não há mais ninguém
      -- elegível e a rotina encerra, evitando trabalho inútil.
      _falhas := _falhas + 1;
      IF _falhas >= 5 THEN EXIT; END IF;
      CONTINUE;
    END IF;
    _falhas := 0;
    _n := _n + 1;
  END LOOP;

  RETURN _n;
END;
$function$;

REVOKE ALL ON FUNCTION public.atend_distribuir_fila_interno(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.atend_distribuir_fila_interno(uuid, integer) FROM anon;
REVOKE ALL ON FUNCTION public.atend_distribuir_fila_interno(uuid, integer) FROM authenticated;

-- 2) A função pública passa a apenas validar o acesso e delegar.
CREATE OR REPLACE FUNCTION public.atend_distribuir_fila(_clinica_id uuid, _max integer DEFAULT 20)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_member(auth.uid(), _clinica_id) AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Sem acesso a esta clínica';
  END IF;
  RETURN public.atend_distribuir_fila_interno(_clinica_id, _max);
END;
$function$;

-- 3) Gatilho: ficar Online (com Telefonia) reavalia a fila no próprio banco,
--    mesmo que ninguém esteja com a tela aberta.
CREATE OR REPLACE FUNCTION public.atend_presenca_redistribui()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Só interessa a transição para "disponível para receber".
  IF NEW.status <> 'ONLINE' OR NEW.aceita_novas IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  -- Heartbeat repetido de quem já estava Online não dispara nada.
  IF TG_OP = 'UPDATE'
     AND OLD.status = 'ONLINE'
     AND OLD.aceita_novas IS TRUE THEN
    RETURN NEW;
  END IF;

  -- Sem Telefonia (ou administrador) não movimenta a fila.
  IF public.atend_usuario_e_admin(NEW.user_id, NEW.clinica_id)
     OR NOT public.has_module_access(NEW.user_id, NEW.clinica_id, 'telefonia', 'read') THEN
    RETURN NEW;
  END IF;

  -- Nada esperando: sai barato.
  IF NOT EXISTS (
    SELECT 1 FROM public.atend_conversas c
     WHERE c.clinica_id = NEW.clinica_id
       AND c.atribuida_user_id IS NULL
       AND c.is_teste = false
  ) THEN
    RETURN NEW;
  END IF;

  PERFORM public.atend_distribuir_fila_interno(NEW.clinica_id, 20);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_atend_presenca_redistribui ON public.atend_agente_presenca;
CREATE TRIGGER trg_atend_presenca_redistribui
AFTER INSERT OR UPDATE OF status, aceita_novas ON public.atend_agente_presenca
FOR EACH ROW EXECUTE FUNCTION public.atend_presenca_redistribui();

-- 4) Gatilho: encerrar uma pausa também devolve a pessoa ao pool.
CREATE OR REPLACE FUNCTION public.atend_pausa_fim_redistribui()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.finalizada_em IS NULL OR OLD.finalizada_em IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF public.atend_usuario_e_admin(NEW.user_id, NEW.clinica_id)
     OR NOT public.has_module_access(NEW.user_id, NEW.clinica_id, 'telefonia', 'read') THEN
    RETURN NEW;
  END IF;
  PERFORM public.atend_distribuir_fila_interno(NEW.clinica_id, 20);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_atend_pausa_fim_redistribui ON public.atend_pausas_log;
CREATE TRIGGER trg_atend_pausa_fim_redistribui
AFTER UPDATE OF finalizada_em ON public.atend_pausas_log
FOR EACH ROW EXECUTE FUNCTION public.atend_pausa_fim_redistribui();