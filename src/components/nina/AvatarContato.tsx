import { User } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { iniciaisDoNome } from "@/lib/atendimento/rotulo-conversa";

/**
 * Avatar do contato do WhatsApp: a foto, quando houver, ou as iniciais do nome; sem nome, um ícone.
 * A API oficial da Meta não entrega a foto do contato, por isso hoje só aparecem as iniciais.
 */
export function AvatarContato({
  nome,
  fotoUrl,
  className,
}: {
  nome: string | null | undefined;
  fotoUrl?: string | null;
  className?: string;
}) {
  const iniciais = iniciaisDoNome(nome);
  return (
    <Avatar className={className ?? "h-12 w-12"} data-testid="avatar-contato">
      {fotoUrl ? <AvatarImage src={fotoUrl} alt="" /> : null}
      <AvatarFallback className="bg-primary/15 text-sm font-semibold text-primary">
        {iniciais ?? <User className="h-5 w-5" aria-hidden />}
      </AvatarFallback>
    </Avatar>
  );
}
