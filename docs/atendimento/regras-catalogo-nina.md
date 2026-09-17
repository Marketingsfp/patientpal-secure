# Regras do catálogo da Nina — 17/09/2026

Regra de negócio solicitada pela clínica, compartilhada pelo atendimento real e pela homologação:

- Profissional **SFP** em uma consulta ou entre os executantes de um procedimento exige atendimento humano. A busca identificada encerra o turno e usa o encaminhamento existente. Uma lista mista não escolhe automaticamente o item SFP. O executor reconsulta a publicação antes de consultar vagas, selecionar horário, coletar cadastro ou gravar a reserva, inclusive para sessões antigas.
- **Técnico/técnica** são nomes genéricos: a projeção enviada ao modelo e os textos de resumo/confirmação omitem esses nomes. Preços, preparo, horários e demais informações permanecem disponíveis. Os nomes e IDs operacionais são preservados internamente para não romper a agenda.
- Idades publicadas são **mínimas**, inclusive zero. Apresentação: “a partir de X anos/meses”, mantendo número e unidade. Critérios explícitos são normalizados na leitura; a instrução publicada orienta também a interpretação das observações em texto livre. Preços, jejum e periodicidade não viram idade.

Não há motor de confiança ou avaliação por nota. São regras administrativas, publicadas nas instruções e aplicadas nos pontos operacionais necessários.

## Publicação

A migration `20260918001000_nina_regras_catalogo_sfp_idade.sql` cria uma **nova versão** global das instruções de WhatsApp a partir da versão atual. Preserva o conteúdo histórico, os rascunhos em edição e as instruções do painel interno. Remove a regra antiga conhecida que proibia interpretar idade isolada como mínima. O novo bloco explicita a precedência sobre outras orientações antigas sobre esse tema. Quando não existe publicação, o fallback atualizado contém as mesmas regras.

Aplicar a migration e publicar o código juntos. A versão em uso segue o cache normal de instruções; turnos já iniciados conservam seu snapshot. Publicar posteriormente um rascunho antigo exige manter estas regras no novo texto.

## Verificação local

Testes de geração executam o núcleo real com modelo, banco e encaminhamento simulados e rede proibida, nos modos produção e homologação. Cobrem SFP, falha de transferência e preservação das informações ao omitir o nome genérico. Testes do executor verificam a publicação vigente antes da reserva e do cadastro e preservam o cenário de escolha das 10:20.

`scripts/test-nina-regras-catalogo-postgres.py --pg-bin /usr/lib/postgresql/18/bin` verifica a migration em PostgreSQL descartável: nova versão, histórico e rascunhos preservados, painel interno intacto e repetição sem duplicar versões. Nenhuma mensagem é enviada a pacientes nesses testes.
