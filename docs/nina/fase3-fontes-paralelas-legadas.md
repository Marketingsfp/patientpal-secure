# FASE 3 — Fontes paralelas ou legadas de conhecimento (somente leitura)

Execução investigada (mesma das Fases 1 e 2):
- clínica: POLICLINICA MENINO JESUS `7570ddde-8c1c-4b55-ba72-cf12b2a6c940`
- conversa `d2adc481-8d98-4c89-a161-b9dee204818d`
- mensagem da Nina `33e46c67-5328-472f-b024-9ad38f803499` (07/09/2026 11:36 BRT)
- execução `4a371384-f9ad-46c2-b5eb-49d96120e487`, trace `2089e6b9-ee80-4e2a-a9b5-4479aaf21cff`

Valores citados na mensagem: **R$ 110,00 (PIX/dinheiro) e R$ 130,00 (cartão)** para
ultrassonografia de abdômen total/superior.

## 1. Estruturas legadas encontradas

| Estrutura | Estado | Participa do fluxo atual da Nina |
|---|---|---|
| `procedimentos` (tabela operacional legada) | **ativa** (4.522 registros; 84 de USG) | **SIM** — lida pela tool `buscar_procedimentos` |
| `nina_kb_bases` / `nina_kb_registros` (planilha + embeddings/RAG) | 3 bases: v1 ERRO, v3 INATIVA (250 reg.), v4 ATIVA (366 reg.) | **NÃO** — `searchKnowledgeBase` lê apenas `nina_cat_servicos`/`nina_cat_profissionais` |
| `atend_kb` (FAQ do atendimento humano) | vazia (0 registros) | NÃO |
| `nina_kb_consultas` | log de auditoria (52 registros) | NÃO é fonte de conteúdo |
| `nina_cat_servicos` / `nina_cat_profissionais` (catálogo estruturado) | 0 publicados | SIM, mas retorna vazio |

## 2. Correspondência exata dos valores

**Fonte confirmada da resposta — legada ativa:**
- Fonte: tabela `procedimentos` (via tool `buscar_procedimentos`, `supabaseAdmin`, filtro `ativo = true` + `ilike nome`)
- Registros: `USG ABDOME SUPERIOR` (`f26fe310-…`) e `USG ABDOMINAL TOTAL` (`7da17bc9-…`)
- Conteúdo: `valor_dinheiro_pix = 110,00`, `valor_cartao = 130,00`
- Ainda ativa: **SIM**
- Foi consultada naquela execução: **SIM** (duas chamadas de `buscar_procedimentos`)

**Correspondência secundária — legada inativa (não usada na execução):**
- Fonte: `nina_kb_registros`, base v3 `5d68e460-…` (status INATIVA, criada 02/09/2026)
- 109 registros de USG com embeddings, incluindo exatamente:
  `USG ABDOME SUPERIOR 110/130`, `USG PELVICA 102/120`,
  `USG PELVICA COM DOPPLER 197/235`, `USG PROSTATA 102/120`,
  `USG PROSTATA COM DOPPLER 197/235`, `USG TRANSVAGINAL 102/120`
- Ainda ativa: **NÃO** (status INATIVA; base ATIVA é a v4)
- Foi consultada naquela execução: **NÃO** (nenhum código atual lê `nina_kb_registros`)

Observação relevante: a base **v4 ATIVA não tem nenhum registro de USG** (0 de 366).
Portanto, mesmo que o RAG antigo estivesse ligado, ele não produziria esses preços —
eles vêm da tabela operacional legada.

## 3. Cache

- `consultar_base_conhecimento` → `catalogo-retrieval.server.ts` responde com `cache: false`; não há cache de retrieval nem de RAG.
- `buscar_procedimentos` consulta o banco a cada chamada, sem cache.
- Caches em memória existentes no servidor: instruções da Nina (30 s) e calendários publicados (5 min) — nenhum contém preços.
- Não há Redis, cache de Edge Function nem cache de resposta. TanStack Query existe apenas no frontend e não alimenta o contexto da Nina.
- Hipótese "catálogo esvaziado + cache antigo servindo dados": **descartada**. O log `nina_kb_consultas` da execução (14:36:27 UTC) registra `fonte=catalogo knowledge_status=not_found`, ou seja, o catálogo respondeu vazio em tempo real.

## 4. Código

| Arquivo | Função | Finalidade | Ativo | No fluxo da Nina |
|---|---|---|---|---|
| `src/lib/nina/paciente-tools.server.ts` | `case "buscar_procedimentos"` (linha ~1026) | lê `procedimentos` direto, sem estado de publicação | SIM | **SIM — origem dos preços** |
| `src/lib/nina/knowledge.server.ts` | `searchKnowledgeBase` | ponto único de consulta ao catálogo publicado | SIM | SIM |
| `src/lib/nina/catalogo-retrieval.server.ts` | `buscarNoCatalogo` | lê `nina_cat_servicos`/`nina_cat_profissionais` publicados | SIM | SIM |
| `src/lib/nina/arquitetura/manifesto.ts` | metadados | apenas documenta `nina_kb_registros` | SIM | Não é fonte |
| `src/integrations/supabase/types.ts` | tipos gerados | — | SIM | Não |

Não há preço de ultrassonografia hardcoded em TypeScript, prompts, JSON, seeds, migrations ou constantes.

## 5. Dados de homologação

`src/testes/fase4/dados-sinteticos.ts` cita ultrassonografia apenas como texto de
cenário (pergunta do paciente simulado), sem preços. Nenhum fixture/mock injeta
valores clínicos no contexto da Nina; a Homologação usa a Nina real com as mesmas
tools de produção.

## 6. Gate de saída — classificação

| Fonte | Classificação |
|---|---|
| Tabela `procedimentos` via `buscar_procedimentos` | **Legada ativa** (origem confirmada dos R$ 110 / R$ 130) |
| `nina_kb_registros` v3 (planilha + embeddings) | **Legada inativa** (contém os mesmos valores, não consultada) |
| `nina_kb_registros` v4 ATIVA | Legada inativa para preços de USG (não possui registros de USG) |
| `atend_kb` | Nenhuma correspondência (vazia) |
| Caches | Nenhuma correspondência |
| Hardcode / Mock / fixture | Nenhuma correspondência |

Nada foi apagado, limpo, desativado ou alterado nesta fase.
