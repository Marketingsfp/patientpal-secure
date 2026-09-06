UPDATE public.nina_cat_servicos
   SET status = 'RASCUNHO', publicado_em = NULL
 WHERE clinica_id = '7570ddde-8c1c-4b55-ba72-cf12b2a6c940'
   AND nome = 'ECOCARDIOGRAMA';

UPDATE public.nina_cat_profissionais
   SET status = 'RASCUNHO', publicado_em = NULL
 WHERE clinica_id = '7570ddde-8c1c-4b55-ba72-cf12b2a6c940'
   AND nome = 'Alex Louza';