import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Building2, Stethoscope, Wallet, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/app")({
  component: DashboardPage,
  head: () => ({ meta: [{ title: "Dashboard — ClinicaOS" }] }),
});

function DashboardPage() {
  const { memberships, clinicaAtual, loading } = useClinica();
  const [stats, setStats] = useState({ medicos: 0, regras: 0 });

  useEffect(() => {
    if (!clinicaAtual) return;
    (async () => {
      const [m, r] = await Promise.all([
        supabase.from("medicos").select("id", { count: "exact", head: true }).eq("clinica_id", clinicaAtual.clinica_id),
        supabase.from("regras_rateio").select("id", { count: "exact", head: true }).eq("clinica_id", clinicaAtual.clinica_id),
      ]);
      setStats({ medicos: m.count ?? 0, regras: r.count ?? 0 });
    })();
  }, [clinicaAtual]);

  if (loading) return <p className="text-muted-foreground">Carregando...</p>;

  if (memberships.length === 0) {
    return (
      <div className="max-w-xl mx-auto mt-12 text-center">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-4">
          <Building2 className="h-7 w-7" />
        </div>
        <h1 className="text-2xl font-semibold">Bem-vindo ao ClinicaOS!</h1>
        <p className="text-muted-foreground mt-2">
          Para começar, crie sua primeira clínica. Você será o administrador dela.
        </p>
        <Button asChild className="mt-6" size="lg">
          <Link to="/app/clinicas">Criar minha primeira clínica</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Visão geral de {clinicaAtual?.clinica.nome}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard icon={Building2} label="Clínicas" value={memberships.length} />
        <StatCard icon={Stethoscope} label="Médicos" value={stats.medicos} />
        <StatCard icon={Wallet} label="Regras de rateio" value={stats.regras} />
        <StatCard icon={Users} label="Seu papel" value={clinicaAtual?.role ?? "—"} />
      </div>

      <Card>
        <CardHeader><CardTitle>Próximos passos</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Step done={memberships.length > 0} text="Criar primeira clínica" />
          <Step done={stats.medicos > 0} text="Cadastrar médicos" link="/app/medicos" />
          <Step done={stats.regras > 0} text="Configurar regras de rateio" link="/app/rateio" />
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
            <p className="text-xl font-semibold">{value}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Step({ done, text, link }: { done: boolean; text: string; link?: string }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className={`h-5 w-5 rounded-full border-2 ${done ? "bg-success border-success" : "border-muted-foreground/30"}`} />
        <span className={done ? "text-muted-foreground line-through" : ""}>{text}</span>
      </div>
      {!done && link && <Button asChild size="sm" variant="ghost"><Link to={link}>Ir</Link></Button>}
    </div>
  );
}