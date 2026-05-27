import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/checkin/$token")({
  component: CheckinPage,
  head: () => ({ meta: [{ title: "Check-in — ClinicaOS" }] }),
});

interface Resp { ok: boolean; erro?: string; paciente?: string; inicio?: string; procedimento?: string }

function CheckinPage() {
  const { token } = Route.useParams();
  const [state, setState] = useState<"loading" | "ok" | "err">("loading");
  const [data, setData] = useState<Resp | null>(null);

  useEffect(() => {
    (async () => {
      const { data: r, error } = await supabase.rpc("checkin_agendamento", { _token: token });
      if (error || !r) { setState("err"); setData({ ok: false, erro: error?.message ?? "Falha" }); return; }
      const resp = r as unknown as Resp;
      setData(resp);
      setState(resp.ok ? "ok" : "err");
    })();
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {state === "loading" && <Loader2 className="h-5 w-5 animate-spin" />}
            {state === "ok" && <CheckCircle2 className="h-5 w-5 text-primary" />}
            {state === "err" && <XCircle className="h-5 w-5 text-destructive" />}
            {state === "loading" ? "Validando..." : state === "ok" ? "Check-in confirmado" : "Não foi possível confirmar"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {state === "ok" && data && (
            <>
              <p><span className="text-muted-foreground">Paciente:</span> <span className="font-medium">{data.paciente}</span></p>
              <p><span className="text-muted-foreground">Serviço:</span> {data.procedimento ?? "—"}</p>
              <p><span className="text-muted-foreground">Horário:</span> {data.inicio ? new Date(data.inicio).toLocaleString("pt-BR") : "—"}</p>
              <p className="pt-2 text-muted-foreground">Aguarde ser chamado na recepção.</p>
            </>
          )}
          {state === "err" && (
            <p className="text-destructive">{data?.erro ?? "Token inválido ou expirado."}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}