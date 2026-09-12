# Fase 2 — Habilitar “Aplicar correção com Sol” logo após a análise

## Objetivo

No mesmo cartão do erro reportado: analisar, ver a proposta completa e aplicar.
Sem exigir os cliques manuais antigos (Diagnosticar causa, Confirmar problema,
Aprovar) e sem criar um segundo botão que faça a mesma coisa.

## O que muda para quem usa

- O botão existente passa a se chamar **Aplicar correção com Sol** e fica
  ligado assim que a análise terminar com uma proposta aplicável e a pessoa
  tiver permissão.
- Quando não dá para aplicar, o botão fica desligado com o motivo concreto na
  tela: “Nenhuma alteração necessária”, “A análise não produziu proposta”,
  “Falta informação essencial”, “Sem permissão”, “A análise foi refeita —
  confira a proposta atualizada”.
- Depois do clique aparece o andamento salvo: verificando proposta → aplicando
  → testando → publicando → verificando resultado. Recarregar a página volta a
  mostrar o mesmo trabalho.
- Os controles antigos continuam existindo como caminho de revisão manual, mas
  deixam de ser pré-requisito. O botão manual antigo é renomeado para
  **Registrar correção manual**, para não parecer duplicado.

## Escopo

Dentro: tela de aprendizado da Nina, cartão de análise, endpoints de análise e
de aplicação, registro de autorização e progresso.

Fora: avaliador continua somente leitura, executor continua com as mesmas
ferramentas restritas por camada, identidade da Arquitetura, permissões, dados
clínicos, WhatsApp real, Confidence Engine e Telefonia não são tocados.

## Detalhes técnicos

### 1. Prontidão compartilhada — `src/lib/nina/correcao-prontidao.ts` (novo)

Módulo puro usado pelo cliente e pelo servidor:

- `assinaturaProposta(proposta)` — hash estável dos campos da proposta exibida.
- `avaliarProntidao({ analise, proposta, prontidaoPermissao, execucaoEmCurso, executorDisponivel, assinaturaExibida })`
  devolve `{ habilitado, codigo, motivo }` com códigos:
  `pronto`, `analise_em_andamento`, `analise_falhou`, `sem_analise`,
  `sem_proposta`, `nenhuma_alteracao_necessaria`, `informacao_insuficiente`,
  `sem_permissao`, `proposta_desatualizada`, `executor_indisponivel`,
  `execucao_em_curso`.
- Rótulos das etapas de progresso.

### 2. Proposta com patch — `src/lib/nina/analise-erro.ts`

Estende `PropostaCorrecao` com `ambiente`, `escopo` (`local` | `global`),
`arquivos: string[]`, `patch: string | null`, `revisaoBase: string | null`,
com os campos correspondentes em `SCHEMA_ANALISE` (todos em `required`,
opcionais como nulos) e em `normalizarProposta`. Camadas de código sem patch
concreto ficam `informacao_insuficiente` em vez de habilitar o botão.
Preparar o patch não altera o sistema ativo: continua sendo texto na proposta.

### 3. Apresentação — `src/components/nina/AnaliseErroIAResultado.tsx`

Mostra, antes do clique: causa sustentada, mudança pretendida, arquivos e
configurações atingidos, antes/depois (já existe), ambiente, alcance
local/global, patch e revisão base quando houver, e o estado explícito
“Nenhuma alteração necessária”.

### 4. Progresso persistido — migração nova

Tabela `public.nina_correcao_execucoes`: `clinica_id`, `feedback_id`,
`analise_id`, `pacote_hash`, `pacote_revisao`, `proposta jsonb`,
`proposta_assinatura`, `ambiente`, `escopo`, `autorizado_por`,
`autorizado_em`, `etapa`, `status`, `passos jsonb`, `resumo jsonb`, `erro`,
`created_at`, `updated_at`. GRANT para `authenticated` e `service_role`, RLS
com `public.nina_fb_pode_revisar(auth.uid(), clinica_id)`, no mesmo padrão de
`nina_feedback_analises`. Índice único parcial para uma execução em curso por
feedback (bloqueia duplo clique no servidor).

### 5. Executor — `src/lib/nina/correcao-executor.functions.ts`

- Entrada ganha `analiseId`, `propostaAssinatura`, `pacoteHash`.
- Revalida no servidor: permissão, análise concluída, proposta presente e
  aplicável, executor disponível (`LOVABLE_API_KEY`), e assinatura/hash iguais
  aos exibidos — divergiu, recusa com “a proposta mudou” e não aplica nada.
- Cria a linha de execução com a autorização (quem clicou, quando, análise,
  pacote, proposta, ambiente, escopo) e atualiza `etapa` a cada passo.
- Ao final grava `resumo` e mantém os registros atuais em
  `nina_feedback_acoes` e `nina_feedback_versoes` como hoje.
- Nova server fn `execucaoCorrecaoAtual({ clinicaId, feedbackId })` para
  retomar a exibição após recarregar.

### 6. Tela — `src/routes/_authenticated/app.nina-aprendizado.tsx`

Botão único com rótulo novo, `disabled` e `title` vindos de `avaliarProntidao`,
motivo visível quando desabilitado, carregamento da execução em curso ao abrir
o cartão, e `CorrecaoExecucaoPainel` exibindo a etapa persistida. Nenhum
pré-requisito de clique manual; histórico e caminho manual preservados.

### 7. Verificações

`bunx tsgo --noEmit`, testes direcionados novos para `correcao-prontidao`,
assinatura/invalidação de proposta e gate do servidor, suíte Nina e `build`.
Nenhuma mensagem real, publicação operacional ou execução transacional sem
confirmação de ambiente e clínica.

## Pendências

Validação visual autenticada e execução real de “Aplicar correção” dependem de
confirmação de ambiente e clínica.
