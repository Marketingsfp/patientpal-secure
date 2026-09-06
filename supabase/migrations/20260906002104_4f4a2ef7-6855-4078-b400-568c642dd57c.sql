-- 1) Sequência global (não reinicia, não reaproveita números)
CREATE SEQUENCE IF NOT EXISTS public.atend_conversas_numero_seq AS bigint START WITH 1000 INCREMENT BY 1;

-- 2) Coluna nova (aditiva; o UUID `id` continua sendo a chave técnica)
ALTER TABLE public.atend_conversas ADD COLUMN IF NOT EXISTS numero_conversa bigint;

-- 3) Backfill histórico, em ordem de criação, sem disparar o trigger de updated_at
ALTER TABLE public.atend_conversas DISABLE TRIGGER trg_conv_touch;
DO $$
DECLARE _n bigint; _base bigint;
BEGIN
  SELECT count(*) INTO _n FROM public.atend_conversas WHERE numero_conversa IS NULL;
  IF _n > 0 THEN
    -- reserva um bloco contíguo da sequência antes de gravar
    _base := nextval('public.atend_conversas_numero_seq');
    PERFORM setval('public.atend_conversas_numero_seq', _base + _n);
    UPDATE public.atend_conversas c
       SET numero_conversa = _base + o.rn - 1
      FROM (
        SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn
          FROM public.atend_conversas
         WHERE numero_conversa IS NULL
      ) o
     WHERE c.id = o.id;
  END IF;
END $$;
ALTER TABLE public.atend_conversas ENABLE TRIGGER trg_conv_touch;

-- 4) Unicidade global + obrigatoriedade
CREATE UNIQUE INDEX IF NOT EXISTS atend_conversas_numero_conversa_key
  ON public.atend_conversas (numero_conversa);
ALTER TABLE public.atend_conversas ALTER COLUMN numero_conversa SET DEFAULT nextval('public.atend_conversas_numero_seq');
ALTER TABLE public.atend_conversas ALTER COLUMN numero_conversa SET NOT NULL;
ALTER SEQUENCE public.atend_conversas_numero_seq OWNED BY public.atend_conversas.numero_conversa;

-- 5) Geração sempre no banco: valor vindo da aplicação é ignorado
CREATE OR REPLACE FUNCTION public.fn_atend_conversa_numero_insert()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.numero_conversa := nextval('public.atend_conversas_numero_seq');
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_atend_conversa_numero_insert ON public.atend_conversas;
CREATE TRIGGER trg_atend_conversa_numero_insert
  BEFORE INSERT ON public.atend_conversas
  FOR EACH ROW EXECUTE FUNCTION public.fn_atend_conversa_numero_insert();

-- 6) Imutabilidade após atribuído (encerrar/reabrir/transferir não muda)
CREATE OR REPLACE FUNCTION public.fn_atend_conversa_numero_imutavel()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.numero_conversa IS DISTINCT FROM OLD.numero_conversa THEN
    RAISE EXCEPTION 'O número da conversa (#%) é permanente e não pode ser alterado', OLD.numero_conversa;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_atend_conversa_numero_imutavel ON public.atend_conversas;
CREATE TRIGGER trg_atend_conversa_numero_imutavel
  BEFORE UPDATE OF numero_conversa ON public.atend_conversas
  FOR EACH ROW EXECUTE FUNCTION public.fn_atend_conversa_numero_imutavel();

COMMENT ON COLUMN public.atend_conversas.numero_conversa IS
  'Número curto, único no sistema inteiro e permanente da conversa (exibido como #1342). Não confundir com protocol_number, que é o protocolo do atendimento gerado no encerramento.';