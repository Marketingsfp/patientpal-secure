# Ambientes: Produção × Laboratório

Este repositório é único e alimenta **dois projetos Lovable** distintos, cada
um com seu próprio Lovable Cloud (Supabase). A separação é feita por branch.

```text
GitHub (este repositório)
├── main       ← Lovable-Prod  → Cloud Prod  → produção
└── develop    ← Lovable-Lab   → Cloud Lab   → laboratório (dados fictícios)

Branches de trabalho (sempre via PR):
  hotfix/<slug>    correção urgente saindo de main
  fix/<slug>       correção descoberta no lab, saindo de develop
  feature/<slug>   nova funcionalidade, saindo de develop
  release/<slug>   pacote validado do lab indo para main
```

## Regras de ouro

1. **Nunca push direto em `main` nem em `develop`.** Sempre via PR.
2. Todo **hotfix** vira dois PRs: um para `main`, outro para `develop` (na mesma ordem).
3. **`develop` só sobe para `main` via `release/*` ou `cherry-pick`** de commits já validados no Lab.
4. **Nunca alterar schema pelo painel do Supabase** — só por migration em `supabase/migrations/`.
5. **Dados não sincronizam.** Só a estrutura.
6. No Lab, integrações externas (WhatsApp, NFS-e, e-mail, boletos) usam sandbox/mocks. Nunca destinos reais.
7. Regra 1.10 do `AGENTS.md` continua valendo em ambos os ambientes: sempre confirmar a clínica-alvo.

## Como saber em qual branch o Lovable está

- **Lovable-Prod** fica travado em `main`. Se precisar corrigir bug de produção, use
  Account Settings → Labs → **GitHub Branch Switching** para trocar temporariamente para
  `hotfix/<slug>`, fazer o prompt, voltar para `main` após o merge.
- **Lovable-Lab** fica travado em `develop`. Não trocar.
- A branch ativa aparece no rodapé do editor Lovable quando o Branch Switching está ligado.

## Fluxo hotfix (produção)

```text
1. GitHub:   git checkout main && git pull
             git checkout -b hotfix/<slug>
             git push -u origin hotfix/<slug>
2. Lovable-Prod: Labs → trocar para hotfix/<slug>
3. Prompt de correção → commit vai na hotfix
4. GitHub:   PR hotfix/<slug> → main  (revisar, merge)
5. Lovable-Prod: voltar para main → Publish
6. GitHub:   PR hotfix/<slug> → develop  (resolver conflitos)
7. Lovable-Lab: sincroniza sozinho; validar
```

## Fluxo fix (laboratório)

```text
1. Lovable-Lab (em develop): identificar problema
2. GitHub:   git checkout develop && git pull
             git checkout -b fix/<slug>
3. Lovable-Lab: Labs → trocar para fix/<slug>, prompt de correção
4. GitHub:   PR fix/<slug> → develop
5. Validar no Lab
6. Subir para produção:
   - 1 correção isolada: cherry-pick do sha para uma branch release/<slug> cortada de main → PR para main
   - Bloco de correções: branch release/<versao> a partir de develop → PR para main
```

## Sincronização main → develop

- Obrigatória logo após todo merge em `main`.
- PR "Sync main→develop" semanal (segunda-feira) mesmo sem hotfixes, para não acumular.
- Sempre **merge commit**, nunca rebase e nunca force push.
- Detecção rápida de divergência:
  ```bash
  git log --oneline main ^develop   # commits só em main
  git log --oneline develop ^main   # commits só em develop
  ```

## Arquivos com `merge=ours` (ver `.gitattributes`)

Estes arquivos são regerados pelo Lovable a partir do Cloud vinculado ao
projeto. Em merges cross-branch, sempre preservar a versão da branch de destino:

- `.env`
- `src/integrations/supabase/client.ts`
- `src/integrations/supabase/client.server.ts`
- `src/integrations/supabase/types.ts`
- `src/integrations/supabase/auth-middleware.ts`
- `src/integrations/supabase/auth-attacher.ts`
- `supabase/config.toml`

**Ativar o driver `merge=ours` uma vez em cada clone local:**

```bash
git config merge.ours.driver true
```

Sem esse comando, o Git ignora a diretiva e faz merge normal.

## Rollback

- **Código**: `git revert <sha do merge>` + Publish.
- **Migration**: não use `git revert` em migration já aplicada. Escreva uma
  migration compensatória nova (ex.: `ALTER TABLE ... DROP COLUMN` para desfazer um `ADD COLUMN`).
- **Emergência**: histórico de versões do Lovable (rollback nativo).

## Integrações no Lab (blindagem obrigatória, a ser implantada no Lovable-Lab)

Nenhuma sozinha basta — precisa das camadas juntas:

1. Secret `APP_ENV=lab` no Cloud-Lab.
2. Credenciais próprias de sandbox por integração.
3. Tabela `lab_allowlist_contatos` (telefones/e-mails autorizados).
4. Mocks de WhatsApp e NFS-e ativados quando `APP_ENV=lab`.
5. Guard `assertNotLabForRealOps()` em pagamentos e webhooks de saída.
6. Banner visual vermelho "AMBIENTE DE LABORATÓRIO — dados fictícios".
7. Webhooks externos do Focus NFe / WhatsApp apontando para o URL do Lab.

Ver `.lovable/plan.md` para o plano completo.