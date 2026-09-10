# Fase 8 — Aceite de integração do Confidence Engine

Escopo: endurecer o runner de cenários e comprovar a matriz obrigatória por testes
determinísticos. Nada foi publicado, nenhuma mensagem real de WhatsApp foi enviada
e nenhum dado de produção foi alterado.

## O que mudou

| Arquivo | Mudança |
| --- | --- |
| `src/lib/nina/confidence/gate-v2.ts` | A verificação passa a começar pela lista de saídas esperadas. Novos critérios: avaliação ausente por saída, saída órfã, id de entrada usado como saída, tipo de avaliação, nota/nível, versão de política, clínica/conversa, execução, hash do texto entregue, score 100 sem evidência, HIGH com bloqueador. |
| `src/lib/nina/cenarios.functions.ts` | Lê as mensagens reais (id, direção, corpo, execução), monta as saídas esperadas com hash e roda os critérios mesmo quando não há nenhum snapshot. |
| `src/lib/nina/confidence/claims.ts` | Afirmação extraída do texto só é confirmada quando o assunto do dado recuperado é o mesmo assunto da frase (procedimento, profissional, unidade). Valor coincidente com outro assunto vira verificação incompleta. |
| `src/lib/nina/confidence/engine.ts`, `policy.ts`, `types.ts` | Ação de escrita (criar/cancelar agendamento) exige paciente identificado antes de ser liberada. Bloqueio novo `PACIENTE_NAO_IDENTIFICADO` → `INVALID_PATIENT_DATA`, contado só na segurança da ação. |
| `src/lib/nina/confidence/fase8-aceite-runner.test.ts` | Suíte nova com os critérios do runner e a matriz obrigatória. |
| `src/lib/nina/confidence/gate-v2.test.ts` | Contrato atualizado (4 → 12 critérios) porque a exigência aumentou; nenhum critério foi afrouxado. |

## Antes e depois

- **Antes:** cenário sem snapshot era aprovado; uma segunda saída sem avaliação passava
  despercebida; o id da mensagem de entrada podia fazer as vezes de saída avaliada.
- **Depois:** saída sem avaliação reprova o cenário; cada saída precisa de avaliação
  própria, com política, escopo, execução e hash conferidos.
- **Antes:** "O ultrassom custa R$ 150,00" era confirmado por um preço de consulta de
  cardiologia, porque o valor batia.
- **Depois:** o assunto precisa bater; caso contrário a afirmação fica como não verificada.
- **Antes:** "vou marcar para você agora" com paciente não identificado saía como ação
  liberada.
- **Depois:** a ação é bloqueada; a avaliação do texto continua medida à parte.

## Validação executada

- `bunx tsgo --noEmit`: sem erros.
- `bun test src/lib/nina/confidence`: 431 testes, 0 falhas.
- `bun test` (suíte completa): 3.003 testes, 11.409 asserções, 0 falhas.
- `bun run build`: concluído.

## Pendências declaradas (não executadas)

- Banco isolado com migrations e triggers reais rodando o pipeline ponta a ponta.
- LLM real e entrega real no WhatsApp — mocks não comprovam aderência do modelo nem envio.
- Teste de arquitetura publicada (marcador `TESTE-ARQUITETURA-9381`) em sessão isolada.
- Concorrência multi-instância real.
- Validação visual autenticada dos painéis.
