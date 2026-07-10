UPDATE public.fin_lancamentos
SET status = 'cancelado',
    descricao = COALESCE(descricao, '') || ' [CANCELADO — valor inconsistente, correção manual 07/07/2026]'
WHERE id IN (
  'e9c4a181-9793-4858-ace9-201c6de4ed01',
  'e9e7cc48-66fa-4d51-8387-3f992112ffa9'
);