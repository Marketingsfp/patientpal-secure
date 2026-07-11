Todas as mudanças ficam em `src/components/pages/contratos-page.tsx` (frontend/apresentação). Nenhum arquivo de autenticação, autorização, RLS, presets ou rotas protegidas é tocado. AGENTS.md/seção 1 não se aplica.

## 1. Formulário de novo contrato (foto 2)

- Reordenar o campo **"Nº de pessoas no contrato"** para ficar ao lado do campo **"Convênio"**: ambos passam a ocupar 1 coluna cada na primeira linha do grid (em vez de o Convênio ocupar `col-span-2`). Se não houver faixas cadastradas para o convênio, o Convênio volta a ocupar a linha inteira (fallback).
- Adicionar o campo **"Data Término"** ao lado do campo **"Data início"**, na mesma linha. Substitui a posição atual do "Dia de vencimento", que desce para a linha seguinte junto com "Valor mensal" / "Taxa de adesão".
- **Data Término** é somente-leitura (mesmo estilo visual dos campos "Valor mensal" e "Taxa de adesão": caixa cinza com valor formatado).
- Cálculo automático: `data_fim = data_inicio + 1 ano` (mesmo dia/mês do ano seguinte, ex.: 11/07/2026 → 11/07/2027). Se `data_inicio` estiver vazia, exibe "—".
- No `insert` de `contratos_assinatura` (por volta da linha 862), passar também `data_fim` calculado, para que a coluna Término da listagem seja preenchida corretamente para contratos novos.

## 2. Listagem de contratos (foto 1)

- Adicionar nova coluna **"TIPO DE CONVÊNIO"** entre PACIENTE e INÍCIO. Valor exibido = `convenios.find(x => x.id === c.convenio_id)?.nome ?? "—"` (o array `convenios` já é carregado no `load()`). Coluna sem filtro por enquanto (apenas exibição), para manter o escopo mínimo.
- Ajustar os `colSpan` dos estados "Carregando…" e "Nenhum contrato" de 10 para 11.
- Coluna **TÉRMINO**: passa a exibir `fmtD(c.data_fim)` (já é o comportamento atual). Para contratos antigos com `data_fim` nulo no banco, exibir fallback calculado em memória: `data_inicio + 1 ano` — assim registros legados também aparecem preenchidos, sem migração de dados. Contratos novos criados a partir desta mudança já gravam `data_fim` no banco.

## 3. Regra de negócio

Base de cálculo fixa em **1 ano** conforme o pedido do usuário ("Se um contrato iniciou dia 11/07/2026, ele vence em 11/07/2027"). No último dia da vigência o contrato continua utilizável normalmente (a comparação usa `data_fim` inclusiva — não há mudança em lógica de bloqueio; apenas exibição).

## Fora de escopo

- Não altera `cb_convenios.vigencia_meses` nem lógica de mensalidades.
- Não muda a tabela `contratos_assinatura` (o campo `data_fim` já existe).
- Não adiciona filtro para a nova coluna Tipo de convênio (pode ser pedido depois).
- Não mexe em edição/administração de contratos existentes (aba admin) — foco apenas em criação + listagem.
