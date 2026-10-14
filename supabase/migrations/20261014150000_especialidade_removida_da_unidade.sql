-- "Excluir" especialidade vale só para a unidade (14/10/2026).
--
-- A lista de nomes é compartilhada entre as unidades, e todas as 67
-- especialidades estão em uso em algum lugar (médico, serviço, regra do
-- cartão) ou ativas em outra unidade — apagar a linha de `especialidades`
-- afetaria as outras unidades e, pelos ON DELETE CASCADE / SET NULL, apagaria
-- vínculos e o histórico. Por isso "excluir" na tela marca a especialidade
-- como REMOVIDA NA UNIDADE: some da lista dessa unidade e fica inativa nela;
-- nada muda nas outras e nenhum registro é apagado.
--
-- Removida implica inativa. As listas de escolha (Agenda, Serviços, cartão,
-- Nina) já filtram `ativo = true` em especialidades_da_unidade, então não
-- precisam mudar. Quem reativar a especialidade na unidade (tela, importação
-- de serviços ou de equipe) desfaz a remoção automaticamente.

ALTER TABLE public.especialidade_unidade
  ADD COLUMN IF NOT EXISTS removida boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.especialidade_unidade_removida_coerente()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.removida THEN
    IF TG_OP = 'INSERT' OR NOT OLD.removida OR NOT NEW.ativo THEN
      NEW.ativo := false;          -- excluída fica inativa
    ELSE
      NEW.removida := false;       -- reativou: volta a valer
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_especialidade_unidade_removida ON public.especialidade_unidade;
CREATE TRIGGER trg_especialidade_unidade_removida
  BEFORE INSERT OR UPDATE ON public.especialidade_unidade
  FOR EACH ROW EXECUTE FUNCTION public.especialidade_unidade_removida_coerente();
