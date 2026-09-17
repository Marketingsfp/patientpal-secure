-- 1) Perfis com acesso ao módulo financeiro também leem o repasse padrão
CREATE OR REPLACE FUNCTION public.medicos_repasse_lista(_clinica_id uuid)
 RETURNS TABLE(id uuid, tipo_repasse text, percentual_repasse_padrao numeric, valor_repasse_padrao numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT m.id, m.tipo_repasse::text, m.percentual_repasse_padrao, m.valor_repasse_padrao
  FROM public.medicos m
  WHERE m.clinica_id = _clinica_id
    AND (
      public.can_manage_medicos(auth.uid(), _clinica_id)
      OR public.has_module_access(auth.uid(), _clinica_id, 'financeiro', 'read')
    );
$function$;

-- 2) Repasse da INFILTRACAO (CADA) do Dr. Paulo Roberto L Monteiro = R$ 90,00 (só se ainda estiver em branco)
UPDATE public.medico_convenios
   SET valor = 90.00
 WHERE id = '2e06ca8e-f5ac-4ded-936c-31911d802377'
   AND medico_id = 'f3e122ff-696a-42ae-837e-b5c79b4fec23'
   AND nome = 'INFILTRACAO (CADA)'
   AND valor IS NULL;