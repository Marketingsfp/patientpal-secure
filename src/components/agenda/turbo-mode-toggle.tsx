import { Zap } from "lucide-react";
import { useTurboMode } from "@/lib/turbo-mode";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

/**
 * Toggle "Modo Recepção Turbo". Quando ativo, teclas F2–F9, Ctrl+S,
 * Ctrl+Enter e Enter/Shift+Enter em campos `[data-turbo-field]` passam a
 * funcionar. Estado persiste em localStorage.
 */
export function TurboModeToggle() {
  const [on, setOn] = useTurboMode();
  return (
    <Button
      type="button"
      size="sm"
      variant={on ? "default" : "outline"}
      className="h-7 text-[11px] px-2 gap-1"
      title="Modo Recepção Turbo: navegação por teclado (F2 buscar, F3 novo, F5 atualizar, F6 próximo horário, F7 Express, F8 Agenda, F9 Caixa, Ctrl+S salvar, Ctrl+Enter salvar+receber)"
      onClick={() => {
        const next = !on;
        setOn(next);
        toast.success(next ? "Modo Turbo ativado — use F2/F3/F5/F6" : "Modo Turbo desativado");
      }}
    >
      <Zap className={`h-3 w-3 ${on ? "" : "opacity-70"}`} />
      Turbo {on ? "ON" : "OFF"}
    </Button>
  );
}
