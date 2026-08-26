import { Link, useLocation } from "@tanstack/react-router";
import { Activity, ClipboardList } from "lucide-react";
import { cn } from "@/lib/utils";

const ITENS = [
  { to: "/app/fisioterapia", label: "Mapa & Avaliação", icon: Activity, exato: true },
  {
    to: "/app/fisioterapia/pacotes",
    label: "Pacotes de Sessões",
    icon: ClipboardList,
    exato: false,
  },
] as const;

/**
 * Navegação entre as duas telas do módulo de Fisioterapia.
 *
 * Cada item é uma rota de verdade, não uma aba: o endereço muda, o botão
 * "voltar" do navegador funciona e o link pode ser compartilhado. O item de
 * "Mapa & Avaliação" casa por igualdade exata porque `/app/fisioterapia` é
 * prefixo de `/app/fisioterapia/pacotes` — sem isso os dois acenderiam juntos.
 */
export function FisioSubnav() {
  const location = useLocation();
  return (
    <nav className="flex flex-wrap items-center gap-1.5">
      {ITENS.map((item) => {
        const active = item.exato
          ? location.pathname === item.to || location.pathname === `${item.to}/`
          : location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);
        return (
          <Link
            key={item.to}
            to={item.to}
            className={cn(
              "group flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-[14px] font-medium transition-all duration-200",
              active
                ? "border-primary bg-primary text-primary-foreground shadow-sm"
                : "border-border/60 bg-muted/40 text-muted-foreground hover:border-primary/30 hover:bg-primary/5 hover:text-foreground",
            )}
          >
            <item.icon
              className={cn(
                "h-4 w-4 shrink-0 transition-colors",
                active ? "" : "text-muted-foreground/70 group-hover:text-primary",
              )}
            />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
