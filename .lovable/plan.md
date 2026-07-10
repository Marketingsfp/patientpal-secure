# Relatório preliminar de saúde — produção 09/07/2026

Você reportou "falhas críticas sequenciais em todos os usuários e vários módulos", mas sem sintomas específicos, janela de regressão ou output do Security Scan. Sem esses dados, uma "auditoria forense do histórico de prompts" viraria adivinhação. Abaixo separo o que **já verifiquei objetivamente** vs. o que **precisa da sua evidência** antes de eu propor correção ou reversão.

## 1. Verificações que já rodei (baseline saudável)

**Infraestrutura Lovable Cloud** — status `ACTIVE_HEALTHY`. Backend responde normalmente. Não há outage.

**Variáveis de ambiente (`.env`)** — `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID` presentes e válidos. Não há `service_role` no frontend. `client.ts` (auto-gerado) lê `import.meta.env.VITE_*` com fallback SSR — correto para produção publicada.

**Separação client/server** — `client.server.ts` (service role) só é importado em arquivos server-only. Nenhum componente React importa `supabaseAdmin`. Middleware `attachSupabaseAuth` registrado em `src/start.ts` — bearer token anexado nos serverFn.

**Requests em produção agora (do seu login)** — `/auth/v1/user`, `/rest/v1/profiles`, `/rest/v1/clinica_memberships`, `/rest/v1/estorno_solicitacoes` retornando **200**. RLS deixando o admin ler suas 3 clínicas normalmente. Não há 401/403 em cascata.

**Um único sinal amarelo** — uma requisição a `clinica_memberships` retornou **503 PGRST002** ("Could not query the database for the schema cache. Retrying") às 01:29:14 e a retentativa imediata retornou 200. Isso é reload de schema cache do PostgREST, tipicamente após migração recente — transitório, não bloqueia usuários, mas indica que houve migração hoje. Não é causa raiz de "falha sistêmica".

**Conclusão parcial:** não vejo, do meu lado, evidência de disparidade de ambiente, vazamento de service_role, RLS quebrada em massa, nem build corrompido. O sistema publicado está funcional para o seu usuário admin agora.

## 2. Preciso de você para continuar (bloqueio)

Você respondeu "vários módulos, todos os usuários" mas **não descreveu nenhum sintoma**. Sem isso não consigo distinguir entre:

- Regressão real de código hoje (candidata a revert do histórico)
- RLS insuficiente para roles não-admin (você é admin nas 3 clínicas — talvez o problema só apareça para recepção/médico/financeiro)
- Erro de negócio (um botão não faz o que deveria) que parece "quebra sistêmica" mas é escopo pontual
- Compute sob pressão (o teste de carga que rodamos antes mostrou queries sem WHERE lentas)

**O que preciso, minimamente:**

1. **1–2 sintomas concretos** de módulos que "quebraram" hoje. Formato: "abro Agenda, clico em Novo Agendamento, salvo, e aparece X" (ou o toast, ou o request que dá 4xx/5xx no Network do F12).
2. **Perfil do usuário afetado.** É admin, recepção, médico, financeiro? A recepcionista sentiu o mesmo que o admin?
3. **Print/texto do Security Scan** (More → Security → Basic Scan). "Não verifiquei" me deixa sem o segundo maior sinal que essa auditoria precisa.
4. **Uma indicação de janela** — mesmo que aproximada: "de manhã estava OK, depois do almoço não". Sem isso a estratégia revert vs. correção atômica é chute.

## 3. Recomendação enquanto isso

**Não reverter às cegas.** Você tem 337 migrações e ~15 turnos de mudança hoje entre formato de ano, testes de carga (read-only, não mudaram código) e a própria auditoria arquitetural (read-only). O último bloco de código que efetivamente tocou o produto foi o ajuste "ano com 2 dígitos + expansão da coluna paciente" em `app.financeiro.atendimentos.tsx` — mudança puramente visual, isolada, sem risco de derrubar módulos inteiros. Reverter isso não resolveria uma quebra sistêmica.

**Estratégia preferida:** correção atômica após triagem do sintoma real. Reversão fica como plano B se identificarmos que um commit específico introduziu regressão ampla.

## 4. Próximo passo

Me responda com **um** sintoma concreto (mesmo que só um módulo, um clique, um toast). Com isso eu:

- Reproduzo com Playwright no sandbox contra a produção
- Abro o Network real e o Console real
- Isolo se é RLS (403), env (undefined), build (import failed), ou lógica (200 mas dado errado)
- Trago o relatório final por severidade (Crítico/Alto/Médio) + causa raiz + plano de correção atômica ou revert direcionado

Sem esse sintoma, permanecemos em plan mode.
