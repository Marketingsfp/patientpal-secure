## Objetivo

Permitir agrupar **várias cobranças pagas do mesmo paciente** em **uma única NFS-e**, combinando:

- Mensalidades de contrato (Cartão Benefícios / Convênios)
- Atendimentos avulsos pagos (Agenda / Financeiro)
- Taxas de adesão / inclusão de dependente

Escopo confirmado: **todas as 3 clínicas**, comportamento **global**.

---

## Antes × Depois

**Hoje** — cada parcela paga e cada atendimento pago geram uma NFS-e independente. Não há como somar 6 mensalidades pagas retroativamente em uma nota só, nem juntar “consulta avulsa + mensalidade” do mesmo tomador.

**Depois** — o operador seleciona *N* itens pagos do mesmo paciente (na aba Mensalidades do contrato **e/ou** em uma nova aba “NFS-e agrupada”), o sistema:

1. Soma os valores.
2. Monta descrição consolidada (“Mensalidades set/2026 a dez/2026 + Consulta 12/07/2026…”).
3. Emite **1 NFS-e** com valor total.
4. Vincula todos os `fin_lancamentos` selecionados à mesma nota (o botão “NFS-e” some/aparece como emitida em cada linha origem).

---

## Mudanças (o que será tocado)

### 1. Banco (1 migração)

- Adicionar coluna `nfse.pagamento_ids uuid[]` (mantém `pagamento_id` como principal para retrocompatibilidade).
- Índice GIN em `pagamento_ids` para consulta rápida por lançamento.
- Sem mudança em RLS/políticas (herda `nfse`).

### 2. Backend / Server function

- `src/lib/nfse.functions.ts`: aceitar `pagamentoIds: uuid[]` no `inputValidator`. Ao inserir em `nfse`, gravar array; manter primeiro id em `pagamento_id`.
- Nada muda no envio ao Focus NFe (é uma nota só, valor total).

### 3. Frontend

**a) Aba “Mensalidades” do contrato** (`contratos-page.tsx`)

- Estender a barra flutuante de seleção existente (que já soma parcelas selecionadas) com o botão **“Emitir NFS-e agrupada (N)”**, habilitado quando **todas as selecionadas estiverem pagas** e tiverem `lancamento_id`.
- Reaproveita `pickTomadorNfse` + `pedirDescricaoNfse` (fluxo idêntico ao unitário).
- Após emitir, atualiza `nfsePorLancamento` de todos os ids selecionados.

**b) Nova página “NFS-e agrupada por paciente”** em `Financeiro › Notas`

- Campo de busca de paciente.
- Lista `fin_lancamentos` pagos do paciente **sem NFS-e emitida** (mensalidades, taxas, atendimentos) das últimas 12 meses, com filtro por período.
- Seleção múltipla → mesmo fluxo de emissão agrupada.

### 4. Validações / regras

- Todos os itens têm que ser do **mesmo `clinica_id`** e do **mesmo paciente/tomador**.
- Nenhum item selecionado pode já ter NFS-e ativa (`status != 'cancelada'`).
- Se houver mistura consulta+exame, a nota vai pelo CNPJ do **primeiro item** (mantém a heurística atual do `nfse.functions.ts`); se o operador quiser separar, seleciona em lotes distintos. Isso será avisado no dialog antes de emitir.

---

## Fora do escopo

- Cancelamento / substituição de nota agrupada (fica para depois — cancela igual às unitárias, já suportado).
- Rateio de valores/impostos entre itens (a nota é única, valor cheio).
- Emissão agrupada envolvendo tomadores diferentes.

---

## Riscos

- **Produção**: mexe em fluxo que dispara integração real Focus NFe. Vou testar primeiro em uma seleção pequena (2 parcelas) na Menino Jesus e reportar antes de considerar concluído.
- Retrocompatibilidade: consultas antigas em `nfse.pagamento_id` continuam funcionando; código que usa a nova capacidade lê `pagamento_ids`.

---

## Validação prevista

1. Migração aplicada.
2. Rebuild dos tipos Supabase.
3. Selecionar 2 mensalidades pagas de um contrato de teste → emitir agrupada → verificar no banco: 1 linha em `nfse`, `pagamento_ids` com 2 UUIDs, ambos os botões “Emitir NFS-e” trocados por link.
4. Repetir com 1 mensalidade + 1 atendimento avulso do mesmo paciente na nova aba do Financeiro.
