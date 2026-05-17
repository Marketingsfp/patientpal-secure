import { createFileRoute, Link } from "@tanstack/react-router";
import { Activity, CheckCircle2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import heroImage from "@/assets/clinica-hero.png";

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

const NAV = [
  { label: "Home", to: "/" as const },
];

const FEATURES = [
  "Agenda Online",
  "WhatsApp",
  "Prontuário Eletrônico",
  "Assinatura Digital",
  "Telemedicina",
  "Convênios",
  "Emissão NFs-e",
  "Gestão Financeira",
  "Estoque",
  "Agente de IA",
  "Totem & Painel",
  "Reconhecimento Facial",
  "Rateio Automático",
  "Pagamento por Voz",
  "Power BI",
  "Multi-clínica",
  "Marketing & CRM",
  "+30 recursos",
];

function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* HEADER */}
      <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Activity className="h-5 w-5" />
            </div>
            <span className="text-xl font-bold tracking-tight text-primary">
              ClinicaOS
            </span>
          </Link>

          <nav className="hidden items-center gap-8 md:flex">
            {NAV.map((n) => (
              <Link
                key={n.label}
                to={n.to}
                className="text-sm font-medium text-foreground/80 transition-colors hover:text-primary"
              >
                {n.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="lg" className="rounded-full hidden sm:inline-flex">
              <Link to="/paciente/consultas">Sou Paciente</Link>
            </Button>
            <Button asChild size="lg" className="rounded-full bg-[oklch(0.45_0.18_260)] text-white hover:bg-[oklch(0.40_0.18_260)]">
              <Link to="/login">
                Sou Cliente (Entrar) <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute -left-20 top-20 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
        <div className="pointer-events-none absolute right-0 bottom-0 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />

        <div className="mx-auto grid max-w-7xl items-center gap-12 px-6 py-16 md:grid-cols-2 md:py-24">
          <div>
            <h1 className="text-4xl font-bold leading-tight tracking-tight text-primary md:text-5xl lg:text-6xl">
              Sistema para clínicas
              <br />
              de multi especialidades
            </h1>

            <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">
              Junte-se a profissionais da saúde de todo o Brasil e melhore sua
              gestão com a <span className="font-semibold text-foreground">ClinicaOS</span>.
              Ganhe tempo organizando sua agenda e gerencie melhor sua clínica com
              o software mais completo e fácil de usar.
            </p>

            <ul className="mt-8 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
              {FEATURES.map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm text-foreground">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>

          </div>

          <div className="relative">
            <img
              src={heroImage}
              alt="Dashboard ClinicaOS — visão completa da clínica"
              width={1024}
              height={1024}
              className="w-full drop-shadow-2xl"
            />
          </div>
        </div>
      </section>

      {/* RECURSOS */}
      <section id="recursos" className="border-t border-border bg-muted/30 py-20">
        <div className="mx-auto max-w-6xl px-6 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            Tudo que sua clínica precisa em <span className="text-primary">um só lugar</span>
          </h2>
          <p className="mt-4 text-muted-foreground">
            Multi-unidade, multi-especialidade, com receita e despesa separadas por clínica.
          </p>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {[
              { title: "Agenda & Recepção", desc: "Totem com reconhecimento facial, painel de chamada em tempo real e fila por prioridade." },
              { title: "Financeiro Inteligente", desc: "Rateio automático médico/clínica, integração Pix/Cartão (PayTime + PagSeguro), DRE por unidade." },
              { title: "IA & Atendimento", desc: "Pagamento por voz no totem, triagem inteligente e agente de IA 24/7." },
            ].map((c) => (
              <div
                key={c.title}
                className="rounded-2xl border border-border bg-card p-8 text-left shadow-sm transition-shadow hover:shadow-lg"
              >
                <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-semibold text-foreground">{c.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{c.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA FINAL */}
      <section id="contato" className="py-20">
        <div className="mx-auto max-w-4xl rounded-3xl bg-primary px-8 py-16 text-center text-primary-foreground">
          <h2 className="text-3xl font-bold md:text-4xl">
            Pronto para modernizar sua clínica?
          </h2>
          <p className="mt-3 text-primary-foreground/90">
            Teste grátis. Sem cartão de crédito.
          </p>
          <Button
            asChild
            size="lg"
            className="mt-8 rounded-full bg-white px-10 text-primary hover:bg-white/90"
          >
            <Link to="/signup">
              Começar agora <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} ClinicaOS — Gestão para clínicas multi-especialidade
      </footer>
    </div>
  );
}
