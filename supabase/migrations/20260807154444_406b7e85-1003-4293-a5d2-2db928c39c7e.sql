CREATE OR REPLACE FUNCTION public.fn_valida_nome_paciente()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_nome text;
BEGIN
  -- Só valida quando o nome é novo ou foi alterado, para não travar
  -- a edição de cadastros legados que já possuem nomes fora do padrão.
  IF TG_OP = 'UPDATE' AND NEW.nome IS NOT DISTINCT FROM OLD.nome THEN
    RETURN NEW;
  END IF;

  -- Limpa: remove tudo que não for letra ou espaço e normaliza espaços
  v_nome := regexp_replace(COALESCE(NEW.nome, ''), '[^[:alpha:] ]', '', 'g');
  v_nome := btrim(regexp_replace(v_nome, '\s{2,}', ' ', 'g'));

  IF length(v_nome) < 2 THEN
    RAISE EXCEPTION 'Nome inválido: informe o nome usando apenas letras e espaços.';
  END IF;

  IF length(v_nome) > 200 THEN
    RAISE EXCEPTION 'Nome muito longo (máx. 200 caracteres).';
  END IF;

  NEW.nome := v_nome;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_valida_nome_paciente ON public.pacientes;
CREATE TRIGGER trg_valida_nome_paciente
BEFORE INSERT OR UPDATE OF nome ON public.pacientes
FOR EACH ROW EXECUTE FUNCTION public.fn_valida_nome_paciente();