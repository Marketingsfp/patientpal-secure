# FASE 6 — Protocolo e handoff de ponta a ponta

Data: 07/09/2026. Escopo: código e testes automatizados. **Nenhum teste
transacional ao vivo foi executado** (ver "Pendências").

## 1. Gerador de protocolo reutilizado

Continua único: `atend_gerar_protocolo_atendimento` (lock por clínica) via
`src/lib/atendimento/protocolo-atendimento.server.ts`. Não existe segundo
gerador; homologação e Test Runner usam exatamente o mesmo caminho.

## 2. Formato

`^[A-Z]{2,6}-\d{1,10}$` (ex.: `MJ-14712`), validado por
`protocoloFormatoValido` em `src/lib/nina/handoff-assertions.ts`.

## 3. Idempotência

- O número é por ciclo (`session_id` da Nina): retry e evento duplicado
  reaproveitam o mesmo protocolo.
- A comunicação ao paciente é única por protocolo (`deveInformarProtocolo` +
  verificação de evento `protocolo_informado`).
- Falha de envio não marca como informado: a próxima tentativa reusa o número.

## 4. Integração com a mensagem

`anunciarHandoffAoPaciente` agora devolve `message_id`, texto, origem
(modelo/contingência), status e transporte. É esse vínculo que permite dizer
**em qual mensagem** o protocolo foi informado.

## 5. Distribuição e "Não atribuídas"

Inalterado: em produção, `atribuirAtendenteOnline` (decisão no banco, com
lock). Sem ninguém online a conversa fica na fila não atribuída — e o
protocolo/mensagem já existem antes disso.

## 6. Homologação e Test Runner

Mesma Nina, mesmo modelo, mesmo prompt, mesmo catálogo publicado, mesma
decisão de handoff, mesmo gerador de protocolo e mesma lógica de mensagem.
A mensagem aparece no chat de teste como fala da Nina (`canal: test-console`).
Nada sai para o WhatsApp real e nenhum atendente real é atribuído.

## 7. Reset de ciclo

Handoff é evento terminal do ciclo de teste: encerra o ciclo, zera a memória
ativa, preserva histórico/traces e permite novo ciclo no mesmo lead. O evento
`IA_MEMORIA_RESETADA` guarda `ciclo_id`, `nina_session_id`, `protocol_number`
e `handoff_reason`.

## 8. Auditoria

Novo registro consolidado, gravado uma única vez por handoff no evento
`HANDOFF_AUDITORIA` (`src/lib/atendimento/handoff-auditoria.server.ts`):

`conversation_id`, `cycle_id`, `nina_session_id`, `handoff_event_id`,
`protocol_id`, `protocol_number`, `created_at`, `handoff_reason`,
`destination` (+ `destination_known`), `assigned_to`, `message_id`,
`message_body`, `message_origin`, `send_status`, `transport`, `environment`,
`retry`.

Leitura: `lerTrilhaHandoff({ clinicaId, conversaId })`.

## 9. Paridade produção x teste

`compararParidadeHandoff` compara os dois registros. Divergência aceita apenas
em identificadores e transporte/isolamento (`transport`, `environment`,
`assigned_to`, ids, número do protocolo, texto da mensagem). Qualquer diferença
em decisão, motivo, destino, presença de protocolo ou presença de mensagem é
reprovada.

## 10. Segurança

`violacoesDeSeguranca` aponta, em conversa de teste: envio por WhatsApp real,
atendente real atribuída, paciente real vinculado e execução fora do ambiente
de teste.

## 11. Performance

A auditoria só roda quando existe handoff: uma inserção por transferência
(`HANDOFF_AUDITORIA`). O caminho normal das mensagens não ganhou nenhuma
consulta nova. A captura de `message_id` reaproveita o insert já existente
(`.select("id")`), sem consulta adicional.

## 12. Testes e resultados

`src/lib/atendimento/handoff-auditoria.test.ts` cobre os casos obrigatórios:
pedido do paciente, informação ausente, atendente online, ninguém online,
destino conhecido/desconhecido, falha de envio, retry, evento duplicado,
homologação, Test Runner e novo ciclo — além de paridade e segurança.

Resultado: `bun test src/lib/atendimento src/lib/nina` → **1.146 testes,
6.825 verificações, 0 falhas**. Typecheck limpo.

## Pendências

Validação ao vivo (produção e homologação) não executada: ela cria protocolo,
mensagem e eventos persistentes. Depende de confirmação explícita de clínica e
ambiente.
