import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

interface ProfissionalCellProps {
  nome: string;
  especialidade?: string | null;
  avatarUrl?: string | null;
  className?: string;
}

function initials(name: string) {
  return name
    .replace(/^(dr\.?a?\.?)\s*/i, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

/** Célula de Profissional: avatar + nome + especialidade. */
export function ProfissionalCell({ nome, especialidade, avatarUrl, className }: ProfissionalCellProps) {
  return (
    <div className={cn("flex items-center gap-2.5 min-w-0", className)}>
      <Avatar className="h-8 w-8 shrink-0 border border-border">
        {avatarUrl ? <AvatarImage src={avatarUrl} alt={nome} /> : null}
        <AvatarFallback className="text-[11px] bg-primary/10 text-primary font-medium">
          {initials(nome) || "?"}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <div className="text-sm font-medium text-foreground truncate" title={nome}>{nome}</div>
        {especialidade && (
          <div className="text-xs text-muted-foreground truncate">{especialidade}</div>
        )}
      </div>
    </div>
  );
}