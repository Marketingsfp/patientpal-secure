# Plano — Ambientes Produção × Laboratório com Lovable + GitHub

**Nada será alterado até você aprovar.** Este é apenas o diagnóstico e a arquitetura recomendada.

---

## 1. Diagnóstico da estrutura atual

Inspecionei o repositório:

- **Lovable Cloud ativo** apontando para um único Supabase de produção (`odllhxwadsrnhphzoevl`).
- **Uma única base de código** (branch única gerenciada pelo Lovable).
- **494 migrations** versionadas em `supabase/migrations/` — bom, dá para replicar a estrutura em outro projeto Supabase.
- **Nenhuma Edge Function** em `supabase/functions/` — toda a lógica servidor está em `createServerFn` (TanStack Start) rodando no Cloudflare Workers via `wrangler.jsonc`.
- **`.env` versionado** com `VITE_SUPABASE_URL` / `VITE_SUPABASE_PROJECT_ID` fixos apontando para produção (chaves publishable, não são segredos).
- **Integrações externas em produção**: WhatsApp (`src/lib/whatsapp.functions.ts`, rota pública `api/public/whatsapp.$clinicaId.ts`), NFS-e (Focus NFe webhook em `api/public/focusnfe.webhook.ts`), backup diário (`api/public/hooks/backup-diario.ts`), e-mail, boletos, QZ Tray. Chaves reais ficam em Secrets do Cloud (não no repo).
- **Sem GitHub conectado no momento** (nenhum workflow em `.github/`).
- **AGENTS.md regra 1.10**: toda alteração exige confirmação da clínica-alvo.

---

## 2. Limitações reais do Lovable (importante entender antes de escolher a arquitetura)

Estas limitações moldam tudo o que segue:

1. **Um projeto Lovable = uma branch ativa por vez.** O suporte a múltiplas branches é *experimental* (Account Settings → Labs → "GitHub Branch Switching"). Trocar branch no Lovable troca o código que o preview mostra, mas a troca é lenta e o preview/publish é um só.
2. **Um projeto Lovable = um Lovable Cloud (Supabase).** Não é possível ter o mesmo projeto Lovable apontando para dois Supabase diferentes conforme a branch. Os Secrets, o banco e o Storage são presos ao projeto.
3. **Uma publicação (`.lovable.app`) por projeto.** Um projeto Lovable = um domínio publicado. Não existe "publicar main em um domínio e develop em outro" a partir de um único projeto.
4. **Migrations são aplicadas pela ferramenta ao Cloud daquele projeto**, não por CI. Se você abrir uma migration na branch `develop` do Lovable, ela roda no Supabase daquele projeto — não existe "aplicar só no Supabase de testes".
5. **Merges feitos no GitHub voltam ao Lovable via sync bidirecional**, mas os arquivos auto-gerados (`src/integrations/supabase/client.ts`, `types.ts`, `.env` com URL/keys do Cloud) são reescritos pelo Lovable a partir do Cloud vinculado ao projeto — logo, uma tentativa de commitar `.env` diferente por branch será sobrescrita.

**Consequência direta:** a ideia "um projeto Lovable, duas branches, dois Supabase" **não é suportada hoje**. Precisa ser dois projetos Lovable.

---

## 3. Comparação das três opções

| | **A** — 1 Lovable, 1 repo, branches, 2 deploys externos | **B** — 2 Lovable, 1 repo, branch por projeto | **C** — 2 Lovable, 2 repos |
|---|---|---|---|
| Código único | Sim | Sim (mesmo repo) | Não |
| Dois Supabase | Precisa sair do Cloud | Sim, nativo | Sim |
| Deploy separado | Precisa hospedar fora do Lovable | Sim, nativo (dois `.lovable.app`) | Sim |
| Sync main↔develop | Git normal | Git normal, mas cada projeto Lovable "prefere" sua branch | Divergência garantida |
| Migrations por ambiente | Você mesmo aplica via CLI | Cada projeto Lovable aplica na sua Cloud | Igual B |
| Risco de sobrescrever `.env`/`client.ts` | Alto (Lovable rege 1 Cloud) | Baixo (cada projeto tem seu Cloud) | Baixo |
| Complexidade | Alta (sai do modelo Lovable) | Média | Baixa mas divergente |

**Recomendação: Opção B.**

Ela atende tudo que você pediu, mantém um único repositório (sua exigência) e respeita as limitações atuais do Lovable.

---

## 4. Arquitetura recomendada (Opção B detalhada)

```text
GitHub (1 repositório)
├── main       ← Lovable-Prod  → Cloud Prod  → prod.dominio
└── develop    ← Lovable-Lab   → Cloud Lab   → lab.dominio

Branches auxiliares (só no GitHub, mescladas via PR):
  hotfix/*  feature/*  fix/*  release/*
```

- **Lovable-Prod**: este projeto (já existe). Fica "grudado" na branch `main`. Cloud atual = produção.
- **Lovable-Lab**: novo projeto criado via **Remix** deste, com Cloud próprio. Fica "grudado" na branch `develop`.
- Cada projeto Lovable é conectado ao **mesmo repositório GitHub**, mas cada um em uma branch diferente (isso é suportado — a conexão GitHub por projeto tem uma branch padrão).
- Os arquivos auto-gerados (`.env`, `src/integrations/supabase/client.ts`) **serão naturalmente diferentes entre as branches** porque cada Lovable os regenera para sua própria Cloud. Isso é OK: eles não precisam ser "unificados", é justamente o que dá ambientes separados.

### Estratégia para os arquivos auto-gerados divergentes

Para que merges main↔develop **não sobrescrevam** as URLs/keys do Supabase da branch destino, adotar um destes:
- **Recomendado**: `.gitattributes` marcando `.env`, `src/integrations/supabase/client.ts` e `src/integrations/supabase/types.ts` com `merge=ours` na branch de destino, ou
- Mover a leitura para variáveis com fallback e ignorar essas linhas no merge (menos limpo).

O Lovable regera esses arquivos localmente após qualquer sync, então mesmo se um merge trouxer o valor errado, o próximo evento do Lovable-Lab reescreve para os valores do Cloud-Lab. Ainda assim, `merge=ours` evita o ruído.

---

## 5. Fluxo de trabalho (Git Flow adaptado ao Lovable)

### 5.1 Correção de erro em produção (hotfix)

```text
main → hotfix/nome → PR para main → PR para develop
```

1. No **GitHub**, criar `hotfix/xxx` a partir de `main`.
2. No **Lovable-Prod**, trocar para a branch `hotfix/xxx` via Labs → Branch Switching.
3. Enviar o prompt de correção. O Lovable commita na `hotfix/xxx` (não toca produção ainda).
4. Abrir **PR `hotfix/xxx` → `main`**. Revisar. Merge.
5. Publicar `main` no Lovable-Prod → produção atualiza.
6. Abrir **PR `hotfix/xxx` → `develop`**. Se houver conflito, resolver no GitHub.
7. Após merge em `develop`, o Lovable-Lab sincroniza automaticamente. Publicar no Lovable-Lab.
8. Confirmar `git log main..develop -- <arquivo>` vazio para os arquivos do hotfix.

### 5.2 Correção descoberta no laboratório

```text
develop → fix/nome → PR develop → validar → cherry-pick/PR para main
```

- Para **uma correção isolada** ir do lab para prod: `git cherry-pick <sha>` da `develop` para uma branch `release/xxx` cortada de `main`, PR para `main`.
- Para **um pacote de correções validadas** subir junto: branch `release/x.y` a partir de `develop`, PR para `main`.

### 5.3 Quando usar cada operação Git

| Situação | Ferramenta |
|---|---|
| Levar hotfix para as duas branches | Dois PRs (merge) |
| Levar 1 correção específica do lab para prod | `cherry-pick` |
| Levar bloco validado do lab para prod | `release/*` + PR |
| Trazer prod para lab (rotina) | PR direto `main → develop` |

### 5.4 Sincronização contínua main → develop

- **Frequência**: sempre que um hotfix entrar em `main`, imediatamente abrir PR `main → develop`. Além disso, um PR "sync semanal" toda segunda-feira.
- **Quem inicia**: quem fez o hotfix é responsável pelo PR de sync no mesmo dia.
- **Detectar divergência**: `git log --oneline main ^develop` (commits só em main) e `git log --oneline develop ^main` (só em develop). Em GitHub: comparar branches em `/compare/develop...main`.
- **Evitar apagar trabalho do lab**: sempre usar **merge commit** (não rebase, não force push) nos PRs de sync, e proteger `develop` com "no force push".

---

## 6. Configuração dos dois Supabase

- **Cloud-Prod**: o atual `odllhxwadsrnhphzoevl`. Nada muda.
- **Cloud-Lab**: novo Cloud criado automaticamente ao remixar/criar o Lovable-Lab. Rodar as 494 migrations existentes na criação (o Lovable faz isso pegando `supabase/migrations/`).
- **Regra**: **toda mudança de schema entra por migration**. Nunca pelo painel. Você já segue isso.
- **Sincronização de estrutura**: como o repo é único, tabelas/colunas/índices/constraints/triggers/views/RPCs/RLS/grants estarão idênticos automaticamente após cada migration ser mergeada nas duas branches e aplicada pelo respectivo projeto Lovable.
- **Storage buckets**: buckets são criados por migration (`supabase--storage_create_bucket` grava SQL). Já é o caso hoje.
- **Dados não sincronizam.** Cloud-Lab começa vazio; você popula com dados fictícios via seed próprio (script SQL em `supabase/seeds/lab.sql`, aplicado só no Lab).
- **Chaves no front-end**: `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` são publishable (podem ficar no `.env` versionado). O Lovable-Prod grava as de prod na `main`; o Lovable-Lab grava as de lab na `develop`. É por isso que essas linhas precisam de `merge=ours` para não vazarem entre branches.

---

## 7. Blindagem de integrações no laboratório (camadas)

Nenhuma dessas camadas sozinha basta — implantar todas:

1. **Secret `APP_ENV`** (`production` | `lab`) em cada Cloud. Lida em toda server function crítica.
2. **Feature flags por clínica** (já existe via `clinica_feature_flags`) — adicionar flag `env_lab` global no Cloud-Lab.
3. **Credenciais próprias por ambiente**: tokens de WhatsApp, Focus NFe, e-mail — cada Cloud tem os seus. **Cloud-Lab recebe tokens de sandbox** (Focus NFe tem homologação; WhatsApp usa número de teste; e-mail via provedor com domínio de teste).
4. **Allowlist** no Lab: uma tabela `lab_allowlist_contatos` (telefones e e-mails). Toda função de envio (`whatsapp.functions.ts`, envio de e-mail, boletos) checa: `if APP_ENV='lab' and destino not in allowlist → bloquear e logar`.
5. **Mock de NFS-e**: no Lab, o cliente Focus NFe é substituído por stub que grava a "emissão" em tabela local sem chamar API.
6. **Mock de WhatsApp**: idem — grava a "mensagem" numa fila local visível na UI, sem chamar gateway.
7. **Bloqueio dentro das server functions críticas**: guard `assertNotLabForRealOps()` em pagamentos, cobranças, webhooks de saída.
8. **Domínios distintos**: `.lovable.app` diferente por projeto; opcional custom domain `lab.suaclinica.com`.
9. **Banner visual permanente** no Lab: barra vermelha no topo "AMBIENTE DE LABORATÓRIO — dados fictícios".
10. **Webhooks de entrada** (Focus NFe, backup): no Cloud-Prod apontam para prod; no Cloud-Lab apontam para lab. Configurado no provedor externo, não no código.

---

## 8. Proteções no GitHub (a serem aplicadas por você em Settings → Branches)

**`main`**:
- Proibir push direto.
- Exigir PR com pelo menos 1 aprovação.
- Exigir status checks (build) passando.
- Exigir branch atualizada.
- Proibir force push e delete.
- Exigir assinatura (opcional).

**`develop`**:
- Proibir push direto e force push.
- Exigir PR (revisão opcional para agilidade do lab).

**Tags de release** em cada merge para `main` (`v2026.07.25` etc.).

### Checklist de PR (colocar em `.github/pull_request_template.md`)

```markdown
- [ ] Causa raiz identificada
- [ ] Correção em branch própria (hotfix/fix/feature)
- [ ] Clínica-alvo confirmada (regra 1.10 do AGENTS.md)
- [ ] Migrations idempotentes
- [ ] Testado no Lovable-Lab
- [ ] PR espelho aberto (main↔develop) se aplicável
- [ ] Integrações externas verificadas / mockadas no Lab
- [ ] Plano de rollback descrito abaixo
```

---

## 9. Estratégia de deploy

- **Lovable-Prod**: publicar manualmente após cada merge em `main` (botão Publish). URL estável já em uso.
- **Lovable-Lab**: publicar sob demanda em domínio de lab. Como é laboratório, o próprio preview URL do Lovable-Lab pode ser suficiente.
- Não usar hosting externo — perde o benefício do Lovable.

---

## 10. Plano de rollback

- **Código**: `git revert <sha do merge>` na `main` + novo publish. Tag da versão anterior serve de âncora.
- **Migration destrutiva**: nunca commitar `DROP` sem migration reversa. Rollback = migration "compensatória" (não `git revert` em migration já aplicada). Documentar no PR.
- **Emergência**: cada projeto Lovable tem histórico de versões (rollback nativo) — usar como último recurso.

---

## 11. Cenário simulado (o exemplo do prompt)

Estado: `develop` tem mudanças de triagem; surge bug de pagamento duplicado em prod.

| Passo | Onde | Ação |
|---|---|---|
| 1 | GitHub | `git checkout main && git pull && git checkout -b hotfix/pagamento-duplicado` |
| 2 | Lovable-Prod | Labs → trocar para `hotfix/pagamento-duplicado` |
| 3 | Lovable-Prod | Prompt de correção. Commit vai na hotfix. Prod **não** muda ainda. |
| 4 | GitHub | PR `hotfix → main`. Revisar. Merge. |
| 5 | Lovable-Prod | Voltar para `main`. Publish → prod corrigida. |
| 6 | GitHub | PR `hotfix → develop`. Conflito esperado nos arquivos de triagem? Não — hotfix mexe em pagamento, triagem é outro escopo. Se houver conflito em `.env`/`client.ts`, resolver mantendo os valores do lab (`merge=ours` cuida disso). |
| 7 | Lovable-Lab | Trocar para `develop` (se já não estiver). Sincroniza. Publish no Lab. |
| 8 | Validação | `git log develop --oneline | grep pagamento-duplicado` presente; `git log develop --oneline | grep triagem` também presente. |

Resultado: main tem só pagamento corrigido; develop tem pagamento **e** triagem.

---

## 12. Passo a passo de implantação (quando você aprovar)

**Ações manuais suas (Lovable/GitHub não fazem por você):**
1. Conectar este projeto ao GitHub (menu + → GitHub → Connect).
2. Habilitar Labs → GitHub Branch Switching na sua conta Lovable.
3. Criar branch `develop` no GitHub a partir de `main`.
4. **Remixar este projeto** para criar o Lovable-Lab (via Share → ou "Duplicar projeto"). O remix cria um Cloud separado.
5. No Lovable-Lab, conectar ao **mesmo repositório GitHub**, apontando para `develop`.
6. Configurar proteções de branch no GitHub Settings.
7. Adicionar `.github/pull_request_template.md` e `.gitattributes` (essas duas eu posso preparar).
8. Criar tokens de sandbox nas integrações (Focus NFe homolog, WhatsApp teste, e-mail com domínio de teste) e adicioná-los como Secrets no Cloud-Lab.
9. Configurar webhooks externos: Focus NFe deve apontar para o URL de Lab quando for conta de homologação.

**Ações que eu posso executar via Lovable (após aprovação):**
- Criar `.gitattributes`, `.github/pull_request_template.md` e um `AMBIENTE.md` explicando o fluxo.
- Introduzir `APP_ENV` como constante lida em runtime + guard `assertNotLabForRealOps()`.
- Criar tabela `lab_allowlist_contatos` (migration) e wrappers de WhatsApp/e-mail/NFS-e que consultam a allowlist quando `APP_ENV=lab`.
- Criar banner visual "AMBIENTE DE LABORATÓRIO".
- Criar mocks (`whatsapp.lab.ts`, `nfse.lab.ts`) e roteamento por env.
- Seed de dados fictícios (`supabase/seeds/lab.sql`).

**Ações que só Supabase/plataforma externa fazem:**
- Criação física do Cloud-Lab (acontece automaticamente no remix Lovable).
- Configuração dos webhooks nas contas de Focus NFe, WhatsApp Business, etc.

---

## 13. Riscos identificados

1. **Sync GitHub↔Lovable pode conflitar com arquivos auto-gerados** → mitigado por `merge=ours` em `.env`/`client.ts`/`types.ts`.
2. **Labs → Branch Switching é experimental** — pode ter bugs. Recomendação: usar principalmente para *trocar de contexto* no Lovable-Prod entre `main` e `hotfix/*`; o Lovable-Lab fica fixo em `develop`.
3. **Custo**: dois projetos Lovable = dois Clouds = duas assinaturas de Cloud. Confirmar com você antes.
4. **494 migrations rodando na criação do Cloud-Lab**: pode demorar. Alternativa: gerar um `schema.sql` consolidado e rodar como migration única inicial no Lab.
5. **Regra 1.10 do AGENTS.md** continua valendo: eu vou continuar perguntando a clínica-alvo mesmo dentro do Lab.

---

## 14. Checklist final antes de dar "go"

- [ ] Você confirma Opção B (2 projetos Lovable, 1 repo, 2 Clouds).
- [ ] Você aceita o custo do segundo Cloud.
- [ ] Você quer que eu prepare os arquivos de suporte (`.gitattributes`, template de PR, `AMBIENTE.md`, guards de env, allowlist, mocks) **antes** ou **depois** da criação do Lovable-Lab.
- [ ] Você mesmo fará: conectar GitHub, remixar o projeto, configurar branch protections e webhooks externos.
- [ ] Definiu quem serão os "usuários fictícios" e clínica(s) espelho no Lab.

Aguardo sua aprovação para começar pelos itens que estão do meu lado.
