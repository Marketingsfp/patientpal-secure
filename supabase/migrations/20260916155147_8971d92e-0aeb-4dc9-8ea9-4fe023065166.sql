-- Portal Coach WhatsApp — tabelas próprias, prefixo coach_.

CREATE OR REPLACE FUNCTION public.coach_pode_gerir(_clinica_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.clinica_memberships m
    WHERE m.user_id = auth.uid()
      AND m.clinica_id = _clinica_id
      AND m.role IN ('admin','gestor','supervisor')
  )
$$;
GRANT EXECUTE ON FUNCTION public.coach_pode_gerir(uuid) TO authenticated;

-- 1) Análises de conversa
CREATE TABLE public.coach_analises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  user_id uuid,
  atendente text NOT NULL,
  session_id text NOT NULL DEFAULT '',
  tipo_entrada text NOT NULL CHECK (tipo_entrada IN ('texto','audio')),
  titulo text NOT NULL,
  preview text NOT NULL,
  pontuacao numeric NOT NULL,
  sentimento text NOT NULL,
  resultado jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_coach_analises_clinica ON public.coach_analises (clinica_id, created_at DESC);
CREATE INDEX idx_coach_analises_atendente ON public.coach_analises (clinica_id, atendente, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coach_analises TO authenticated;
GRANT ALL ON public.coach_analises TO service_role;
ALTER TABLE public.coach_analises ENABLE ROW LEVEL SECURITY;
CREATE POLICY "coach_analises_select" ON public.coach_analises FOR SELECT TO authenticated
  USING (clinica_id = ANY (public.clinicas_do_usuario())
         AND (public.coach_pode_gerir(clinica_id) OR user_id = auth.uid()));
CREATE POLICY "coach_analises_insert" ON public.coach_analises FOR INSERT TO authenticated
  WITH CHECK (clinica_id = ANY (public.clinicas_do_usuario())
              AND (public.coach_pode_gerir(clinica_id) OR user_id = auth.uid()));
CREATE POLICY "coach_analises_update" ON public.coach_analises FOR UPDATE TO authenticated
  USING (clinica_id = ANY (public.clinicas_do_usuario())
         AND (public.coach_pode_gerir(clinica_id) OR user_id = auth.uid()))
  WITH CHECK (clinica_id = ANY (public.clinicas_do_usuario()));
CREATE POLICY "coach_analises_delete" ON public.coach_analises FOR DELETE TO authenticated
  USING (clinica_id = ANY (public.clinicas_do_usuario())
         AND (public.coach_pode_gerir(clinica_id) OR user_id = auth.uid()));

-- 2) Roleplay
CREATE TABLE public.coach_roleplay_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  user_id uuid,
  atendente text NOT NULL,
  nota numeric NOT NULL,
  resumo text NOT NULL,
  acertos jsonb NOT NULL DEFAULT '[]'::jsonb,
  melhorias jsonb NOT NULL DEFAULT '[]'::jsonb,
  dica_pratica text,
  cenario text,
  perfil_cliente text,
  pontos_fracos jsonb NOT NULL DEFAULT '[]'::jsonb,
  mensagens jsonb NOT NULL DEFAULT '[]'::jsonb,
  duracao_seg integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_coach_roleplay_atendente ON public.coach_roleplay_sessions (clinica_id, atendente, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coach_roleplay_sessions TO authenticated;
GRANT ALL ON public.coach_roleplay_sessions TO service_role;
ALTER TABLE public.coach_roleplay_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "coach_roleplay_select" ON public.coach_roleplay_sessions FOR SELECT TO authenticated
  USING (clinica_id = ANY (public.clinicas_do_usuario())
         AND (public.coach_pode_gerir(clinica_id) OR user_id = auth.uid()));
CREATE POLICY "coach_roleplay_insert" ON public.coach_roleplay_sessions FOR INSERT TO authenticated
  WITH CHECK (clinica_id = ANY (public.clinicas_do_usuario())
              AND (public.coach_pode_gerir(clinica_id) OR user_id = auth.uid()));
CREATE POLICY "coach_roleplay_update" ON public.coach_roleplay_sessions FOR UPDATE TO authenticated
  USING (clinica_id = ANY (public.clinicas_do_usuario())
         AND (public.coach_pode_gerir(clinica_id) OR user_id = auth.uid()))
  WITH CHECK (clinica_id = ANY (public.clinicas_do_usuario()));
CREATE POLICY "coach_roleplay_delete" ON public.coach_roleplay_sessions FOR DELETE TO authenticated
  USING (clinica_id = ANY (public.clinicas_do_usuario())
         AND (public.coach_pode_gerir(clinica_id) OR user_id = auth.uid()));

-- 3) Provas
CREATE TABLE public.coach_provas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  user_id uuid,
  atendente text NOT NULL,
  nota numeric NOT NULL,
  acertos integer NOT NULL,
  total integer NOT NULL,
  questoes jsonb NOT NULL DEFAULT '[]'::jsonb,
  respostas jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_coach_provas_atendente ON public.coach_provas (clinica_id, atendente, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coach_provas TO authenticated;
GRANT ALL ON public.coach_provas TO service_role;
ALTER TABLE public.coach_provas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "coach_provas_select" ON public.coach_provas FOR SELECT TO authenticated
  USING (clinica_id = ANY (public.clinicas_do_usuario())
         AND (public.coach_pode_gerir(clinica_id) OR user_id = auth.uid()));
CREATE POLICY "coach_provas_insert" ON public.coach_provas FOR INSERT TO authenticated
  WITH CHECK (clinica_id = ANY (public.clinicas_do_usuario())
              AND (public.coach_pode_gerir(clinica_id) OR user_id = auth.uid()));
CREATE POLICY "coach_provas_delete" ON public.coach_provas FOR DELETE TO authenticated
  USING (clinica_id = ANY (public.clinicas_do_usuario())
         AND (public.coach_pode_gerir(clinica_id) OR user_id = auth.uid()));

-- 4) Tempo de estudo
CREATE TABLE public.coach_tempo_estudo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  user_id uuid,
  atendente text NOT NULL,
  atividade text NOT NULL,
  dia date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date,
  segundos integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinica_id, atendente, atividade, dia)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coach_tempo_estudo TO authenticated;
GRANT ALL ON public.coach_tempo_estudo TO service_role;
ALTER TABLE public.coach_tempo_estudo ENABLE ROW LEVEL SECURITY;
CREATE POLICY "coach_tempo_select" ON public.coach_tempo_estudo FOR SELECT TO authenticated
  USING (clinica_id = ANY (public.clinicas_do_usuario())
         AND (public.coach_pode_gerir(clinica_id) OR user_id = auth.uid()));
CREATE POLICY "coach_tempo_insert" ON public.coach_tempo_estudo FOR INSERT TO authenticated
  WITH CHECK (clinica_id = ANY (public.clinicas_do_usuario())
              AND (public.coach_pode_gerir(clinica_id) OR user_id = auth.uid()));
CREATE POLICY "coach_tempo_update" ON public.coach_tempo_estudo FOR UPDATE TO authenticated
  USING (clinica_id = ANY (public.clinicas_do_usuario())
         AND (public.coach_pode_gerir(clinica_id) OR user_id = auth.uid()))
  WITH CHECK (clinica_id = ANY (public.clinicas_do_usuario()));

-- 5) Metas
CREATE TABLE public.coach_desempenho_metas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  user_id uuid,
  atendente text NOT NULL,
  meta_nota numeric NOT NULL DEFAULT 6.0,
  meta_horas numeric NOT NULL DEFAULT 1,
  observacao text NOT NULL DEFAULT '',
  autor_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinica_id, atendente)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coach_desempenho_metas TO authenticated;
GRANT ALL ON public.coach_desempenho_metas TO service_role;
ALTER TABLE public.coach_desempenho_metas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "coach_metas_select" ON public.coach_desempenho_metas FOR SELECT TO authenticated
  USING (clinica_id = ANY (public.clinicas_do_usuario())
         AND (public.coach_pode_gerir(clinica_id) OR user_id = auth.uid()));
CREATE POLICY "coach_metas_gestor" ON public.coach_desempenho_metas FOR ALL TO authenticated
  USING (clinica_id = ANY (public.clinicas_do_usuario()) AND public.coach_pode_gerir(clinica_id))
  WITH CHECK (clinica_id = ANY (public.clinicas_do_usuario()) AND public.coach_pode_gerir(clinica_id));

-- 6) Eventos de segurança (proteção de tela)
CREATE TABLE public.coach_eventos_seguranca (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  user_id uuid,
  atendente text NOT NULL,
  tela text NOT NULL,
  tipo text NOT NULL,
  detalhe text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_coach_eventos_clinica ON public.coach_eventos_seguranca (clinica_id, created_at DESC);
GRANT SELECT, INSERT, DELETE ON public.coach_eventos_seguranca TO authenticated;
GRANT ALL ON public.coach_eventos_seguranca TO service_role;
ALTER TABLE public.coach_eventos_seguranca ENABLE ROW LEVEL SECURITY;
CREATE POLICY "coach_eventos_select" ON public.coach_eventos_seguranca FOR SELECT TO authenticated
  USING (clinica_id = ANY (public.clinicas_do_usuario())
         AND (public.coach_pode_gerir(clinica_id) OR user_id = auth.uid()));
CREATE POLICY "coach_eventos_insert" ON public.coach_eventos_seguranca FOR INSERT TO authenticated
  WITH CHECK (clinica_id = ANY (public.clinicas_do_usuario()));
CREATE POLICY "coach_eventos_delete" ON public.coach_eventos_seguranca FOR DELETE TO authenticated
  USING (clinica_id = ANY (public.clinicas_do_usuario()) AND public.coach_pode_gerir(clinica_id));

-- 7) Configuração do Coach por clínica (scripts, base de serviços, vozes)
CREATE TABLE public.coach_config_clinica (
  clinica_id uuid PRIMARY KEY REFERENCES public.clinicas(id) ON DELETE CASCADE,
  scripts jsonb NOT NULL DEFAULT '[]'::jsonb,
  tabela_servicos text NOT NULL DEFAULT '',
  voz_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  checklist jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coach_config_clinica TO authenticated;
GRANT ALL ON public.coach_config_clinica TO service_role;
ALTER TABLE public.coach_config_clinica ENABLE ROW LEVEL SECURITY;
CREATE POLICY "coach_config_select" ON public.coach_config_clinica FOR SELECT TO authenticated
  USING (clinica_id = ANY (public.clinicas_do_usuario()));
CREATE POLICY "coach_config_gestor" ON public.coach_config_clinica FOR ALL TO authenticated
  USING (clinica_id = ANY (public.clinicas_do_usuario()) AND public.coach_pode_gerir(clinica_id))
  WITH CHECK (clinica_id = ANY (public.clinicas_do_usuario()) AND public.coach_pode_gerir(clinica_id));

-- updated_at
CREATE TRIGGER coach_tempo_estudo_updated_at BEFORE UPDATE ON public.coach_tempo_estudo
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER coach_metas_updated_at BEFORE UPDATE ON public.coach_desempenho_metas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER coach_config_updated_at BEFORE UPDATE ON public.coach_config_clinica
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RPC de tempo de estudo
CREATE OR REPLACE FUNCTION public.coach_registrar_tempo_estudo(
  _clinica_id uuid, _atendente text, _atividade text, _segundos integer
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR _clinica_id IS NULL OR _atendente IS NULL OR btrim(_atendente) = '' THEN
    RETURN;
  END IF;
  IF _segundos IS NULL OR _segundos <= 0 OR _segundos > 3600 THEN
    RETURN;
  END IF;

  INSERT INTO public.coach_tempo_estudo (clinica_id, user_id, atendente, atividade, dia, segundos)
  VALUES (_clinica_id, auth.uid(), btrim(_atendente), _atividade,
          (now() AT TIME ZONE 'America/Sao_Paulo')::date, _segundos)
  ON CONFLICT (clinica_id, atendente, atividade, dia)
  DO UPDATE SET segundos = public.coach_tempo_estudo.segundos + EXCLUDED.segundos,
                user_id = COALESCE(public.coach_tempo_estudo.user_id, EXCLUDED.user_id),
                updated_at = now();
END;
$$;
GRANT EXECUTE ON FUNCTION public.coach_registrar_tempo_estudo(uuid, text, text, integer) TO authenticated;