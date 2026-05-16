import { createFileRoute, Link } from "@tanstack/react-router";
import { Activity, ShieldCheck, Stethoscope, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  component: LandingPage,
  head: () => ({
    meta: [
      { title: "ClinicaOS — Gestão completa para clínicas multi-unidade" },
      {
        name: "description",
        content:
          "Plataforma de gestão para clínicas: agenda, prontuário, financeiro, triagem e rateio de receita em uma única plataforma.",
      },
    ],
  }),
});

function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-background/80 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Activity className="h-5 w-5" />
            </div>
            <span className="text-lg font-semibold tracking-tight">ClinicaOS</span>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost"><Link to="/login">Entrar</Link></Button>
            <Button asChild><Link to="/signup">Criar conta</Link></Button>
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-6 py-20 text-center">
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-foreground">
            Gestão completa para sua{" "}
            <span className="text-primary">clínica multi-unidade</span>
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
            Agenda, prontuário eletrônico, financeiro com rateio automático de receita,
            triagem inteligente, WhatsApp e BI — tudo em um só lugar.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Button asChild size="lg"><Link to="/signup">Começar agora</Link></Button>
            <Button asChild size="lg" variant="outline"><Link to="/login">Já tenho conta</Link></Button>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 pb-20 grid gap-6 md:grid-cols-3">
          {[
            { icon: Stethoscope, title: "Multi-clínica e multi-especialidade", desc: "Centralize todas as unidades com permissões por papel." },
            { icon: Wallet, title: "Rateio automático de receita", desc: "Regras de repasse por médico, especialidade e forma de pagamento." },
            { icon: ShieldCheck, title: "Seguro por padrão", desc: "Controle de acesso granular com RLS e auditoria." },
          ].map((f) => (
            <div key={f.title} className="rounded-xl border border-border bg-card p-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t border-border py-6 text-center text-sm text-muted-foreground">
        ClinicaOS — Fase 1
      </footer>
    </div>
  );
}