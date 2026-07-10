ALTER TABLE public.fin_lancamentos ADD COLUMN IF NOT EXISTS grupo_pagamento_id uuid;
CREATE INDEX IF NOT EXISTS fin_lancamentos_grupo_pagamento_id_idx ON public.fin_lancamentos(grupo_pagamento_id);