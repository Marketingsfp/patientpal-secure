# Diagnóstico — aviso duplicado no encaminhamento e vínculo errado da nota (caso MJ-52)

Data: 2026-09-13. Escopo: WhatsApp / Nina / OS ZAP (produção, homologação e auditoria).
Nada foi alterado nesta etapa. Somente diagnóstico e pontos concretos de alteração.

Tipo do pedido: erro de código/arquitetura (dois responsáveis pela mesma
comunicação) + inconsistência de dados de auditoria (vínculo de confiança
apontando para outro texto). Não é regra de negócio nova.

---

## 1. Os dois caminhos de envio

### Caminho A — mensagem de encaminhamento com protocolo (módulo de atendimento)

1. O modelo chama a ferramenta `solicitar_atendente_humano`
   (`src/lib/nina/handoff-tool.server.ts`, executada pelo Tool Broker durante
   `gerarRespostaNina`, `src/lib/whatsapp.server.ts`).
2. `encaminharParaHumano` — `src/lib/atendimento/handoff.server.ts:193`.
   Atualiza a conversa (`owner_type: NONE`, `ai_enabled: false`,
   `status: waiting`), registra `HANDOFF_SOLICITADO` e `ENTROU_NA_FILA`.
3. `protocoloAoIniciarHandoff` — `src/lib/atendimento/protocolo-atendimento.server.ts:117`.
   Gera/reaproveita o protocolo (MJ-52) e, como `anunciar` é opcional e o
   chamador não passa `false`, **anuncia por padrão**.
4. `anunciarHandoffAoPaciente` — `protocolo-atendimento.server.ts:292`.
   Monta o texto com `gerarMensagemHandoff`
   (`src/lib/atendimento/mensagem-handoff.server.ts`) e chama
   `enviarTextoSistema`.
5. `enviarTextoSistema` — `protocolo-atendimento.server.ts:~345`.
   Grava direto em `whatsapp_mensagens` (`wa_message_id: handoff-<conversa>-<ts>`;
   em homologação com `canal: "test-console"`, sem transporte real).

**Falha de vínculo:** essa linha **não** recebe `execucao_id`, não passa por
`registrarEntregaSaida`, nem por `gravarEntregaDoTurno`, nem por
`registrarDecisaoConfianca`. Para a auditoria ela é uma mensagem órfã: existe
para o paciente, não existe para o turno.

### Caminho B — aviso controlado de baixa confiabilidade (finalização da Nina)

1. `gerarRespostaNina` avalia a resposta candidata e grava o snapshot:
   `registrarDecisaoConfianca` — `src/lib/whatsapp.server.ts:2575`, com
   `textoFinalHash = respostaFinalAvaliada.textoAvaliadoHash` (texto
   **candidato**, o de encaminhamento com banner; nota LOW 63).
2. `decidirBloqueioBaixaConfianca` — `whatsapp.server.ts:2768` — bloqueia o
   candidato e **substitui** `resposta` pelo aviso controlado
   (`AVISO_ENCAMINHAMENTO_SIMULADO` em homologação,
   `AVISO_ENCAMINHAMENTO_HUMANO`/`_FALHOU` em produção),
   `src/lib/nina/confidence/baixa-confiabilidade.ts:33-50`.
3. O `decisaoId` e o `textoFinalHash` do candidato viajam em `opcoes.auditoria`
   (`whatsapp.server.ts:2615-2626`) para quem persiste.
4. Quem persiste liga a nota à mensagem:
   `src/lib/nina/teste-console.server.ts:640-700` (homologação) e o caminho
   equivalente do webhook em produção — `registrarEntregaSaida` +
   `gravarEntregaDoTurno`, com `textoHash = hash(reply)` e
   `detalhe.hash_avaliado = auditoriaNina.textoFinalHash`.

**Falha de vínculo:** o texto entregue é o aviso; o hash avaliado é o do
candidato descartado. Os dois hashes já são gravados lado a lado e **divergem**,
mas ninguém compara — então a mensagem final aparece na tela carregando a nota
LOW 63 de outro texto.

---

## 2. Por que apareceram duas mensagens

No mesmo turno, dois módulos assumiram a comunicação do mesmo encaminhamento:

- o Caminho A entregou "encaminhei, protocolo MJ-52…" no momento da ferramenta;
- o Caminho B entregou "Não vou seguir com esta resposta agora…" na finalização,
  porque o bloqueio de baixa confiabilidade roda **mesmo quando
  `jaEncaminhado = true`** (só deixa de encaminhar de novo; continua trocando o
  texto e o texto trocado é enviado pelo chamador).

Não há idempotência entre os dois: o Caminho A registra o anúncio em
`atend_conversa_eventos` (`protocolo_informado`), que o Caminho B nunca consulta.

---

## 3. Pontos concretos de alteração

### 3.1 Um único responsável pela entrega do aviso final

- `src/lib/whatsapp.server.ts` (bloco `decidirBloqueioBaixaConfianca`,
  ~2765-2860): antes de substituir a resposta, consultar se o encaminhamento
  deste turno **já anunciou** ao paciente (protocolo + `mensagemId` do anúncio).
  Se anunciou, o turno não produz segunda mensagem: o candidato continua
  descartado, a resposta do turno passa a ser "sem texto novo" e o registro
  aponta a mensagem do anúncio como saída do turno.
- `src/lib/atendimento/handoff.server.ts` (`encaminharParaHumano`): devolver no
  `ResultadoHandoff` o vínculo do anúncio (`protocolo`, `mensagemId`, `status`,
  `handoffEventoId`) de forma consumível pelo Tool Broker — hoje o dado existe
  (`anuncioHandoff`) mas não chega à finalização da Nina.
- `src/lib/nina/handoff-tool.server.ts`: propagar esse vínculo para o registro
  do turno (`rastreio/turno.server.ts`), para a finalização decidir com fato, e
  não com suposição.
- Alternativa simétrica (caso a decisão do time seja o contrário): manter o
  aviso da Nina como única fala e chamar `protocoloAoIniciarHandoff` com
  `anunciar: false` a partir do caminho de baixa confiabilidade. Precisa de
  decisão do time — as duas opções preservam protocolo e fila.

### 3.2 Vínculos necessários (mesma operação entre módulos)

Chaves que precisam acompanhar a operação nos dois caminhos:
`turno_id (trace)`, `execucao_id`, `conversa_id`, `handoff_evento_id`,
`protocolo`, `outgoing_message_id`, `texto_hash`, `decisao_id`, `representacao`,
`estado de entrega`, `ambiente`.

- `src/lib/atendimento/protocolo-atendimento.server.ts` (`enviarTextoSistema` e
  `anunciarHandoffAoPaciente`): gravar `execucao_id` na linha de
  `whatsapp_mensagens` e chamar `registrarEntregaSaida` + `gravarEntregaDoTurno`
  para a mensagem do protocolo, com representação própria
  (ex.: `texto_completo` com origem `aviso_encaminhamento`), estado
  `persistida` em homologação e `confirmada` só com retorno do transporte.
- `src/lib/nina/confidence/entrega.ts`: já possui
  `saidaCorrespondeAoAvaliado` e `avaliacaoAindaVale`; nenhum dos dois caminhos
  os chama. Passar a usá-los no ponto de persistência.
- `src/lib/nina/teste-console.server.ts:660-700` e o caminho equivalente de
  produção: quando `hash(texto entregue) ≠ hash_avaliado`, **não** vincular a
  nota anterior. Registrar a saída como "mensagem controlada do sistema — não
  avaliada" (o `confianca-badge` já sabe exibir "Resposta não avaliada"), sem
  recalcular nota e sem mexer em pesos ou limites.

### 3.3 O que permanece intocado

- Pesos, limites, critérios e versões do motor de confiança.
- Aviso simbólico e ausência de transferência real em homologação.
- Encaminhamento real em produção, fila, protocolo e Tool Broker.
- Reset da homologação apenas pelo botão "Resolver / Reiniciar teste".

---

## 4. Limitações desta etapa

- Não foi executada conversa real com a IA; a reconstrução é por leitura de
  código e pelos registros descritos do caso MJ-52.
- O caminho de produção que persiste a resposta (webhook) precisa receber o
  mesmo ajuste do console de homologação; ambos estão listados acima.
- A escolha de quem fala com o paciente (3.1) é decisão de produto e está
  aguardando confirmação do time.
