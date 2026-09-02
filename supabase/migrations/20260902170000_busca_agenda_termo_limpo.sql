-- Parte 3 da correcao da busca colada: buscar_pacientes_agenda.
--
-- Ela alimenta o campo de paciente DENTRO da tela de Agenda. Ficou de fora das
-- partes 1 e 2, entao colar um nome do WhatsApp ou de um PDF de convenio ali
-- continuava sem achar o paciente -- mesmo problema, mesma causa: espaco duro
-- (NBSP), espaco duplicado, tabulacao e caractere de largura zero fazem o
-- LIKE nao casar com nada.
--
-- Unica mudanca: as linhas do declare que preparam o termo, que agora passam
-- por public.normalizar_termo_busca. O restante do corpo e copia exata da
-- definicao que esta em producao hoje (md5 1b6514e30c35613ba96bbb560d68b212).
-- Nada e gravado: a funcao segue somente leitura.

create or replace function public.buscar_pacientes_agenda(
  _clinica_ids uuid[],
  _termo text,
  _limite integer default 20
)
returns table (
  id uuid, nome text, cpf text, telefone text, data_nascimento date,
  clinica_id uuid, codigo_prontuario text, numero_pasta text
)
language plpgsql stable security definer set search_path = public
as $$
declare
  -- A limpeza vem antes de tudo: o termo colado chega com espaco duro, espaco
  -- repetido, tabulacao e caractere invisivel, e qualquer um deles derruba o
  -- LIKE para zero resultado.
  v_limpo   text := public.normalizar_termo_busca(_termo);
  v_termo   text := v_limpo;
  v_norm    text := upper(public.strip_accents(v_limpo));
  v_digits  text := regexp_replace(v_limpo, '\D', '', 'g');
  v_limite  int  := least(greatest(coalesce(_limite, 20), 1), 50);
  v_data    date := null;
  v_allowed uuid[];
  v_is_numeric boolean;
begin
  if auth.uid() is null
     or _clinica_ids is null
     or array_length(_clinica_ids, 1) is null
     or (length(v_norm) < 2 and length(v_digits) < 2) then
    return;
  end if;

  select array_agg(distinct m.clinica_id)
    into v_allowed
  from public.clinica_memberships m
  where m.user_id = auth.uid() and m.ativo = true
    and m.clinica_id = any(_clinica_ids);
  if v_allowed is null then return; end if;

  -- "Termo numérico" = só dígitos, espaços e separadores comuns
  -- Ex.: "123.456.789-00", "(11) 91234-5678", "01/01/1990", "1234"
  v_is_numeric := (v_termo ~ '^[\d\s\.\-\/\(\)\+]+$') and length(v_digits) >= 2;

  -- Data de nascimento
  if v_termo ~ '^\d{4}-\d{2}-\d{2}$' then
    begin v_data := v_termo::date; exception when others then v_data := null; end;
  elsif v_termo ~ '^\d{2}[\/\-]\d{2}[\/\-]\d{4}$' then
    begin v_data := to_date(replace(v_termo, '-', '/'), 'DD/MM/YYYY'); exception when others then v_data := null; end;
  elsif length(v_digits) = 8 and v_is_numeric then
    -- 8 dígitos podem ser data (DDMMAAAA) OU prefixo de CPF/telefone.
    -- Tenta como data; se inválida, cai para busca numérica adiante.
    begin v_data := to_date(v_digits, 'DDMMYYYY'); exception when others then v_data := null; end;
  end if;

  -- Branch 1: data de nascimento
  if v_data is not null then
    return query
    select p.id, p.nome, p.cpf, p.telefone, p.data_nascimento, p.clinica_id,
           p.codigo_prontuario, p.numero_pasta
    from public.pacientes p
    where p.ativo = true
      and p.clinica_id = any(v_allowed)
      and p.data_nascimento = v_data
    order by p.nome
    limit v_limite;
    return;
  end if;

  -- Branch 2: numérico (CPF, telefone, prontuário, pasta)
  if v_is_numeric then
    return query
    select p.id, p.nome, p.cpf, p.telefone, p.data_nascimento, p.clinica_id,
           p.codigo_prontuario, p.numero_pasta
    from public.pacientes p
    where p.ativo = true
      and p.clinica_id = any(v_allowed)
      and (
        p.cpf_digits like v_digits || '%'
        or p.codigo_prontuario like v_digits || '%'
        or p.codigo_prontuario_anterior like v_digits || '%'
        or p.numero_pasta like v_digits || '%'
        or (p.telefone is not null
            and regexp_replace(p.telefone, '\D', '', 'g') like '%' || v_digits || '%')
      )
    order by
      case when p.cpf_digits = v_digits then 0
           when p.codigo_prontuario = v_digits then 0
           else 1 end,
      p.nome
    limit v_limite;
    return;
  end if;

  -- Branch 3: nome (prefixo)
  return query
  select p.id, p.nome, p.cpf, p.telefone, p.data_nascimento, p.clinica_id,
         p.codigo_prontuario, p.numero_pasta
  from public.pacientes p
  where p.ativo = true
    and p.clinica_id = any(v_allowed)
    and p.nome like v_norm || '%'
  order by case when p.nome = v_norm then 0 else 1 end, p.nome
  limit v_limite;
end;
$$;
