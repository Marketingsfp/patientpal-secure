# FASE 4 — QA unificado da Nina (Produção, Homologação e Test Runner)

## Componentes reutilizados
- `NinaMessage` / `HomologacaoInbox` — mesmo balão e mesma estrutura de dados.
- `ReportarErroNinaBotao` — mesmo X vermelho, um clique, sem modal.
- `ConfiancaMensagem` + `useConfiancaMensagens` — mesmo badge e mesmo cache em lote.
- Confidence Decision Engine (`src/lib/nina/confidence/`) — fonte única do score.
- Tracing da Arquitetura — mesmo `trace_id` no WhatsApp real e na Homologação.

## Campos compartilhados
`message_id`, `conversation_id` / `test_conversation_id`, `environment`,
`cycle_id`, `nina_session_id`, `created_at`, `confidence_score`,
`confidence_level`, `audit_trace_id`, `report_status`.
Ausências continuam `null` — nada é preenchido artificialmente.

## Reporte de erro
Um clique no X registra o erro com IDs exatos da mensagem e da conversa,
ambiente, ciclo e sessão. Duplo clique não duplica. Falha mostra erro real.
O item chega à Revisão de Aprendizados com selo de ambiente.

## Confidence source
Somente snapshots persistidos em `nina_confianca_decisoes`, gravados no momento
da resposta com a política vigente. Mensagem sem snapshot mostra
"Não avaliada". Scores históricos permanecem com a policy original.

## Separação de ambientes
`nina_confianca_decisoes.ambiente` aceita agora `producao`, `homologacao` e
`teste_automatizado`. O ambiente é derivado no servidor: conversa de teste com
simulação em andamento vira `teste_automatizado`; sem simulação, `homologacao`.
As métricas de produção usam filtro por igualdade (`= producao` /
`= production`), portanto teste e homologação nunca entram nos indicadores reais.

## Integração com auditoria
Cada decisão guarda `trace_id`, validadores, fontes, ferramentas, bloqueadores
e decisão final. A auditoria detalhada continua sob demanda (popover/Detalhes
técnicos), sem chain-of-thought.

## Integração com o Test Runner
`nina_teste_execucao_itens` passou a guardar o resumo da confiança do cenário:
`confianca_amostras`, `confianca_media`, `confianca_min`, `confianca_max`,
`confianca_niveis`, `confianca_nivel_minimo`, `confianca_trace_ids`.
`src/lib/nina/confianca-execucao.ts` agrega os snapshots reais e cruza o
resultado PASS/FAIL com o nível declarado (incluindo marcação de
superconfiança: falha com nível HIGH). Nenhum score é recalculado.

## Performance
Sem consulta por balão: a confiança vem em lote por conversa (até 300 IDs,
cache por clínica/execução, TTL 60s, revalidação silenciosa). O Test Runner faz
uma única leitura agregada no fechamento do item, fora do caminho de renderização.
A abertura de um lead não carrega auditoria completa.

## Testes executados
- `bunx tsgo --noEmit` — sem erros.
- `bun test src/lib/nina` — suíte Nina, incluindo os novos testes de
  `confianca-execucao` (resumo vazio, agregação, superconfiança, ambientes).

## Pendências
- Fluxo vivo ponta a ponta (paciente de teste → Nina → X → Revisão) não foi
  executado: exigiria gerar atendimento e registros reais.
- Medição cronometrada antes/depois em produção não foi feita; a análise de
  performance é estrutural (número de requisições por mensagem).
