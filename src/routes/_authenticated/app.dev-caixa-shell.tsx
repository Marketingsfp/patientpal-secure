import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { CaixaShellV2 } from "@/components/caixa-v2/caixa-shell";
import { useCaixaV2Flag } from "@/hooks/use-caixa-v2-flag";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/app/dev-caixa-shell")({
  component: DevCaixaShell,
  head: () => ({
    meta: [{ title: "Preview — Caixa v2 (dev)" }, { name: "robots", content: "noindex, nofollow" }],
  }),
});

function DevCaixaShell() {
  const { enabled, loading, setEnabled } = useCaixaV2Flag();
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data } = await supabase
        .from("profiles")
        .select("preferencias_ui")
        .eq("id", u.user.id)
        .maybeSingle();
      const p = (data?.preferencias_ui ?? {}) as { caixa?: { compact?: boolean } };
      if (typeof p.caixa?.compact === "boolean") setCompact(p.caixa.compact);
    })();
  }, []);

  const persistCompact = async (v: boolean) => {
    setCompact(v);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { data } = await supabase
      .from("profiles")
      .select("preferencias_ui")
      .eq("id", u.user.id)
      .maybeSingle();
    const prev = (data?.preferencias_ui ?? {}) as Record<string, unknown>;
    const caixa = { ...((prev.caixa as object) ?? {}), compact: v };
    await supabase
      .from("profiles")
      .update({ preferencias_ui: { ...prev, caixa } })
      .eq("id", u.user.id);
  };

  return (
    <div className="h-[calc(100vh-56px)] flex flex-col">
      <div className="border-b bg-muted/30 px-4 py-2 flex items-center justify-between gap-4 flex-wrap">
        <div className="text-xs text-muted-foreground">
          <b>Preview isolado</b> — rota <code>/app/dev-caixa-shell</code> · não altera{" "}
          <code>/app/caixa</code>.
        </div>
        <div className="flex items-center gap-3">
          <Label className="text-xs flex items-center gap-2">
            Flag <code className="bg-muted px-1 rounded">caixa_v2</code>
            <Switch
              checked={enabled}
              disabled={loading}
              onCheckedChange={(v) => void setEnabled(v)}
              data-testid="flag-caixa-v2"
            />
          </Label>
          <Button size="sm" variant="ghost" asChild>
            <a href="/app/caixa">Ver caixa clássico</a>
          </Button>
        </div>
      </div>
      <div className="flex-1 min-h-0">
        {enabled ? (
          <CaixaShellV2 compactPref={compact} onToggleCompact={(v) => void persistCompact(v)} />
        ) : (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground text-center p-6">
            Flag <code className="mx-1">caixa_v2</code> desligada.
            <br />
            Ative acima para pré-visualizar o novo Caixa. O caixa de produção continua em{" "}
            <code>/app/caixa</code>.
          </div>
        )}
      </div>
    </div>
  );
}
