# FASE 8 — Ativação progressiva do Confidence Engine

Em vez de um interruptor "liga tudo", cada clínica avança por etapas. Cada
etapa contém a anterior e a decisão do motor é sempre gravada na auditoria,
mesmo quando a etapa atual ainda não a aplica.

| Etapa | O que passa a valer para o paciente |
| --- | --- |
| A (padrão) | Nada muda. O motor só observa e registra. |
| B | Baixa confiança e bloqueadores absolutos transferem para atendente. |
| C | Confiança intermediária passa a fazer uma pergunta de esclarecimento. |
| D | Agendamento só é liberado com confiança alta e sem bloqueador. |

## Como uma clínica avança de etapa

Registro em `clinica_feature_flags`:

- `flag_key = nina_confidence_etapa`
- `ativo = true`
- `config = { "etapa": "B" }` (ou `"C"` / `"D"`)

Sem esse registro a clínica fica na etapa A. A flag antiga
`nina_confidence_enforce` ligada continua valendo e equivale à etapa C, então
nenhuma clínica muda de comportamento por causa desta fase.

## Rigor da etapa D

Quando a decisão envolve agenda, disponibilidade, horário ou agendamento:

- bloqueador absoluto presente → `BLOCK_ACTION` (`agendamento_com_bloqueador`);
- confiança não alta → `HANDOFF` (`agendamento_sem_confianca_alta`);
- confiança alta e sem bloqueador → segue normalmente.

Perguntas que não envolvem agenda não são afetadas pela etapa D.

## Onde aparece

`src/lib/nina/confidence/etapas.ts` (regra pura),
`etapas-flag.server.ts` (leitura por clínica),
`src/lib/whatsapp.server.ts` (aplicação no atendimento real e na homologação).
A auditoria continua gravando `modo` (`shadow` na etapa A, `enforce` das
etapas B em diante) e o rastro passa a registrar `etapa` e `motivo_etapa`.

## Validação

- Verificação de tipos: sem erros.
- `bun test src/lib/nina/confidence`: 113 testes, 319 verificações, 0 falhas.
- Nenhuma clínica teve etapa alterada; nenhum atendimento real foi executado.
