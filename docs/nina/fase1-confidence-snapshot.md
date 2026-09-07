# Fase 1 — Snapshot de confiança por mensagem

## Auditoria do que já existia (nada foi duplicado)

- Mensagens: `whatsapp_mensagens` (conteúdo, direção, autoria `enviada_por`, `execucao_id`).
- Execução da Nina: `nina_execucoes` + `nina_trace_eventos` (rastro).
- Confiança: `nina_confianca_decisoes` já grava score, nível, decisão, ação,
  validadores, reason codes, fontes, ferramentas, bloqueadores, resultado final,
  modo (shadow/enforce) e `teria_permitido`.
- Erros reportados: `nina_feedback_erros`; Revisão de Aprendizados: `nina_aprendizados`.

Conclusão: **não foi criada tabela nova**. A estrutura existente já era o snapshot;
faltavam apenas a versão da política e a garantia de imutabilidade.

## Relacionamento definido

mensagem (`whatsapp_mensagens.execucao_id`)
→ execução (`nina_execucoes.id`)
→ confiança (`nina_confianca_decisoes.execucao_id`, última decisão da execução)
→ conversa (`conversation_id`) → erro reportado (`nina_feedback_erros`) → aprendizado.

## O que a Fase 1 acrescentou

1. `policy_version` em `nina_confianca_decisoes`; registros anteriores ficaram
   como `desconhecida` (nenhuma pontuação inventada).
2. `VERSAO_POLITICA = "v1"` em `src/lib/nina/confidence/policy.ts`, gravada em
   toda decisão nova.
3. Imutabilidade real: trigger `nina_confianca_decisoes_no_update` bloqueia
   UPDATE e DELETE na tabela, inclusive por rotina administrativa.
4. Índice `(clinica_id, execucao_id, created_at desc)` para leitura por mensagem.
5. Na Inbox: mensagem da Nina sem avaliação gravada mostra **Não avaliada**,
   nunca 0%, 100% ou estimativa; o popover informa a versão da política usada.

## Integridade

Nenhum dado histórico foi apagado, recalculado ou preenchido. Preços ou cadastros
que mudem depois não alteram a confiança já registrada.
