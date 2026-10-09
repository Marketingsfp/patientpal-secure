import { MailPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { conversaNovaParaAtendente, type ConversaNova } from "@/lib/atendimento/conversa-nova";

export function BadgeConversaNova({ conversa }: { conversa: ConversaNova }) {
  if (!conversaNovaParaAtendente(conversa)) return null;
  return (
    <Badge
      data-testid="conversa-nova"
      title="A atendente responsável ainda não abriu esta conversa após a atribuição atual."
      className="shrink-0 gap-1 border border-atd-blue/30 bg-atd-blue-soft px-1.5 py-0 text-[11px] text-atd-blue-ink"
    >
      <MailPlus className="h-3 w-3" aria-hidden="true" /> Novo
    </Badge>
  );
}
