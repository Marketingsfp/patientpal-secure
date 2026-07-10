import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Activity } from "lucide-react";

function hasSupabaseSession(): boolean {
  if (typeof window === "undefined") return false;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("sb-") && k.endsWith("-auth-token")) {
        const v = localStorage.getItem(k);
        if (v && v.length > 2) return true;
      }
    }
  } catch {
    /* ignore */
  }
  return false;
}

export const Route = createFileRoute("/")({
  // Redireciona ANTES de renderizar — elimina o flash de "Abrindo ClinicaOS…".
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    throw redirect({ to: hasSupabaseSession() ? "/app" : "/login", replace: true });
  },
  component: LandingPage,
  head: () => ({
    meta: [
      { title: "ClinicaOS — Sistema para clínicas de multi especialidades" },
      {
        name: "description",
        content:
          "Sistema completo para clínicas multi-especialidades: agenda online, prontuário eletrônico, financeiro com rateio, totem, telemedicina e IA.",
      },
      { property: "og:title", content: "ClinicaOS — Sistema para clínicas multi-especialidades" },
      {
        property: "og:description",
        content:
          "Agenda, prontuário, financeiro, telemedicina e IA: tudo o que sua clínica precisa em uma só plataforma.",
      },
      { property: "og:url", content: "https://patientpal-secure.lovable.app/" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://patientpal-secure.lovable.app/" }],
  }),
});

function LandingPage() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate({ to: hasSupabaseSession() ? "/app" : "/login", replace: true });
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 text-center">
      <div className="space-y-4">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Activity className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-foreground">Abrindo ClinicaOS…</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Aguarde enquanto direcionamos para o sistema.
          </p>
        </div>
      </div>
    </div>
  );
}
