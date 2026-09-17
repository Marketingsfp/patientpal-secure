# Escolha do médico, disponibilidade e modalidade

Correção de continuidade conversacional e autorização de leitura da agenda. Não altera cadastro, vagas, preços, permissões de escrita ou regras de confirmação de agendamento.

## Evidência e diagnóstico

A captura enviada mostra uma oferta composta: “Você gostaria de verificar as vagas disponíveis na agenda? Se sim, qual dos profissionais você prefere?”, seguida de “com o joao helio”, nova oferta específica e “sim”. A Nina voltou a pedir confirmação e preferência de dia, em vez de apresentar o resultado da agenda.

Foi reproduzido em testes um defeito em `consulta-agenda.ts`: `ofertaAgenda` examinava apenas a última pergunta da resposta. A escolha do profissional após a oferta composta não era reconhecida como interesse em consultar vagas. Três variantes de escolha falharam antes do ajuste e passaram depois.

O “sim” depois da oferta específica já autoriza a leitura quando o profissional está corretamente definido. Não foram consultados os registros históricos de execução da mensagem da captura; não foi possível confirmar com segurança se houve rejeição de ferramenta naquele último turno. A repetição de confirmação e a exigência desnecessária de data também foram tratadas explicitamente no prompt.

## Depois

- Duas perguntas consecutivas no fim da mesma resposta podem formar oferta de consulta seguida da escolha do profissional. Uma pergunta sobre cadastro, pagamento ou outro assunto não herda a oferta anterior.
- A escolha inequívoca autoriza a consulta somente daquele médico. Um aceite genérico de uma lista ainda não escolhe alguém. Recusas, homônimos, mudança de clínica/sessão e troca de profissional continuam protegidos.
- Sem preferência de data, o prompt orienta usar `proxima_vaga`; não é necessário pedir uma data para iniciar a consulta. Preferências informadas continuam sendo respeitadas.
- As opções devem trazer médico, atendimento, data, horário, modalidade explicada e valores por forma de pagamento. O executor já retorna a modalidade e sua orientação, inclusive a diferença entre pré-agendamento, hora marcada e ficha.
- Sem pré-agendamento, o fluxo informa os períodos publicados para comparecimento, sem reservar horário ou coletar cadastro para isso. Modalidade indefinida exige conferência pela equipe.
- Consultar não seleciona nem reserva uma vaga. O resumo final, o aceite da opção exata e a verificação cadastral continuam necessários para agendar. Falta de vagas mantém o encaminhamento humano.

## Publicação

A instrução CONV-07 foi acrescentada antes da seção “5. DADOS E OPERAÇÕES”, preservando integralmente a v29 e sua LING-02. A interface confirmou **v30 publicada em 17/09/2026 às 16:19**, para todas as clínicas. O texto publicado foi comparado integralmente com o esperado (32.956 caracteres).

O mesmo bloco fica em `src/lib/nina/prompt/consulta-agenda.ts`, usado somente no fallback. O prompt publicado continua sendo a fonte comportamental, sem injeção de instruções ocultas e sem motor de confiança. A etapa do fallback que orientava coleta imediatamente após confirmar interesse foi corrigida para consultar vagas antes.

## Validação

213 testes locais passaram, executados em grupos separados para isolar mocks:

- 42 de autorização de consulta, incluindo as frases da captura e casos negativos.
- 25 de continuidade e comprovação do interesse, incluindo a persistência da oferta composta e o aceite subsequente.
- 92 do executor da agenda, incluindo consulta sem data após escolha/aceite, modalidades em produção e homologação, ausência de gravação automática e regressão 08:00 versus 10:20.
- 54 de histórico, modalidades, agenda sem vagas, montagem do prompt e resposta direta.

`bun run typecheck` e `git diff --check` passaram. Os testes usam banco e transporte simulados; nenhum paciente, agendamento, fila ou catálogo real foi alterado. Não houve teste do modelo real com a nova publicação.

Naquela validação, o prompt v30 estava ativo para as próximas execuções. A correção de código faz parte da entrega ao GitHub de 17/09/2026 e depende da implantação do site. O teste da captura é anterior à publicação; as mensagens antigas permanecem intactas. O rascunho posterior v31 reúne esta orientação e a interpretação contextual, conforme `agenda-contextual-2026-09-17.md`.
