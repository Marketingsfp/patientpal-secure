import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Activity,
  CalendarPlus,
  CreditCard,
  FileText,
  ShieldCheck,
  Clock,
  Smartphone,
  ArrowRight,
  LogOut,
  MessageCircle,
} from "lucide-react";

export const Route = createFileRoute("/online")({
  component: AutoatendimentoOnlinePage,
  head: () => ({
    meta: [
      { title: "Autoatendimento Online — Agende, pague e veja seus exames" },
      {
        name: "description",
        content:
          "Portal de autoatendimento da clínica: agende consultas e exames, pague pendências e 2ª via de boletos e acompanhe seus resultados online.",
      },
      { property: "og:title", content: "Autoatendimento Online — Clínica" },
      {
        property: "og:description",
        content: "Agende consultas e exames, resolva pagamentos e acesse seus resultados sem sair de casa.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

const SERVICOS = [
  {
    to: "/paciente/consultas",
    icon: CalendarPlus,
    titulo: "Agendar consulta ou exame",
    desc: "Escolha especialidade, veja horários livres e confirme em poucos toques.",
    acao: "Agendar agora",
  },
  {
    to: "/paciente/financeiro",
    icon: CreditCard,
    titulo: "Pagamentos e 2ª via",
    desc: "Quite pendências, emita a segunda via de boletos e acompanhe mensalidades.",
    acao: "Ver pendências",
  },
  {
    to: "/paciente/perfil",
    icon: FileText,
    titulo: "Meus dados e resultados",
    desc: "Atualize seu cadastro e acesse laudos, exames e histórico de atendimentos.",
    acao: "Acessar",
  },
] as const;

const VANTAGENS = [
  { icon: Clock, titulo: "24 horas por dia", desc: "Resolva tudo sem depender do horário da recepção." },
  { icon: Smartphone, titulo: "Do celular ou computador", desc: "Interface pensada para telas pequenas e grandes." },
  { icon: ShieldCheck, titulo: "Dados protegidos", desc: "Acesso autenticado e em conformidade com a LGPD." },
];

function AutoatendimentoOnlinePage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState<string | null>(null);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    let ativo = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!ativo) return;
      setEmail(data.session?.user.email ?? null);
      setPronto(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setEmail(session?.user.email ?? null);
    });
    return () => {
      ativo = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function sair() {
    await supabase.auth.signOut();
    navigate({ to: "/online" });
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Activity className="h-4 w-4" />
          </div>
          <span className="font-semibold tracking-tight text-slate-900">Autoatendimento</span>
          <div className="ml-auto flex items-center gap-2">
            {pronto && email ? (
              <>
                <span className="hidden text-xs text-slate-500 sm:inline">{email}</span>
                <Button variant="ghost" size="sm" onClick={sair} className="gap-1">
                  <LogOut className="h-4 w-4" /> Sair
                </Button>
              </>
            ) : (
              <Button asChild size="sm" className="rounded-lg">
                <Link to="/login" search={{ redirect: "/online" } as never}>Entrar</Link>
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-primary">
            <ShieldCheck className="h-3.5 w-3.5" /> Canal oficial do paciente
          </span>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Resolva tudo online, sem fila
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-600">
            Agende consultas e exames, pague pendências ou emita a 2ª via de boletos e acompanhe seus
            resultados e dados cadastrais — de qualquer lugar.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild size="lg" className="h-11 gap-2 rounded-lg">
              <Link to="/paciente/consultas">
                <CalendarPlus className="h-4 w-4" /> Agendar atendimento
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="h-11 gap-2 rounded-lg">
              <Link to="/paciente">
                Área do paciente <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </section>

        <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SERVICOS.map((s) => (
            <Link key={s.to} to={s.to} className="group">
              <Card className="flex h-full flex-col gap-3 rounded-xl border-slate-200 p-6 shadow-sm transition-all group-hover:-translate-y-0.5 group-hover:border-primary/40 group-hover:shadow-md">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <s.icon className="h-5 w-5" />
                </div>
                <h2 className="text-base font-semibold text-slate-900">{s.titulo}</h2>
                <p className="text-sm leading-relaxed text-slate-500">{s.desc}</p>
                <span className="mt-auto inline-flex items-center gap-1 pt-2 text-sm font-medium text-primary">
                  {s.acao} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Card>
            </Link>
          ))}
        </section>

        <section className="mt-8 grid gap-4 sm:grid-cols-3">
          {VANTAGENS.map((v) => (
            <div key={v.titulo} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <v.icon className="h-5 w-5 text-slate-400" />
              <p className="mt-3 text-sm font-semibold text-slate-900">{v.titulo}</p>
              <p className="mt-1 text-sm text-slate-500">{v.desc}</p>
            </div>
          ))}
        </section>

        <section className="mt-8 flex flex-col items-start gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:flex-row sm:items-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
            <MessageCircle className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-slate-900">Precisa de ajuda?</p>
            <p className="text-sm text-slate-500">
              Nossa equipe atende pelo WhatsApp e pelo telefone da unidade durante o horário comercial.
            </p>
          </div>
          <Button asChild variant="outline" className="h-10 rounded-lg">
            <Link to="/paciente">Falar com a clínica</Link>
          </Button>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white py-6">
        <p className="mx-auto max-w-5xl px-4 text-xs text-slate-400">
          Este canal é destinado ao autoatendimento do paciente. Em caso de urgência, procure a unidade
          mais próxima ou ligue para o serviço de emergência.
        </p>
      </footer>
    </div>
  );
}
