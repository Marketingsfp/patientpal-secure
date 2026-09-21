# Informações públicas das três clínicas

Dados autorizados pelo responsável em 21/09/2026, a partir das imagens e da identificação das unidades na conversa. Fonte única do diretório: `src/lib/nina/clinicas-grupo.ts`. O diretório alimenta ferramentas, contexto do atendimento e prévia das instruções; as regras orientam responder só os dados solicitados da clínica mencionada.

| Clínica | Endereço | CEP | Telefone | Funcionamento habitual |
|---|---|---|---|---|
| Policlínica Menino Jesus | Rua Expedicionários, 148 — Centro, São João de Meriti — RJ | 25520-591 | (21) 2655-1085 | Segunda a sexta 07h–18h; sábado 07h–14h; domingo fechado |
| Policlínica São Francisco de Paula | Avenida Comendador Teles, 2414 — Vilar dos Teles, São João de Meriti — RJ | 25561-162 | (21) 2699-1990 | Segunda, terça, quinta e sexta 06h–19h; quarta 06h–21h; sábado 06h–14h; domingo fechado |
| Clínica Consulta Hoje | Rua Mercedes, 75 — Centro, Queimados — RJ | 26325-320 | (21) 97377-5431 | Segunda a sexta 08h–17h; sábado 08h–12h; domingo fechado |

Os horários da São Francisco são os que o responsável identificou como filial e associou ao endereço acima. “Filial” isoladamente não resolve a unidade numa conversa; o modelo deve usar o contexto ou esclarecer. Telefones de contato não foram confirmados como números de WhatsApp.

Na leitura do cadastro existente, Menino Jesus estava sem endereço/telefone, Consulta Hoje tinha outro telefone e não havia versões de calendário nas três clínicas. Esses cadastros administrativos não foram modificados: o diretório público confirmado fornece as informações para a Nina sem alterar documentos financeiros, Agenda, distribuição, horários do atendimento humano ou métricas.

`dados_da_clinica` e `horario_funcionamento` aceitam `clinica`: nome/chave de uma das três ou `todas`. O seletor nunca altera o `clinicaId` operacional. Sem seletor, usam a clínica do atendimento; seletor desconhecido pede esclarecimento, sem cair silenciosamente na clínica atual. O diretório só está associado aos três IDs conferidos, não a outras organizações.

Funcionamento habitual não garante abertura numa data excepcional. Calendário publicado válido tem prioridade sobre a rotina; suas exceções são mantidas e conflitos não são ignorados. Na ausência de confirmação de uma data, a Nina informa somente a rotina e oferece confirmar com a equipe. As leituras entre clínicas se limitam aos calendários públicos dos IDs fixos do grupo, nunca a pacientes, preços ou agendamentos.

Testes locais cobrem os 21 dias/horários, contatos, aliases, unidade indefinida, grupo completo, isolamento de outras organizações, feriados/exceções e execução das ferramentas em WhatsApp e homologação com banco simulado e rede proibida. Não houve envio de mensagens ou alteração de registros operacionais reais.

A ativação exige publicação do código da aplicação no Lovable. Não há migration estrutural ou publicação de novos horários operacionais.

As instruções WhatsApp foram publicadas como v43 (`1e86be70-f8c4-4a7a-9ad4-a0a31a94c9bb`, MD5 `b5879223b4616fa4004753268073ffaf`, 52.868 caracteres), acrescentando apenas a regra INST-01. A v42 foi arquivada com conteúdo preservado; painel interno v4 e limite de duas perguntas permanecem intactos. A migration de conteúdo foi validada em PostgreSQL descartável quanto a preservação do histórico/rascunhos, idempotência e respeito a publicações posteriores.

Validação final: 128 testes aprovados e verificação TypeScript sem erros. Código da aplicação ainda depende de publicação no Lovable.
