## Problema
A política SELECT em `nfse_emitentes` só permite gestores. Usuários comuns precisam ler dados básicos do emitente (id, nome, CNPJ, município, ambiente Focus, ambiente padrão) para emitir NF-e, mas **não podem** ver colunas sensíveis (certificado digital, senha do certificado, tokens Focus NFe homologação/produção).

## Solução: view segura + refatorar leituras client-side
Global (todas as clínicas).

### 1. Migration — criar view `nfse_emitentes_publico`

```sql
CREATE OR REPLACE VIEW public.nfse_emitentes_publico AS
SELECT
  id, clinica_id, nome, razao_social, cnpj, inscricao_municipal,
  codigo_municipio, municipio, uf, endereco, numero, bairro, cep,
  telefone, email, regime_tributario, item_lista_servico, cnae,
  codigo_tributacao_municipio, aliquota_iss, iss_retido,
  descricao_servico_padrao, focus_ambiente, focus_serie_rps,
  rps_proximo_numero, rps_lote_proximo, ativo, padrao,
  created_at, updated_at
FROM public.nfse_emitentes;
-- Sem security_invoker → executa como owner, ignora RLS do base
-- mas exclui: focus_token_producao, focus_token_homologacao,
-- certificado_a1_base64, certificado_a1_senha, e outros campos sigilosos.

-- Filtro de linhas via política própria (a view herda RLS quando
-- security_invoker=on). Como usamos DEFINER, aplicamos filtro no SQL:
CREATE OR REPLACE VIEW public.nfse_emitentes_publico
WITH (security_invoker=off) AS
SELECT ...campos acima...
FROM public.nfse_emitentes e
WHERE EXISTS (
  SELECT 1 FROM public.clinica_memberships m
  WHERE m.user_id = auth.uid()
    AND m.clinica_id = e.clinica_id
    AND m.ativo = true
);

REVOKE ALL ON public.nfse_emitentes_publico FROM PUBLIC, anon;
GRANT SELECT ON public.nfse_emitentes_publico TO authenticated;
```

Colunas sigilosas ficam ausentes da view; ninguém que use a view consegue vê-las, mesmo por engano.

### 2. Refatorar 6 pontos client-side para consumir a view
Todos apenas leem colunas não sensíveis:

- `src/components/nfse/use-pick-emitente.tsx` (2 selects)
- `src/routes/_authenticated/app.nfse.index.tsx` (2 selects — lista + `rps_proximo_numero`)
- `src/routes/_authenticated/app.nfse.testar.tsx`
- `src/routes/_authenticated/app.financeiro.notas.tsx`
- `src/routes/_authenticated/app.financeiro.atendimentos.tsx`
- `src/components/pages/contratos-page.tsx`
- `src/routes/_authenticated/app.nfse.index.tsx` join embutido: `emitente:nfse_emitentes(nome, cnpj)` → apontar para `nfse_emitentes_publico` via FK hint.

### 3. Não alterar
- Tabela base `nfse_emitentes` mantém as políticas atuais (só gestores selecionam/gerenciam), então cadastro/edição na tela **Configurações → NF-e** continua exclusiva para gestores.
- `nfse.functions.ts` (backend) continua usando a tabela base — roda com service role / gestor.
- Backup diário e emissão via server function continuam intactos (usam service role).

## Validação
- Logar como usuário comum da SFP: abrir "Financeiro → Notas" e "Financeiro → Atendimentos" → dropdown de emitente carrega.
- Emitir NF-e de teste com usuário comum.
- Logar como gestor: tela Configurações → NF-e continua funcionando (CRUD via tabela base).
- Conferir no console/network: nenhuma query cliente lê `focus_token_*` nem `certificado_*`.

## Fora de escopo
- Não mexer no motor de emissão.
- Não alterar política de UPDATE/INSERT/DELETE (permanece restrita a gestores).