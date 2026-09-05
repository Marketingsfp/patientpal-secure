/**
 * Banner discreto de evento de sistema dentro da timeline da conversa.
 * Não é mensagem do paciente, da Nina nem do atendente: é uma marcação de
 * mudança de estado (resolvida, reaberta, atribuída, transferida…).
 */

import { formatarDataHoraMensagem } from "@/lib/atendimento/data-hora";

export interface ConversaEvento {
  id: string;
  evento: string;
  user_id: string | null;
  user_nome?: string | null;
  para_nome?: string | null;
  motivo: string | null;
  detalhes: unknown;
  created_at: string;
}

function autor(ev: ConversaEvento): string {
  const nome = (ev.user_nome ?? "").trim();
  if (nome) return nome;
  return ev.user_id ? "um atendente" : "Sistema de Automação";
}

export function textoEvento(ev: ConversaEvento): string {
  const por = autor(ev);
  const automatico = Boolean((ev.detalhes as { automatico?: boolean } | null)?.automatico);
  switch (ev.evento) {
    case "FINALIZADA":
      return automatico
        ? "Conversa resolvida automaticamente pela Nina após conclusão do atendimento"
        : `Conversa encerrada e resolvida por ${por}`;


    case "REABERTA":
      return "Conversa reaberta por nova mensagem do paciente";
    case "ATRIBUIDA_IA":
    case "DEVOLVIDA_PARA_IA":
      return "Conversa atribuída à Nina (IA)";
    case "ASSUMIDA":
      return `Conversa atribuída a ${por}`;
    case "DESATRIBUIDA":
      return "Conversa ficou sem responsável";
    case "TRANSFERIDA": {
      const para = (ev.para_nome ?? "").trim();
      return para
        ? `Conversa transferida por ${por} para ${para}`
        : `Conversa transferida por ${por}`;
    }
    case "IA_MEMORIA_RESETADA":
      return "Memória da Nina foi resetada";
    case "ATENDIMENTO_ENCERRADO":
      return "Atendimento encerrado — a Nina reassumirá caso o paciente envie uma nova mensagem";
    case "TIMEOUT_NINA":
      return "Timeout da Nina: paciente não respondeu em 30 minutos. Conversa encaminhada para atendimento humano";
    case "HANDOFF_SOLICITADO":
      return "Nina solicitou atendimento humano";
    case "ENTROU_NA_FILA":
      return "Conversa entrou na fila de atendimento";
    case "AGENDAMENTO_CRIADO":
      return `Agendamento criado por ${por}`;
    case "RESUMO_IA_GERADO":
      return "Resumo interno da Nina gerado para o atendimento";

    case "IA_SILENCIADA":
      return "IA pausada nesta conversa";
    default:
      return ev.evento.replaceAll("_", " ").toLowerCase();
  }
}

export function ConversationSystemEvent({ evento }: { evento: ConversaEvento }) {
  const hora = formatarDataHoraMensagem(evento.created_at);
  return (
    <div className="my-2 flex justify-center px-2">
      <div className="max-w-[90%] rounded-full border border-border/60 bg-muted/60 px-3 py-1 text-center text-[11px] leading-tight text-muted-foreground sm:text-xs">
        <span>{textoEvento(evento)}</span>
        {evento.motivo ? <span className="opacity-80"> — {evento.motivo}</span> : null}
        {hora ? <span className="ml-1 whitespace-nowrap opacity-60">{hora}</span> : null}
      </div>
    </div>
  );
}
