-- Pasta Ortodôntica: número da pasta física de arquivo usada pela Ortodontia.
--
-- Não confundir com as numerações que já existem em `pacientes`:
--   * codigo_prontuario  -> a ficha cadastral do paciente (número do prontuário);
--   * numero_pasta       -> numeração legada da importação, hoje praticamente
--                           uma cópia do prontuário (12.370 de 12.503 registros
--                           são idênticos), por isso não serve para a Ortodontia.
--
-- No sistema antigo esse número aparecia ao lado da Ficha Cadastral e é o que a
-- recepção usa para puxar a pasta física antes do atendimento de ortodontia.
-- Texto (e não número) de propósito: no arquivo físico existem códigos com
-- letra e com zero à esquerda.

alter table public.pacientes
  add column if not exists pasta_ortodontica text;

comment on column public.pacientes.pasta_ortodontica is
  'Número/código da pasta física de arquivo da Ortodontia. Digitado pela recepção; não é o prontuário.';

-- Índice parcial: só uma fração dos pacientes é de ortodontia, então o índice
-- fica pequeno e ainda assim atende a busca da recepção pelo número da pasta.
create index if not exists pacientes_pasta_ortodontica_idx
  on public.pacientes (clinica_id, pasta_ortodontica)
  where pasta_ortodontica is not null;
