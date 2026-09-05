import { createFileRoute } from "@tanstack/react-router";

/**
 * FASE 1 — URL individual por conversa.
 *
 * A tela de atendimento continua sendo renderizada pela rota pai
 * (/app/nina). Esta rota existe apenas para que cada conversa tenha um
 * endereço próprio e imutável: /app/nina/<id interno da conversa>.
 * O identificador usado é o id interno da conversa (conversation_id),
 * nunca nome, telefone, posição na lista, status ou contador.
 */
export const Route = createFileRoute("/_authenticated/app/nina/$conversationId")({
  component: () => null,
  head: () => ({ meta: [{ title: "Atendimento — Nina — ClinicaOS" }] }),
});
