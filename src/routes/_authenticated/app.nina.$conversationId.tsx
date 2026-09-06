import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Endereço individual por conversa — DESCONTINUADO.
 *
 * A conversa aberta passou a ser uma seleção interna da Inbox, sempre no
 * mesmo endereço (/app/nina). Esta rota existe só para que links antigos não
 * quebrem: o identificador do endereço é descartado, nenhuma conversa é
 * buscada por causa dele e nada muda no atendimento (responsável, fila,
 * status ou mensagens).
 */
export const Route = createFileRoute("/_authenticated/app/nina/$conversationId")({
  beforeLoad: () => {
    throw redirect({ to: "/app/nina", hash: "atend-inbox", replace: true });
  },
  component: () => null,
});
