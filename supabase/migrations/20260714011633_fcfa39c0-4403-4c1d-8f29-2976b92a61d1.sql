UPDATE public.perfil_permissoes
SET acesso = 'none'
WHERE perfil_id IN (
  SELECT p.id FROM public.perfis_acesso p
  JOIN public.clinicas c ON c.id = p.clinica_id
  WHERE c.nome = 'POLICLINICA MENINO JESUS'
    AND p.chave <> 'admin'
)
AND modulo IN (
  'equipe','especialidades','disponibilidades','prontuario-modelos',
  'perfis','unidades','medicos','procedimentos','planos','estoque',
  'modelos-documentos','clinicas','tipos-servico','enfermagem-recursos'
)
AND acesso IN ('read','write');