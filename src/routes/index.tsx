import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Activity } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/")({
  component: LandingPage,
  head: () => ({
    meta: [
      { title: "ClinicaOS — Sistema para clínicas de multi especialidades" },
      {
        name: "description",
        content:
          "Sistema completo para clínicas multi-especialidades: agenda online, prontuário eletrônico, financeiro com rateio, totem, telemedicina e IA.",
      },
    ],
  }),
});

function LandingPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    void navigate({ to: user ? "/app" : "/login", replace: true });
  }, [loading, navigate, user]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 text-center">
      <div className="space-y-4">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Activity className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-foreground">Abrindo ClinicaOS…</h1>
          <p className="mt-1 text-sm text-muted-foreground">Aguarde enquanto direcionamos para o sistema.</p>
        </div>
      </div>
    </div>
  );
}
