
# Agenda Health Hub Pro — Estudo de Reformulação (Concept Study)

> Documento **conceitual**. Nenhuma linha de código será escrita antes da sua aprovação explícita deste estudo.
> Nada em regras de negócio, banco, financeiro, caixa, orçamentos, check-in, Nina, permissões ou integrações será alterado. **Só muda a experiência de uso.**

> **Ajustes aprovados (rev. 2):**
> 1. Trabalho continua isolado em `/app/agenda-v2`. `/app/agenda` clássica **intocada**. Flag `agenda_v2` OFF por padrão. Promoção só após aprovação visual explícita (mesmo rito do Caixa, Orçamentos e Clientes).
> 2. Foco desta fase é **UX e design**, não novas funcionalidades. Meta: tela mais bonita do sistema.
> 3. Recepção deve conseguir passar o dia inteiro na Agenda — tudo abre em drawer/modal, sem troca de rota.
> 4. **Modal "Novo Agendamento" também será redesenhado** como wizard em etapas (poucos campos por vez), mesma identidade visual da Agenda V2. Não haverá "Agenda bonita + formulário antigo".
> 5. Laboratório mantém regra dura: **1 coleta = 1 sessão**, N exames dentro.
> 6. Zero alteração em regra de negócio. Apenas UX, organização visual e navegação.
> 7. **Processo obrigatório para toda tela nova a partir daqui:**
>    `Estudo → Mockups (desktop + notebook + tablet) → Aprovação → Implementação → Validação → Promoção.`
>    Nenhuma tela é implementada antes da aprovação do mockup correspondente.

---

## 1. Princípios de design (norte fixo)

A Agenda passa a ser tratada como **vitrine do produto**, não como tela CRUD. Cinco princípios inegociáveis:

1. **Silêncio visual** — muito espaço em branco, ruído reduzido a zero. Nada compete com o próximo horário.
2. **Paciente é protagonista** — nome, foto e horário dominam o card. Metadata é secundária, revelada sob demanda.
3. **Ação certa, no momento certo** — botões e filtros aparecem *quando fazem sentido*, não permanentes na tela.
4. **Uma tela, um foco** — tudo periférico (financeiro, orçamento, docs, prontuário) abre em drawer sobre a Agenda. Nunca troca de rota.
5. **Velocidade percebida > velocidade real** — skeletons finos, transições curtas (<150ms), teclado como primeira classe (`⌘K`, `N`, `J/K`, `T`).

Referências visuais: Linear (hierarquia + densidade calibrada), Notion Calendar (timeline respirável), Arc (superfícies suaves, motion sutil), Stripe Dashboard (tipografia + tabular numbers), Raycast (command palette + micro-interações).

---

## 2. Comparação Agenda atual × Agenda nova

| Aspecto | Agenda atual | Agenda nova |
|---|---|---|
| Estrutura visual | Tabela densa com muitas colunas | Timeline vertical + cards inteligentes |
| Filtros | 6–8 filtros sempre visíveis no topo | 1 barra unificada `⌘K` + 2 chips ativos no máximo |
| Botões por linha | 4–6 ícones sempre expostos | Ações contextuais no hover / no drawer |
| Paginação | Paginada por página | Scroll contínuo com âncora "Agora" fixa |
| Densidade | Fixa | 3 modos: Confortável (default recepção), Compacto (coordenação), Foco (médico) |
| Paciente | Texto em coluna | Foto + nome grande + telefone secundário |
| Horário | Coluna estreita | Rail vertical de horas com marca "AGORA" pulsante |
| Sessão de exames | N linhas separadas | 1 card agrupado ("Coleta laboratorial · 12 exames") |
| Contexto do paciente | Abre nova página | Drawer lateral: jornada + financeiro + docs + histórico |
| KPIs | Barra colorida no topo | Faixa discreta, cada KPI é filtro clicável |
| Cor | Múltiplas cores por status | Paleta reduzida; cor = **estado da jornada**, não decoração |
| Tipografia | Sistema padrão | Inter Display (títulos) + Inter (corpo) + tabular numbers |

Justificativa em uma frase: hoje a Agenda pede que o usuário *decodifique*; a nova pede que ele apenas *veja*.

---

## 3. Arquitetura da nova Agenda

```text
┌─────────────────────────────────────────────────────────────────────┐
│  Header fino                                                        │
│  [Data ‹ hoje ›]      Aguardando 4 · Atrasados 1 · Encaixe 2       │  ← KPIs = filtros
│                                                          [+ Nova]  │
├──────────────┬──────────────────────────────────────┬──────────────┤
│              │  Rail de horas   │   Timeline        │              │
│  Sidebar     │   07:00          │   ┌────────────┐  │   Drawer     │
│  operacional │   ─── AGORA ───  │   │ card       │  │   contextual │
│  (clara)     │   08:00          │   └────────────┘  │   (lazy)     │
│              │   09:00          │   ┌────────────┐  │              │
│  Turno       │   ...            │   │ card       │  │              │
│  Sessões     │                  │   └────────────┘  │              │
│  Recursos    │                  │                   │              │
│  Equipe      │                  │                   │              │
└──────────────┴──────────────────┴───────────────────┴──────────────┘
```

**Zonas:**
- **Header fino** — data + KPIs clicáveis + `⌘K`. Nada mais.
- **Sidebar operacional (clara, off-white)** — turno, ocupação, recursos, equipe. Discreta.
- **Rail de horas** — hora grande, linha "AGORA" pulsante, horas sem sessão colapsam.
- **Timeline** — cards, agrupamento inteligente por sessão.
- **Drawer contextual** — abre à direita sobre a timeline. Nunca muda rota.

**Estados vazios:** nenhum "vazio poluído". Se não há sessões, uma frase serena + botão único "Nova sessão".

---

## 4. Anatomia do card (paciente-primeiro)

```text
┌─────────────────────────────────────────────────────────────┐
│  09:30                                                      │
│  ●●●○  ← progresso da jornada (4 estágios, glow no ativo)   │
│                                                             │
│  ┌──┐   Maria Helena Ribeiro                    · Consulta  │
│  │👤│   Dra. Ana · Cardiologia                              │
│  └──┘   30 min · Convênio Unimed                            │
│                                                             │
│                                          [hover: ações →]   │
└─────────────────────────────────────────────────────────────┘
```

Regras:
- **Horário** em Inter Display tabular, tamanho grande, no topo — dominante.
- **Foto do paciente** real quando existir; fallback iniciais em avatar cinza claro.
- **Nome** em peso 600, tudo o resto em 400 slate-500.
- **Chip de tipo de sessão** discreto à direita.
- **Barra de progresso** de 4 segmentos = jornada (Agendado → Check-in → Atendimento → Concluído).
- **Ações no hover** apenas: Abrir · Reagendar · Pagar. Resto no drawer.

---

## 5. Agrupamento inteligente (sessão)

Regra dura já aprovada na V2 permanece: **1 coleta = 1 card**, nunca N.

```text
┌─────────────────────────────────────────────────────────────┐
│  07:30 · Coleta Laboratorial · 12 exames · Jejum 8h         │
│  👤 João Pedro · Coletador: Ana · Sala Coleta 1             │
│  [▾ expandir lista de exames]                               │
└─────────────────────────────────────────────────────────────┘
```

Mesma lógica para: consulta + exames complementares, endoscopia + sedação, cirurgia + anestesia/OPME. **Nenhuma regra nova** — apenas a UI reflete o agrupamento que já existe em `pacote_id`.

---

## 6. Fluxos por perfil

### 6.1 Recepção (foco absoluto — 90% do tempo aqui)
1. Abre agenda → vê **próximo paciente** dominando a tela.
2. Paciente chega → clica no card → drawer abre em **"Check-in"** com um único botão grande verde.
3. Precisa cobrar → mesmo drawer, aba **"Pagamento"** — sem trocar rota. Fluxo de caixa existente, intocado.
4. Encaixe → `N` no teclado → modal enxuto → cai na timeline com chip ⏱ Encaixe.
5. Busca paciente → `⌘K` → resultado inline sem sair da agenda.

**Meta:** zero cliques desperdiçados. Nenhum "voltar para a agenda".

### 6.2 Médico
1. Vista abre em **modo Foco** — apenas seus pacientes, sem sidebar operacional.
2. Card do próximo paciente destacado com aura sutil.
3. Clicar → drawer abre direto no **prontuário** (regra existente).
4. Tecla `J/K` navega entre pacientes do dia.

### 6.3 Coordenação
1. Vista abre em **modo Compacto** — mais linhas visíveis.
2. Alternador de recorte (Profissional · Sala · Equipamento · Especialidade) no header.
3. KPIs no header ficam clicáveis → filtro instantâneo.
4. Drawer contextual traz histórico + pendências.

Nenhum fluxo altera regras de negócio. Só reorganiza a superfície.

---

## 7. Densidade e modos

| Modo | Público padrão | Card | Altura hora |
|---|---|---|---|
| **Confortável** | Recepção | 96 px | 88 px |
| **Compacto** | Coordenação | 64 px | 56 px |
| **Foco** | Médico | 112 px | 104 px |

Alternador no canto do header, salva por usuário (localStorage). Não é feature nova de banco.

---

## 8. Sistema visual

**Tipografia**
- Títulos: **Inter Display** 600 (nome do paciente, horários grandes).
- Corpo: **Inter** 400/500.
- Números: `font-variant-numeric: tabular-nums` sempre.

**Paleta (semântica, não decorativa)**
- Fundo app: `#FAFAF8` (off-white quente).
- Sidebar: `#F7F7F5`.
- Superfície card: `#FFFFFF` + `border-slate-200/60`.
- Texto primário: `slate-800`.
- Texto secundário: `slate-500`.
- Acento indigo (ativo/agora): `#4F46E5` com glow suave.
- Estados: emerald (ok) · amber (atenção) · rose (crítico). Nunca mais que 3 cores por tela.

**Motion**
- 120–160 ms para hovers e reveals.
- "AGORA" pulsa a cada 2 s (opacity 0.7 → 1).
- Cards entram com `translateY(4px) → 0` + fade — só na primeira renderização.

**Espaço**
- Grid 8 px. Padding card 20 px. Gap entre cards 12 px. Margens laterais generosas (respirável).

---

## 9. Wireframes (baixa fidelidade, ASCII)

**Estado padrão (recepção, modo Confortável):**
```text
Agenda · Segunda, 6 jul                    Aguardando 4 · Atraso 1 · Encaixe 2     [+ Nova sessão]
────────────────────────────────────────────────────────────────────────────────────────────────
 Turno Manhã       │ 07:00                                                          │
 32 sessões  74%▓▓ │ ─── AGORA ────────────────────────────────────────────────────  │
 Recursos          │ 07:30  ┌─────────────────────────────────────────────────────┐  │
   Sala 1  ▓▓▓░░   │        │ Coleta Laboratorial · 12 exames · Jejum            │  │
   Sala 2  ▓▓░░░   │        │ João Pedro · Coletador Ana · Sala Coleta 1         │  │
   Coleta  ▓▓▓▓▓   │        └─────────────────────────────────────────────────────┘  │
 Equipe on-line    │ 08:00  ┌─────────────────────────────────────────────────────┐  │
   ● Ana           │        │ 08:00                                               │  │
   ● Dra. Marta    │        │ ●●●○  Maria Helena Ribeiro         · Consulta      │  │
   ● Dr. Paulo     │        │       Dra. Ana · Cardiologia                       │  │
                   │        └─────────────────────────────────────────────────────┘  │
                   │ 09:00  (vazio — colapsado)                                     │
                   │ 09:30  ┌─────────────────────────────────────────────────────┐  │
```

**Drawer aberto (paciente):**
```text
                                              │  Maria Helena Ribeiro         ✕      │
                                              │  09:30 · Consulta · Dra. Ana         │
                                              │  ──────────────────────────────────  │
                                              │  ● Agendado    09:12                 │
                                              │  ● Check-in    09:28                 │
                                              │  ○ Atendimento                       │
                                              │  ○ Concluído                         │
                                              │  ──────────────────────────────────  │
                                              │  [Iniciar atendimento]  [Pagar]     │
                                              │                                      │
                                              │  Financeiro · Docs · Histórico       │
```

Mockups de alta fidelidade serão gerados em imagens dedicadas assim que você aprovar o conceito (Passo 12).

---

## 10. O que não muda (contrato inegociável)

- Estrutura de dados atual (`agendamentos`, `pacote_id`, `fluxo_etapa`, etc.).
- Regras de negócio de agendamento, horários, disponibilidades.
- Caixa, orçamentos, financeiro, NFS-e.
- Check-in (o botão só é mais bonito — o fluxo é o mesmo).
- Nina, permissões, integrações.
- Rotas existentes: `/app/agenda` continua sendo a rota. **Substituímos a UI, não a URL.**
- Agenda V2 (`/app/agenda-v2`) segue como piloto separado; será descontinuada ou reaproveitada como base visual desta reformulação (a decidir em Passo 12).

---

## 11. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Recepção estranha a nova UI e perde velocidade | Modo Confortável + tour de 30 s + tecla `?` mostra atalhos |
| Drawer sobre timeline atrapalha coordenação | Botão "expandir" transforma drawer em painel lateral fixo |
| Menos filtros expostos = usuário não acha filtro | `⌘K` universal + chips ativos sempre visíveis |
| Foto do paciente ausente | Fallback iniciais elegante já previsto |
| Regressão de performance | Meta ≤ clássica atual (3.0 s cold-start), medida antes de aprovar release |

---

## 12. Próximos passos (proposta de sequência, ainda sem código)

1. **Você aprova este estudo conceitual** (ou pede ajustes de direção).
2. Gero **3 mockups de alta fidelidade** (imagens) da tela principal em 3 direções distintas.
3. Você escolhe uma direção.
4. Gero mockups complementares: drawer, modo compacto, modo foco, estado vazio, mobile-tablet.
5. Só então abrimos o plano de implementação em fases, sempre atrás de flag, sem tocar em regra de negócio.

---

## 13. Aprovação

Aguardando seu retorno em um destes três formatos:

- **"Aprovado, siga para os mockups"** → gero as 3 direções visuais.
- **"Aprovado com ajustes: ..."** → incorporo e reenvio este documento revisado.
- **"Mudar direção"** → refazemos o conceito antes de qualquer visual.

Nenhuma implementação será iniciada sem sua aprovação explícita da direção visual final.

---

## 14. Refinamentos aprovados (rev. 3) — pré-implementação

Ajustes incorporados sobre a direção híbrida (Editorial Calm + Focus Rail + acabamento Warm Clinical):

1. **Wizard "Novo Agendamento"** — mantido exatamente na direção aprovada (4 etapas, cards/avatares/chips, barra indigo, sem formulário tradicional).
2. **Drawer do paciente é padrão** — abre por default ao clicar no card. Abaixo do nome do paciente, um **resumo clínico compacto**:
   `42a · Unimed · Cardiologia · Dra. Ana · chegou 09:28`
   Tipografia slate-500, tabular numbers para idade e horário. Uma única linha, sem ícones decorativos.
3. **Paciente dominante na timeline** — hierarquia visual invertida:
   - Nome do paciente: Inter Display 600, 22–24px, slate-900 (dominante).
   - Horário: 14px tabular slate-500 (secundário), canto superior direito.
   - Foto 56–64px continua à esquerda.
   - Barra de jornada abaixo do nome.
4. **Modo Compacto = mesma timeline, mais densa** — não é uma UI paralela. Reaproveita o layout da Agenda principal, apenas:
   - Card 64px (vs 96px do Confortável).
   - Gap 6px (vs 12px).
   - Rail 56px (vs 80px).
   - Nome do paciente ainda dominante, apenas menor (18px).
   - Zero re-design; só re-densidade.
5. **Linha "AGORA" mais discreta** — indigo `#4F46E5` com opacity 0.55, sem glow, sem pulso agressivo. Marcador de 6px à esquerda + linha de 1px. Pulso reduzido para opacity 0.55↔0.75 a cada 3s.
6. **Camada de inteligência operacional (IA)** — nova faixa "Sugestões" acima da timeline (colapsável, default aberta na 1ª sessão do dia):
   - **Atrasos previstos:** "3 pacientes com risco de atraso após 10:30 (média de 8min)."
   - **Encaixes possíveis:** "Janela de 20min às 11:10 na Sala 2."
   - **Salas ociosas:** "Sala 3 sem sessões entre 14:00 e 16:00."
   - **Próximos atendimentos:** "Próximo: João Pedro em 12min — chegou."
   - Cada sugestão é um chip discreto (slate-50 bg, border slate-200/60). Clicar em um chip filtra a timeline ou abre o drawer relevante. **Zero regra nova** — apenas leitura de dados já existentes (`agendamentos`, `pacote_id`, `fluxo_etapa`, disponibilidades).

**Contrato reforçado:** nenhuma alteração em regras de negócio. Flag `agenda_v2` OFF por padrão. `/app/agenda` clássica intocada até aprovação final.

---

## 15. Plano de implementação (fases, atrás de flag)

Toda a implementação ocorre em `/app/agenda-v2` e componentes dedicados em `src/components/agenda-v2/`. A agenda clássica não é tocada.

### Fase A — Fundação visual (2–3 sessões)
- Tokens de tipografia (Inter Display, tabular-nums) e paleta refinada em `src/styles.css`.
- `<AgendaShell>` (header fino, sidebar clara, rail, timeline, drawer slot).
- Rail de horas com linha "AGORA" (versão discreta rev. 3).
- Skeletons finos.

### Fase B — Card paciente-dominante + agrupamento
- `<SessionCard>` reescrito com nome dominante, horário secundário, barra de jornada 4 segmentos, foto/iniciais.
- Agrupamento "1 coleta = 1 sessão" na UI (dados já existem).
- Hover reveal: Abrir · Reagendar · Pagar.

### Fase C — Drawer contextual padrão
- `<PatientDrawer>` abre por default no clique.
- Cabeçalho: foto 96px, nome 24px, **resumo clínico compacto** (rev. 3).
- Timeline da jornada, botão "Iniciar atendimento", abas Financeiro/Docs/Histórico/Prontuário (reaproveitam telas existentes em iframe/rota embedada — sem duplicar lógica).

### Fase D — Modos de densidade
- Alternador Confortável/Compacto/Foco no header, persistido em `profiles.preferencias_ui`.
- Compacto = mesma timeline, só re-densidade (rev. 3).
- Foco = médico, sem sidebar operacional, atalhos `J/K/N/Enter`.

### Fase E — Wizard "Novo Agendamento"
- Modal 4 etapas (Paciente · Serviço · Horário · Confirmação).
- Reaproveita **integralmente** as funções de criação existentes; só a UI muda.
- Barra de progresso indigo, botões ghost/primary.

### Fase F — `⌘K` e KPIs clicáveis
- Command palette (reaproveita `CommandPalette` do list-shell).
- KPIs do header viram filtros (Aguardando, Atraso, Encaixe).

### Fase G — Camada de IA operacional
- `<OperationalInsights>` acima da timeline, colapsável.
- Regras derivadas 100% dos dados existentes; nenhum campo novo em banco.
- 4 tipos de sugestão (atrasos, encaixes, ociosas, próximos).

### Fase H — Validação e promoção
- Testes visuais em desktop 1920, notebook 1280, tablet 1024.
- Medição de performance vs clássica (meta ≤ 3.0s cold-start).
- Aprovação final → decisão sobre promover flag `agenda_v2` para ON por padrão (rito idêntico ao Caixa/Orçamentos/Clientes).

**Nenhuma fase toca:** dados, RLS, caixa, financeiro, orçamentos, check-in, Nina, permissões, integrações, rotas existentes.
