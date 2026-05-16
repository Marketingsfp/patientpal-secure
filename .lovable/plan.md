## Visão geral

Integrar o **Sistema Financeiro** (projeto separado, 18 migrations, 14+ páginas) dentro do **ClinicaOS**, com tudo isolado por clínica (SFP, MJ, CH) via RLS, e migrar os dados existentes ao final.

Esse trabalho é grande e vai ser feito em **5 etapas**, cada uma entregue e testada antes de seguir para a próxima. Aprovando esse plano, começo pela Etapa 1.

---

## Etapa 1 — Fundação (banco + navegação)

Recriar o schema financeiro adaptado ao multi-clínica:

- Tabelas:
  - `fin_categorias` (receita/despesa, com `clinica_id`)
  - `fin_contas` (caixa, banco, cartão — saldo por conta)
  - `fin_empresas` (fornecedores/parceiros)
  - `fin_lancamentos` (Receitas + Despesas + Movimento de Caixa — tabela única com `tipo`)
  - `fin_notas_pacientes` (notas fiscais ligadas ao paciente)
  - `fin_atendimentos_financeiro` (link com `pacientes` + valor + repasse via `regras_rateio`)
  - `fin_lembretes`, `fin_alertas`, `fin_regras_ia`
- Todas com `clinica_id NOT NULL` + RLS via `is_member()` / `can_manage_clinica()`
- Adicionar ao menu lateral do `app-shell`: **Financeiro** (Dashboard, Mov. Caixa, BI, Analítico, Atendimentos, Empresas, Notas, Relatórios, Estatísticas, Lembretes, Categorias, Contas, Regras IA, Alertas)
- Rotas em `src/routes/_authenticated/app.financeiro.*`

## Etapa 2 — Operacional do dia a dia

- **Dashboard financeiro**: cards (Saldo, Receitas, Despesas, Atendimentos, Média/Dia, Ticket Médio, Pagamentos Médicos), filtro de período (Hoje/Semana/Mês/Personalizado) e gráfico Evolução 6 meses
- **Movimento de Caixa**: lista, filtros, +Receita/+Despesa (modal com categoria, conta, valor, data, forma de pagamento)
- **Categorias** e **Contas**: CRUD
- **Empresas**: CRUD de fornecedores/parceiros

## Etapa 3 — Atendimentos e rateio médico

- **Atendimentos financeiros** ligados a `pacientes` + `medicos`
- **Notas Pacientes** (NFs-e)
- Cálculo automático de **rateio médico/clínica** usando `regras_rateio` já existente
- Página **Pagamentos Médicos** (extrato de repasses)

## Etapa 4 — Inteligência (BI + IA + Relatórios)

- **BI**: gráficos por categoria/forma de pagamento/médico
- **Analítico** e **Estatísticas**: DRE simplificada por clínica
- **Relatórios**: exportação CSV/PDF por período
- **Regras IA**: classificação automática de lançamentos via Lovable AI
- **Alertas** e **Lembretes**: notificações de vencimentos

## Etapa 5 — Migração dos dados

- Ler as tabelas do projeto **Sistema Financeiro** original via export
- Mapear cada registro a uma das 3 clínicas (SFP/MJ/CH) — vou te perguntar como classificar se não houver campo claro
- Inserir tudo no ClinicaOS preservando histórico e datas

---

## Detalhes técnicos (resumo)

- Stack: **TanStack Start** (este projeto), não React Router DOM como o original — vou reescrever as páginas, não copiar
- Tudo via `createServerFn` quando precisar de lógica privilegiada; queries simples direto pelo `supabase` client com RLS
- Reuso do `useClinica()` para filtrar tudo pela clínica ativa
- Sem Edge Functions — usar TanStack server functions

## O que **não** está incluso

- Tela de configurações/usuários do app original (já temos auth + memberships aqui)
- Importação de planilhas Excel (página Import) — fica para depois se você precisar
- Trocar tema visual — mantenho o visual atual do ClinicaOS (teal)

---

**Posso começar pela Etapa 1 (banco + menu)?** Após aprovar esse plano executo direto.