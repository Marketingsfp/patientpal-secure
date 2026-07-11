# Plano — Isolamento multi-tenant + RBAC granular

Data: 11/07/2026
Autor: auditoria/planejamento (nenhuma migration executada)
Base: `docs/auditoria-permissoes-2026-07-10.md` + inspeção ao vivo do banco.

> Este documento contém **SQL pronto** por fase para você aplicar quando quiser.
> Nada foi executado. Cada fase é independente e pode virar uma migration separada.

---

## Estado atual (verificado no banco em 11/07/2026)

- **RLS habilitado em 135 de 135 tabelas do schema `public`.** Não há tabela exposta.
- **Funções de autorização existentes:** `is_member`, `can_manage_clinica`
  (admin + gestor), `has_role(user, clinica, role)`.
- **Funções ausentes** (referenciadas no pedido, precisam ser criadas):
  `can_access_patient_data`, `has_module_access`.
- **Padrão atual das policies sensíveis** (`fin_lancamentos`, `pagamentos`,
  `prontuarios`, `paciente_biometria`): `SELECT/INSERT/UPDATE` liberadas para
  qualquer `is_member(...)`; apenas `DELETE` exige `can_manage_clinica`.
  Ou seja: um usuário com perfil "recepção" pode gravar diretamente em
  `prontuarios` ou `fin_lancamentos` via API mesmo que a matriz da tela
  marque "Sem". **Este é o risco P0.**
- **Estorno** já está OK no banco: `UPDATE` exige `can_manage_clinica OR has_role(financeiro)`.
  Só falta o front-end esconder o botão corretamente.
- **Totem/LGPD:** `lgpd_consentimentos` só tem 2 policies (`insert_own`,
  `select_own`). `paciente_biometria` está aberta a qualquer membro
  (inclusive UPDATE/INSERT). Precisa restringir insert do totem.

---

## Fase 1 — Fundamentos no banco (baixo risco)

Cria as funções centrais que as fases seguintes vão consumir. Nenhuma policy
é reescrita ainda, então **não bloqueia ninguém**.

```sql
-- 1.1 Autorização por módulo (baseia-se na matriz perfil_permissoes).
--     Admin passa sempre (mantém o comportamento atual do runtime).
CREATE OR REPLACE FUNCTION public.has_module_access(
  _user_id uuid,
  _clinica_id uuid,
  _modulo text,
  _nivel text DEFAULT 'read'   -- 'read' | 'write'
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    -- membro ativo?
    EXISTS (
      SELECT 1 FROM public.clinica_memberships m
      WHERE m.user_id = _user_id AND m.clinica_id = _clinica_id AND m.ativo = true
        AND (
          m.role = 'admin'                                -- admin: acesso total
          OR EXISTS (
            SELECT 1
            FROM public.perfis_acesso pa
            JOIN public.perfil_permissoes pp ON pp.perfil_id = pa.id
            WHERE pa.clinica_id = _clinica_id
              AND pa.chave = m.role::text
              AND pp.modulo = _modulo
              AND (
                (_nivel = 'read'  AND pp.acesso IN ('read','write'))
             OR (_nivel = 'write' AND pp.acesso = 'write')
              )
          )
        )
    );
$$;

-- 1.2 Acesso a dados clínicos do paciente.
--     Regra: admin, gestor ou médico da mesma clínica; enfermeiro apenas read.
CREATE OR REPLACE FUNCTION public.can_access_patient_data(
  _user_id uuid,
  _clinica_id uuid,
  _nivel text DEFAULT 'read'
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.clinica_memberships m
    WHERE m.user_id = _user_id AND m.clinica_id = _clinica_id AND m.ativo = true
      AND (
        m.role IN ('admin','gestor','medico')
        OR (_nivel = 'read' AND m.role = 'enfermeiro')
      )
  );
$$;
```

**Impacto:** nenhum. Só cria as funções.

---

## Fase 2 — RLS de prontuários e dados clínicos (médio risco)

Restringe leitura/escrita de prontuários ao perfil clínico + gestão.
**Atenção:** teste com um usuário recepção antes de aplicar em produção —
se a recepção precisar visualizar algo do prontuário (ex.: alergias
destacadas na agenda), o `select` precisa manter `is_member`. Recomendação:
manter `select` amplo mas restringir `insert/update/delete`.

```sql
-- prontuarios: escrita restrita a médico/gestor/admin da clínica
DROP POLICY IF EXISTS pron_insert ON public.prontuarios;
DROP POLICY IF EXISTS pron_update ON public.prontuarios;
DROP POLICY IF EXISTS pron_delete ON public.prontuarios;

CREATE POLICY pron_insert ON public.prontuarios FOR INSERT TO authenticated
  WITH CHECK (can_access_patient_data(auth.uid(), clinica_id, 'write'));
CREATE POLICY pron_update ON public.prontuarios FOR UPDATE TO authenticated
  USING      (can_access_patient_data(auth.uid(), clinica_id, 'write'))
  WITH CHECK (can_access_patient_data(auth.uid(), clinica_id, 'write'));
CREATE POLICY pron_delete ON public.prontuarios FOR DELETE TO authenticated
  USING (can_manage_clinica(auth.uid(), clinica_id));

-- Aplicar o mesmo padrão em: anamnese_respostas, exame_resultados,
-- odonto_prontuarios, odonto_dentes, triagens_enfermagem (write=enfermeiro OK).
-- SELECT continua com is_member para não quebrar telas de suporte.
```

---

## Fase 3 — RLS financeiro (médio-alto risco)

Restringe escrita financeira a admin/gestor/financeiro. **Impacto real:**
recepcionistas que hoje registram recebimento em caixa continuam funcionando
**porque `caixa_movimentos` é uma tabela separada** — só quem chama
`fin_lancamentos` diretamente da API perde acesso. Verifique se algum fluxo
de agenda/checkout grava direto em `fin_lancamentos`.

```sql
DROP POLICY IF EXISTS fin_lanc_insert ON public.fin_lancamentos;
DROP POLICY IF EXISTS fin_lanc_update ON public.fin_lancamentos;

CREATE POLICY fin_lanc_insert ON public.fin_lancamentos FOR INSERT TO authenticated
  WITH CHECK (
    can_manage_clinica(auth.uid(), clinica_id)
    OR has_role(auth.uid(), clinica_id, 'financeiro'::app_role)
    OR has_role(auth.uid(), clinica_id, 'caixa'::app_role)   -- remova se não quiser
  );
CREATE POLICY fin_lanc_update ON public.fin_lancamentos FOR UPDATE TO authenticated
  USING      (can_manage_clinica(auth.uid(), clinica_id)
              OR has_role(auth.uid(), clinica_id, 'financeiro'::app_role))
  WITH CHECK (can_manage_clinica(auth.uid(), clinica_id)
              OR has_role(auth.uid(), clinica_id, 'financeiro'::app_role));
-- SELECT/DELETE permanecem como estão (is_member / can_manage_clinica).

-- Replicar em: fin_contas, fin_categorias, fin_empresas, fin_atendimentos,
-- fin_notas_pacientes, pagamentos, pagamento_splits, boletos, nfse.
```

---

## Fase 4 — RLS de biometria/LGPD (baixo risco, alto valor)

Totem deve poder **inserir** biometria só com consentimento LGPD registrado
na mesma transação, e **nunca ler** biometria de outros pacientes.

```sql
-- Bloqueia UPDATE de biometria (write-once).
DROP POLICY IF EXISTS biometria_member_update ON public.paciente_biometria;

-- INSERT continua permitido a membros, mas exige consentimento LGPD ativo.
DROP POLICY IF EXISTS biometria_member_insert ON public.paciente_biometria;
CREATE POLICY biometria_member_insert ON public.paciente_biometria
  FOR INSERT TO authenticated
  WITH CHECK (
    is_member(auth.uid(), clinica_id)
    AND EXISTS (
      SELECT 1 FROM public.lgpd_consentimentos c
      WHERE c.paciente_id = paciente_biometria.paciente_id
        AND c.tipo = 'biometria'
        AND c.revogado_em IS NULL
    )
  );

-- SELECT: apenas equipe clínica (evita atendente do totem ler galeria facial).
DROP POLICY IF EXISTS biometria_member_select ON public.paciente_biometria;
CREATE POLICY biometria_select ON public.paciente_biometria
  FOR SELECT TO authenticated
  USING (can_access_patient_data(auth.uid(), clinica_id, 'read'));
```

---

## Fase 5 — RBAC no front-end (baixo risco)

### 5.1 Financeiro — dashboard e estorno

`src/routes/_authenticated/app.financeiro.*.tsx` e
`src/components/financeiro/SolicitarEstornoDialog.tsx`:

```tsx
const { clinicaAtual } = useClinica();
const role = clinicaAtual?.role;
const podeFinanceiro = role === "admin" || role === "gestor" || role === "financeiro";
if (!podeFinanceiro) return <SemPermissao />;
```

Já existe `<SemPermissao />` em `src/components/sem-permissao.tsx`. Aplicar em:
- `app.financeiro.*.tsx` (dashboard, movimento, atendimentos, estorno, laudos).
- Botão "Solicitar estorno" e "Aprovar estorno" no caixa/atendimento.

### 5.2 Prontuário

`src/routes/_authenticated/app.atendimento-ia.$agendamentoId.tsx` e demais
telas de prontuário:

```tsx
const podeVerProntuario = ["admin","gestor","medico","enfermeiro"].includes(role ?? "");
const podeEditarProntuario = ["admin","gestor","medico"].includes(role ?? "");
```

### 5.3 Totem

`src/routes/totem.tsx` e `src/routes/autoatendimento.tsx`:
- Remover qualquer botão de edição de paciente existente.
- Fluxo de novo paciente: obrigatório passar por `<FaceCaptureDialog />` →
  tela de consentimento LGPD → só então grava `pacientes` + `lgpd_consentimentos` +
  `paciente_biometria` (nessa ordem, na mesma transação server-side).
- Migrar essa gravação para uma `createServerFn` (`src/lib/totem.functions.ts`)
  para poder validar consentimento antes do insert de biometria.

---

## Fase 6 — Redundância `.eq('clinica_id')` no cliente

**Recomendação:** aplicar como *code review rule*, não como refactor big-bang.
RLS já garante o isolamento; o `.eq('clinica_id')` só serve para:

1. Evitar queries acidentalmente amplas que retornam dados de todas as
   clínicas do usuário quando ele é membro de várias.
2. Melhorar performance (índices por clínica).

### Alvos verificados (66 arquivos usam essas tabelas)

Prioridade alta (financeiro/prontuário/pacientes):

```
src/routes/_authenticated/app.financeiro.atendimentos.tsx  (18 queries)
src/routes/_authenticated/app.financeiro.movimento.tsx      (12)
src/routes/_authenticated/app.relatorios.tsx                 (9)
src/routes/_authenticated/app.painel-executivo.tsx           (9)
src/routes/_authenticated/app.caixa.tsx                      (9)
src/routes/_authenticated/app.financeiro.estorno.tsx         (4)
src/components/financeiro/lancamento-dialog.tsx              (5)
```

Prioridade média (agenda/atendimento):

```
src/routes/_authenticated/app.agenda.tsx                    (49)
src/lib/agenda/*.functions.ts                                (17)
src/routes/_authenticated/app.atendimento-ia.*.tsx           (5)
```

### Padrão a aplicar

```ts
// ANTES
const { data } = await supabase.from("fin_lancamentos").select("*").eq("mes", mes);

// DEPOIS
const { data } = await supabase
  .from("fin_lancamentos")
  .select("*")
  .eq("clinica_id", clinicaAtual.clinica_id)   // ← redundância defensiva
  .eq("mes", mes);
```

### Como identificar as queries faltantes

```bash
rg -n "\.from\(['\"]fin_lancamentos['\"]" src --type ts -A 6 \
  | rg -B 6 "\.select|\.insert|\.update" \
  | rg -L "clinica_id"
```

---

## Fase 7 — Segredos do lado servidor (baixo risco, provavelmente já OK)

Auditar imports de `LOVABLE_API_KEY` e outros segredos:

```bash
rg -n "LOVABLE_API_KEY|SUPABASE_SERVICE_ROLE_KEY" src
```

Regras:
- Só pode aparecer em arquivos `*.functions.ts` (dentro de `.handler`) ou
  `*.server.ts` ou `src/routes/api/**`.
- Nunca em componentes React, hooks ou `.tsx` de rota que renderize UI.
- Chamadas ao Lovable AI Gateway → obrigatoriamente via `createServerFn`
  (padrão já usado em `src/lib/transcribe.functions.ts`).

Já verificado: `transcribe.functions.ts`, `boleto.functions.ts`,
`nfse.functions.ts`, `atendimento-ai.functions.ts` seguem o padrão correto.

---

## Fase 8 — Governança dos perfis (recomendação da auditoria de 10/07)

Copiada aqui como lembrete — **não é código, é decisão organizacional**:

1. Reduzir os 10 admins a no máximo 2–3 pessoas de fato administrativas.
2. Reduzir o perfil MÉDICO de 43/57 módulos para ~15 (só clínico + agenda
   própria + repasse próprio).
3. Fazer `can_manage_clinica` deixar de incluir `gestor` para operações que
   alteram permissões — só admin deve alterar matriz de admin.
4. Unificar os dois `PRESETS` divergentes em `src/lib/permissoes-presets.ts`.

---

## Ordem sugerida de execução

| # | Fase | Risco | Duração | Rollback |
|---|------|-------|---------|----------|
| 1 | Funções `has_module_access` + `can_access_patient_data` | Nenhum | 5 min | `DROP FUNCTION` |
| 2 | RLS prontuários (write) | Médio | 10 min | Migration reversa restaurando `is_member` |
| 3 | RLS financeiro (write) | Médio-alto | 15 min | Idem |
| 4 | RLS biometria/LGPD | Baixo | 10 min | Idem |
| 5 | RBAC front (financeiro/prontuário/totem) | Baixo | 30 min | Reverter commits |
| 6 | `.eq('clinica_id')` nos 7 arquivos prioritários | Baixo | 45 min | Reverter commits |
| 7 | Auditoria de segredos | Nenhum | 10 min | — |
| 8 | Governança de perfis | Organizacional | — | — |

**Antes de qualquer fase de RLS:** rodar um teste com um usuário de cada
perfil (admin, médico, recepção, financeiro, caixa, enfermeiro) na clínica
Menino Jesus. A migration entra em uma janela de baixo uso.

---

## Checklist de validação por fase

Após aplicar cada fase, executar no console do navegador logado como
**recepção**:

```js
// Deve dar erro/vazio após Fase 3
await supabase.from('fin_lancamentos').insert({ clinica_id: '...', valor: 1 });
// Deve dar erro após Fase 2
await supabase.from('prontuarios').update({ diagnostico: 'x' }).eq('id','...');
```

E como **médico**:

```js
// Deve funcionar
await supabase.from('prontuarios').select('*').limit(1);
// Deve dar erro
await supabase.from('fin_lancamentos').insert({ ... });
```
