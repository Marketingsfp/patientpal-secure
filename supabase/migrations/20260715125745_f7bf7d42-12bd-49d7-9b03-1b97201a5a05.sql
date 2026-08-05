
-- 1. Add 'estorno' to caixa_mov_tipo enum
ALTER TYPE public.caixa_mov_tipo ADD VALUE IF NOT EXISTS 'estorno';
