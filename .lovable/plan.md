## Objetivo

Hoje, no cadastro de Serviços, o campo **Especialidade** aceita só uma. Já existe uma tabela auxiliar (`procedimento_especialidades`) com vínculo N:N e até uma seção "Outras especialidades", mas ela está **escondida quando o tipo é Procedimento ou Exame** — só aparece em Consulta.

A mudança é estender esse multi-vínculo para qualquer categoria (Consulta, Exame, Procedimento), mantendo o mesmo registro de serviço, o mesmo nome e os mesmos valores. Assim, "VITAMINA B12" pode aparecer em Endocrinologia, Clínica Geral, etc., sem duplicar.

## Como vai funcionar

No diálogo "Editar serviço / Novo serviço":

1. **Especialidade principal** (campo já existente) — continua igual, é a especialidade "dona" do serviço, usada como rótulo padrão na listagem.
2. **Outras especialidades** (seção nova, antes só aparecia para Consulta) — passa a aparecer também para Exame e Procedimento. Lista todas as especialidades cadastradas com checkbox; o que estiver marcado vincula o serviço àquela especialidade.

Na tela de listagem de Serviços, a coluna **Especialidade** mostrará todas as especialidades vinculadas (ex.: "ENDOCRINOLOGIA, CLÍNICA GERAL"), e o filtro por especialidade considerará qualquer um dos vínculos.

Na agenda e nos demais lugares onde o serviço é escolhido a partir da especialidade do médico, ele aparecerá se a especialidade do médico bater com **qualquer uma** das especialidades vinculadas ao serviço.

## Detalhes técnicos

- `src/routes/_authenticated/app.procedimentos.tsx`:
  - Remover a condição que esconde a seção "Outras especialidades" quando `tipo !== 'consulta'`.
  - No `handleSave`, remover a guarda que só sincroniza `procedimento_especialidades` para consultas — passar a sincronizar para todos os tipos.
  - Na listagem, exibir todas as especialidades vinculadas (já temos `vincEspMap`); usá-lo também no filtro por especialidade.
- Nenhuma mudança de schema: a tabela `procedimento_especialidades` e suas policies já existem.
- Sem mudanças em repasse, cartão benefícios ou financeiro — apenas a relação serviço↔especialidade fica N:N de fato.

## Fora do escopo

- Não duplicar registros existentes.
- Não alterar valores nem regras de cartão benefícios.
- Não mexer no cadastro de médico.
