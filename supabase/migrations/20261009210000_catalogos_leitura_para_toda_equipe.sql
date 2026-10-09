-- Leitura das listas de especialidades e de categorias de serviço volta a
-- valer para toda a equipe logada. Aplicado em produção em 09/10/2026 com
-- autorização do dono.
--
-- A revisão de segurança automática do agente do Lovable
-- (drizzle/migrations/0004_catalogos_leitura_so_admin.sql, 09/10/2026 17:19
-- UTC, não pedida pelo dono) deixou só administradores lerem essas listas.
-- Recepção, caixa, médicos, telefonia e enfermagem usam os nomes na Agenda,
-- no agendamento, na guia e no cadastro — sem leitura, as listas vinham
-- vazias. São só nomes (Cardiologia, Consulta...), sem dado de paciente.
--
-- A restrição de leitura da tabela "permissions" da mesma revisão continua.

DROP POLICY IF EXISTS especialidades_select_admin ON public.especialidades;
DROP POLICY IF EXISTS especialidades_select ON public.especialidades;
CREATE POLICY especialidades_select ON public.especialidades
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS tipos_servico_select_admin ON public.tipos_servico;
DROP POLICY IF EXISTS tipos_servico_select ON public.tipos_servico;
CREATE POLICY tipos_servico_select ON public.tipos_servico
  FOR SELECT TO authenticated USING (true);
