import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Activity, LogOut, Calendar, CreditCard, DollarSign, User } from "lucide-react";

export const Route = createFileRoute("/paciente/")({
  component: PortalHomePage,
  head: () => ({
    meta: [
      { title: "Portal do Paciente — ClinicaOS" },
      {
        name: "description",
        content: "Acesse suas consultas, cartões, pendências financeiras e perfil.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

function PortalHomePage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        navigate({ to: "/login", search: { redirect: "/paciente" } as never });
        return;
      }
      setEmail(session.user.email ?? null);
      setLoading(false);
    })();
  }, [navigate]);

  async function sair() {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  }

  const cards = [
    { to: "/paciente/consultas", icon: Calendar, label: "Consultas", desc: "Próximas e passadas" },
    {
      to: "/paciente/cartoes",
      icon: CreditCard,
      label: "Cartões",
      desc: "Benefícios e mensalidades",
    },
    {
      to: "/paciente/financeiro",
      icon: DollarSign,
      label: "Financeiro",
      desc: "Pendências em aberto",
    },
    { to: "/paciente/perfil", icon: User, label: "Perfil", desc: "Seus dados de contato" },
  ] as const;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card sticky top-0 z-10">
        <div className="mx-auto max-w-2xl px-4 py-3 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Activity className="h-4 w-4" />
          </div>
          <span className="font-bold text-primary">ClinicaOS</span>
          <Button variant="ghost" size="sm" className="ml-auto" onClick={sair}>
            <LogOut className="h-4 w-4 mr-1" /> Sair
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-6">
        <h1 className="text-2xl font-bold">Portal do Paciente</h1>
        {email && <p className="text-sm text-muted-foreground">{email}</p>}
        {loading ? (
          <p className="mt-6 text-sm text-muted-foreground">Carregando…</p>
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-3">
            {cards.map((c) => (
              <Link key={c.to} to={c.to} className="contents">
                <Card className="p-4 hover:shadow-md hover:border-primary/40 transition-all cursor-pointer">
                  <c.icon className="h-6 w-6 text-primary mb-2" />
                  <p className="font-semibold">{c.label}</p>
                  <p className="text-xs text-muted-foreground">{c.desc}</p>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
