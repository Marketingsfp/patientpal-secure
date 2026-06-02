-- Remove tipo "cirurgia" do catálogo de tipos de serviço
DELETE FROM public.tipos_servico WHERE lower(nome) = 'cirurgia';
