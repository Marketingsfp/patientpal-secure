# Consolidação das instruções da Nina — 20/09/2026

Pedido: aplicar a auditoria do prompt publicado, corrigindo conflitos com regras já definidas pela clínica. Foi confirmada pelo usuário a nova conduta para forma de pagamento ausente: confirmar com a equipe, sem presumir recusa.

## Fontes e publicação

- WhatsApp global v40 (`84fb6c59-7b38-481c-b93b-848040b1c24b`), lida no banco: 41.780 caracteres.
- Painel interno global v3 (`7a90f80b-79a4-4c8f-97a5-4940aafa97db`): ponto e regra de emojis, sem contexto da clínica.
- O painel v2 já continha somente um ponto. O problema original não foi causado pela adição posterior da proibição de emojis.
- Snapshot anterior: `src/lib/nina/__tests__/fixtures/instrucoes-antes-consolidacao.json`.
- A identidade publicada foi preservada; preços, médicos, horários, critérios cadastrais e dados históricos não foram editados.

`behavior-v4.ts` mantém o nome por compatibilidade e passa a representar o texto consolidado de reserva. Regras compartilhadas compõem tanto o fallback quanto a publicação. `painel-interno.ts` restaura o texto completo do painel, incluindo `${contextoTexto}` e os limites de acesso do colaborador.

O script `scripts/nina/gerar-consolidacao-instrucoes.ts` gera a migration de dados a partir dessas fontes. Ele não acessa o banco. A migration cria novas versões, liga-as às anteriores e arquiva as versões substituídas. Não altera o conteúdo, autoria ou datas históricas; o trigger existente pode atualizar o `updated_at` quando muda o status. Não modifica schema, RLS, permissões, pacientes ou financeiro. Rascunhos são preservados.

Publicação aplicada e conferida por hash no banco:

| Escopo | Versão | Identificador | MD5 do conteúdo |
|---|---|---|---|
| WhatsApp | 41 | `9fd865e8-4c07-4a4d-abbd-5f1cb8135eab` | `f7f3d390b2379af613f33e8598484867` |
| Painel interno | 4 | `498be217-2e8b-49ee-9ffb-5dd86eb8ac31` | `5bdb9e5abf1d131f01f12a176aa2ddfa` |

A aplicação exige a mesma identificação e hash do conteúdo auditado. Alteração concorrente aborta a transação inteira. Reaplicação após execução bem-sucedida não duplica versões nem sobrescreve versões publicadas posteriormente. Instalações sem publicação continuam com o fallback.

## Regras alinhadas

| Tema | Conduta consolidada |
|---|---|
| Interpretação | Analisa mensagem e sessão; separa consulta de exame/procedimento e identifica objetivo antes da busca. |
| Termo de busca | Somente o atendimento e qualificadores; sem frase inteira, saudação, sintomas ou datas no termo. |
| Abreviações e nomes | Equivalências localizam candidatos; não autorizam trocar atendimento ou escolher homônimos. |
| Esclarecimento | Uma tentativa por solicitação ambígua; se persistir, encaminha com a dúvida. Coleta e escolha de horário têm suas próprias etapas. |
| Atualização de fatos | Consulta atualizada a cada nova pergunta; reaproveita o resultado correspondente nas rodadas do mesmo turno. |
| Mais de quatro profissionais | Pergunta primeiro entre o primeiro disponível e a escolha de profissionais/horários; aproveita preferência já expressa. |
| Um profissional | Primeira data disponível ou outra data, sem oferecer escolha de médico. |
| Preços | Agrupa uma vez somente se todas as opções e condições forem iguais; qualquer diferença mantém preços por profissional. Ausência não comprova igualdade. |
| Pix/cartão | Mesmo valor, mencionados juntos; Pix antecipado pelo WhatsApp e desconto em dinheiro quando perguntado. |
| Forma não cadastrada | Confirma com a equipe. Lista vazia ou incompleta não comprova aceite nem recusa. Diagnóstico de evidências alinhado à regra. |
| Idade | Idade isolada é mínima conforme regra vigente; preserva número e unidade. Não transforma peso em idade. |
| SFP | Encaminhamento silencioso, também na homologação. |
| Aviso de encaminhamento | Sistema coordena aviso/protocolo; não há ordem paralela para o modelo criar uma segunda mensagem. |
| Motivo interno | Distingue atendimento não encontrado, ausência de vagas, ambiguidade persistente e falha técnica. |
| Cancelamento/remarcação | Recepção dá continuidade; não cria outra reserva para simular remarcação. |
| Painel interno | Instruções completas, contexto autorizado e respeito às permissões; publicação sem contexto é rejeitada. |

As ambiguidades de peso, horários conflitantes, anestesia, recorrência quinzenal, modalidade e limite de chegada continuam dependendo da equipe. Campo vazio não foi preenchido por inferência. Prazo de 30 minutos, exceção de reserva comprovada, não repetição de encaminhamento e retenção de resumos continuam sob controle do servidor.

## Verificação de fonte isolada

A regra temporária `TESTE-ARQUITETURA-9381` saiu do prompt do WhatsApp. O mecanismo próprio já existente continua em `src/lib/nina/homologacao/verificacoes.server.ts`, usa exclusivamente o escopo `homologacao`, publica marcadores de teste nesse escopo e não declara ferramentas operacionais. A interface `VerificacoesHomologacao.tsx` permite executar essa verificação. Não adicionar novamente uma exceção de teste ao prompt de produção.

## Validação e limites

- Testes do carregamento por versão, preservação da identidade, renderização do contexto do painel e equivalência entre publicação gerada e fallback.
- Testes de busca com erros/abreviações, consulta versus exame, esclarecimento único, regras do catálogo, pagamento, transferência SFP e aviso de transferência.
- Migration executada em PostgreSQL descartável: histórico/rascunho preservados, idempotência, publicação posterior intacta e rollback diante de edição concorrente.
- Testes com modelo e banco simulados verificam integração e contratos; não demonstram, sozinhos, aderência de toda resposta do modelo real. Não foram criados agendamentos nem enviadas mensagens a pacientes nesta atualização.
- ESLint sem erros nas linhas alteradas e nos arquivos novos, conferência de diff e compilação dos módulos alterados com Bun aprovados. Há pendências anteriores de formatação e avisos de tipos nos arquivos existentes, fora dos trechos alterados. O build completo pelo Vite parou antes da compilação por incompatibilidade de separadores de caminho no Windows em `@lovable.dev/mcp-js` (`routesDir`); não foi declarado como aprovado.

Para reverter comportamento, publicar uma nova versão a partir do conteúdo anterior adequado pela interface oficial. Não apagar versões, reescrever históricos nem restaurar o painel defeituoso de ponto isolado. Uma alteração posterior nas constantes requer regeneração e revisão da publicação correspondente, sem sobrescrever automaticamente edições feitas na Arquitetura.
