
## Objetivo

Hoje o fluxo "Solicitar estorno" só funciona para **recebimentos** (linhas de `caixa_movimentos` com `lancamento_id` em `fin_lancamentos`). Sangria não tem lançamento financeiro — é apenas um movimento negativo de caixa (`caixa_movimentos.tipo = 'sangria'`), então nunca há botão de estorno na linha. Este plano estende o fluxo existente para permitir solicitar (e o financeiro aprovar) o estorno de uma sangria, reutilizando exatamente a mesma UI/tabela/notificação/lista.

## Pergunta de escopo (regra 1.10 — clínica-alvo)

Precisa confirmar antes de codar: aplicar em **todas as 3 clínicas** (Menino Jesus, SFP, POLICLINICA SAO FRANCISCO DE PAULA) ou apenas em uma? A alteração é técnica (não é regra nova de negócio), então o padrão sugerido é **global**, mas confirmo antes de executar.

## Análise (4 eixos)

- **Financeiro:** fecha lacuna — hoje sangria errada só é corrigida por lançamento manual "avulso" sem rastro; passa a ter aprovação, motivo e histórico como qualquer estorno.
- **Operacional:** mesmo fluxo já conhecido (botão na linha → sino do financeiro → aprovar/recusar). Zero curva de aprendizado.
- **Experiência:** recepção deixa de ficar dependente de aviso por WhatsApp/verbal para o financeiro consertar sangria trocada de valor/destinatário.
- **Segurança/Auditoria:** solicitação, aprovação e reversão gravadas em `estorno_solicitacoes` + `audit_log`, com usuário/hora.

## Como será feito

### 1. Banco (migração)

- `estorno_solicitacoes`: adicionar coluna `caixa_movimento_id uuid` (nullable, FK opcional lógica para `caixa_movimentos.id`).
- Índice único parcial `uq_estorno_solicitacoes_movimento_pendente` em `(caixa_movimento_id)` onde `status = 'pendente'` — mesma trava que já existe para `lancamento_id`.
- Ampliar CHECK do campo `tipo` (se existir) para aceitar `estorno_sangria`, ou simplesmente reutilizar `erro_caixa` — o discriminador real passa a ser `caixa_movimento_id IS NOT NULL`.
- Nova função `public.estornar_sangria(_movimento_id uuid, _clinica_id uuid) returns jsonb` (SECURITY DEFINER, mesma assinatura de retorno da `estornar_lancamento_receita`):
  - valida que o movimento existe, é da clínica, tipo `sangria` e ainda não estornado;
  - insere um `caixa_movimentos` de compensação com `tipo = 'suprimento'`, mesmo valor, descrição `"[Estorno de sangria] <descrição original>"`, referenciando o movimento origem;
  - se a sessão original ainda está `aberto`, lança na mesma sessão; se fechada, lança na sessão aberta atual do usuário aprovador (retorna aviso `"lancado_em_sessao_atual"`);
  - marca o movimento original com metadata (`observacoes` acrescido de `[ESTORNADO em ... por ...]`) para o histórico não sumir.
- GRANT execute para `authenticated`; revoke de `public`/`anon`.

### 2. Front — `SolicitarEstornoDialog`

- Novo prop opcional `caixaMovimentoId?: string | null`.
- Se `caixaMovimentoId` presente:
  - checa duplicidade contra `estorno_solicitacoes.caixa_movimento_id`;
  - grava no insert `caixa_movimento_id` e `tipo = 'erro_caixa'` (sangria só faz sentido como erro de caixa);
  - esconde o bloco "devolução ao paciente" (não se aplica).

### 3. Front — `app.caixa.tsx` (linhas de movimento)

- No mapa `estornosPorLanc`, criar `estornosPorMov` (Map por `caixa_movimento_id`).
- Na célula `Ação` da tabela, adicionar bloco espelho do atual `m.tipo === "recebimento"` para `m.tipo === "sangria" && podeEscrever`:
  - "Aguardando aprovação" quando pendente;
  - "Estornada" quando aprovado;
  - "Solicitar estorno" chamando `setEstornoFor(m)` com o mesmo dialog, passando `caixaMovimentoId={m.id}`.
- Ajustar o `<SolicitarEstornoDialog>` no rodapé para passar `caixaMovimentoId` quando `estornoFor?.tipo === 'sangria'`.

### 4. Front — `app.financeiro.estorno.tsx` (aprovação)

- `Solic` ganha `caixa_movimento_id: string | null`.
- `executarEstorno`: se `s.caixa_movimento_id`, chama `supabase.rpc("estornar_sangria", ...)`; senão mantém `estornarLancamentoReceita`.
- Coluna "Descrição" mostra badge "Sangria" quando aplicável, para o financeiro reconhecer.

### 5. Sino de notificações (`EstornosBell.tsx`)

- Sem mudança de código — a listagem é `status = 'pendente'` na mesma tabela; o toast já aparece automaticamente.

### 6. Auditoria

- `estornar_sangria` grava `audit_log` (tabela `caixa_movimentos`, action `ESTORNO`, dados_antes/depois com valor e destinatário).

## Antes / Depois

- **Antes:** linhas de sangria em `Meus movimentos` não têm ação; correção precisa ser feita por lançamento manual sem aprovação.
- **Depois:** operador clica "Solicitar estorno" na sangria, financeiro recebe no sino (mesma fila), aprova → sistema cria movimento de suprimento equivalente e marca a sangria como estornada, mantendo os dois registros no histórico.

## Validação

- Criar sangria de R$ 1,00 em ambiente de teste da clínica indicada, solicitar estorno, aprovar pelo financeiro, conferir: (a) suprimento de compensação criado na mesma sessão, (b) saldo do caixa restaurado, (c) `estorno_solicitacoes` com status `aprovado` e `caixa_movimento_id` preenchido, (d) `audit_log` com o registro, (e) botão da linha vira "Estornada".
- Testar tentativa de segunda solicitação (deve ser barrada pelo índice único).
- Testar aprovação quando a sessão original está fechada — deve lançar na sessão aberta com aviso.

## Fora de escopo

- Devolução ao paciente para sangria (não faz sentido; sangria não é pagamento).
- Estorno de suprimento/despesa — pode virar próximo passo, se o time pedir.

## Risco

Baixo. Reaproveita 100% da UI/tabela existente; apenas adiciona uma coluna, uma RPC e um bloco de botão espelhando o já testado para recebimentos.
