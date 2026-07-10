# Plano — Jornada do Paciente (rascunho para revisão)

> Documento de discussão. **Nenhum código será escrito** com base neste plano
> até aprovação explícita. Nada aqui altera cobrança, pagamento, NFS-e,
> GR/guia, regra financeira, contratos ou pacientes associados.

## Problema

Hoje um comparecimento com múltiplos atendimentos (consulta + exames + procedimento)
aparece como N linhas independentes na Agenda, na Recepção, no Painel e nos
Relatórios. O paciente é atendido uma única vez, mas a operação enxerga N
atendimentos soltos — cada um com sua própria ficha, chamada e status.

Clínicas de imagem, cardiologia, medicina ocupacional e diagnóstica costumam
precisar disso: **1 ficha por comparecimento**, agrupando os atendimentos
realizados naquela visita.

## Objetivo

Introduzir o conceito de **Jornada do Paciente** — uma unidade lógica que
representa "o paciente veio à clínica hoje e fez A, B, C" — sem quebrar a
granularidade financeira (cada procedimento continua faturável, guiável e
repassável individualmente).

## Não-objetivos

- Fundir GRs/guias em uma única (guia continua por procedimento quando
  necessário).
- Fundir NFS-e ou lançamentos financeiros.
- Alterar cobrança, pagamento, contrato, cartão benefícios ou dependentes.
- Substituir a Agenda ou a Agenda V2. A Jornada é uma **visão adicional**.

## Modelo de dados proposto (sem migration nesta rodada)

```
jornadas_paciente
  id, clinica_id, paciente_id, unidade_id, criada_em, status, checkin_em,
  encerrada_em, observacoes, responsavel_recepcao_id

jornada_itens
  id, jornada_id, agendamento_id, ordem, categoria, status_local
  (categoria = laboratorio | imagem | consulta | procedimento | cirurgia)
```

Cada `agendamento` continua existindo como está hoje. A jornada é
**opcional**: agendamentos sem jornada seguem 100% compatíveis com o fluxo
atual (retrocompatibilidade total).

## Fluxo previsto na recepção

1. Paciente chega. Recepção abre "Nova Jornada" (ou o sistema oferece
   agrupar automaticamente agendamentos do mesmo paciente no mesmo dia/unidade).
2. Recepção adiciona/remove itens (agendamentos existentes ou novos) até
   confirmar. Marca a ordem sugerida (ex.: laboratório primeiro, depois
   consulta).
3. Um único cartão de espera representa a jornada. As chamadas por setor
   continuam individuais.
4. Cada item da jornada evolui de status (aguardando → em atendimento →
   concluído) independentemente. A jornada só fecha quando todos os itens
   terminam ou o paciente é liberado.

## Impactos previstos

### Painel / Painel Executivo

- Novo KPI opcional: **Jornadas** (comparecimentos únicos) ao lado do já
  existente **Atendimentos** (que continua contando linha a linha, com a
  regra de laboratório aprovada nesta rodada).

### Relatórios

- Nova quebra "por jornada" nos relatórios de produção e de recepção.
- Relatório financeiro **não muda** — continua por atendimento/lançamento.

### Repasse médico

- **Nenhuma alteração**. Repasse continua por `fin_atendimento` (por exame /
  por procedimento).

### Recepção

- Tela dedicada de jornada, mostrando timeline por setor (laboratório →
  consulta → imagem) e senha unificada.

### Emissão de guias

- GRs continuam por exame/procedimento quando exigido pela regra financeira
  do convênio. A jornada só agrupa a **visão**, não a emissão.

## Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Recepção esquecer de criar a jornada e cair em fluxo antigo | Regra opcional: agendamentos do mesmo paciente/dia/unidade viram jornada automaticamente ao 1º check-in. |
| Confundir contagem "atendimentos" x "jornadas" | Nomear com clareza no Painel; documentar. |
| Impacto em Agenda V2 | Zero — jornada é modelo paralelo, não substitui agendamento. |
| Migração retroativa (jornadas históricas) | Opcional; começa apenas com jornadas novas. Backfill como job separado. |

## Faseamento sugerido

**Fase J1 — Modelo + Recepção**
- Migration criando `jornadas_paciente` e `jornada_itens` com RLS e GRANTs.
- Tela de recepção agrupando por jornada.
- Card de senha unificado.

**Fase J2 — Painel + Relatórios**
- KPI de jornadas.
- Quebra "por jornada" em produção/recepção.

**Fase J3 — Integração com Agenda V2 (opcional)**
- Wizard "Nova jornada" na Agenda V2 permite compor múltiplos atendimentos
  antes de salvar.

**Fase J4 — Automação**
- Regra opcional: check-in unifica automaticamente agendamentos do dia.
- Emissão de contrato/termo único da jornada (sem afetar NFS-e por serviço).

## Perguntas em aberto (para você responder antes de codar)

1. Jornada é por dia ou por unidade? (Recomendação: paciente + unidade + dia.)
2. Recepção cria manualmente ou o sistema propõe automaticamente ao check-in?
3. Deve existir "jornada agendada" (planejada com antecedência) ou só ao
   comparecer?
4. Cancelamento parcial: se paciente desiste de 1 item, os outros continuam
   normalmente?
5. Cadastro do paciente compartilhado entre itens (evita re-perguntar
   convênio/telefone) — como manter isso quando itens são de médicos
   diferentes com convênios distintos?

---

**Status: rascunho — aguardando revisão.** Nada será implementado até um
documento de decisão (`plan-jornada-DECIDIDO.md`) ser aprovado por você.