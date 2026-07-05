# Migração C.1 — `fin_atendimentos.nfse_id`

Correção pontual para desbloquear os 2 cenários de NFS-e (agrupada e por item) que falharam no E2E da Migração C. Aditiva, reversível, sem tocar em dado real.

## 1. Alteração de schema

**Coluna nova em `public.fin_atendimentos`:**
```sql
ALTER TABLE public.fin_atendimentos
  ADD COLUMN nfse_id uuid NULL
  REFERENCES public.nfse(id) ON DELETE SET NULL;
```
- Nullable (atendimento pode existir sem NFS-e emitida).
- `ON DELETE SET NULL`: se a NFS-e for excluída/cancelada, o vínculo é limpo mas o atendimento permanece intacto (regra financeira: nunca perder receita).

**Índice:**
```sql
CREATE INDEX idx_fin_atendimentos_nfse_id
  ON public.fin_atendimentos(nfse_id)
  WHERE nfse_id IS NOT NULL;
```
Parcial (só linhas com NFS-e) — suporta a consulta N atendimentos → 1 NFS-e no modo `agrupada` sem inflar o índice.

**Nenhum GRANT novo** — `fin_atendimentos` já tem os grants para `authenticated`/`service_role`.

## 2. Impacto por eixo

| Eixo | Impacto | Risco |
|---|---|---|
| 💰 Financeiro | Vínculo 1-N (1 NFS-e ↔ N atendimentos) fica explícito; nenhuma coluna de valor muda | 🟢 |
| 🧾 NFS-e | `emitir_nfse_orcamento` passa a executar (para de referenciar coluna inexistente); modo `por_item` grava 1-para-1, `agrupada` grava N-para-1 | 🟢 |
| 💵 Caixa | Nenhum — `caixa_movimentos` e `caixa_sessoes` não são tocados | 🟢 |
| 📊 Relatórios | Habilita filtros "atendimentos faturados/não faturados" e "atendimentos por NFS-e"; nenhuma view existente quebra (coluna aditiva) | 🟢 |
| 🛡️ Auditoria | `emitir_nfse_orcamento` já grava `audit_log`; nenhum ajuste necessário | 🟢 |

## 3. Rollback

```sql
DROP INDEX IF EXISTS public.idx_fin_atendimentos_nfse_id;
ALTER TABLE public.fin_atendimentos DROP COLUMN IF EXISTS nfse_id;
```
Reversão limpa. Como a coluna é aditiva e nullable, dropar não afeta linhas existentes.

## 4. Testes pós-aplicação (só os 2 cenários que falharam)

Prefixo `[TESTE-FRONT-CONVERSAO]`. Via Playwright autenticado como admin, pelo `ConversaoOrcamentoDialog`.

**Teste 1 — NFS-e por item** (`clinicas.nfse_modo_emissao='por_item'`):
1. Seed: orçamento com 3 itens, todos convertidos em venda → 3 `fin_atendimentos` pagos.
2. UI: clicar "Emitir NFS-e" no dialog.
3. Asserts:
   - 3 rows em `nfse` criadas (1 por atendimento).
   - `fin_atendimentos.nfse_id` de cada uma aponta para a NFS-e correspondente (1-para-1).
   - Segunda chamada retorna `NFSE_JA_EMITIDA` (sem duplicar).

**Teste 2 — NFS-e agrupada** (`clinicas.nfse_modo_emissao='agrupada'`):
1. Seed: mesmo orçamento com 3 itens pagos.
2. UI: clicar "Emitir NFS-e".
3. Asserts:
   - 1 row em `nfse` com `orcamento_id` preenchido e `valor_servicos = SUM(itens)`.
   - `fin_atendimentos.nfse_id` das 3 rows aponta para o **mesmo** `nfse.id`.
   - Segunda chamada retorna `NFSE_JA_EMITIDA`.
   - Se algum item não estiver pago → `NFSE_ITENS_PENDENTES` e nenhuma NFS-e criada.

**Confirmações finais que serão reportadas:**
- NFS-e vinculada a cada atendimento via `fin_atendimentos.nfse_id`.
- Não duplica emissão (bloqueio idempotente).
- Respeita `clinicas.nfse_modo_emissao` (dois modos testados no mesmo turno, alternando a config).
- Cleanup 100% via prefixo `[TESTE-FRONT-CONVERSAO]` + contagem antes/depois.
- Nenhum dado real alterado (config da clínica restaurada ao valor original ao fim do teste).

## 5. Não faz parte desta migração
- Não altera a RPC `emitir_nfse_orcamento` (ela já espera `nfse_id`; só adicionamos a coluna).
- Não muda default de `nfse_modo_emissao` em clínicas existentes.
- Não emite NFS-e real no Focus — os testes usam o caminho de gravação local (sem chamada externa).
