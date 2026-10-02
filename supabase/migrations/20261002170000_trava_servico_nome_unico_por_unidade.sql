-- Trava anti-duplicação de serviços (procedimentos) por unidade.
--
-- Dentro de uma mesma clínica não pode haver dois serviços ATIVOS com o mesmo
-- nome, ignorando maiúsculas/minúsculas, acentos e espaços extras. Unidades
-- diferentes têm tabelas de preço independentes, então o mesmo nome em outra
-- clínica continua permitido. Cadastros inativos ficam fora da trava (são as
-- cópias preservadas da unificação de 02/10/2026); reativar um deles enquanto
-- houver outro ativo com o mesmo nome é recusado.
--
-- A tela mostra "Serviço já cadastrado. Utilize a edição do registro
-- existente." ao reconhecer o nome do índice (src/lib/traduzir-erro.ts).
-- A mesma normalização existe no front em src/lib/nome-servico.ts.

create or replace function public.servico_nome_chave(nome text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select btrim(regexp_replace(
    lower(translate(coalesce(nome, ''),
      'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç',
      'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc')),
    '\s+', ' ', 'g'))
$$;

create unique index if not exists uq_procedimentos_clinica_nome_ativo
  on public.procedimentos (clinica_id, public.servico_nome_chave(nome))
  where ativo;
