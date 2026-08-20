-- Fila de cobrança do Caixa: o "dia" passa a ser o dia de Brasília.
--
-- `fila_caixa_hoje` recorta os agendamentos do dia com
--
--     a.inicio >= _data::timestamptz  and  a.inicio < (_data + 1)::timestamptz
--
-- e esse cast usa o fuso do servidor, que é UTC. Na prática a janela ia das
-- 21h do dia anterior às 21h do dia pedido (horário de Brasília). Resultado:
--
--   * agendamento marcado para hoje a partir das 21h nunca entrava na fila;
--   * agendamento de ontem depois das 21h aparecia como se fosse de hoje.
--
-- O lado do navegador (src/routes/_authenticated/app.caixa.tsx) também mandava
-- a data em UTC, o que fazia a fila inteira virar para o dia seguinte às 21h;
-- isso foi corrigido junto, usando hojeBR().
--
-- A função é longa e só estas bordas mudam, então aplicamos o ajuste sobre a
-- definição vigente em vez de reescrever as 200 linhas — mesmo padrão usado em
-- 20260819220000_carencia_ignora_taxa_adesao.sql.
do $$
declare
  src text;
  novo text;
  ini constant text := '_data::timestamptz';
  fim constant text := '(_data + 1)::timestamptz';
begin
  select pg_get_functiondef(p.oid) into src
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'fila_caixa_hoje';

  if src is null then
    raise exception 'fila_caixa_hoje não encontrada';
  end if;

  if position('America/Sao_Paulo' in src) > 0 then
    raise notice 'fila_caixa_hoje já usa o fuso de Brasília; nada a fazer.';
    return;
  end if;

  if position(ini in src) = 0 or position(fim in src) = 0 then
    raise exception 'bordas de data de fila_caixa_hoje não batem com o esperado — revisar à mão';
  end if;

  novo := replace(src, fim, '((_data + 1)::timestamp at time zone ''America/Sao_Paulo'')');
  novo := replace(novo, ini, '(_data::timestamp at time zone ''America/Sao_Paulo'')');
  -- O padrão do parâmetro também era o dia de Greenwich.
  novo := replace(
    novo,
    '_data date DEFAULT CURRENT_DATE',
    '_data date DEFAULT ((now() at time zone ''America/Sao_Paulo'')::date)'
  );
  execute novo;
end $$;
