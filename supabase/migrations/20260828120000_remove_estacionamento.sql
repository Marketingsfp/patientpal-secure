-- ---------------------------------------------------------------------------
-- Remove o módulo Estacionamento
--
-- O módulo foi criado em 27/08/2026 (migration
-- 20260827200000_estacionamento_movimentos.sql) e removido no dia seguinte, a
-- pedido do dono. A aba, a rota e a biblioteca saíram do código; este arquivo
-- desfaz a parte que ficou no banco.
--
-- A tabela foi conferida antes de cair: ZERO linhas. Nenhum dado de operação
-- foi perdido — o módulo chegou a existir, mas nunca chegou a ser usado.
--
-- A migration que CRIA a tabela é mantida no repositório de propósito, e não
-- apagada: ela registra uma alteração que de fato rodou em produção. Apagá-la
-- faria o histórico mentir sobre o que já foi aplicado, e quem lesse os
-- arquivos depois não entenderia por que a tabela existiu por um dia. O par
-- "cria" + "remove" conta a história inteira, e um banco montado do zero a
-- partir das migrations termina sem a tabela, igual à produção.
--
-- Nada aqui toca em caixa, em fin_lancamentos ou em qualquer outra tabela: o
-- módulo sempre foi isolado, e é por isso que a remoção é só estas duas linhas.
-- ---------------------------------------------------------------------------

DROP TABLE IF EXISTS public.estacionamento_movimentos;

-- O gatilho caiu junto com a tabela; a função que ele chamava existia só para
-- ela e não tem outro uso.
DROP FUNCTION IF EXISTS public.fn_estacionamento_normaliza_placa();

NOTIFY pgrst, 'reload schema';
