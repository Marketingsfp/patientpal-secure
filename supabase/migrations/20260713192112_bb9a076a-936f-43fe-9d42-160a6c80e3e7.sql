ALTER TABLE public.pagamento_splits
  DROP CONSTRAINT IF EXISTS pagamento_splits_pagamento_id_fkey;

ALTER TABLE public.pagamento_splits
  ADD CONSTRAINT pagamento_splits_pagamento_id_fkey
  FOREIGN KEY (pagamento_id)
  REFERENCES public.fin_lancamentos(id)
  ON DELETE CASCADE;