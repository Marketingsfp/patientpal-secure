-- A parcela 0 de `contrato_mensalidades` é a taxa de adesão, não uma
-- mensalidade. A contagem que alimenta a carência das regras de benefício
-- ("só vale após a Nª mensalidade paga") não filtrava por `numero_parcela`,
-- então a adesão entrava na conta e toda carência liberava um mês antes do
-- cadastrado: quem tinha pago a 1ª mensalidade contava 2. Num convênio com
-- adesão cobrada no ato, os R$ 20,00 da adesão sozinhos já liberariam
-- benefício sem nenhuma mensalidade paga.
--
-- O lado da Agenda vive em src/lib/convenio/info-convenio-paciente.ts; aqui
-- corrigimos o lado do Caixa, dentro da CTE `pagas` de `fila_caixa_hoje`.
-- A função é longa e só esta linha muda, então aplicamos o filtro sobre a
-- definição vigente em vez de reescrever as 200 linhas.
do $$
declare
  src text;
  novo text;
  alvo constant text := 'on m.contrato_id = cv.contrato_id and m.status = ''pago''';
begin
  select pg_get_functiondef(p.oid) into src
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'fila_caixa_hoje';

  if src is null then
    raise exception 'fila_caixa_hoje não encontrada';
  end if;

  if position(alvo || ' and m.numero_parcela > 0' in src) > 0 then
    raise notice 'fila_caixa_hoje já ignora a taxa de adesão; nada a fazer.';
    return;
  end if;

  if position(alvo in src) = 0 then
    raise exception 'CTE pagas de fila_caixa_hoje não bate com o esperado — revisar à mão';
  end if;

  novo := replace(src, alvo, alvo || ' and m.numero_parcela > 0');
  execute novo;
end $$;
