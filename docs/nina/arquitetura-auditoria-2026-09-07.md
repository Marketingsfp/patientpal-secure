# Auditoria do canvas — Nina → Arquitetura (07/09/2026)

Levantamento somente leitura. Nenhum arquivo de comportamento da Nina foi alterado.
Fonte: `src/lib/nina/arquitetura/manifesto.ts` (manifesto), `layout.ts` (posições),
e o código real do fluxo (`src/routes/api/public/whatsapp.$clinicaId.ts` →
`src/lib/whatsapp.server.ts` → módulos de `src/lib/nina/`).

## 1. Números atuais

| Item | Valor |
| --- | --- |
| Nodes no manifesto | 38 |
| Conexões (arestas únicas) | 53 |
| Colunas geradas pelo layout | 16 (0 a 15) |
| Tamanho do desenho | 4.836 × 1.020 px |
| Arquivos de código referenciados | 23 |
| Nodes isolados | 0 |
| Pontos finais | 5 (`status.update`, `handoff.summary`, `protocol.generate`, `metrics.period`, `error.handle`) |

Categorias: PROCESSAMENTO 11, OBSERVABILIDADE 5, TOOLS 5, INSTRUCOES 3,
CONHECIMENTO 3, IA 2, VALIDACAO 2, SAIDA 2, ERRO_FALLBACK 2, ENTRADA 1,
CONTEXTO 1, MEMORIA 1.

## 2. Nodes válidos

Os 38 nodes apontam para arquivos e funções que **existem hoje** — a suíte do
módulo (80 testes, 773 verificações, 0 falhas) confirma arquivo + função de cada
node. Não há node quebrado nem referência morta.

Fluxo principal confirmado no código:

recebimento (webhook Meta) → log bruto → validação/assinatura → deduplicação por
`wa_message_id` → conversa garantida/reaberta → decisão de roteamento (Nina x
humano) → sessão (TTL) → contexto → instruções (catálogo + aprendizados) →
prompt → modelo (AI Gateway) → ferramentas (até 6 rodadas) → validação da
resposta → persistência → envio (texto ou áudio com fallback) → espera/timeout,
encerramento, métricas e evidências.

## 3. Componentes reais ainda **não** representados

1. **Ferramentas do paciente**: o código expõe 13 ferramentas
   (`listar_especialidades`, `buscar_medicos`, `buscar_procedimentos`,
   `dados_da_clinica`, `consultar_base_conhecimento`, `consultar_disponibilidade`,
   `proxima_vaga`, `verificar_horario`, `horario_funcionamento`,
   `identificar_paciente`, `meus_agendamentos`, `agendar`, `nina_ferramenta`).
   O manifesto agrupa isso em 7 nodes.
2. **Blocos de instrução por fase** (`atendimento-fase1` a `fase6`), cada um com
   flag por clínica — hoje somem dentro de `prompt.compose`.
3. **Oferta completa** (`oferta-completa.server.ts`) e **saudação de sessão**
   (`saudacao-sessao.ts`).
4. **Estado do fluxo** (`fluxo-estado.server.ts`) e **gate de identificação**
   (`identificacao-gate.server.ts`) — este último decide o que a Nina pode
   responder antes de identificar o paciente.
5. **Vínculo paciente ↔ conversa** (`atendimento/vinculo-contato.server.ts`).
6. **Canal de voz** (`src/routes/api/nina-fala.ts`, `nina-voz.ts`) e o
   roteador de raciocínio (`reasoning-router.ts`) usado só nesse canal.
7. **Endpoint público de timeout de espera**
   (`src/routes/api/public/nina.espera-timeout.ts`), hoje representado apenas
   pela função interna.
8. **Camada de tracing** (`nina_trace_eventos`) — existe como módulo, mas não é
   um node do mapa.

## 4. Nodes alterados / a revisar

- `tool.catalog.lookup` aponta para `catalogo-retrieval.server.ts`, que hoje é
  chamado por `knowledge.server.ts`, e não diretamente pelo broker: a conexão
  desenhada é mais direta do que a real.
- `llm.model_flag` (`modelo-flag.server.ts`) é usado pelo AI Gateway e também
  pelo canal de voz — o mapa mostra só um caminho.
- `metrics.record` (`telemetria.server.ts`) é acionado dentro do AI Gateway, não
  depois do envio como o desenho sugere.

## 5. Possíveis obsoletos

Nenhum node aponta para código inexistente. O único candidato conceitual é a
representação do catálogo como "recuperação" própria: a busca vetorial existe no
banco mas o caminho ativo é a busca estruturada do catálogo. Recomenda-se
renomear/reposicionar, não excluir.

## 6. Inconsistências de conexão

16 das 53 arestas não ligam colunas vizinhas:

- 7 arestas de retorno **ferramenta → modelo** (salto de 2 colunas para trás) —
  são reais (ciclo tool calling), mas hoje viram linhas longas cruzando tudo.
- `tool.handoff → handoff.queue` (5 colunas para trás).
- `wait.timeout → handoff.queue` (8 colunas para trás) — a maior travessia do
  mapa e a principal responsável pelo emaranhado central.
- `wait.timeout → conversation.close`, `conversation.close → metrics.record`,
  `audio.fallback → message.persist`, `conversation.reopen → routing.decide`,
  `instructions.* → prompt.compose`, `llm.model_flag → llm.generate` ligam nodes
  da mesma coluna (linhas horizontais que passam por cima de outros nodes).

## 7. Problemas de layout observados

- **Largura excessiva**: 16 colunas / 4.836 px exigem muito zoom-out.
- **Coluna sobrecarregada**: a coluna 11 concentra 8 nodes (todas as ferramentas
  + `message.outbound`), enquanto as colunas 0 a 4 têm 1 node cada.
- **Ferramentas depois do modelo**: por serem alcançadas via `tool.execute`, as
  ferramentas caem à direita do modelo e todas as voltas cruzam o miolo — é a
  região central emaranhada que aparece na tela.
- **Ramo de atendimento humano** (`handoff.*`, `protocol.generate`) fica no meio
  do fluxo automático, sem separação visual.
- **Desalinhamento por categoria**: dentro da coluna a ordenação é alfabética
  pelo nome, então IA, TOOLS e OBSERVABILIDADE se misturam na vertical.
- **Fluxo principal não se destaca**: as arestas do caminho feliz têm o mesmo
  peso visual das de erro, timeout e observabilidade.
- **Finais dispersos**: 5 pontos finais espalhados por 4 colunas diferentes.

## 8. Estratégia recomendada de reorganização (para a próxima fase)

1. **Faixas horizontais por papel** (entrada/processamento, IA+ferramentas,
   humano, observabilidade), mantendo o caminho feliz numa única linha central.
2. **Ferramentas em bloco vertical ao lado do modelo**, com o ciclo
   modelo ↔ ferramenta desenhado como um par curto, e não como sete voltas
   longas.
3. **Agrupamento visual (cluster)** para: instruções/prompt, ferramentas,
   handoff humano, observabilidade — com recolher/expandir.
4. **Reduzir colunas** fundindo etapas de passagem obrigatória (log → validação
   → deduplicação) em uma faixa mais compacta.
5. **Diferenciar tipos de aresta**: fluxo principal (traço forte), retorno/ciclo
   (tracejado), erro/timeout (destaque), observabilidade (linha leve).
6. **Ordenar cada coluna por categoria**, não por nome.
7. Antes de mexer no desenho, **completar o manifesto** com os componentes do
   item 3 e ajustar as ligações do item 4 — reorganizar um mapa incompleto só
   troca um emaranhado por outro.

Sem mudanças de comportamento. Fase 1 não iniciada.
