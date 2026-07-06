
# Agenda V2 — Planejamento Final (Rev. 3)

Versão consolidada após as respostas às 7 perguntas em aberto e os 9 pontos adicionais.
**Nada será implementado sem aprovação explícita desta versão.**

---

## 1. Decisões fixadas (respostas às 7 perguntas)

| # | Tema | Decisão |
|---|------|---------|
| 1 | Rota no piloto | `/app/agenda-v2` em paralelo. Clássico `/app/agenda` intocado. |
| 2 | Perfis no piloto | Admin + Gestor. Recepção só na Fase 6. |
| 3 | Confirmação de véspera (WhatsApp/Nina) | Fase 5. |
| 4 | Encaixe | Recepção livre + chip ⏱ Encaixe visível. |
| 5 | Kanban de espera | Opcional, com default por perfil. |
| 6 | Cadeira/leito | Só quando houver demanda real (não entra na Fase 1). |
| 7 | Odonto e Fisioterapia | Fora do V2. Rodada dedicada após V2 estabilizada. |

---

## 2. Diretrizes estruturais (os 9 pontos fundamentais)

### 2.1 Agenda orientada por Sessão de Atendimento
Unidade central = **Sessão**, não procedimento isolado.
Tipos previstos no V2: Consulta · Coleta Laboratorial · Imagem · Cardiológica · Endoscopia · Pequena Cirurgia · Procedimento Ambulatorial · Infusão · Enfermagem.

Cada sessão: 1 paciente · 1 janela · 1 recurso principal · 0..N recursos secundários · 1..N itens · 0..1 orçamento.

### 2.2 Detecção automática do tipo de sessão
O tipo é **derivado dos serviços vinculados**, nunca escolhido manualmente.

Regra: `procedimentos.categoria` + `procedimento_unidade_regras.tipo_sessao` mapeiam cada item para um tipo. O agrupador aplica a regra:

- Só laboratório → Sessão Laboratorial
- Só imagem (mesmo equipamento/afim) → Sessão de Imagem
- Consulta + exames complementares da mesma especialidade → Sessão Cardiológica / Ginecológica / etc.
- Endoscopia/colonoscopia + sedação → Sessão de Endoscopia
- Cirurgia + anestesia/OPME → Sessão Cirúrgica
- Fallback → Sessão de Consulta ou Ambulatorial

Conflitos (tipos incompatíveis num mesmo bloco) geram alerta e sugerem separar em duas sessões.

### 2.3 Múltiplas visualizações
Uma única fonte de verdade, N recortes:

- Por Profissional (default médico)
- Por Sala
- Por Equipamento (default imagem)
- Por Setor
- Por Coletador (default laboratório)
- Por Recurso genérico (`enfermagem_recursos.tipo`)
- Por Paciente (linha do tempo — ver 2.4)
- Por Especialidade

Alternador único no topo da agenda. Cada perfil abre no recorte configurado.

### 2.4 Linha do Tempo do Paciente
Ao clicar em um card, drawer lateral com **jornada do dia**:

```text
Agendamento → Check-in → Recepção → Pagamento →
Sala de Espera → Atendimento → Exames →
Procedimentos → Recuperação → Alta
```

Cada etapa: timestamp, responsável, status, ação contextual (concluir, reabrir, anotar).
Fonte: `agendamentos.fluxo_etapa` + eventos derivados (pagamentos, triagens, resultados). Sem migration na Fase 1.

### 2.5 Dashboard Operacional (header da Agenda)
Faixa de KPIs em tempo real, colapsável:

- Aguardando · Atrasados · Encaixes · Consultas · Exames · Cirurgias
- Salas ocupadas · Equipamentos em uso
- Tempo médio de espera · Ocupação por setor

Cada KPI é filtro clicável (aplica ao recorte atual).

### 2.6 Recepção sem troca de tela
Todos os fluxos secundários abrem em **drawer lateral** sobre a Agenda:

Paciente · Financeiro/Pagamentos · Orçamento · Documentos · Pendências · Exames · Histórico · Reagendar.

`Ctrl+K` universal a partir do card.

### 2.7 Laboratório = Sessão de Coleta única
Regra dura: **nunca N blocos para N exames da mesma coleta.**

Card único:
```text
Coleta Laboratorial · 12 exames · Jejum 8h
Sala Coleta 1 · Coletador: João · 07:30–07:45
[expandir] → lista de exames com status individual
```
1 orçamento · N itens · 1 recurso principal (coletador/sala).

### 2.8 Escalabilidade
Novos tipos de atendimento entram **sem código novo**:

- 1 registro em `procedimentos` (com categoria + regras)
- 1 registro em `procedimento_unidade_regras` (tipo_sessao, duração, preparo, sala/equipamento)
- Detecção automática absorve.

Só há código novo quando o tipo exige UI genuinamente diferente (ex.: internação futura).

### 2.9 Agenda como Central Operacional
Meta: **90%+ do tempo operacional na Agenda.**
Cada perfil abre em vista pré-configurada (ver 3.4). Módulos satélite viram drawers.

---

## 3. Arquitetura resumida

### 3.1 Modelo lógico (Fase 1, sem migration)
- `agendamentos.pacote_id` = identificador da Sessão
- `agendamentos.tipo_atendimento` = tipo derivado (auto)
- `agendamentos.fluxo_etapa` = jornada do paciente
- `agendamento_orcamento_itens` = itens da sessão
- `enfermagem_recursos` = salas/equipamentos/coletadores/cadeiras
- `medico_disponibilidades` = grade profissional
- `procedimento_unidade_regras` = regras por tipo/unidade

### 3.2 Fase 2 (aditiva, não destrutiva)
Nova tabela `sessoes_atendimento` + coluna `agendamentos.sessao_id`.
Double-write com `pacote_id` durante transição. RLS + GRANTs completos.
Reversível.

### 3.3 Rota, flag e fallback
- Rota: `/app/agenda-v2`
- Flag: `agenda_v2` (OFF por padrão)
- Público: admin + gestor
- Fallback: `/app/agenda` clássico intocado
- Rollback: desligar flag

### 3.4 Vistas default por perfil
| Perfil | Vista inicial |
|--------|---------------|
| Recepção | Lista + KPIs |
| Coletador | Kanban de espera |
| Técnico imagem | Timeline por equipamento |
| Enfermagem | Kanban + triagem |
| Médico | Fita por profissional |
| Coordenação | Timeline + KPIs |
| Admin/Gestor | Timeline + KPIs |

---

## 4. Fases

1. **Fase 1 — Fundação** (sem migration)
   Timeline + Lista + alternador de recortes + chips + drawers (paciente/financeiro/docs/pendências/exames/histórico/orçamento/reagendar) + linha do tempo do paciente + KPIs básicos + 2 pilotos (Consulta e Coleta Laboratorial) + detecção automática de tipo.
2. **Fase 2** — `sessoes_atendimento` explícita (migration aditiva).
3. **Fase 3** — Imagem + Cardiológica.
4. **Fase 4** — Cirurgia + Pequenos Procedimentos.
5. **Fase 5** — Kanban completo + KPIs avançados + vistas pré-configuradas por perfil + confirmação WhatsApp/Nina.
6. **Fase 6** — Liberação gradual (recepção → enfermagem → médicos).
7. **Fase 7** — Encerramento oficial. Só então Prontuário V2.

---

## 5. Riscos e mitigação

| Risco | Mitigação |
|-------|-----------|
| Detecção automática errar tipo | Regra revisável em `procedimento_unidade_regras`; usuário pode forçar tipo. |
| Preparo conflitante entre itens | Regra "mais restritivo vence" + alerta. |
| Sobreposição com clássico | Flag OFF + rota separada + fallback. |
| Impacto financeiro | Zero alteração em `orcamentos`/`pagamentos` até Fase 2. |
| Recepção sofrer na transição | Recepção só na Fase 6, após validação admin/gestor. |
| Async de resultados | `exame_resultados` mantém workflow atual. |

---

## 6. Rollback

- Fase 1: desligar flag → clássico restaurado.
- Fase 2: migration aditiva, `pacote_id` preservado, reversível.
- Fases 3–7: cada uma atrás da mesma flag, com toggle por unidade.

---

## 7. O que NÃO entra no V2 (registrado)

- Odontologia (odontograma exige rodada dedicada)
- Fisioterapia (plano de sessões recorrentes)
- Cadeira de infusão / leito de recuperação (só quando houver demanda real)
- Prontuário V2 (só após Fase 7)
- Confirmação automática (só Fase 5)

---

## 8. Aprovação

Aguardando seu **"aprovado, iniciar Fase 1"** para começar.
Nenhum código será tocado antes disso.
