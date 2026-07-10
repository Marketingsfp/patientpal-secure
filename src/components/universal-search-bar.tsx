import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useClinica } from "@/hooks/use-clinica";
import { useUBFlag, useUniversalSearcher } from "@/hooks/use-universal-search";
import {
  CommandPalette,
  useCommandPaletteToggle,
  useDefaultScreenEntries,
} from "@/components/list-shell";

/**
 * Busca Universal fixa no topbar. Renderiza somente para admin/gestor
 * e apenas quando a flag `ub_v1` (profiles.preferencias_ui.flags.ub_v1)
 * estiver ligada. Kill-switch: desligar a flag remove o input do header.
 * Sem menção a "Convênios" — apenas Cartão de Benefícios / Associados.
 */
export function UniversalSearchBar() {
  const { clinicaAtual } = useClinica();
  const { enabled: ubEnabled } = useUBFlag();
  const role = clinicaAtual?.role ?? "";
  const allowed = role === "admin" || role === "gestor";

  const navigate = useNavigate();
  const entries = useDefaultScreenEntries();
  const [open, setOpen] = useCommandPaletteToggle();
  const clinicaIds = useMemo(
    () => (clinicaAtual?.clinica_id ? [clinicaAtual.clinica_id] : []),
    [clinicaAtual?.clinica_id],
  );
  const searcher = useUniversalSearcher({
    clinicaIds,
    navigate: (to) => {
      void navigate({ to: to as never });
    },
  });

  if (!ubEnabled || !allowed) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden sm:flex items-center gap-2 h-8 px-3 rounded-full border bg-muted/40 hover:bg-muted transition-colors text-xs text-muted-foreground w-full max-w-[440px]"
        title="Busca Universal (Ctrl/⌘+K)"
        data-testid="ub-topbar-trigger"
      >
        <Search className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate flex-1 text-left">
          Buscar pacientes, orçamentos, agenda, NFS-e…
        </span>
        <kbd className="hidden md:inline text-[10px] px-1.5 py-0.5 rounded bg-background border">
          Ctrl K
        </kbd>
      </button>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="sm:hidden h-8 w-8 rounded-full border bg-muted/40 hover:bg-muted flex items-center justify-center"
        title="Busca Universal"
        data-testid="ub-topbar-trigger-mobile"
        aria-label="Busca Universal"
      >
        <Search className="h-4 w-4 text-muted-foreground" />
      </button>
      <CommandPalette
        open={open}
        onOpenChange={setOpen}
        entries={entries}
        asyncSearch={searcher}
        placeholder="Buscar pacientes (CPF, telefone, nome), orçamentos, agenda, NFS-e…"
      />
    </>
  );
}
