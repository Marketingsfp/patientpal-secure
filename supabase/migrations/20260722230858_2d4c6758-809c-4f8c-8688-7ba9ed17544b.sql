
ALTER TABLE public.cb_convenios
  ADD COLUMN IF NOT EXISTS acrescimo_cartao_modo text
    CHECK (acrescimo_cartao_modo IN ('percentual','valor_fixo')),
  ADD COLUMN IF NOT EXISTS acrescimo_cartao_percentual numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS acrescimo_cartao_valor numeric(10,2) NOT NULL DEFAULT 0;
