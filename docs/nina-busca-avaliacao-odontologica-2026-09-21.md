# Nina — busca de avaliação odontológica

## Diagnóstico

No reteste de 21/09/2026, sessão 54, a Nina chamou
`consultar_base_conhecimento` com `tipo_atendimento: consulta` e o termo
`avaliação odontológica`. A interpretação estava correta. O retorno foi
`not_found`, provocando o encaminhamento MJ-151.

A execução registrou a leitura de 41 profissionais publicados, sem nenhum
selecionado. Jean Ferreira, Raiani e Karen estavam publicados em ODONTOLOGIA
e tinham `tipo_atendimento: Avaliação odontológica`.

O índice leve da busca incluía nome, especialidades, horários e aliases,
mas omitia `tipo_atendimento`. Como todos os termos do pedido precisam ser
comprovados, a palavra `avaliação` descartava os três profissionais. O campo
aparecia na leitura dos detalhes, que só acontece depois da seleção: tarde
demais para participar da busca.

## Correção

- Incluir `tipo_atendimento`, que já é público, no índice leve e na comparação
  dos atendimentos oferecidos pelo profissional.
- Reconhecer Odontologia, odonto, dentista, odontologista e as formas
  odontológica/odontológico como equivalências de escrita para a busca.
- Registrar os ajustes de escrita também na evidência de consultas e
  profissionais, facilitando diagnósticos futuros.

A palavra `avaliação` continua obrigatória quando consta no pedido. Não foi
adicionada a uma lista de palavras descartáveis. Qualificadores como
infantil e com sedação continuam sendo exigidos, e a categoria de consulta
permanece separada dos exames e procedimentos. Equivalência de escrita não
autoriza copiar preços, preparo ou regras de outro atendimento.

Não há migration, edição do catálogo, alteração de preços, de modalidades,
de permissões, de pacientes ou de vagas existentes. A correção vale para
todas as clínicas no executor compartilhado da homologação e do WhatsApp.

## Validação

- A reprodução da busca exata falhava antes da alteração. Depois, encontra
  os três profissionais e preserva os dados publicados.
- 334 testes aprovados em sete arquivos: busca, interpretação no núcleo real,
  ausência na base, esclarecimentos, confirmação de profissional e agenda.
- O fluxo de interpretação foi testado nos dois canais com banco e modelo
  simulados, comprovando que o resultado encontrado não dispara transferência.
- A continuidade de Odontologia até uma única reserva foi testada em banco
  simulado, preservando escolha do horário, coleta de dados e confirmação.
- Testes negativos cobrem qualificadores ausentes, outro procedimento,
  publicação arquivada, outra clínica, nota interna e rascunho.
- Checagem de tipos, compilação de produção e `git diff --check` aprovados.

O diagnóstico na base real foi somente de leitura. Não foram enviados textos
a pacientes nem criados agendamentos reais nesta correção.

Reversão: reverter o commit e republicar a aplicação. Não há alteração de
dados para desfazer.
