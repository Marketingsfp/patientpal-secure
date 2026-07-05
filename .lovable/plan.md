# Plano — Auditoria de Integração + Proposta Visual

Dois entregáveis independentes. Nada é implementado antes da sua aprovação.

---

## Frente 1 — Auditoria de Integração Ponta a Ponta

Objetivo: rodar 2 jornadas completas (particular e associado) cobrindo 5 tipos de serviço, do orçamento à NFS-e, e reportar onde a integração quebra ou diverge da regra.

### Escopo por jornada

Cada jornada roda como bateria Playwright autenticada como admin, com dados prefixados `[TESTE-AUDIT-INT]` e cleanup 100% ao final.

**Jornada A — Paciente Particular**
1. Criar paciente particular.
2. Criar orçamento com 5 itens: Consulta, Laboratório, Ultrassom, MAPA, Holter.
3. Validar `fn_regras_procedimento` para cada item (regra vinda do cadastro, não hardcoded).
4. Conversão via `ConversaoOrcamentoDialog` — item a item, validando badges operacional/financeiro.
5. Registrar pagamento no Caixa (sessão aberta e fechada).
6. Emitir NFS-e nos 2 modos (`por_item` e `agrupada`), alternando `clinicas.nfse_modo_emissao`.
7. Validar reflexo em Financeiro (`fin_atendimentos`, `fin_lancamentos`) e vínculo `nfse_id`.
8. Sem contrato/mensalidade — validar que nenhum informativo indevido é gerado.

**Jornada B — Paciente Associado (cartão de benefícios / convênio)**
1. Paciente vinculado a `cb_convenios` ativo, com contrato de assinatura vigente.
2. Mesmo orçamento (5 itens), aplicando `procedimento_cb_convenio_valores` e `cb_convenio_regras`.
3. Validar desconto/copay por item conforme regra do convênio.
4. Conversão + Caixa + NFS-e (idem).
5. Validar contrato: `contrato_mensalidades` não afetada indevidamente; informativo de convênio emitido quando aplicável.
6. Validar split (`procedimento_split_regras` / `pagamento_splits`) se o convênio exigir.

### Matriz de verificação (13 pontos por jornada)

| # | Ponto | Fonte da verdade |
|---|---|---|
| 1 | Orçamento criado com todos itens | `orcamentos` + `orcamento_itens` |
| 2 | Regra correta por item | `fn_regras_procedimento` |
| 3 | Status operacional coerente | dialog + RPC |
| 4 | Status financeiro coerente | dialog + RPC |
| 5 | Venda antecipada permitida onde configurada | `procedimento_unidade_regras` |
| 6 | Agendamento em cascata no cancelamento | `agendamentos` |
| 7 | Pagamento sem estorno automático | `caixa_movimentos` |
| 8 | Bloqueio de conversão duplicada | RPC |
| 9 | NFS-e por item (1-para-1) | `nfse` + `fin_atendimentos.nfse_id` |
| 10 | NFS-e agrupada (N-para-1) | idem |
| 11 | Idempotência NFS-e | `NFSE_JA_EMITIDA` |
| 12 | Convênio: desconto/copay | `cb_convenio_regras` |
| 13 | Contrato: informativo correto | `contratos_assinatura` + `contrato_mensalidades` |

### Entregáveis da Frente 1
- Relatório antes/depois por jornada.
- Lista de bugs/divergências (com evidência: print + query).
- Confirmação de cleanup + zero alteração em dado real.
- **Nenhuma correção aplicada nesta fase** — apenas diagnóstico. Correções entram como Migração D (se necessária) após você aprovar o que corrigir.

---

## Frente 2 — Proposta Visual (mockups, sem código)

Objetivo: reduzir atrito de navegação. Entregar **modelos visuais** para você escolher, antes de qualquer refactor.

### Diagnóstico rápido do estado atual
- Menu lateral com ~40 itens em ~10 seções (`src/lib/permissoes-presets.ts` lista 60+ módulos).
- Paginação profunda: Financeiro tem 12 sub-rotas, Cartão de Benefícios tem 6, etc.
- Já existe Modo Turbo (`turbo-mode.ts`) mas só na Agenda.
- Dashboard atual (`app.index.tsx`) é só um seletor de subsistema, não um painel operacional.

### O que será proposto (5 protótipos visuais)

1. **Menu curto — Command Rail**
   Sidebar reduzida a 7 grupos fixos (Início, Agenda, Pacientes, Financeiro, Serviços, Equipe, Config). Sub-rotas viram tabs no topo da página, não itens de menu. Alvo: cortar itens visíveis de ~40 para ~7.

2. **Command Palette (Ctrl+K)**
   Overlay estilo Linear/Raycast: busca fuzzy em telas, ações, pacientes, orçamentos, agendamentos. Atalhos globais (F2–F9 já existentes + Ctrl+K). Fonte: rotas registradas + tabelas indexadas.

3. **Busca Global no topbar**
   Input persistente no header, sempre visível, com autocomplete cross-entity (paciente, orçamento, agendamento, NFS-e, contrato). Ctrl+K abre a mesma coisa em modal.

4. **Recepção Turbo expandida**
   Modo Turbo hoje vive só na Agenda. Proposta: estender para Recepção, Caixa e Fluxo, com HUD de atalhos visível quando ativo, e uma tela "cockpit" única substituindo a navegação entre 4 abas.

5. **Dashboard por perfil (7 variantes)**
   - **admin/gestor**: KPIs financeiros + ocupação + alertas.
   - **médico**: agenda do dia + pendências de prontuário.
   - **recepção**: fila + próximos horários + orçamentos abertos.
   - **caixa**: sessão aberta + pendências de pagamento + estornos.
   - **financeiro**: contas a receber/pagar + NFS-e do dia + alertas.
   - **enfermeiro**: triagens abertas + alertas de enfermagem.
   - **gestor de pessoas**: ponto + férias + treinamentos.

### Como você vai ver os mockups
Vou gerar direções visuais renderizadas (não código de produção) para você aprovar antes de implementar. Sequência:
1. Escolha de paleta + tipografia + layout (3 perguntas visuais).
2. Geração de 3 direções renderizadas do novo shell (sidebar + topbar + dashboard + Ctrl+K).
3. Você escolhe 1. Só então parto para o código.

### Entregáveis da Frente 2
- 3 direções visuais renderizadas do novo shell.
- Wireframe dos 7 dashboards por perfil.
- Mapa de menu antes/depois (de ~40 para ~7 itens).
- **Nenhum código alterado nesta fase.**

---

## Ordem de execução proposta

1. Você aprova este plano.
2. Frente 1 roda primeiro (não bloqueia UI, é diagnóstico).
3. Em paralelo, faço as 3 perguntas visuais da Frente 2 e gero as direções.
4. Consolido: relatório da auditoria + direção visual escolhida → plano de implementação (Migração D + refactor de shell).

## Fora de escopo agora
- Não altero backend nesta fase (auditoria é read-only + testes com prefixo).
- Não implemento nenhum componente novo antes da sua escolha visual.
- Não mexo em Modo Turbo atual até definir o cockpit.
