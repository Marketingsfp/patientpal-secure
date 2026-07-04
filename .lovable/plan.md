# Plano — RPC `fila_caixa_hoje` (P1-CAIXA-001 etapa 3) + usuário de teste recepção

## 1. Objetivo

Substituir as 7 requests em cascata do `loadFilaCaixa` por uma única RPC no banco, mantendo 100% da semântica atual (mesmos valores, mesmo `ja_pago`, mesmos descontos). Meta: **< 700ms** no warm (hoje: 2,35s).

Sem mudanças de schema. Apenas 1 função nova, `SECURITY INVOKER` (respeita RLS).

## 2. Tabelas consultadas (somente leitura)

| Tabela | Uso |
|---|---|
| `agendamentos` | fila do dia (`fluxo_etapa in (...)`, `inicio` entre 00:00 e 23:59) |
| `medicos` | nome do médico |
| `procedimentos` | valores padrão (`valor_dinheiro`, `valor_cartao_credito`, `valor_padrao`) |
| `contratos_assinatura` | convênio ativo do paciente |
| `cb_convenio_regras` | regras de desconto (percentual/valor fixo) |
| `procedimento_cb_convenio_valores` | valor fixo por procedimento × convênio |
| `procedimento_especialidades` | especialidade do procedimento (para casar regra) |
| `fin_lancamentos` | marca `ja_pago` (`tipo='receita' and agendamento_id in fila`) |

Nenhuma escrita. Nenhum `DELETE`/`UPDATE`.

## 3. Assinatura e campos retornados

```sql
create or replace function public.fila_caixa_hoje(
  _clinica_id uuid,
  _data date default current_date
) returns table (
  id                uuid,
  paciente_id       uuid,
  paciente_nome     text,
  procedimento      text,      -- já com sufixo "(valor convênio)" / "(-20%)" quando aplicável
  inicio            timestamptz,
  medico_nome       text,
  valor             numeric,   -- dinheiro (já com desconto do convênio se houver)
  valor_cartao      numeric,   -- cartão (idem)
  ja_pago           boolean,
  desconto_origem   text       -- diagnóstico: 'particular' | 'convenio_valor_fixo' | 'convenio_regra' | null
)
language sql
stable
security invoker
set search_path = public
```

O front recebe exatamente o mesmo shape do `FilaItem` atual — só troca 7 queries por 1 `.rpc()`.

## 4. Regras de cálculo (espelham 100% o código atual em `app.caixa.tsx:387-413`)

Prioridade, por linha da fila:

1. **Particular (base)**: `valor_dinheiro ?? valor_padrao`; cartão = `valor_cartao_credito ?? valor_padrao ?? dinheiro`.
2. **Sem convênio ativo** (nenhum `contratos_assinatura.status='ativo'` para o paciente) → mantém particular. `desconto_origem = 'particular'`.
3. **Convênio ativo + valor fixo específico** (`procedimento_cb_convenio_valores.valor_dinheiro > 0` para o par proc×convênio) → aplica esse valor em dinheiro e cartão. Sufixo `(valor convênio)`. `desconto_origem = 'convenio_valor_fixo'`.
4. **Convênio ativo + regra** (`cb_convenio_regras` `ativo=true`, casando por `especialidade_id` do procedimento e `tipo` em `['consulta','exame','procedimento']` na ordem, ordenado por `prioridade`):
   - `modo='percentual'` → aplica `(1 - percentual/100)` em dinheiro e cartão. Sufixo `-N%`.
   - `modo='valor_fixo'` → substitui pelo `valor`. Sufixo `R$ X,XX`.
   - `desconto_origem = 'convenio_regra'`.
5. **Sem regra casável** → mantém particular.

Regra "associado": hoje é **derivada automaticamente** pela presença de `contratos_assinatura` ativo — não há flag separada. A RPC preserva esse comportamento.

## 5. Regra de `ja_pago`

```sql
exists (
  select 1 from fin_lancamentos l
  where l.agendamento_id = a.id
    and l.clinica_id     = _clinica_id
    and l.tipo           = 'receita'
)
```

Idêntico ao atual. **Sem** filtro de data em `fin_lancamentos` — pagamento pode ter sido lançado antes do dia do atendimento (ex.: pré-pago). Mantém a proteção contra cobrança duplicada.

## 6. Segurança / RLS

- `SECURITY INVOKER` + `search_path = public`: a RPC executa como o usuário logado; as policies existentes de cada tabela continuam aplicadas.
- `GRANT EXECUTE ON FUNCTION public.fila_caixa_hoje(uuid, date) TO authenticated;`
- Sem `GRANT` para `anon`.
- Recepção só verá linhas das clínicas em que tem `clinica_memberships` (policies já garantem).

## 7. Migration proposta (esboço)

```sql
create or replace function public.fila_caixa_hoje(
  _clinica_id uuid,
  _data date default current_date
) returns table (...campos acima...)
language plpgsql stable security invoker set search_path = public
as $$
begin
  return query
  with fila as (
    select a.id, a.paciente_id, a.paciente_nome, a.procedimento,
           a.inicio, m.nome as medico_nome
    from agendamentos a
    left join medicos m on m.id = a.medico_id
    where a.clinica_id = _clinica_id
      and a.fluxo_etapa in ('aguardando_recepcao','recepcao','caixa')
      and a.inicio >= _data::timestamp
      and a.inicio <  (_data + 1)::timestamp
  ),
  base as (
    select f.*,
           p.id  as procedimento_id,
           coalesce(p.valor_dinheiro, p.valor_padrao, 0)          as base_dinheiro,
           coalesce(p.valor_cartao_credito, p.valor_padrao,
                    p.valor_dinheiro, 0)                          as base_cartao
    from fila f
    left join procedimentos p
      on p.clinica_id = _clinica_id and upper(p.nome) = upper(f.procedimento)
  ),
  conv as (
    select distinct on (c.paciente_id) c.paciente_id, c.convenio_id
    from contratos_assinatura c
    where c.clinica_id = _clinica_id and c.status = 'ativo'
      and c.paciente_id in (select paciente_id from base where paciente_id is not null)
    order by c.paciente_id, c.created_at desc nulls last
  ),
  fixo as (
    select b.id, v.valor_dinheiro
    from base b
    join conv cv on cv.paciente_id = b.paciente_id
    join procedimento_cb_convenio_valores v
      on v.procedimento_id = b.procedimento_id
     and v.convenio_id     = cv.convenio_id
    where v.valor_dinheiro > 0
  ),
  regra as (
    -- resolve regra por especialidade+tipo com order by prioridade
    -- (detalhe implementado dentro do CTE, mesma ordem 'consulta','exame','procedimento')
    ...
  ),
  calc as (
    select b.*,
           coalesce(fx.valor_dinheiro, rg.dinheiro, b.base_dinheiro) as valor,
           coalesce(fx.valor_dinheiro, rg.cartao,   b.base_cartao)   as valor_cartao,
           case when fx.id is not null then '(valor convênio)'
                when rg.id is not null then rg.sufixo end            as sufixo,
           case when fx.id is not null then 'convenio_valor_fixo'
                when rg.id is not null then 'convenio_regra'
                else 'particular' end                                as desconto_origem
    from base b
    left join fixo fx on fx.id = b.id
    left join regra rg on rg.id = b.id
  )
  select c.id, c.paciente_id, c.paciente_nome,
         case when c.sufixo is not null
              then c.procedimento || ' ' || c.sufixo
              else c.procedimento end,
         c.inicio, c.medico_nome, c.valor, c.valor_cartao,
         exists(
           select 1 from fin_lancamentos l
           where l.agendamento_id = c.id
             and l.clinica_id = _clinica_id
             and l.tipo = 'receita'
         ) as ja_pago,
         c.desconto_origem
  from calc c
  order by c.inicio;
end $$;

grant execute on function public.fila_caixa_hoje(uuid, date) to authenticated;
```

CTE `regra` fica com a lógica de prioridade — vou codificar por completo na migration real. Aqui foi resumido para o plano.

## 8. Front-end (após a migration aprovada, em edit separado)

Em `src/routes/_authenticated/app.caixa.tsx`, o `loadFilaCaixa` inteiro (linhas ~310–442) vira:

```ts
const { data, error } = await supabase.rpc('fila_caixa_hoje', {
  _clinica_id: clinicaAtual.clinica_id,
});
if (error) { console.error(error); return; }
setFilaCaixa((data ?? []) as FilaItem[]);
```

Todo o resto (mapas, joins em JS, chunking do `in()`) é removido.

## 9. Plano de rollback

- **Nível 1 (instantâneo, sem deploy):** `drop function public.fila_caixa_hoje;` — a UI passa a receber erro, mas o front pode ser revertido para o caminho antigo com um `git revert` do commit do frontend.
- **Nível 2 (feature flag):** manter os dois caminhos por 1 sprint atrás de um `useCaixaRpc` (localStorage/env). Se preferir isso, digo — não está no escopo default para manter simples.
- Migration é aditiva (só cria função). Nenhum dado ou coluna é alterado — rollback é `drop function`.

## 10. Testes antes/depois

**Antes de aplicar:**
1. Snapshot da fila atual como admin em MJ: nome, procedimento, valor, valor_cartao, ja_pago para todas as linhas de hoje → salvo em JSON.
2. Mesma consulta usando a nova RPC via `supabase--read_query`: `select * from fila_caixa_hoje('<clinica_id>')`.
3. Diff campo a campo. **Critério de aceite: zero divergência.**

**Depois de aplicar no frontend:**
4. Playwright como admin: carrega `/app/caixa` warm → mede tempo, conta requests supabase (esperado: cai de 28 → ~5), verifica 0 HTTP 400, 0 erros de console.
5. Playwright como `recepcao@teste.local`: mesmo teste; verifica que a fila aparece e o botão "Cobrar" continua bloqueado nos `ja_pago`.
6. Teste manual proposto pelo usuário (você): cobrar 1 agendamento de teste e confirmar que ele passa a `ja_pago=true` na próxima carga.

## 11. Riscos

| Risco | Probabilidade | Mitigação |
|---|---|---|
| Divergência de valor vs. cálculo antigo | Média | Diff obrigatório na etapa 10.3 antes de trocar o front |
| Cobrança duplicada por `ja_pago` errado | **Baixa** | Regra idêntica ao código atual; teste 10.5 |
| Regra de convênio casando em ordem diferente | Média | CTE `regra` replica exatamente o loop `['consulta','exame','procedimento']` + `prioridade` |
| Timeout em clínicas grandes | Baixa | Filtro por `_clinica_id` + `inicio` do dia (índices já existem) |
| Afetar Agenda | **Nenhum** | Agenda não usa essa RPC |
| Afetar Caixa (movimentos/sessões) | **Nenhum** | RPC só lê agendamentos+valores; não toca `caixa_sessoes`/`caixa_movimentos` |

## 12. Usuário de teste `recepcao@teste.local`

**Não posso criar usuários via SQL** — a tabela `auth.users` é gerenciada pelo Supabase Auth e o service role key não é acessível no Lovable Cloud. Duas opções:

**Opção A (recomendada, você faz em 30s):** crie você mesmo em **Backend → Users → Add user**:
- Email: `recepcao@teste.local`
- Senha temporária: `Recep@2026!` (ou outra que preferir)
- Auto-confirm: ✅
- Depois eu rodo (via migration na próxima etapa) o INSERT em `user_roles` + `clinica_memberships` + `perfis_acesso` de recepção para a clínica MJ, para o novo usuário.

**Opção B:** crio um `createServerFn` administrativo (`supabaseAdmin.auth.admin.createUser`) protegido por `requireSupabaseAuth` + checagem de admin. Você chama uma vez pelo console do navegador logada como admin. Mais trabalho, mesmo resultado.

Diga qual prefere. Depois de testar, você desativa em **Backend → Users** (botão Ban/Delete).

## 13. Ordem de execução (após sua aprovação)

1. Você cria o usuário (opção A) OU aprova opção B.
2. Rodo a migration da RPC (aditiva, revisível).
3. Faço o diff etapa 10.1–10.3 e mostro o resultado.
4. **Só troco o frontend após seu ok no diff.**
5. Rodo testes 10.4–10.5 e reporto tempos.

Aguardando aprovação para prosseguir.
