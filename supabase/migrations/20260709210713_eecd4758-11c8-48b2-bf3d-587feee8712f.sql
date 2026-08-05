ALTER TABLE public.caixa_movimentos
  ADD COLUMN IF NOT EXISTS destino_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS destino_nome text;