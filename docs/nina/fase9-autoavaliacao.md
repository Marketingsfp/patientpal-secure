# FASE 9 — Autoavaliação e melhoria contínua

## O que foi cruzado

Para cada resposta da Nina, o sistema relaciona:

confiança × erro reportado × transferência × agendamento confirmado ×
resultado da conversa.

O erro reportado é ligado à decisão pela mensagem, pela execução ou pela
conversa — nessa ordem —, então um erro apontado na revisão manual encontra a
resposta exata que o gerou.

Indicadores por faixa de confiança (90–100, 75–89, 50–74, abaixo de 50):
respostas liberadas, transferidas, esclarecidas, com erro reportado,
agendamentos confirmados/não confirmados e conversas resolvidas. Também há o
recorte por validador que falhou, por bloqueador e por categoria.

Exemplo do que o painel responde: se muitas respostas de 95% estão sendo
reportadas como erro, a faixa alta aparece com taxa de erro acima do aceitável
e o sistema sugere endurecer o limite.

## Propostas — a Nina sugere, a pessoa decide

A análise gera propostas (subir limite, ajustar peso, revisar validador,
criar bloqueador objetivo). Regras duras:

- toda proposta nasce como **pendente**;
- a Nina nunca aprova nem aplica nada; o banco recusa aprovação sem pessoa
  responsável e recusa aplicação sem aprovação prévia;
- uma proposta só passa a valer depois de **aprovada** e **aplicada** por uma
  pessoa, e mesmo assim só pode mexer em pesos, limites e mínimos por risco,
  dentro de faixas válidas;
- **bloqueadores absolutos não são ajustáveis por essa via**. Qualquer ajuste
  inválido é descartado e a política padrão prevalece.

O bloqueador manda mais que o número: com 96 pontos e dois preços oficiais
diferentes para o mesmo procedimento, o resultado continua sendo não responder
e transferir para atendente.

## Critério final de aceite — onde cada resposta está registrada

| # | Pergunta | Onde é respondida |
| --- | --- | --- |
| 1 | O que o paciente perguntou? | Intenção detectada e conversa/mensagem vinculadas na auditoria da decisão |
| 2 | Que informação a Nina utilizou? | Fontes registradas na decisão (tipo, referência, publicada) |
| 3 | De onde veio? | Mesma lista de fontes: catálogo publicado, agenda ou base de conhecimento |
| 4 | As ferramentas funcionaram? | Ferramentas registradas com sucesso/erro por chamada |
| 5 | Havia inconsistência? | Validador de conflito e lista de bloqueadores |
| 6 | Qual o nível de confiança? | Pontuação e nível gravados na decisão |
| 7 | Por que esse nível? | Resultado de cada validador com código de motivo |
| 8 | Por que respondeu, perguntou ou transferiu? | Decisão do motor, etapa de ativação aplicada e motivo |
| 9 | O backend confirmou a ação? | Validação imediatamente antes da gravação; a liberação só ocorre após retorno real |
| 10 | Ficou tudo registrado? | Tabela de decisões de confiança + rastro da execução + propostas |

Tudo isso é interno: nada disso é mostrado ao paciente.

## Onde está

- `src/lib/nina/confidence/calibracao.ts` — correlação e geração de propostas (camada pura).
- `src/lib/nina/confidence/politica-override.server.ts` — política em vigor por clínica.
- `src/lib/nina/confianca.functions.ts` — análise, registro e decisão das propostas.
- `src/components/nina/CalibracaoConfianca.tsx` — painel de revisão nas Métricas.
- Tabela `nina_confianca_propostas`, com trava no banco para aprovação/aplicação.

## Validação

- Verificação de tipos: sem erros.
- `bun test src/lib/nina/confidence/calibracao.test.ts`: 9 testes, 25 verificações.
- Nenhuma proposta foi criada, aprovada ou aplicada; nenhuma política mudou.
