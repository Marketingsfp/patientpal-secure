## Diagnóstico confirmado

A paciente **Erica Kariny** existe na Menino Jesus e possui **3 lançamentos válidos** no período (13/07/26) que deveriam aparecer na aba **Atendimentos → Financeiro**:

- `cc6e15ae` — USG TRANSVAGINAL (Dra. Isis Serrano)
- `76a40786` — CONSULTA (Dr. Marcílio)
- `fdbb066b` — PREVENTIVO (Dr. Marcílio)

Todos com `status='confirmado'`, `tipo='receita'`, agendamento válido no intervalo `01/07 → 21/07/2026`. A consulta bruta no banco retorna os 3 corretamente.

**Causa raiz:** no período 01/07 – 21/07 a Menino Jesus tem **2.959 lançamentos**, mas a tela `app.financeiro.atendimentos.tsx` usa um único `supabase.from("fin_lancamentos").select(...)` sem paginação. O PostgREST corta em **1.000 linhas** por padrão, ordenado por `data desc`. Como todos os 2.959 registros são do mesmo período (empate na ordenação), os 3 registros da Erika ficam fora do lote retornado — junto com centenas de outros atendimentos que também estão "sumindo" silenciosamente na Menino Jesus.

Isso é **bug técnico**, não regra de negócio. Já vimos o mesmo padrão de teto de 1.000 em outras telas da Menino Jesus/SFP (buscar_pacientes, mensalidades, etc.).

## Escopo

- **Somente frontend / consultas.** Nenhuma alteração em banco, regras de negócio, RPCs ou dados históricos.
- Aplicação **global** (todas as clínicas): é bug técnico de paginação e não altera nenhum comportamento visível para clínicas menores.

## O que será alterado

Arquivo: `src/routes/_authenticated/app.financeiro.atendimentos.tsx`

1. Trocar as 3 consultas do bloco de carregamento (`qManual` em `fin_atendimentos`, `qAgenda` e `qReceitasSemAgenda` em `fin_lancamentos`) por **loops paginados em blocos de 1.000** usando `.range(offset, offset+999)`, iterando até o lote vir com menos de 1.000 linhas.
2. Manter todos os filtros existentes (clinica_id, tipo, status, período, agendamento inner join) exatamente iguais.
3. Manter a mesma ordenação por `data` desc; a ordenação final da tela continua sendo aplicada em memória depois da união.

Nenhuma alteração em: tipos, cálculo de repasse, filtros de tela (paciente/médico/status/tipo), lógica de espelho manual↔agenda, mensagens, layout.

## Antes / Depois

- **Antes:** Menino Jesus com >1.000 lançamentos no período mostra apenas os primeiros 1.000; Erica (e outros) somem da aba.
- **Depois:** todos os atendimentos do período são carregados, independentemente do volume da clínica.

## Validação

Após aplicar:
1. Abrir `Financeiro → Atendimentos` na Menino Jesus com filtro 01/07 – 21/07/2026 e digitar "erica kariny" — devem aparecer as 3 linhas (USG, Consulta, Preventivo, com Dr. Marcílio / Dra. Isis).
2. Conferir o total geral (`R$ 0,00` atual) — deve subir refletindo os ~2.959 lançamentos completos.
3. Testar SFP no mesmo período para confirmar que o resultado bate com o esperado (nada some, nada duplica).

## Riscos / Pendências

- Carregar 2.959+ linhas em uma clínica movimentada é mais pesado em rede, mas o payload por linha é pequeno; sem impacto perceptível na UX. Se ficar lento no futuro, dá para reduzir o range padrão para últimos 7 dias na aba.
- Não altera nada em produção fora do carregamento desta tela.

Confirma que posso aplicar essa correção **global** (afeta as 3 clínicas, sem tocar em dados)?