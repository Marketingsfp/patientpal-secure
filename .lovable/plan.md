## Objetivo
Em **Caixa → Movimentos da sessão**, separar o nome do serviço em uma coluna própria e adicionar a coluna **Médico**.

## Mudanças em `src/routes/_authenticated/app.caixa.tsx`

### 1. Enriquecer os movimentos após o `load()`
Depois de carregar `movs` (linha ~406-411), fazer duas consultas em lote:

- `fin_lancamentos` filtrando pelos `lancamento_id` presentes nos movimentos, selecionando `id, medico_id, agendamento_id, descricao`.
- `medicos` para obter `nome` dos `medico_id` retornados.
- Opcional: `agendamentos` → `procedimentos.nome` quando quisermos o nome oficial do procedimento (usaremos apenas se disponível; caso contrário caímos no parse da descrição).

Guardar num `Map<lancamento_id, { medico_nome, servico_nome }>` em estado (`enrichPorLanc`).

### 2. Derivar `servico` e `medico` para cada linha
Função utilitária `deriveServicoMedico(m)`:

- Se `m.lancamento_id` e houver enriquecimento → usar `servico_nome` (procedimento do agendamento ou fin_lancamentos.descricao) e `medico_nome`.
- Fallback (abertura/fechamento/sangria/estorno manual): parse de `m.descricao`
  - Serviço: parte após `" — "` ou `" · "`, removendo sufixos entre parênteses de forma de pagamento (`(cartão …)`, `(pix)`, etc.). Se não houver separador → `—`.
  - Médico: `—`.
- Descrição exibida na coluna "Descrição": manter o texto original (paciente + contexto) — o serviço fica destacado na nova coluna.

### 3. Tabela (linhas ~1304-1333)
Cabeçalho passa a ser: `Data | Hora | Tipo | Descrição | Serviço | Médico | Forma | Valor | Ação`.

Adicionar duas novas `<TableCell>` entre Descrição e Forma exibindo `servico || "—"` e `medico || "—"`.

Atualizar `colSpan={7}` da linha vazia para `colSpan={9}`.

### 4. Export Excel/PDF (linhas ~1037 e ~1080)
Incluir colunas `Serviço` e `Médico` no CSV/Excel e no HTML de impressão, na mesma ordem da tabela.

## Fora do escopo
- Não altero a tabela "Histórico de sessões" nem a de Manager.
- Sem mudanças no schema, cálculos, filtros ou fluxo de estorno.
- Movimentos sem `lancamento_id` (abertura, fechamento, sangria) exibirão `—` em Médico.
