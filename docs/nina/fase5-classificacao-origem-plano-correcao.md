# FASE 5 — Classificação da origem e plano de correção (diagnóstico, sem alteração)

## 1. Classificação da origem

Causas comprovadas, combinadas:

- **E — Prompt/contexto** (causa principal): a tabela completa de procedimentos com preços é
  interpolada no texto de sistema a cada mensagem.
- **B — Fonte legada** (causa secundária, mesma origem de dados): a tool `buscar_procedimentos` lê
  diretamente a tabela operacional `procedimentos`, sem estado de publicação.

Descartadas com evidência:

- A — catálogo estruturado atual: consultado e vazio (`knowledge_status = not_found`).
- C — RAG/vector store: `nina_kb_registros` não é lida por nenhum código ativo.
- D — cache: retrieval registrou `cache: false`; nenhum cache guarda preços.
- F — hardcode / G — mock de homologação: nenhum preço de USG no código, fixtures, seeds ou migrations.
- H — vazamento de sessão: contexto continha apenas a mensagem do próprio lead.
- I — outra tool/backend: as três tools do turno estão auditadas.
- J — alucinação sem fonte: os valores conferem exatamente com a base; não houve invenção.
- K: não se aplica.

## 2. Origem x falha de proteção

**Origem da informação:** dados reais e atuais da tabela operacional `procedimentos`, entregues ao
modelo por dois caminhos simultâneos — injeção no prompt e tool `buscar_procedimentos`.

**Por que o sistema permitiu enviar:** não existe validação que exija origem publicada para fatos de
preço. A regra "só o catálogo publicado é fonte" foi aplicada apenas em
`consultar_base_conhecimento`; o prompt e a tool de procedimentos continuaram alimentando o modelo
com a fonte legada, e nada compara a resposta final com o estado de publicação. Em outras palavras:
a política de publicação existe em uma porta e não nas outras duas.

## 3. Evidências

| Conclusão | Fonte | ID/registro | Arquivo/função | Trecho | Relação com a execução |
|---|---|---|---|---|---|
| Preços no prompt | `nina_execucao_evidencias`, etapa 1, mensagem `system` (98.724 chars) | execução `4a371384-f9ad-46c2-b5eb-49d96120e487` | `src/lib/whatsapp.server.ts` — consulta linha ~595, formatação ~743, bloco `PROCEDIMENTOS:` ~1000 | `- USG ABDOME SUPERIOR [ULTRASSONOGRAFIA]: PIX R$ 110.00 / cartão R$ 130.00` | contexto real desta chamada, antes de qualquer tool |
| Tool legada retornou os preços | evidência etapa 12, mensagem `tool` idx 7 | mesma execução | `src/lib/nina/paciente-tools.server.ts`, `case "buscar_procedimentos"` | `{"nome":"USG ABDOME SUPERIOR","valor_dinheiro_pix":110,"valor_cartao":130}` | 2ª chamada de tool do turno |
| Dados existem e estão ativos | tabela `procedimentos` | `f26fe310-…` (ABDOME SUPERIOR), `7da17bc9-…` (ABDOMINAL TOTAL) | — | 110,00 / 130,00, `ativo = true` | fonte lida pelos dois caminhos acima |
| Catálogo publicado vazio | evidências etapas 10 e 11 + `nina_kb_consultas` | consulta `4a1f385b-723a-4a4f-b4fe-d49aecbaede5` (14:36:27 UTC) | `catalogo-retrieval.server.ts` | `status: PUBLICADO`, `encontrados: []`, `cache: false` | mesma execução |
| Modelo não inventou | evidência etapa 14 (resposta original) | mesma execução | — | valores idênticos aos da tool | comparação direta |
| Transformação posterior | evidência etapa 17 | mesma execução | `gerarRespostaNina` | saudação duplicada; nenhum preço alterado | defeito separado |

Nenhuma conclusão se apoia em arquivo que não participou da execução: a base legada de planilha
(`nina_kb_registros` v3) contém valores iguais, mas está classificada como **não causal**.

## 4. Plano de correção proposto (não executado)

Ordem sugerida, do menor risco ao maior:

1. **Definir a política de fonte oficial para preço.** Decisão do time: enquanto o catálogo não
   estiver publicado, a Nina deve (a) não informar preço, ou (b) informar preço da tabela
   operacional identificando a origem. Hoje o comportamento é (b) implícito e não declarado.
2. **Retirar a tabela de preços do prompt.** O bloco `PROCEDIMENTOS:` injeta ~98 mil caracteres a
   cada mensagem (46,8 mil tokens de entrada nesta execução). Substituir por consulta sob demanda
   via tool reduz custo, latência e elimina o caminho não auditável.
3. **Alinhar `buscar_procedimentos` à política.** Passar a ler o catálogo publicado ou, se a
   diretoria optar por manter a tabela operacional, marcar o retorno com `fonte: legado` e registrar
   isso na execução.
4. **Grounding de fatos:** toda informação factual (preço, médico, procedimento, horário, regra)
   devolvida por tool carrega `fonte` + `registro_id` + `status_publicacao`; a resposta é auditável
   contra essas referências.
5. **Corrigir a saudação duplicada** em `gerarRespostaNina` (defeito independente encontrado na Fase 4).
6. **Preservar, não apagar:** as bases legadas (`nina_kb_bases` v1/v3, `nina_kb_registros`) só devem
   ser removidas depois de decisão explícita, em fase separada — não participam do fluxo.

## 5. Proteção estrutural recomendada

Viável e de baixo risco: as tools já retornam objetos estruturados, então acrescentar
`fonte`, `registro_id` e `status_publicacao` é aditivo e não muda o comportamento do modelo.
Com isso, uma execução que produz um preço sem nenhuma tool com referência oficial fica detectável
na auditoria (e, num segundo momento, no avaliador Sol e na Homologação).

Não recomendo bloquear automaticamente toda frase sem referência: o mesmo texto mistura fato e
cortesia, e um bloqueio genérico derrubaria respostas legítimas. O caminho é começar por detecção e
alerta, e só depois discutir bloqueio para as categorias críticas (preço e horário).

## 6. Relatório final

- **MENSAGEM INVESTIGADA:** `33e46c67-5328-472f-b024-9ad38f803499` — conversa `d2adc481-8d98-4c89-a161-b9dee204818d`, 07/09/2026 11:36:30 BRT
- **EXECUÇÃO / TRACE:** `4a371384-f9ad-46c2-b5eb-49d96120e487` / `2089e6b9-ee80-4e2a-a9b5-4479aaf21cff`
- **MODELO:** `google/gemini-3.7-flash` (Lovable AI Gateway, thinking high, 1 tentativa, sem fallback)
- **AMBIENTE:** projeto único, schema `public`, Homologação isolada logicamente (Lead Teste 02, sessão 19), clínica POLICLINICA MENINO JESUS
- **CATÁLOGO CONSULTADO:** SIM
- **REGISTROS ENCONTRADOS:** nenhum no catálogo publicado (0 publicados); 12 itens retornados pela tabela legada; 84 itens de USG existentes nessa tabela
- **FONTES LEGADAS ENCONTRADAS:** tabela `procedimentos` (ativa, usada); `nina_kb_bases`/`nina_kb_registros` v3 (inativa, não usada)
- **RAG/VECTOR STORE UTILIZADO:** NÃO
- **CACHE UTILIZADO:** NÃO
- **VALORES ENCONTRADOS NO CÓDIGO:** NÃO
- **VALORES PRESENTES NO CONTEXTO DO MODELO:** SIM (bloco `PROCEDIMENTOS:` do prompt e retorno da tool)
- **CONTEXTO ANTERIOR CONTINHA OS VALORES:** NÃO (nenhuma mensagem anterior de sessão foi reenviada)
- **TOOLS UTILIZADAS:** `buscar_procedimentos("ultrassom")` (não encontrado), `buscar_procedimentos("USG")` (12 itens com preços), `consultar_base_conhecimento("ultrassonografia")` (vazio)
- **ORIGEM DA INFORMAÇÃO:** E — Prompt/contexto, combinada com B — Fonte legada (tabela `procedimentos`)
- **EVIDÊNCIA:** item 3 desta fase
- **FALHA QUE PERMITIU A RESPOSTA:** a exigência de fonte publicada existe só na consulta ao catálogo; prompt e tool de procedimentos entregam a base operacional sem estado de publicação, e nenhuma validação de grounding confere a resposta final
- **NÍVEL DE CONFIANÇA DA CONCLUSÃO:** alto — contexto, tools, resposta original e mensagem persistida foram lidos integralmente da mesma execução
- **CORREÇÃO RECOMENDADA:** item 4 desta fase
- **RISCOS DA CORREÇÃO:** tirar os preços do prompt e/ou fechar a tool no catálogo publicado faz a Nina parar de informar preço até a publicação do catálogo — impacto operacional direto no WhatsApp de produção; exige decisão do time antes de qualquer alteração
- **TESTES NECESSÁRIOS APÓS CORRIGIR:** homologação com os leads de teste em perguntas de preço (com e sem catálogo publicado), regressão do avaliador Sol, comparação de tokens/latência, verificação de que nenhuma resposta cita preço sem referência de fonte, e checagem de que atendimento humano e agenda não foram afetados

**Gate final:** parado no diagnóstico. Nenhuma limpeza, migração, alteração de prompt, remoção de
base legada, invalidação de cache ou mudança de comportamento da Nina foi executada.
