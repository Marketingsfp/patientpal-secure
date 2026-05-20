
CREATE TABLE public.lms_cursos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  titulo text NOT NULL,
  descricao text,
  capa_url text,
  carga_horaria_min int DEFAULT 0,
  publicado boolean NOT NULL DEFAULT false,
  criado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.lms_modulos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  curso_id uuid NOT NULL REFERENCES public.lms_cursos(id) ON DELETE CASCADE,
  titulo text NOT NULL,
  ordem int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  CREATE TYPE public.lms_licao_tipo AS ENUM ('video','texto','quiz');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.lms_licoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  modulo_id uuid NOT NULL REFERENCES public.lms_modulos(id) ON DELETE CASCADE,
  curso_id uuid NOT NULL REFERENCES public.lms_cursos(id) ON DELETE CASCADE,
  tipo public.lms_licao_tipo NOT NULL DEFAULT 'texto',
  titulo text NOT NULL,
  conteudo text,
  video_url text,
  duracao_min int DEFAULT 0,
  ordem int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.lms_quizzes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  licao_id uuid NOT NULL REFERENCES public.lms_licoes(id) ON DELETE CASCADE,
  perguntas jsonb NOT NULL DEFAULT '[]'::jsonb,
  nota_minima int NOT NULL DEFAULT 70,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.lms_progresso (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  curso_id uuid NOT NULL REFERENCES public.lms_cursos(id) ON DELETE CASCADE,
  licao_id uuid NOT NULL REFERENCES public.lms_licoes(id) ON DELETE CASCADE,
  concluida_em timestamptz NOT NULL DEFAULT now(),
  nota int,
  UNIQUE(user_id, licao_id)
);

CREATE TABLE public.lms_certificados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL,
  user_id uuid NOT NULL,
  curso_id uuid NOT NULL REFERENCES public.lms_cursos(id) ON DELETE CASCADE,
  codigo_verificacao text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(12), 'hex'),
  emitido_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, curso_id)
);

CREATE TABLE public.lms_trilhas_cargo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  cargo_id uuid NOT NULL,
  curso_id uuid NOT NULL REFERENCES public.lms_cursos(id) ON DELETE CASCADE,
  obrigatorio boolean NOT NULL DEFAULT true,
  UNIQUE(cargo_id, curso_id)
);

CREATE INDEX idx_lms_modulos_curso ON public.lms_modulos(curso_id, ordem);
CREATE INDEX idx_lms_licoes_modulo ON public.lms_licoes(modulo_id, ordem);
CREATE INDEX idx_lms_progresso_user ON public.lms_progresso(user_id, curso_id);

-- RLS
ALTER TABLE public.lms_cursos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lms_modulos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lms_licoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lms_quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lms_progresso ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lms_certificados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lms_trilhas_cargo ENABLE ROW LEVEL SECURITY;

-- Cursos: membros veem publicados; gestores gerenciam
CREATE POLICY lms_cursos_select ON public.lms_cursos FOR SELECT
  USING (is_member(auth.uid(), clinica_id) AND (publicado OR can_manage_clinica(auth.uid(), clinica_id)));
CREATE POLICY lms_cursos_manage ON public.lms_cursos FOR ALL
  USING (can_manage_clinica(auth.uid(), clinica_id))
  WITH CHECK (can_manage_clinica(auth.uid(), clinica_id));

-- Módulos / Lições / Quizzes: herdam acesso do curso
CREATE POLICY lms_modulos_select ON public.lms_modulos FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.lms_cursos c WHERE c.id = curso_id AND is_member(auth.uid(), c.clinica_id)));
CREATE POLICY lms_modulos_manage ON public.lms_modulos FOR ALL
  USING (EXISTS (SELECT 1 FROM public.lms_cursos c WHERE c.id = curso_id AND can_manage_clinica(auth.uid(), c.clinica_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.lms_cursos c WHERE c.id = curso_id AND can_manage_clinica(auth.uid(), c.clinica_id)));

CREATE POLICY lms_licoes_select ON public.lms_licoes FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.lms_cursos c WHERE c.id = curso_id AND is_member(auth.uid(), c.clinica_id)));
CREATE POLICY lms_licoes_manage ON public.lms_licoes FOR ALL
  USING (EXISTS (SELECT 1 FROM public.lms_cursos c WHERE c.id = curso_id AND can_manage_clinica(auth.uid(), c.clinica_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.lms_cursos c WHERE c.id = curso_id AND can_manage_clinica(auth.uid(), c.clinica_id)));

CREATE POLICY lms_quizzes_select ON public.lms_quizzes FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.lms_licoes l JOIN public.lms_cursos c ON c.id = l.curso_id WHERE l.id = licao_id AND is_member(auth.uid(), c.clinica_id)));
CREATE POLICY lms_quizzes_manage ON public.lms_quizzes FOR ALL
  USING (EXISTS (SELECT 1 FROM public.lms_licoes l JOIN public.lms_cursos c ON c.id = l.curso_id WHERE l.id = licao_id AND can_manage_clinica(auth.uid(), c.clinica_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.lms_licoes l JOIN public.lms_cursos c ON c.id = l.curso_id WHERE l.id = licao_id AND can_manage_clinica(auth.uid(), c.clinica_id)));

-- Progresso: usuário gerencia o próprio; gestores leem tudo
CREATE POLICY lms_prog_select_self ON public.lms_progresso FOR SELECT
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.lms_cursos c WHERE c.id = curso_id AND can_manage_clinica(auth.uid(), c.clinica_id)));
CREATE POLICY lms_prog_insert_self ON public.lms_progresso FOR INSERT
  WITH CHECK (user_id = auth.uid());
CREATE POLICY lms_prog_update_self ON public.lms_progresso FOR UPDATE
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Certificados: usuário vê os próprios; gestores veem da clínica
CREATE POLICY lms_cert_select ON public.lms_certificados FOR SELECT
  USING (user_id = auth.uid() OR can_manage_clinica(auth.uid(), clinica_id));
CREATE POLICY lms_cert_insert_self ON public.lms_certificados FOR INSERT
  WITH CHECK (user_id = auth.uid() AND is_member(auth.uid(), clinica_id));

-- Trilhas: gestores
CREATE POLICY lms_trilhas_select ON public.lms_trilhas_cargo FOR SELECT
  USING (is_member(auth.uid(), clinica_id));
CREATE POLICY lms_trilhas_manage ON public.lms_trilhas_cargo FOR ALL
  USING (can_manage_clinica(auth.uid(), clinica_id))
  WITH CHECK (can_manage_clinica(auth.uid(), clinica_id));

CREATE TRIGGER trg_lms_cursos_touch BEFORE UPDATE ON public.lms_cursos
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
