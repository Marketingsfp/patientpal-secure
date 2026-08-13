import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { getPreferenciasUi, updatePreferenciasUi } from "@/lib/cache/prefs-cache";
import { ClientesShellV2 } from "@/components/clientes-v2/clientes-shell";
import { useClientesV2Flag } from "@/hooks/use-clientes-v2-flag";

export const Route = createFileRoute("/_authenticated/app/dev-clientes-shell")({
  component: DevClientesShell,
  head: () => ({
    meta: [
      { title: "Preview — Clientes v2 (dev)" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

function DevClientesShell() {
  const { enabled, loading, setEnabled } = useClientesV2Flag();
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    void (async () => {
      const { prefs } = await getPreferenciasUi();
      const p = prefs as { clientes?: { compact?: boolean } };
      if (typeof p.clientes?.compact === "boolean") setCompact(p.clientes.compact);
    })();
  }, []);

  const persistCompact = async (v: boolean) => {
    setCompact(v);
    await updatePreferenciasUi((prev) => ({
      ...prev,
      clientes: { ...((prev.clientes as object) ?? {}), compact: v },
    }));
  };

  return (
    <div className="h-[calc(100vh-56px)] flex flex-col">
      <div className="border-b bg-muted/30 px-4 py-2 flex items-center justify-between gap-4 flex-wrap">
        <div className="text-xs text-muted-foreground">
          <b>Preview isolado</b> — rota <code>/app/dev-clientes-shell</code> · não altera <code>/app/clientes</code>.
        </div>
        <div className="flex items-center gap-3">
          <Label className="text-xs flex items-center gap-2">
            Flag <code className="bg-muted px-1 rounded">clientes_v2</code>
            <Switch
              checked={enabled} disabled={loading}
              onCheckedChange={(v) => void setEnabled(v)}
              data-testid="flag-clientes-v2"
            />
          </Label>
          <Button size="sm" variant="ghost" asChild>
            <a href="/app/clientes">Ver clientes clássico</a>
          </Button>
        </div>
      </div>
      <div className="flex-1 min-h-0">
        {enabled ? (
          <ClientesShellV2 compactPref={compact} onToggleCompact={(v) => void persistCompact(v)} />
        ) : (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground text-center p-6">
            Flag <code className="mx-1">clientes_v2</code> desligada.<br />
            Ative acima para pré-visualizar. A rota <code>/app/clientes</code> continua idêntica.
          </div>
        )}
      </div>
    </div>
  );
}