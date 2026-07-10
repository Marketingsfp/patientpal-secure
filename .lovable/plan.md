# Plano — Repasse de Laudo ECG (rateio manual entre cardiologistas)

## Decisões alinhadas com você
- **Escopo:** só ECG por enquanto (sem generalizar para outros exames com laudo).
- **Quem lauda:** rateio entre todos os cardiologistas cadastrados na clínica.
- **Valor:** cadastrado por médico (cada cardiologista tem seu próprio % ou R$ fixo).
- **Momento:** o financeiro lança manualmente. Nada é gerado automático no atendimento.

## Análise dos 4 eixos
- 💰 **Financeiro:** elimina risco de pagar laudo não feito; permite que o financeiro só solte o repasse depois de confirmar a lista de ECGs laudados no período.
- ⏱️ **Operacional:** recepção segue igual (não muda nada no agendamento do ECG). Financeiro ganha uma tela dedicada com pré-cálculo por cardiologista.
- 😊 **Experiência:** paciente não afetado; cardiologistas passam a receber pelo laudo de forma rastreável.
- 🛡️ **Auditoria:** cada lançamento fica com médico beneficiado + usuário que lançou + período + lista de ECGs de base.

## O que aparece na UI

**1. Cadastro do médico "ELETROCARDIOGRAMA" (o da agenda)** — nova aba **Repasse Laudo**

Igual em estilo à seção Repasse Individual da foto 2. Lista todos os cardiologistas ativos da clínica (via `medico_especialidades` + especialidade Cardiologia) com duas colunas editáveis:

```text
Nome do laudador              Tipo         Valor
─────────────────────────────────────────────────
Dr. João Cardio               % Percentual   40
Dra. Maria Cardio             R$ Valor       15,00
Dr. Pedro Cardio               —              —    (não lauda)
```

Deixar em branco = médico não recebe laudo. O cadastro é por-agenda-ECG (fica ligado ao médico "ELETROCARDIOGRAMA"), o que permite ter no futuro uma agenda "ECG Unidade 2" com laudadores diferentes.

**2. Financeiro → nova sub-aba "Laudos ECG"** (dentro do módulo Repasse Médico / Financeiro)

Fluxo em 3 passos:
1. Filtro por período (data de início/fim) + clínica.
2. Sistema mostra:
   - Total de ECGs realizados no período (`fin_atendimentos` cujo `medico_id` = agenda ECG e serviço = ECG).
   - Para cada cardiologista com repasse configurado, o **valor pré-calculado** aplicando o %/R$ dele sobre o total de ECGs (a definir na aprovação: sobre valor faturado ou por unidade — ver ponto aberto abaixo).
   - Valor sugerido, editável.
3. Botão **"Lançar repasses"** — cria 1 lançamento em `fin_lancamentos` por cardiologista, categoria "Repasse Laudo ECG", com `medico_id` = laudador, referência à agenda-ECG e ao período.

Cada lançamento gera linha em `audit_log`.

## Detalhes técnicos

**Modelo de dados:**
- Nova tabela `medico_repasse_laudo`
  - `agenda_medico_id` (o médico-agenda, ex.: ELETROCARDIOGRAMA)
  - `laudador_medico_id` (o cardiologista)
  - `tipo_repasse` (`percentual` | `valor`)
  - `percentual` / `valor` (mesmo padrão de `medico_convenios`)
  - `clinica_id`, timestamps
  - UNIQUE (`agenda_medico_id`, `laudador_medico_id`)
- Nova tabela `fin_laudo_lotes` para agrupar o lançamento manual (opcional, mas ajuda auditoria)
  - `periodo_inicio`, `periodo_fim`, `agenda_medico_id`, `total_ecgs`, `criado_por`, `criado_em`
  - filhas em `fin_lancamentos` referenciam o lote.
- GRANTs + RLS: SELECT/INSERT/UPDATE/DELETE para `authenticated` filtrado por `clinica_id`; `service_role` full.
- Sem CHECK constraint com `now()`; usar trigger só para `updated_at`.

**Arquivos que devem mudar:**
- `src/components/medicos/MedicoFormDialog.tsx` → nova aba "Repasse Laudo" (visível só quando o médico é o de agenda ECG, ou sempre — a decidir; ver ponto aberto).
- `src/routes/_authenticated/app.financeiro.tsx` → novo item de subnav "Laudos ECG".
- `src/routes/_authenticated/app.financeiro.laudos-ecg.tsx` → nova página (filtro + tabela pré-cálculo + lançar).
- `src/lib/financeiro/laudos.functions.ts` (novo) — server fns:
  - `listarCardiologistasComRepasseLaudo({ agendaMedicoId })`
  - `preCalcularLaudosEcg({ periodo, agendaMedicoId })`
  - `lancarLaudosEcg({ periodo, agendaMedicoId, itens })` (protegido por `requireSupabaseAuth`)
- Migration única para tabelas + GRANTs + RLS.

**Regras de negócio críticas (governança):**
- Bloquear valor negativo, % > 100.
- Impedir lançar 2× o mesmo lote (mesmo `agenda_medico_id` + mesmo período).
- Não permitir alterar/deletar lançamento de laudo depois de conciliado (`fin_lancamentos.conciliado_em`).

## Pontos que ainda preciso confirmar antes de implementar

1. **Base do %:** o percentual do laudador incide sobre **o valor faturado dos ECGs** no período (ex.: 40% de R$ 1.000 = R$ 400) ou **por unidade de ECG** (ex.: R$ 15 × 60 ECGs)? A resposta muda o pré-cálculo.
2. **Como identificar "o médico-agenda ECG":** existe uma flag hoje ou é só pelo nome? Ideal marcar no cadastro do médico "é agenda de exame — não recebe repasse próprio".
3. **Categoria financeira:** criar categoria específica "Repasse Laudo ECG" em `fin_categorias` ou reutilizar a de repasse médico existente?

Posso responder a #2 com um SELECT rápido no banco assim que você aprovar o plano, ou você já sabe a resposta.

## Estimativa
- Migration + backend: ~1h30
- UI cadastro (aba nova no MedicoFormDialog): ~1h
- Página financeiro Laudos ECG: ~2h
- Testes manuais + auditoria: ~30min
- **Total:** ~5h

Se aprovar, começo pela migration (que precisa da sua aprovação separada) e depois toco o resto de uma vez.
