# Resposta da Nina fora da requisição da Meta

Plano aprovado em 17/10/2026: [plano-webhook-assincrono-2026-10-17.html](plano-webhook-assincrono-2026-10-17.html).

Com a chave `nina_whatsapp_assincrono` ligada na clínica, o webhook do WhatsApp grava
a mensagem, passa pelos portões de sempre e, se a Nina deve responder, registra uma
tarefa em `nina_whatsapp_tarefas` e responde "ok" à Meta na hora. O banco (pg_net)
aciona `POST /api/public/nina/processar`, que chama a mesma
`processarRespostaWhatsappNina` de antes. Chave desligada ou despacho recusado: o
webhook responde como sempre, na própria requisição.

## Peças

- Migration `20261017120000_nina_whatsapp_assincrono.sql` (aditiva, reexecutável,
  **desligada** ao aplicar): configuração, tarefas, token `nina-processar` em
  `sistema_job_tokens`, funções internas e o agendamento `nina-whatsapp-varredura`
  (5 s, só SQL).
- `src/lib/nina/whatsapp-assincrono.server.ts`: chave, despacho e a execução da tarefa.
- `src/routes/api/public/nina.processar.ts`: rota com token interno; o corpo traz só
  `{tarefa, token}`.
- `src/lib/nina/entrada-whatsapp.ts`: texto da Nina a partir da mensagem gravada,
  usado pelo webhook e pela rota.

## Recuperação

| Situação | O que acontece |
|---|---|
| Reentrega da Meta | Tarefa única por mensagem; nada novo é acionado |
| Chamada não chegou / servidor caiu | Reserva vence (60 s sem início, 90 s sem renovar) → varredura aciona de novo |
| Conversa ocupada | Volta para a fila com espera (2 → 30 s); após 10 acionamentos, encaminha |
| 3 chamadas perdidas | Modo `encaminhar`: aviso padrão e fila da equipe |
| 5 chamadas perdidas | Tarefa encerrada como `falhou` (`SEM_CONFIRMACAO`) |
| Entrada já tratada | Conclui sem chamar a Nina (mesmo critério da reentrega) |

## Ativação (nesta ordem)

1. Publicar e conferir `GET /api/public/nina/processar` → `{"servico":"nina-processar-v1"}`.
2. Conferir a URL derivada do vigia:
   `SELECT job_url FROM nina_whatsapp_assincrono_config;`
3. Ativar: `UPDATE nina_whatsapp_assincrono_config SET ativo = true;`
4. Diagnóstico (prova de chamada longa): `SELECT nina_whatsapp_diagnostico(90);` e, depois
   de ~2 min:
   `SELECT estado, ultimo_erro, concluido_em - iniciado_em AS duracao FROM nina_whatsapp_tarefas WHERE modo = 'diagnostico' ORDER BY created_at DESC LIMIT 1;`
   Esperado: `concluida` e duração ≥ 90 s. Se `falhou`, **não** ligar a chave.
5. Ligar a chave na clínica:
   `INSERT INTO clinica_feature_flags (clinica_id, flag_key, ativo) VALUES ('<clinica>', 'nina_whatsapp_assincrono', true) ON CONFLICT (clinica_id, flag_key) DO UPDATE SET ativo = true;`
6. Mensagens de teste por um celular da equipe e conferência:
   `whatsapp_webhook_logs.resultado = 'processado_ok:nina_despachada'`, uma entrega por
   mensagem, e `nina_whatsapp_tarefas` concluídas com `falhas = 0`.

## Volta atrás

- Desligar a chave da clínica (efeito imediato; novas mensagens voltam ao caminho de
  sempre). Tarefas já criadas terminam normalmente.
- Só desligar a configuração (`ativo = false`) quando não houver tarefas abertas:
  com ela desligada, a varredura para e tarefas pendentes não são acionadas.
- Nada é apagado; o histórico das tarefas fica 7 dias.

## Validação local (17/10/2026)

- `bun scripts/test-nina-whatsapp-assincrono.mjs node_modules/@electric-sql/pglite/dist/index.js`:
  migration aplicada duas vezes em PostgreSQL descartável, 59 verificações (fila,
  reentrega, reserva, repetição, varredura, encaminhamento, diagnóstico, retenção,
  permissões).
- `src/lib/nina/__tests__/whatsapp-assincrono.test.ts`: rota (token, pedido estrito,
  entrada idêntica à do webhook, ocupada, falhas, encaminhamento, diagnóstico).
- `src/lib/nina/__tests__/webhook-agrupamento.test.ts`: POST real com a chave ligada,
  com despacho recusado e com a chave desligada.
