import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Loader2, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/diagnostico")({
  component: DiagnosticoPage,
  head: () => ({ meta: [{ title: "Diagnóstico — ClinicaOS" }] }),
});

type Status = "pending" | "ok" | "warn" | "error";

interface Check {
  label: string;
  status: Status;
  detail?: string;
}

function StatusIcon({ status }: { status: Status }) {
  if (status === "pending") return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;
  if (status === "ok") return <CheckCircle2 className="h-5 w-5 text-green-600" />;
  if (status === "warn") return <AlertTriangle className="h-5 w-5 text-yellow-600" />;
  return <XCircle className="h-5 w-5 text-destructive" />;
}

function DiagnosticoPage() {
  const [checks, setChecks] = useState<Record<string, Check>>({
    frontend: { label: "Frontend (React + TanStack Router)", status: "ok", detail: "Página renderizada com sucesso." },
    env: { label: "Variáveis de ambiente (Supabase URL/Key)", status: "pending" },
    session: { label: "Sessão Supabase Auth (getSession)", status: "pending" },
    user: { label: "Usuário autenticado (getUser)", status: "pending" },
    rls: { label: "Leitura via RLS (tabela clinicas)", status: "pending" },
    rpc: { label: "RPC autenticada (meus_cartoes)", status: "pending" },
  });

  const update = (key: string, patch: Partial<Check>) =>
    setChecks((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));

  const runChecks = async () => {
    setChecks((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(next)) {
        if (k !== "frontend") next[k] = { ...next[k], status: "pending", detail: undefined };
      }
      return next;
    });

    // 1. env
    const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
    if (url && key) {
      update("env", { status: "ok", detail: `URL: ${url}` });
    } else {
      update("env", { status: "error", detail: "VITE_SUPABASE_URL ou VITE_SUPABASE_PUBLISHABLE_KEY ausente." });
      return;
    }

    // 2. session
    let userId: string | null = null;
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        update("session", { status: "error", detail: error.message });
      } else if (!data.session) {
        update("session", { status: "warn", detail: "Nenhuma sessão ativa (usuário não logado)." });
      } else {
        update("session", { status: "ok", detail: `Token válido. Expira em ${new Date((data.session.expires_at ?? 0) * 1000).toLocaleString()}` });
      }
    } catch (e) {
      update("session", { status: "error", detail: (e as Error).message });
    }

    // 3. user
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error) {
        update("user", { status: "warn", detail: error.message });
      } else if (!data.user) {
        update("user", { status: "warn", detail: "Sem usuário autenticado." });
      } else {
        userId = data.user.id;
        update("user", { status: "ok", detail: `${data.user.email} (id: ${data.user.id.slice(0, 8)}…)` });
      }
    } catch (e) {
      update("user", { status: "error", detail: (e as Error).message });
    }

    // 4. RLS — tenta ler clínicas que o usuário é membro
    try {
      const { data, error } = await supabase.from("clinicas").select("id, nome").limit(5);
      if (error) {
        update("rls", { status: "error", detail: `${error.code ?? ""} ${error.message}` });
      } else {
        update("rls", {
          status: data && data.length > 0 ? "ok" : "warn",
          detail: `${data?.length ?? 0} clínica(s) retornada(s).`,
        });
      }
    } catch (e) {
      update("rls", { status: "error", detail: (e as Error).message });
    }

    // 5. RPC autenticada (só faz sentido logado)
    if (!userId) {
      update("rpc", { status: "warn", detail: "Pulado — requer login." });
    } else {
      try {
        const { data, error } = await supabase.rpc("meus_cartoes");
        if (error) {
          update("rpc", { status: "error", detail: `${error.code ?? ""} ${error.message}` });
        } else {
          const arr = Array.isArray(data) ? data : [];
          update("rpc", { status: "ok", detail: `${arr.length} cartão(ões) retornado(s).` });
        }
      } catch (e) {
        update("rpc", { status: "error", detail: (e as Error).message });
      }
    }
  };

  useEffect(() => {
    void runChecks();
  }, []);

  const order = ["frontend", "env", "session", "user", "rls", "rpc"];

  return (
    <div className="min-h-screen bg-background py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">Diagnóstico do Sistema</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Verifica frontend, autenticação Supabase e acesso RLS.
          </p>
        </div>

        <div className="rounded-lg border bg-card divide-y">
          {order.map((k) => {
            const c = checks[k];
            return (
              <div key={k} className="flex items-start gap-3 p-4">
                <StatusIcon status={c.status} />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-foreground">{c.label}</div>
                  {c.detail && (
                    <div className="text-sm text-muted-foreground mt-0.5 break-words">{c.detail}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex gap-3 mt-6">
          <Button onClick={runChecks}>Rodar novamente</Button>
          <Button variant="outline" asChild>
            <Link to="/login">Ir para login</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/">Voltar ao início</Link>
          </Button>
        </div>

        <div className="mt-6 text-xs text-muted-foreground">
          User-Agent: {typeof navigator !== "undefined" ? navigator.userAgent : "n/d"}
        </div>
      </div>
    </div>
  );
}