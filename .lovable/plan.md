
# Agenda Health Hub Pro — Estudo de Reformulação (Concept Study)

> Documento **conceitual**. Nenhuma linha de código será escrita antes da sua aprovação explícita deste estudo.
> Nada em regras de negócio, banco, financeiro, caixa, orçamentos, check-in, Nina, permissões ou integrações será alterado. **Só muda a experiência de uso.**

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
