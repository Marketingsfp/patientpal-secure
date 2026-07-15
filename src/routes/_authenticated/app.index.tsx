import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Users, HeartPulse, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useClinica } from "@/hooks/use-clinica";
import { Card } from "@/components/ui/card";
import { setSubsystem, SUBSYSTEMS, type SubsystemId } from "@/lib/subsystem";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/app/")({
  component: SubsystemChooser,
  head: () => ({ meta: [{ title: "Sistemas — ClinicaOS" }] }),
});

type CardDef = {
  id: SubsystemId;
  title: string;
  desc: string;
  icon: typeof Users;
  accent: string;
};

const CARDS: CardDef[] = [
  {
    id: "recepcao",
    title: "Gestor Clínico",
    desc: "Agenda, atendimento, financeiro, marketing, cadastros e gestão.",
    icon: HeartPulse,
    accent: "var(--primary)",
  },
];

function corDaClinica(nome?: string): string {
  const n = (nome ?? "").toLowerCase();
  if (n.includes("são francisco") || n.includes("sao francisco")) return "#006634";
  if (n.includes("menino jesus")) return "#15274f";
  if (n.includes("consulta hoje")) return "#141395";
  return "#15274f";
}

function SubsystemChooser() {
  const { user } = useAuth();
  const { clinicaAtual, modoTodas, branding } = useClinica();
  const navigate = useNavigate();
  const [nome, setNome] = useState<string>("");

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    supabase.from("profiles").select("nome").eq("id", user.id).maybeSingle()
      .then((res: { data: { nome: string | null } | null }) => {
        if (!cancelled && res.data?.nome) setNome(res.data.nome.split(" ")[0]);
      });
    return () => { cancelled = true; };
  }, [user?.id]);

  const saudacao = nome || (user?.email ? user.email.split("@")[0] : "");

  const escolher = (id: SubsystemId) => {
    setSubsystem(id);
    // Redireciona para a primeira tela útil do subsistema
    const destino = id === "gestao-pessoas" ? "/app/hr-ponto" : "/app/painel";
    navigate({ to: destino });
  };

  const filtrados = CARDS;

  const headerColor = modoTodas
    ? "#15274f"
    : branding?.primary
      ? branding.primary
      : clinicaAtual
        ? corDaClinica(clinicaAtual.clinica.nome)
        : "#15274f";

  return (
    <div className="-m-3 sm:-m-4 lg:-m-6 min-h-[calc(100vh-3.5rem)] flex flex-col">
      {/* Header escuro com saudação e busca */}
      <div className="text-white px-6 sm:px-10 pt-8 pb-16" style={{ backgroundColor: headerColor }}>
        <div className="mx-auto max-w-6xl">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
            Olá, {saudacao}!
          </h1>
        </div>
      </div>

      {/* Cards dos subsistemas */}
      <div className="flex-1 px-6 sm:px-10 -mt-10">
        <div className="mx-auto max-w-6xl grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtrados.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => escolher(c.id)}
              className="text-left group"
            >
              <Card className="p-6 h-full bg-white border shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all rounded-2xl">
                <div
                  className="h-16 w-16 rounded-2xl flex items-center justify-center mb-5"
                  style={{ backgroundColor: `color-mix(in oklab, ${c.accent} 12%, transparent)`, color: c.accent }}
                >
                  <c.icon className="h-8 w-8" strokeWidth={1.75} />
                </div>
                <h2 className="text-xl font-bold text-foreground mb-2">{c.title}</h2>
                <p className="text-sm text-muted-foreground leading-relaxed">{c.desc}</p>
              </Card>
            </button>
          ))}
          {filtrados.length === 0 && (
            <p className="text-sm text-muted-foreground col-span-full text-center py-10">
              Nenhum subsistema disponível.
            </p>
          )}
        </div>
      </div>

      {/* Rodapé de status */}
      <footer className="mt-10 px-6 sm:px-10 py-4 border-t bg-card flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <span className="font-semibold text-foreground">ClinicaOS</span>
        <span className="flex-1" />
        <span className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          Todos os sistemas operando normalmente.
        </span>
      </footer>
    </div>
  );
}
