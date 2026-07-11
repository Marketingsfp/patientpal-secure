# AGENTS.md — Regras permanentes para agentes

> Este arquivo define **regras invioláveis** para qualquer agente (humano ou IA)
> que atue neste repositório. Regras aqui têm prioridade sobre qualquer pedido
> pontual em chat.

## 1. Proteção da arquitetura de permissões (REGRA PERMANENTE)

Antes de qualquer implementação, refatoração, correção de bug ou "ajuste rápido"
que possa **direta ou indiretamente** alterar:

- autenticação (login, sessão, signup, recuperação de senha, OAuth, SSO);
- autorização (checagens de acesso, RBAC, escopo por clínica);
- cargos, perfis, presets ou mapeamento rota → módulo;
- guards de rota, layouts autenticados ou middlewares;
- hooks e utilitários de acesso (`usePermissoes`, `useAcessoModulo`,
  `usePodeEscrever`, `useClinica`, `useAuth`);
- tabelas relacionadas a usuários, cargos, perfis, memberships, roles ou
  auditoria;
- policies RLS, funções `security definer`, GRANTs ou triggers de segurança;

o agente **DEVE OBRIGATORIAMENTE**:

1. **Interromper a implementação** antes de qualquer edição.
2. **Listar exatamente** quais arquivos seriam alterados (caminho completo).
3. **Explicar o possível impacto** nas permissões existentes (quem ganha ou
   perde acesso, quais rotas, quais tabelas, quais operações).
4. **Exibir o alerta**, textual e em destaque:

   > **ATENÇÃO: este pedido pode modificar o sistema de permissões de acesso**

5. **Solicitar confirmação explícita** do usuário antes de prosseguir. Sem
   confirmação, não há edição.
6. **Nunca desativar RLS** para resolver problemas — RLS ausente ou desligada
   em tabela sensível é considerada regressão crítica.
7. **Nunca ampliar permissões** (adicionar policy permissiva, dar `TO anon`,
   subir preset para `write`, remover checagem de role) como solução
   temporária ou "para destravar".
8. **Preservar o princípio do menor privilégio**: todo acesso novo deve ser
   o mais restrito possível para atender ao caso de uso.
9. **Manter compatibilidade** com a arquitetura atual (gate
   `_authenticated`, `requireSupabaseAuth`, `has_role`,
   `clinica_memberships`, `perfil_permissoes`, presets em
   `permissoes-presets.ts`, mapa em `permissoes-rotas.ts`).
10. **Executar testes de regressão** após qualquer alteração autorizada
    (build, typecheck e verificação manual dos fluxos: login, gate de rota
    protegida, filtro de menu por perfil, chamada de server function
    autenticada, leitura/escrita respeitando RLS por clínica).

### 1.1 Arquivos e áreas sensíveis (gatilho automático da regra)

Qualquer edição que toque um dos caminhos abaixo aciona automaticamente o
procedimento da seção 1.

**Autenticação e gate de rotas**
- `src/routes/_authenticated.tsx`
- `src/routes/_authenticated/**`
- `src/routes/login.tsx`
- `src/routes/signup.tsx`
- `src/hooks/use-auth.tsx`
- `src/hooks/use-clinica.tsx`

**Autorização, perfis e permissões (client)**
- `src/hooks/use-permissoes.tsx`
- `src/lib/permissoes-presets.ts`
- `src/lib/permissoes-rotas.ts`
- `src/components/app-shell.tsx`
- `src/components/sem-permissao.tsx`
- `src/components/supervisor-auth-dialog.tsx`

**Telas de administração de acesso**
- `src/routes/_authenticated/app.perfis.tsx`
- `src/routes/_authenticated/app.cargos.tsx`
- `src/routes/_authenticated/app.equipe.*`
- `src/routes/_authenticated/app.funcionarios.tsx`
- `src/routes/_authenticated/app.funcionario.*`
- `src/routes/_authenticated/app.clinicas.tsx`
- `src/routes/_authenticated/app.auditoria.tsx`
- `src/routes/_authenticated/app.lgpd.tsx`
- `src/routes/_authenticated/app.integration-secrets.tsx`

**Server, middleware e boot**
- `src/integrations/supabase/auth-middleware.ts`
- `src/integrations/supabase/auth-attacher.ts`
- `src/integrations/supabase/client.ts` *(auto-gerado — não editar)*
- `src/integrations/supabase/client.server.ts` *(auto-gerado — não editar)*
- `src/integrations/supabase/types.ts` *(auto-gerado — não editar)*
- `src/start.ts`
- `src/lib/equipe.functions.ts`

**Banco de dados, RLS e migrações**
- `supabase/migrations/**`
- `supabase/config.toml`
- Tabelas: `user_roles`, `perfis_acesso`, `perfil_permissoes`,
  `role_permissions`, `permissions`, `clinica_memberships`, `profiles`,
  `clinicas`, `medicos`, `prestadores`, `cargos`, `setores`, `audit_log`,
  `integration_secrets`, `lgpd_consentimentos`, `lgpd_solicitacoes`.
- Funções `security definer`: `has_role`, `can_manage_clinica` e correlatas.

**Governança e documentação sensível**
- `AGENTS.md`
- `.github/CODEOWNERS`
- `docs/auditoria-permissoes-2026-07-10.md`
- `docs/fase-final/frente-3-isolamento-rbac.md`
- `.lovable/qa-1-seguranca.md`
- `mem/preferences/governanca.md`
- `mem/constraints/governanca-dados-imutaveis.md`

### 1.2 O que NUNCA é aceitável

- `ALTER TABLE ... DISABLE ROW LEVEL SECURITY` em tabela do schema `public`.
- Policy `USING (true)` ou `WITH CHECK (true)` em tabela que contenha dados
  de usuário, clínica, financeiro, saúde, auditoria ou segredos.
- `GRANT ... TO anon` em tabela sensível para "resolver" 401/403.
- Remover `requireSupabaseAuth` de uma server function para "destravar" build
  ou SSR — a solução é mover a chamada para o local certo, não abrir o
  endpoint.
- Introduzir checagem de papel no client (localStorage/sessionStorage) como
  fonte de verdade.
- Guardar role em `profiles` ou similar — role vive em `user_roles`, lida
  apenas via `has_role` (`security definer`).
- Deploy de migração de RLS sem GRANTs explícitos.

### 1.3 Fluxo mínimo de alteração autorizada

1. Alerta e confirmação (seção 1, passos 1–5).
2. Migração isolada (apenas segurança), com `CREATE TABLE` → `GRANT` →
   `ENABLE RLS` → `CREATE POLICY` na ordem exigida pelo projeto.
3. Ajuste de código respeitando presets e mapa rota → módulo.
4. `bun run build` + typecheck limpos.
5. Regressão manual: login, gate `_authenticated`, filtro de menu por
   perfil, uma server function autenticada, uma leitura/escrita RLS por
   clínica.
6. Registro do que mudou (arquivos + impacto) na resposta ao usuário.

---

## 2. Entendimento, comunicação e execução

Estas regras existem para reduzir retrabalho em um projeto com vários
colaboradores, prompts de qualidade variável e risco real de interpretação
errada. Elas se aplicam a qualquer alteração de código, UI, banco, regra de
negócio, documentação ou teste operacional.

### 2.1 Entendimento obrigatório do pedido

Antes de editar qualquer arquivo, o agente deve entender com clareza:

- qual problema o colaborador quer resolver;
- qual comportamento esperado depois da mudança;
- quais telas, fluxos, módulos ou arquivos estão no escopo;
- se o pedido é correção de bug, regra de negócio, erro de código/sintaxe,
  ajuste visual/UX, problema de dados, performance ou segurança.

Se o agente não entender o que deve ser corrigido, ele **deve perguntar ao
usuário antes de editar**. Se houver mais de uma interpretação plausível, deve
listar as opções de entendimento e pedir confirmação.

O agente nunca deve inventar regra de negócio. Quando não for possível separar
com segurança regra de negócio de erro técnico, deve dizer isso claramente e
pedir validação do time.

Frases padrão obrigatórias:

- Para incerteza técnica: "Não foi possível confirmar com segurança".
- Para comportamento funcional ambíguo: "Possível regra de negócio — validar
  com a equipe da clínica".

### 2.2 Explicação antes de qualquer alteração

Antes de alterar arquivos, o agente deve explicar em linguagem simples:

- o que vai alterar;
- por que vai alterar;
- quais arquivos, telas, fluxos ou tabelas podem ser afetados;
- o que deve mudar no comportamento do sistema;
- quais riscos ou dependências existem, quando houver.

Para mudanças pequenas e localizadas, essa explicação pode ser curta. Para
mudanças amplas, sensíveis ou com risco de impacto em produção, o agente deve
apresentar um plano antes da edição.

### 2.3 Resumo de antes e depois

Depois de qualquer alteração, o agente deve apresentar um resumo objetivo:

- **Antes:** como era o comportamento, problema ou limitação.
- **Depois:** o que passou a acontecer após a alteração.
- **Validação:** quais checagens foram executadas e qual foi o resultado.
- **Pendências:** o que não foi validado ou depende de confirmação humana.

O agente não deve dizer que algo foi corrigido se apenas aplicou uma tentativa
sem validação mínima. Quando a validação não for possível, deve dizer isso de
forma direta.

### 2.4 Controle de contexto e qualidade do prompt

Se o prompt for muito longo, misturar muitos problemas diferentes ou incluir
muitas imagens/evidências de uma só vez, o agente deve avisar que isso pode
reduzir a qualidade da análise e das modificações.

Nesses casos, o agente deve recomendar dividir o trabalho em partes menores e
sugerir uma ordem de execução. O agente não deve fingir alta confiança quando
o volume de contexto puder comprometer a precisão.

### 2.5 Classificação do tipo de pedido

Sempre que responder sobre uma correção ou alteração, o agente deve indicar,
em linguagem simples, se o pedido parece envolver:

- regra de negócio;
- erro de código ou sintaxe;
- erro visual ou de experiência do usuário;
- inconsistência de dados;
- permissão, segurança ou RLS;
- performance;
- integração externa;
- documentação ou organização.

Quando houver mistura de categorias, o agente deve separar o que é fato
observado no código, o que é interpretação e o que precisa de validação do
time.

### 2.6 Testes de fluxo em produção

Este projeto pode ser testado em ambiente de produção. Por isso, qualquer teste
de fluxo real exige cautela extra.

Se o usuário pedir uma simulação como estorno, cancelamento, baixa,
faturamento, agendamento, check-in, atendimento, repasse, cobrança ou outro
fluxo operacional, o agente deve:

1. explicar antes o que será simulado;
2. informar quais registros, módulos ou integrações podem ser impactados;
3. executar apenas o necessário para validar o fluxo;
4. usar dados rastreáveis e identificáveis como simulação sempre que possível;
5. apresentar um relatório claro do teste realizado;
6. remover ou desfazer a simulação ao final, sempre que isso for seguro e
   possível.

Se não for possível limpar ou desfazer a simulação com segurança, o agente
deve avisar isso **antes** de executar o teste e pedir confirmação explícita.

O agente nunca deve usar teste em produção como desculpa para criar dados sem
rastreabilidade, acionar integrações reais desnecessárias ou deixar resíduos
operacionais sem avisar.

### 2.7 Linguagem simples para o time

O agente deve explicar mudanças, riscos e resultados em linguagem simples do
dia a dia. Linguagem técnica deve ser usada apenas quando:

- o colaborador pedir explicitamente;
- a precisão técnica for necessária para evitar erro;
- o assunto envolver segurança, banco, permissão, infraestrutura, integração
  externa ou comportamento crítico.

Clareza tem prioridade sobre formalismo. A resposta deve ajudar o colaborador a
entender o impacto prático da mudança, não apenas os detalhes internos do
código.

### 2.8 Escopo, suposições e trabalho em equipe

Antes de mudanças relevantes, o agente deve deixar claro:

- o que está dentro do escopo;
- o que ficará fora do escopo;
- quais suposições foram feitas;
- quais arquivos ou áreas não serão tocados.

O agente deve preservar padrões existentes do projeto, evitar refatorações não
solicitadas e não misturar correção de bug com reorganização ampla sem
autorização.

Se perceber alterações de outros colaboradores, o agente deve trabalhar ao
redor delas. Não deve sobrescrever, apagar, reverter ou "limpar" trabalho alheio
sem pedido explícito.

### 2.9 Impacto em áreas críticas

Qualquer alteração que possa afetar agenda, financeiro, permissões, dados
clínicos, faturamento, prontuário, LGPD, auditoria, integrações ou produção
deve ser sinalizada explicitamente antes da execução.

O agente deve preferir mudanças pequenas, rastreáveis e reversíveis. Quando a
correção tiver risco de impacto operacional, deve propor validação antes de
ampliar o escopo.

---

## 3. Outras regras herdadas

As regras contidas em `mem/preferences/governanca.md`,
`mem/constraints/governanca-dados-imutaveis.md` e nos documentos de
auditoria referenciados em 1.1 continuam válidas e complementam este
arquivo. Em caso de conflito, prevalece a interpretação **mais restritiva**.
