-- Agenda por ORDEM DE CHEGADA (ficha livre).
--
-- Ate aqui todo agendamento precisava cair numa vaga vazia da grade gerada.
-- Para medico que atende por ficha (ordem de chegada, sem hora marcada) isso
-- vira uma trava: quando as vagas do dia acabam, a recepcao nao consegue mais
-- incluir paciente nenhum, mesmo o medico ainda estando atendendo.
--
-- Com `ordem_chegada = true` a grade passa a ser so a ordem da fila: o encaixe
-- e aceito sem consumir vaga e entra no FIM da fila do dia, recebendo o proximo
-- numero de ficha (091, 092...). Entrar no fim e obrigatorio porque a ficha e
-- POSICIONAL — uma linha inserida no meio do dia renumeraria todas as fichas
-- seguintes, inclusive as ja impressas e entregues ao paciente.
--
-- O padrao FALSE mantem todas as agendas existentes com o comportamento atual.
ALTER TABLE public.medico_agendas
  ADD COLUMN IF NOT EXISTS ordem_chegada boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.medico_agendas.ordem_chegada IS
  'TRUE = medico atende por ficha/ordem de chegada. A grade de horarios vira '
  'apenas a ordem da fila: a recepcao pode continuar dando ficha depois que as '
  'vagas geradas do dia acabam, e cada encaixe entra no fim da fila.';
