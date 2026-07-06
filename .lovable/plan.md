
# Plano — Agenda V2 (planejamento, sem código)

> **Escopo:** planejamento apenas. Nenhuma implementação até aprovação.
> **Governança:** aditivo, flag `agenda_v2`, clássico preservado como fallback. Dados imutáveis (identificadores legados, histórico financeiro, audit) intocados.
> **Nomenclatura oficial:** *Sessão de Atendimento* como entidade que agrupa 1..N itens executáveis (consulta, exame, imagem, procedimento).

---

## 1. Visualização da Agenda

Três camadas de visão, sempre acessíveis:

- **Timeline por Recurso (padrão):** colunas = recursos (médico, sala de US, equipamento MAPA, sala de coleta, sala cirúrgica); linhas = tempo. Um card por Sessão, mesmo que agrupe 12 exames.
- **Lista por Paciente (recepção):** dia atual em fila, agrupada por paciente → cada linha mostra a Sessão com badge de nº de itens, preparo, jejum, status operacional e financeiro (separados).
- **Mapa de Salas (kanban por sala):** colunas = salas/equipamentos; cards = Sessões em andamento; usado por enfermagem e técnicos.

Filtros persistentes: unidade, tipo de atendimento, profissional, sala/equipamento, status operacional, status financeiro, "com preparo pendente", "jejum", "com pendência de laudo".

Cabeçalho da agenda mostra KPIs do dia (agendados, chegaram, em execução, concluídos, faltas, receita prevista/realizada) — não altera regra, apenas leitura.

---

## 2. Cards por Tipo de Atendimento

Card unificado, mas o **cabeçalho e o rodapé se adaptam ao tipo**:

| Tipo | Cabeçalho | Corpo | Rodapé |
|---|---|---|---|
| Consulta | Médico · Especialidade | Paciente · Modalidade (Particular/Associado/Cartão) | Prontuário · Anamnese |
| Laboratório | "Coleta Laboratorial" · nº de exames | Preparo · Jejum (horas) | Coleta feita? · Laudo pendente |
| Imagem (US/TC/RM/RX/Mamo) | Modalidade · Equipamento | Preparo · Contraste? · Peso/Restrições | Técnico · Laudo do radiologista |
| Cardiológico (MAPA/Holter) | Equipamento · Duração (24h/48h) | Instalação · Devolução prevista | Devolvido? · Laudo |
| Endoscopia / Colono | Sala · Anestesista | Preparo (dias) · Jejum · Acompanhante obrigatório | Recuperação · Alta |
| Cirurgia (catarata, fimose) | Sala · Equipe | Pré-op · Anestesia · Materiais | Recuperação · Alta · Retorno |
| Pequenos Procedimentos | Sala · Profissional | Consentimento · Preparo | Executado · Cobrança |
| Dermatologia | Médico · Sala | Procedimento (biópsia, crio, etc.) | Amostra enviada? |

Todos os cards mostram: chip de **Sessão (N itens)** quando aplicável, chips de **Preparo/Jejum/Recuperação**, e os dois status separados **Operacional × Financeiro** (regra já vigente no projeto).

---

## 3. Sessão de Atendimento (conceito central)

**Definição:** uma Sessão é um bloco de tempo, em um recurso, para um paciente, contendo 1..N itens executáveis. Na agenda aparece como **um único card**; ao expandir, mostra a lista de itens.

**Propriedades da Sessão:**
- tipo (`laboratorial | imagem | cardiologico | cirurgico | pequenos_procedimentos | consulta`)
- recurso principal (médico OU sala OU equipamento)
- início/fim (calculado do maior item + setup + recuperação)
- preparo agregado (união dos preparos dos itens — o mais restritivo vence: jejum mais longo, restrição mais rígida)
- status operacional agregado (`agendada → chegou → em_execucao → concluida → cancelada | faltou`)
- status financeiro agregado (herda regra atual: um orçamento pode cobrir a Sessão inteira)
- observações
- vínculo com orçamento e com sessão anterior (retorno/continuação)

**Propriedades por Item da Sessão:**
- procedimento_id (fonte de verdade: Catálogo de Serviços)
- ordem de execução
- executor (técnico, enfermeiro, médico)
- status operacional próprio (item pode estar "coletado" mesmo com Sessão "em_execucao")
- status financeiro próprio (já existe em `orcamento_itens.status_financeiro`)
- resultado/laudo vinculado quando aplicável (`exame_resultados`)

**Regras de agrupamento (não hard-coded — vêm de `procedimentos` + configuração):**
- Só agrupa itens compatíveis com o mesmo recurso e mesmo tipo.
- Nunca mistura tipos (não junta consulta com US na mesma Sessão).
- Preparo conflitante bloqueia com alerta (ex.: um exige contraste e outro proíbe).

**UI:**
- Criar Sessão a partir de um orçamento já existente (fluxo mais comum: recepção converte orçamento → Sessão).
- Wizard "Nova Sessão": paciente → tipo → itens (multi-select do catálogo) → recurso sugerido → horário sugerido → confirmação.
- Card colapsado: 1 linha. Expandido: checklist de itens + botões de execução em lote.

---

## 4. Laboratório

- Paciente agenda **1 Sessão Laboratorial** com N exames.
- Recurso: sala/posto de coleta (via `enfermagem_recursos`).
- Preparo agregado (jejum mais longo entre os itens vence).
- Coleta única, mesmo horário, mesmo técnico.
- Cada exame gera 1 registro em `exame_resultados` quando o laudo chega (upload manual ou integração futura).
- Financeiro: 1 orçamento com N itens (já é o modelo atual). Sem alteração de regra.
- Impressão: guia única de coleta + etiquetas por exame.

---

## 5. Imagem (US, TC, RM, Mamo, RX)

- Recurso principal = **equipamento** (não o médico executor). Radiologista pode laudar depois, assíncrono.
- Sessão de Imagem pode conter mais de um exame no mesmo equipamento (ex.: US abdome + US pélvica).
- Campos específicos por modalidade: contraste, peso máximo, marcapasso/metal (RM), gestação, alergias.
- Preparo obrigatório com checklist de confirmação na chegada.
- Após execução: status "aguardando laudo" → laudo entra em `exame_resultados` (fluxo IA já existente).

---

## 6. Cirurgias e Procedimentos (catarata, fimose, endo, colono, pequenos)

- Recurso principal = **sala cirúrgica/procedimento**, com equipe associada (cirurgião, anestesista, instrumentador, enfermagem).
- Blocos de tempo: **pré-op + procedimento + recuperação** — o card ocupa a soma na agenda da sala; o profissional fica ocupado só na janela do procedimento.
- Consentimento e checklist pré-op como pré-requisito de status "chegou → em_execucao".
- Materiais e OPME: leitura do estoque (`estoque_movimentos`), sem alterar regra financeira.
- Alta e retorno: geram Sessão futura opcional (link "criar retorno").

---

## 7. Reaproveitamento de Tabelas (sem migration destrutiva)

Já existe base sólida — o plano preserva 100% do clássico:

| Necessidade V2 | Tabela existente | Situação |
|---|---|---|
| Agendamento base | `agendamentos` | **Já tem `pacote_id`, `tipo_atendimento`, `enfermagem_recurso_id`, `orcamento_id`, `orcamento_item_id`, `agenda_id`, `fluxo_etapa`** — suporta Sessão sem migration obrigatória (ver §8) |
| Itens da Sessão | `orcamento_itens` + `agendamento_orcamento_itens` | Vínculo item ↔ agendamento já existe |
| Catálogo (duração, preparo, sala/equipamento obrigatórios) | `procedimentos` | Campos `duracao_minutos`, `preparo`, `sala_obrigatoria`, `equipamento_obrigatorio`, `tempo_padrao_min` já existem |
| Salas / equipamentos / postos de coleta | `enfermagem_recursos` + `enfermagem_recurso_disponibilidades` + `enfermagem_recurso_procedimentos` | Reutilizar como "Recursos" genéricos (renomear rótulo, não a tabela) |
| Disponibilidade médico | `medico_disponibilidades` + `medico_agendas` + `medico_expediente_encerramento` | Já cobre |
| Regras por procedimento/unidade | `procedimento_unidade_regras` + `fn_regras_procedimento` | Motor de regras já é config-first |
| Laudos / resultados | `exame_resultados` | Fluxo IA já pronto |
| Prontuário e anamnese | `prontuarios`, `anamnese_respostas` | Sem mudança |
| Financeiro | `fin_atendimentos`, `orcamentos`, `pagamentos` | Sem mudança de regra |
| Odontologia | `odonto_prontuarios`, `odonto_dentes` | Sessão odonto é caso futuro; fora do escopo desta fase |

---

## 8. Migration — o que é necessário

**Preferência: nenhuma migration destrutiva. Somente aditivo, e só o mínimo.**

**Fase 1 (zero migration):** usar `agendamentos.pacote_id` como identificador da Sessão. Todos os agendamentos com o mesmo `pacote_id` = mesma Sessão. Campos derivados computados em `view` ou no server function. Isso já cabe no schema atual.

**Fase 2 (migration aditiva, se aprovado):**
- Nova tabela `sessoes_atendimento` (id, clinica_id, tipo, recurso_id, inicio, fim, preparo_agregado, status_op, status_fin, orcamento_id, observacoes, criado_por, created_at, updated_at) — apenas para dar identidade explícita à Sessão e simplificar queries. RLS + GRANTs completos, seguindo o padrão do projeto.
- Nova coluna `agendamentos.sessao_id uuid null` (aditiva, sem `NOT NULL`, sem trigger destrutivo). `pacote_id` **permanece** e passa a apontar para `sessao_id` via backfill controlado, com dupla escrita durante a transição.
- Índices em `sessoes_atendimento(clinica_id, inicio)` e `agendamentos(sessao_id)`.
- Zero alteração em colunas existentes. Zero remoção. Zero regra de cálculo alterada.

Migration só entra depois que Fase 1 provar o conceito no preview.

---

## 9. Riscos

1. **Sobreposição visual com o clássico** — mitigado por flag `agenda_v2` e rotas paralelas (clássico continua acessível).
2. **Agrupamento errado (itens juntados por engano)** — mitigado por regras de compatibilidade explícitas no motor de regras + confirmação da recepção no wizard.
3. **Preparo/jejum conflitante entre itens** — mitigado por validação de preparo agregado com bloqueio + alerta.
4. **Impacto no financeiro** — nenhuma alteração em `fin_atendimentos`/`orcamentos`/`pagamentos`; Sessão é camada de apresentação e agrupamento, não de cálculo.
5. **Recepção acostumada ao clássico** — mitigado por liberação gradual (admin/gestor primeiro, depois médicos, depois recepção) e treinamento por perfil.
6. **Backfill de Sessão em agendamentos antigos** — não fazer. Dados históricos são imutáveis; Sessão só aparece para agendamentos novos ou reagendados no V2.
7. **Multi-recurso (ex.: cirurgia com sala + equipe + anestesista)** — modelado via recurso principal + participantes secundários; risco de conflito de disponibilidade tratado por validação em tempo real.
8. **Laudos assíncronos de imagem** — Sessão pode fechar operacionalmente antes do laudo; status "aguardando laudo" separado do status operacional.

---

## 10. Rollback

- Flag `agenda_v2` desligada → recepção e agenda voltam 100% ao clássico, sem perda de dado.
- Sessões criadas no V2 continuam legíveis no clássico como agendamentos individuais (via `pacote_id`), sem quebra.
- Fase 2 (migration aditiva) é reversível: `sessao_id` é nulo por padrão; drop da coluna é aditivo-inverso e não afeta agendamentos antigos.
- Sem `DROP` de tabela, sem `ALTER` destrutivo, sem alteração de RPC existente.

---

## 11. Plano por Fases

Cada fase segue o ciclo obrigatório: planejamento → aprovação → preview → playwright → validação → promoção controlada → liberação gradual → encerramento com relatório.

**Fase 0 — Descoberta (esta entrega):** plano aprovado.

**Fase 1 — Fundação (sem migration):**
- Rota `/app/agenda-v2` atrás da flag `agenda_v2` (admin/gestor).
- Timeline por Recurso + Lista por Paciente.
- Card unificado com adaptação por tipo.
- Sessão via `pacote_id` (agrupamento derivado).
- Suporte a: Consulta + Sessão Laboratorial (piloto).

**Fase 2 — Sessão explícita (migration aditiva):**
- Tabela `sessoes_atendimento` + coluna `agendamentos.sessao_id`.
- Wizard "Nova Sessão" completo.
- Preparo/jejum agregado com validação.

**Fase 3 — Imagem e Cardiológico:**
- Recurso = equipamento; campos de contraste, restrições.
- Fluxo "aguardando laudo" integrado a `exame_resultados`.
- MAPA/Holter com janela de devolução.

**Fase 4 — Cirurgias e Procedimentos:**
- Bloco pré-op + procedimento + recuperação.
- Checklist de consentimento e materiais.
- Retorno e alta.

**Fase 5 — Mapa de Salas (kanban) + KPIs no cabeçalho.**

**Fase 6 — Liberação gradual:** admin/gestor → médicos → recepção. Clássico permanece.

**Fase 7 — Encerramento:** relatório final (entregas, riscos, pendências, rollback, impacto, doc). Só então → Prontuário V2.

---

## 12. Wireframe da Agenda V2

Vista padrão — **Timeline por Recurso**:

```text
┌────────────────────────────────────────────────────────────────────────────────────┐
│ Agenda V2   [Hoje ▾] [Unidade: Centro ▾] [Tipo: Todos ▾] [Recurso ▾]   ⚙ Preferências│
│ KPIs: Agendados 42 · Chegaram 18 · Em execução 6 · Concluídos 11 · Faltas 2 · R$ 8.4k│
├──────────┬───────────────┬────────────────┬───────────────┬────────────────────────┤
│  Hora    │ Dr. Silva     │ Sala Coleta 1  │ US Equip. A   │ Sala Cirúrgica 1       │
│          │ (Consulta)    │ (Laboratorial) │ (Imagem)      │ (Cirurgia)             │
├──────────┼───────────────┼────────────────┼───────────────┼────────────────────────┤
│  07:00   │               │ ┌────────────┐ │               │                        │
│  07:15   │               │ │ João Souza │ │               │                        │
│  07:30   │               │ │ Coleta Lab │ │               │                        │
│          │               │ │ 12 exames  │ │               │                        │
│          │               │ │ ⚠ Jejum 8h │ │               │                        │
│          │               │ │ [Chegou]   │ │               │                        │
│  07:45   │               │ └────────────┘ │               │                        │
│  08:00   │ ┌───────────┐ │                │ ┌───────────┐ │ ┌────────────────────┐ │
│  08:15   │ │ Ana Lima  │ │                │ │ Maria R.  │ │ │ Catarata OD        │ │
│  08:30   │ │ Consulta  │ │                │ │ US Abdome │ │ │ Pré-op + Cx + Rec  │ │
│          │ │ Cardio    │ │                │ │ + Pélvica │ │ │ Cir: Dr. Nunes     │ │
│          │ │ 💳 Cartão │ │                │ │ ⚠ Contraste│ │ │ Anest: Dra. Paz    │ │
│  08:45   │ └───────────┘ │                │ └───────────┘ │ │ ⚠ Jejum 8h · OPME  │ │
│  09:00   │               │                │               │ │ [Consentimento ✓]  │ │
│  09:30   │               │                │               │ └────────────────────┘ │
└──────────┴───────────────┴────────────────┴───────────────┴────────────────────────┘
```

Card expandido — **Sessão Laboratorial** (12 exames):

```text
┌──────────────────────────────────────────────────────────────┐
│ João Souza · 07:15 – 07:45 · Sala Coleta 1                   │
│ Sessão Laboratorial · 12 exames                              │
│ ⚠ Jejum 8h · Chegou às 07:12 · Op: chegou · Fin: pago        │
├──────────────────────────────────────────────────────────────┤
│ Itens                                          Status  Laudo │
│ ─ Hemograma                                    coletado  ⏳  │
│ ─ Glicose                                      coletado  ⏳  │
│ ─ Colesterol total + frações                   coletado  ⏳  │
│ ─ Triglicerídeos                               coletado  ⏳  │
│ ─ TSH                                          coletado  ⏳  │
│ ─ T4 livre                                     coletado  ⏳  │
│ ─ Uréia                                        coletado  ⏳  │
│ ─ Creatinina                                   coletado  ⏳  │
│ ─ TGO / TGP                                    coletado  ⏳  │
│ ─ Ácido úrico                                  coletado  ⏳  │
│ ─ EAS                                          coletado  ⏳  │
│ ─ Parasitológico                               pendente  —   │
├──────────────────────────────────────────────────────────────┤
│ [Imprimir guia] [Etiquetas] [Marcar coleta feita] [Cancelar] │
└──────────────────────────────────────────────────────────────┘
```

Card expandido — **Sessão Cirúrgica**:

```text
┌──────────────────────────────────────────────────────────────┐
│ Maria Ribeiro · 08:00 – 10:30 · Sala Cirúrgica 1             │
│ Sessão Cirúrgica · Catarata OD                               │
│ Cirurgião: Dr. Nunes · Anestesista: Dra. Paz                 │
│ ⚠ Jejum 8h · Consentimento assinado · OPME reservado         │
├──────────────────────────────────────────────────────────────┤
│ 08:00 – 08:30  Pré-op (enfermagem)             [ ]           │
│ 08:30 – 09:30  Procedimento                    [ ]           │
│ 09:30 – 10:30  Recuperação                     [ ]           │
├──────────────────────────────────────────────────────────────┤
│ Materiais / OPME:  LIO acrílica dobrável · viscoelástico     │
│ [Checklist pré-op] [Iniciar] [Registrar intercorrência]      │
└──────────────────────────────────────────────────────────────┘
```

---

## O que NÃO está no plano (fora de escopo desta etapa)

- Alteração de qualquer regra financeira ou de cálculo de repasse.
- Migração de agendamentos históricos (dados imutáveis).
- Prontuário V2, Central Operacional, Dashboards, BI, Portal do Associado — próximos módulos do roadmap, bloqueados até o encerramento oficial da Agenda V2.
- Odontologia como Sessão (avaliar em fase futura).
- Integrações externas de laboratório/PACS (fase futura).

---

## Próximo passo

Aguardando sua aprovação deste plano. Após o "OK", inicio a **Fase 1** (fundação, sem migration, atrás da flag `agenda_v2`, apenas admin/gestor).
