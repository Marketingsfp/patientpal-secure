ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'telefonia';

INSERT INTO public.perfis_acesso (clinica_id, chave, nome, descricao, sistema, ativo)
SELECT c.id, 'telefonia', 'TELEFONIA',
       'Atendimento humano das conversas encaminhadas pela Nina.', true, true
FROM public.clinicas c
ON CONFLICT (clinica_id, chave) DO NOTHING;

INSERT INTO public.perfil_permissoes (perfil_id, modulo, acesso)
SELECT pa.id, m.modulo, m.acesso::public.modulo_acesso
FROM public.perfis_acesso pa
CROSS JOIN (VALUES
  ('telefonia','write'),
  ('nina','write'),
  ('chat','write'),
  ('atendimento-multiplo','read'),
  ('agenda','read'),
  ('clientes','read'),
  ('consulta-rapida','read')
) AS m(modulo, acesso)
WHERE pa.chave = 'telefonia'
ON CONFLICT DO NOTHING;