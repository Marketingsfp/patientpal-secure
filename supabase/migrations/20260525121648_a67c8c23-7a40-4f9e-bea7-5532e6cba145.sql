CREATE OR REPLACE FUNCTION public.medicos_limpar_nome()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.nome IS NOT NULL THEN
    NEW.nome := upper(
      regexp_replace(
        btrim(NEW.nome),
        '^(\s*(dr|dra)\.?\s+)+',
        '',
        'i'
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_medicos_limpar_nome ON public.medicos;
CREATE TRIGGER tg_medicos_limpar_nome
BEFORE INSERT OR UPDATE OF nome ON public.medicos
FOR EACH ROW
EXECUTE FUNCTION public.medicos_limpar_nome();

UPDATE public.medicos
SET nome = upper(
  regexp_replace(
    btrim(nome),
    '^(\s*(dr|dra)\.?\s+)+',
    '',
    'i'
  )
)
WHERE nome ~* '^(\s*(dr|dra)\.?\s+)+';