import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { OrcamentosShellV2 } from "@/components/orcamentos-v2/orcamentos-shell";
import { useOrcamentosV2Flag } from "@/hooks/use-orcamentos-v2-flag";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/app/dev-orcamentos-shell")({
  component: DevOrcamentosShell,
  head: () => ({
    meta: [
      { title: "Preview — Orçamentos v2 (dev)" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

function DevOrcamentosShell() {
  const { enabled, loading, setEnabled } = useOrcamentosV2Flag();
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data } = await supabase.from("profiles")
        .select("preferencias_ui").eq("id", u.user.id).maybeSingle();
      const p = (data?.preferencias_ui ?? {}) as { orcamentos?: { compact?: boolean } };
      if (typeof p.orcamentos?.compact === "boolean") setCompact(p.orcamentos.compact);
    })();
  }, []);

  const persistCompact = async (v: boolean) => {
    setCompact(v);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { data } = await supabase.from("profiles")
      .select("preferencias_ui").eq("id", u.user.id).maybeSingle();
    const prev = (data?.preferencias_ui ?? {}) as Record<string, unknown>;
    const orcamentos = { ...((prev.orcamentos as object) ?? {}), compact: v };
    await supabase.from("profiles").update({ preferencias_ui: { ...prev, orcamentos } }).eq("id", u.user.id);
  };

  return (
    <div className="h-[calc(100vh-56px)] flex flex-col">
      <div className="border-b bg-muted/30 px-4 py-2 flex items-center justify-between gap-4 flex-wrap">
        <div className="text-xs text-muted-foreground">
          <b>Preview isolado</b> — rota <code>/app/dev-orcamentos-shell</code> · não altera <code>/app/orcamentos</code>.
        </div>
        <div className="flex items-center gap-3">
          <Label className="text-xs flex items-center gap-2">
            Flag <code className="bg-muted px-1 rounded">orcamentos_v2</code>
            <Switch
              checked={enabled} disabled={loading}
              onCheckedChange={(v) => void setEnabled(v)}
              data-testid="flag-orcamentos-v2"
            />
          </Label>
          <Button size="sm" variant="ghost" asChild>
            <a href="/app/orcamentos">Ver orçamentos clássico</a>
          </Button>
        </div>
      </div>
      <div className="flex-1 min-h-0">
        {enabled ? (
          <OrcamentosShellV2 compactPref={compact} onToggleCompact={(v) => void persistCompact(v)} />
        ) : (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground text-center p-6">
            Flag <code className="mx-1">orcamentos_v2</code> desligada.<br />
            Ative acima para pré-visualizar. A rota de produção <code>/app/orcamentos</code> continua idêntica.
          </div>
        )}
      </div>
    </div>
  );
}