# Auditoria de Duplicidades no Menu

**Data:** 2026-07-06
**Status:** Auditoria — SEM implementação. Aguardando aprovação do usuário.
**Bloqueio:** Agenda V2 travada até esta auditoria ser aprovada.

Regras aplicadas nesta análise:
- Nenhuma alteração de dados históricos.
- Nenhuma migration destrutiva sugerida.
- Preferência por soluções aditivas (aliases, redirects, renomeação de labels).
- Manter naming oficial ("Cartão de Benefícios", "Associados"). Não usar "Convênios" em UI nova.

---

## PARTE 1 — Cartão de Benefícios × Relatórios do Cartão

### 1.1 Finalidade de cada módulo

| Módulo | Finalidade real |
|---|---|
| **Benefícios** (`/app/cartao-beneficios/beneficios`) | CRUD de **regras de benefício** (desconto/gratuidade) que um convênio/plano concede sobre um procedimento ou especialidade. É **cadastro**. |
| **Relatórios do Cartão** (`/app/cartao-beneficios/relatorios`) | **Dashboard analítico** de contratos, mensalidades, inadimplência, adesão e uso. É **BI operacional**. |

**Conclusão de finalidade:** NÃO são duplicados. São camadas distintas (regra cadastrada × uso agregado). O que gera confusão é o **label do menu** ("Benefícios" vs "Relatórios Cartão") aparecer no mesmo centro sem hierarquia visual clara.

### 1.2 Telas

- **Benefícios:** tabela + form (Convenio, Escopo servico/especialidade, tipo_desconto percentual/valor/gratuidade, valor).
- **Relatórios Cartão:** KPIs (contratos ativos, MRR, inadimplência), tabelas de mensalidades, exportação Excel, drilldown por plano.
- Módulos vizinhos no mesmo centro: Contratos (Vendas), Convênios, Dependentes, Modelos.

### 1.3 Rotas

```
/app/cartao-beneficios/contratos     → Vendas / contratos assinados
/app/cartao-beneficios/convenios     → Cadastro de convênios + regras
/app/cartao-beneficios/dependentes   → Dependentes por contrato
/app/cartao-beneficios/modelos       → Modelos de contrato (planos)
/app/cartao-beneficios/beneficios    → Regras de benefício por convênio
/app/cartao-beneficios/relatorios    → Relatórios/BI
```

### 1.4 Tabelas utilizadas

| Módulo | Tabelas |
|---|---|
| Benefícios | `cb_beneficios`, `cb_convenios`, `procedimentos`, `especialidades` |
| Relatórios | `contratos_assinatura`, `contrato_mensalidades`, `contrato_dependentes`, `planos_assinatura`, `pacientes`, `agendamentos`, `fin_lancamentos` |
| Contratos | `contratos_assinatura`, `contrato_mensalidades`, `planos_assinatura` |
| Convênios | `cb_convenios`, `cb_convenio_regras`, `cb_convenio_faixas` |
| Modelos | `planos_assinatura` |

**Sobreposição de dados: zero.** Benefícios lê `cb_beneficios`; Relatórios lê fatos (contratos/mensalidades/atendimentos). Nenhuma tabela é escrita pelos dois.

### 1.5 Componentes

- Benefícios: componentes inline (Table, Dialog, Form). Sem componente compartilhado.
- Relatórios: `exportToExcel`, gráficos, tabelas próprias.
- Compartilhado real: `PatientSearchInput`, `useClinica`, primitivos de UI.

### 1.6 Permissões

Ambos usam módulo `cartao-beneficios` em `perfil_permissoes`. Não há grão fino separando cadastro de leitura analítica.
- admin/gestor: acesso total.
- financeiro: `cartao-beneficios: write` (herda tudo).
- recepcao/caixa: `cartao-beneficios: read`.
- medico/enfermeiro: sem acesso.

### 1.7 Funcionalidades

| Ação | Benefícios | Relatórios |
|---|---|---|
| Cadastrar regra de desconto | ✅ | ❌ |
| Ativar/inativar regra | ✅ | ❌ |
| Ver contratos ativos | ❌ | ✅ |
| Ver inadimplência | ❌ | ✅ |
| Exportar Excel | ❌ | ✅ |
| Drilldown por plano | ❌ | ✅ |

### 1.8 Dependências

- Benefícios é **consumido** pelo motor de preços (`fn_regras_procedimento` / `cb-regras.ts`) na hora de precificar um atendimento. Alterar o schema quebra orçamento, caixa, agenda.
- Relatórios é **read-only** sobre contratos/mensalidades.
- Convênios possui aba própria "Regras" (`regras-tab.tsx`) — que se sobrepõe **parcialmente** à tela Benefícios (regras por convênio × faixa × especialidade). **Este é o ponto real de duplicidade**, e não Benefícios × Relatórios.

### 1.9 Sobreposição real

- **Benefícios ↔ Relatórios: ~0%.** São camadas diferentes.
- **Benefícios ↔ Convênios/Regras: ~40%.** Ambas cadastram condições comerciais do convênio; uma via `cb_beneficios`, outra via `cb_convenio_regras` + `cb_convenio_faixas`. **Aqui existe duplicidade real** que o usuário provavelmente percebeu como "algo repetido no cartão".

### 1.10 Impactos de uma unificação

Se unir Benefícios + Convênios/Regras num único cadastro:
- 💰 Financeiro: risco alto — o motor de preço usa `cb-regras.ts` que lê `cb_convenio_regras`. Migrar `cb_beneficios` exige preservar histórico e traduzir semântica ("benefício" = regra positiva; "regra" = tabela de preços).
- ⏱️ Operacional: ganho — 1 lugar só para configurar o convênio.
- 😊 Experiência: neutro (interno).
- 🛡️ Auditoria: preservar histórico é mandatório (dados imutáveis).

Se apenas **renomear + reorganizar menu** (opção aditiva):
- Zero risco financeiro.
- Ganho de clareza imediato.

### 1.11 Proposta de arquitetura (recomendada)

**Opção A — Reorganização (RECOMENDADA, aditiva, zero risco):**
1. Renomear tabs do layout `/app/cartao-beneficios`:
   - "Vendas" → "Contratos"
   - "Convênios" → "Convênios & Regras Comerciais"
   - Nova aba "Cadastros" agrupando: Modelos, Benefícios, Dependentes
   - "Relatórios" fica como está
2. No menu lateral (`menu-catalog.ts`), esconder itens filhos e manter só o pai "Cartão de Benefícios" — a navegação interna já existe via tabs no layout.
3. Adicionar tooltip/subtítulo em "Benefícios" explicando "Descontos e gratuidades por convênio".
4. Adicionar tooltip em "Relatórios Cartão" explicando "Adesão, MRR e inadimplência dos contratos".

**Opção B — Consolidação de Benefícios em Convênios/Regras (custo alto, ganho médio):**
- Migrar `cb_beneficios` para linhas em `cb_convenio_regras` com um novo campo `origem = 'beneficio'`.
- Requer migration com preservação total do histórico + reescrever `cb-regras.ts`.
- **Não recomendado neste momento** — viola a política de mudanças aditivas antes de necessidade real.

### 1.12 Wireframe (Opção A)

```text
┌─ /app/cartao-beneficios ─────────────────────────────────────────┐
│ Contratos │ Convênios & Regras │ Cadastros ▾ │ Dependentes │ BI  │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  [ conteúdo da aba ativa ]                                       │
│                                                                  │
│  "Cadastros" abre submenu:                                       │
│    • Modelos de contrato                                         │
│    • Benefícios (descontos e gratuidades)                        │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### 1.13 Riscos

- Baixo (opção A): mudança apenas de labels e agrupamento visual.
- Alto (opção B): tocar em `cb_beneficios` / `cb_convenio_regras` afeta precificação; requer testes de regressão completos em orçamento, caixa, agenda, cartão de consulta.

### 1.14 Plano de migração (Opção A)

1. Editar `menu-catalog.ts` centro "cartao" — colapsar filhos em um único item pai.
2. Editar `app.cartao-beneficios.tsx` — tabs renomeadas e aba "Cadastros" adicionada.
3. Nenhuma migration de banco.
4. Nenhuma alteração em `perfil_permissoes` (grão continua `cartao-beneficios`).
5. Deploy direto — reversível por revert do commit.

### 1.15 Rollback (Opção A)

- Reverter commits de `menu-catalog.ts` e `app.cartao-beneficios.tsx`.
- Sem dados a restaurar.

---

## PARTE 2 — Exames × Procedimentos

### 2.1 Finalidade de cada módulo

| Módulo | Finalidade real |
|---|---|
| **Procedimentos** (`/app/procedimentos`) | **Catálogo comercial** de serviços da clínica (consultas, exames, cirurgias). Preços, regras, tipo, código, duração, fluxo, obrigatoriedades (agenda/médico/sala). É a **fonte de verdade dos itens vendáveis**. |
| **Exames / Resultados** (`/app/exames-resultados`) | **Workflow clínico** de laudo — recebe texto/PDF do resultado, classifica com IA (normal/alterado/crítico), gera resumo, recomendação e mensagem ao paciente, dispara alerta. É **prontuário/IA operacional**. |

**Conclusão:** NÃO são duplicados. São cadastro comercial × fluxo clínico de laudo. A confusão vem do label "Exames" no menu e do próprio título da rota Procedimentos ("Exames / Procedimentos — ClinicaOS").

### 2.2 Telas

- **Procedimentos:** tabela grande com preços multi-modalidade (dinheiro, pix, cartão, cartão consulta, cartão desconto, valores por convênio), abas de especialidades/categorias/enfermagem, importação, edição em massa.
- **Exames-Resultados:** paciente + tipo de exame + textarea/upload + botão "Classificar IA" + card com análise + salvar + alertar médico.

### 2.3 Rotas

```
/app/procedimentos              → Catálogo (com SectionTabs SERVICOS_TABS: Especialidades, Categorias, Serviços, Enfermagem)
/app/exames-resultados          → Workflow IA de laudo
```

### 2.4 Tabelas utilizadas

| Módulo | Tabelas |
|---|---|
| Procedimentos | `procedimentos`, `procedimento_especialidades`, `procedimento_unidade_regras`, `procedimento_cb_convenio_valores`, `procedimento_split_regras`, `cartoes_convenio`, `cb_convenios`, `cb_convenio_regras`, `especialidades`, `tipos_servico` |
| Exames-Resultados | `exame_resultados`, `pacientes`, `especialidades`, `alertas_enfermagem` (indireto) |

**Sobreposição de tabelas: zero.**

### 2.5 Componentes

- Procedimentos: `SectionTabs`, `CurrencyInput`, `SearchableSelect`, `exportToExcel`, `findRegra`/`computeValor` do `cb-regras.ts`.
- Exames-Resultados: `SearchableSelect`, `exames-ia.functions.ts` (server fn IA).
- Nada compartilhado além de primitivos.

### 2.6 Permissões

- Procedimentos: sem módulo dedicado em `perfil_permissoes`; controlado por `procedimentos` no preset. Admin/gestor/financeiro têm acesso; recepção/médico read.
- Exames-Resultados: módulo `exames-resultados`. Médico: read. Recepção/gestor: sem acesso por padrão.

**Insight:** os públicos são diferentes — Procedimentos é do gestor/financeiro; Exames-Resultados é do médico/enfermeiro. Não faz sentido unir.

### 2.7 Funcionalidades

| Ação | Procedimentos | Exames-Resultados |
|---|---|---|
| Cadastrar item vendável | ✅ | ❌ |
| Definir preço multi-modalidade | ✅ | ❌ |
| Ver regras de convênio | ✅ | ❌ |
| Registrar resultado de exame | ❌ | ✅ |
| Classificar via IA | ❌ | ✅ |
| Gerar alerta ao médico | ❌ | ✅ |
| Mensagem ao paciente | ❌ | ✅ |

### 2.8 Dependências

- **Procedimentos** é dependência **crítica** de: Agenda, Orçamentos, Caixa, Cartão de Benefícios, NFS-e, Prontuário. Qualquer alteração no schema `procedimentos` afeta todo o sistema.
- **Exames-Resultados** depende de: `pacientes`, IA Gateway (Lovable AI). Isolado do resto.

### 2.9 Sobreposição real

- **Dados: 0%.**
- **Semântica no menu: alta.** Usuário lê "Exames" (em Clínico) e "Procedimentos" (em Clínico) e supõe redundância.
- **Título da rota Procedimentos:** "Exames / Procedimentos" — legado histórico que reforça a confusão.

### 2.10 Impactos de uma unificação

Fundir Procedimentos + Exames-Resultados seria **erro grave**: catálogo vs prontuário. Impactaria financeiro, agenda, prontuário e IA.

O que faz sentido: **desambiguar labels e realocar no menu**.

### 2.11 Proposta de arquitetura (recomendada)

**Opção A — Renomeação e realocação (RECOMENDADA, aditiva, zero risco):**
1. Em `menu-catalog.ts`, centro "clinico":
   - Renomear "Procedimentos" → "Catálogo de Serviços" (ou "Serviços & Preços"). Ícone `ClipboardList`.
   - Renomear "Exames" → "Resultados de Exames (IA)". Manter ícone `FlaskConical`.
2. Corrigir `head.title` de `/app/procedimentos` de "Exames / Procedimentos — ClinicaOS" para "Catálogo de Serviços — ClinicaOS".
3. Adicionar subtítulos/tooltips no menu:
   - Catálogo de Serviços: "Preços, regras e cadastro do que a clínica oferece"
   - Resultados de Exames (IA): "Registrar laudo e classificar automaticamente"
4. Considerar mover "Catálogo de Serviços" para o centro **Gestão** (é cadastro comercial, não ato clínico). Ficaria: `Gestão → Catálogo de Serviços`. Manter atalho em Clínico para o médico consultar.

**Opção B — Nada além de tooltip:** manter labels e apenas adicionar descrição no hover. Menor impacto visual, mas não resolve a confusão de fundo.

### 2.12 Wireframe (Opção A)

```text
┌─ Menu lateral ──────────────────┐
│ Clínico                         │
│  • Resultados de Exames (IA)    │  ← era "Exames"
│    "Laudo + classificação"      │
│  • Odontograma                  │
│  • Modelos de Prontuário        │
│  • Médicos / Especialidades     │
│                                 │
│ Gestão                          │
│  • Catálogo de Serviços         │  ← era "Procedimentos"
│    "Preços e regras dos itens"  │
│  • Relatórios / Dashboard       │
└─────────────────────────────────┘
```

### 2.13 Riscos

- Baixo: mudança apenas de labels no menu e title da rota.
- Verificar se algum link/documentação interna referencia literalmente "Procedimentos" no menu — atualizar acordado.
- Não alterar rotas (`/app/procedimentos` e `/app/exames-resultados` permanecem) — preserva bookmarks, atalhos e permissões.

### 2.14 Plano de migração (Opção A)

1. Editar `src/components/menu-v2/menu-catalog.ts` — labels e descrições dos dois itens; mover Procedimentos para centro `gestao` (opcional, sob aprovação).
2. Editar `src/routes/_authenticated/app.procedimentos.tsx` — `head.title`.
3. Nenhuma migration.
4. Nenhuma mudança de permissão.
5. Comunicar recepção/médico via changelog interno.

### 2.15 Rollback (Opção A)

- Reverter commits dos dois arquivos. Sem dados afetados.

---

## PARTE 3 — Resumo executivo e recomendação

| Suposta duplicidade | Duplicação real? | Ação recomendada | Risco | Custo |
|---|---|---|---|---|
| Cartão × Relatórios do Cartão | ❌ Não — camadas distintas | Reorganizar tabs do layout Cartão + colapsar no menu lateral | Baixo | 1 arquivo de menu + 1 layout |
| Cartão × Convênios/Regras internas | ⚠️ Sim, parcial (~40%) | Manter separado por ora; unificar só se justificado por dor operacional | Alto se unir | Alto |
| Exames × Procedimentos | ❌ Não — catálogo × workflow IA | Renomear labels e title da rota; opcionalmente mover Catálogo para Gestão | Baixo | 2 arquivos |

**Recomendação global:** aplicar **apenas a Opção A** de cada bloco (reorganização + renomeação, zero migration). Ganho grande de clareza, risco praticamente nulo, totalmente reversível.

**Nenhuma ação será executada** até o usuário aprovar explicitamente qual opção seguir (A ou B, por bloco).

---

## PARTE 4 — Encerramento

Após aprovação, cada implementação seguirá o ciclo padrão do roadmap:
planejamento detalhado → aprovação → preview → playwright → validação visual → promoção → encerramento com relatório.

Agenda V2 permanece bloqueada até esta auditoria ser encerrada.