
-- 1) Função genérica para uppercase de um campo
CREATE OR REPLACE FUNCTION public.uppercase_field()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  col TEXT := TG_ARGV[0];
  val TEXT;
BEGIN
  EXECUTE format('SELECT ($1).%I::text', col) INTO val USING NEW;
  IF val IS NOT NULL THEN
    NEW := NEW #= hstore(col, upper(val));
  END IF;
  RETURN NEW;
END;
$$;

-- Precisa de hstore para o NEW #= acima
CREATE EXTENSION IF NOT EXISTS hstore;

-- 2) Função mais simples por tabela (evita hstore em prod): usar uma função por coluna inline
-- Vamos usar abordagem direta por trigger dedicada para cada tabela/coluna.
DROP FUNCTION IF EXISTS public.uppercase_field() CASCADE;

-- pacientes.nome
CREATE OR REPLACE FUNCTION public.tg_uc_pacientes_nome() RETURNS TRIGGER LANGUAGE plpgsql SET search_path=public AS $$
BEGIN IF NEW.nome IS NOT NULL THEN NEW.nome := upper(NEW.nome); END IF; RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS uc_pacientes_nome ON public.pacientes;
CREATE TRIGGER uc_pacientes_nome BEFORE INSERT OR UPDATE OF nome ON public.pacientes
FOR EACH ROW EXECUTE FUNCTION public.tg_uc_pacientes_nome();

-- medicos.nome
CREATE OR REPLACE FUNCTION public.tg_uc_medicos_nome() RETURNS TRIGGER LANGUAGE plpgsql SET search_path=public AS $$
BEGIN IF NEW.nome IS NOT NULL THEN NEW.nome := upper(NEW.nome); END IF; RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS uc_medicos_nome ON public.medicos;
CREATE TRIGGER uc_medicos_nome BEFORE INSERT OR UPDATE OF nome ON public.medicos
FOR EACH ROW EXECUTE FUNCTION public.tg_uc_medicos_nome();

-- profiles.nome (funcionários)
CREATE OR REPLACE FUNCTION public.tg_uc_profiles_nome() RETURNS TRIGGER LANGUAGE plpgsql SET search_path=public AS $$
BEGIN IF NEW.nome IS NOT NULL THEN NEW.nome := upper(NEW.nome); END IF; RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS uc_profiles_nome ON public.profiles;
CREATE TRIGGER uc_profiles_nome BEFORE INSERT OR UPDATE OF nome ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.tg_uc_profiles_nome();

-- prestadores.nome
CREATE OR REPLACE FUNCTION public.tg_uc_prestadores_nome() RETURNS TRIGGER LANGUAGE plpgsql SET search_path=public AS $$
BEGIN IF NEW.nome IS NOT NULL THEN NEW.nome := upper(NEW.nome); END IF; RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS uc_prestadores_nome ON public.prestadores;
CREATE TRIGGER uc_prestadores_nome BEFORE INSERT OR UPDATE OF nome ON public.prestadores
FOR EACH ROW EXECUTE FUNCTION public.tg_uc_prestadores_nome();

-- caixa_sessoes.user_nome
CREATE OR REPLACE FUNCTION public.tg_uc_caixa_user_nome() RETURNS TRIGGER LANGUAGE plpgsql SET search_path=public AS $$
BEGIN IF NEW.user_nome IS NOT NULL THEN NEW.user_nome := upper(NEW.user_nome); END IF; RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS uc_caixa_user_nome ON public.caixa_sessoes;
CREATE TRIGGER uc_caixa_user_nome BEFORE INSERT OR UPDATE OF user_nome ON public.caixa_sessoes
FOR EACH ROW EXECUTE FUNCTION public.tg_uc_caixa_user_nome();

-- agendamentos.paciente_nome
CREATE OR REPLACE FUNCTION public.tg_uc_agendamentos_pac() RETURNS TRIGGER LANGUAGE plpgsql SET search_path=public AS $$
BEGIN IF NEW.paciente_nome IS NOT NULL THEN NEW.paciente_nome := upper(NEW.paciente_nome); END IF; RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS uc_agendamentos_pac ON public.agendamentos;
CREATE TRIGGER uc_agendamentos_pac BEFORE INSERT OR UPDATE OF paciente_nome ON public.agendamentos
FOR EACH ROW EXECUTE FUNCTION public.tg_uc_agendamentos_pac();

-- orcamentos.paciente_nome e medico_nome
CREATE OR REPLACE FUNCTION public.tg_uc_orcamentos_nomes() RETURNS TRIGGER LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF NEW.paciente_nome IS NOT NULL THEN NEW.paciente_nome := upper(NEW.paciente_nome); END IF;
  IF NEW.medico_nome IS NOT NULL THEN NEW.medico_nome := upper(NEW.medico_nome); END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS uc_orcamentos_nomes ON public.orcamentos;
CREATE TRIGGER uc_orcamentos_nomes BEFORE INSERT OR UPDATE OF paciente_nome, medico_nome ON public.orcamentos
FOR EACH ROW EXECUTE FUNCTION public.tg_uc_orcamentos_nomes();

-- 3) Backfill dos registros existentes
UPDATE public.pacientes SET nome = upper(nome) WHERE nome IS NOT NULL AND nome <> upper(nome);
UPDATE public.medicos SET nome = upper(nome) WHERE nome IS NOT NULL AND nome <> upper(nome);
UPDATE public.profiles SET nome = upper(nome) WHERE nome IS NOT NULL AND nome <> upper(nome);
UPDATE public.prestadores SET nome = upper(nome) WHERE nome IS NOT NULL AND nome <> upper(nome);
UPDATE public.caixa_sessoes SET user_nome = upper(user_nome) WHERE user_nome IS NOT NULL AND user_nome <> upper(user_nome);
UPDATE public.agendamentos SET paciente_nome = upper(paciente_nome) WHERE paciente_nome IS NOT NULL AND paciente_nome <> upper(paciente_nome);
UPDATE public.orcamentos SET
  paciente_nome = CASE WHEN paciente_nome IS NOT NULL THEN upper(paciente_nome) ELSE NULL END,
  medico_nome = CASE WHEN medico_nome IS NOT NULL THEN upper(medico_nome) ELSE NULL END
WHERE (paciente_nome IS NOT NULL AND paciente_nome <> upper(paciente_nome))
   OR (medico_nome IS NOT NULL AND medico_nome <> upper(medico_nome));
