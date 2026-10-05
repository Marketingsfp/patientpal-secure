# Escolha de profissional nos exames

Regra solicitada em 05/10/2026: Laboratório, Enfermagem e outros setores não são médicos para o paciente escolher.

## Comportamento

- Somente equipes/setores: apresentar exame, escala e informações publicadas. Quando houver agendamento, perguntar interesse ou dia/período, aproveitando o que já foi informado.
- Um médico com nome próprio: não pedir escolha entre profissionais.
- Vários médicos por nome: oferecer escolha quando ainda não definida pelo paciente.
- Lista mista: contar apenas os médicos por nome para essa pergunta; preservar informações e possibilidades de atendimento por equipe.
- Manter IDs internos dos executantes para consultar a agenda. Omitir identificação genérica também no resumo e na confirmação.
- Preservar SFP, atendimento sem pré-agendamento, escala antes das vagas e aceite final da reserva.

## Implementação e limites

`REGRA_ESCOLHA_PROFISSIONAL_NOMINAL` integra o prompt de referência e é adicionada como instrução obrigatória no núcleo compartilhado, mesmo quando a publicação carregada é antiga. As orientações de contagem e apresentação foram alinhadas. Não houve alteração do prompt publicado no banco, do Jev, de dados da clínica ou de reservas, nem nova chamada de IA.

A interpretação de nomes continua com o modelo. Os testes com modelo/serviços simulados verificam entrega da regra nos dois ambientes, preservação do executante e ausência de operações extras. Não comprovam adesão do modelo real. Implantação no Lovable e teste real após implantação permanecem pendentes.

## Validação local

51 testes distintos passaram em cinco arquivos: escolha nominal, regras de catálogo/SFP, escala antes das vagas, escala ausente e precedência do turno. TypeScript sem erros e `git diff --check` aprovado. Nenhuma mensagem enviada nem reserva ou transferência operacional realizada.
