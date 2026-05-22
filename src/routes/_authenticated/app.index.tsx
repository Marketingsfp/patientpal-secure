import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Users, ConciergeBell, Search, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Input } from "@/components/ui/input";
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
    title: "Recepção",
    desc: "Agenda, atendimento, financeiro, marketing, cadastros e gestão.",
    icon: ConciergeBell,
    accent: "var(--primary)",
  },
  {
    id: "gestao-pessoas",
    title: "Gestão de Pessoas",
    desc: "Ponto, férias, holerites, treinamentos e cursos.",
    icon: Users,
    accent: "var(--primary)",
  },
];

function SubsystemChooser() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [busca, setBusca] = useState("");
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

  const filtrados = CARDS.filter((c) => {
    if (!busca.trim()) return true;
    const q = busca.toLowerCase();
    return c.title.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q);
  });

  return (
    <div className="-m-3 sm:-m-4 lg:-m-6 min-h-[calc(100vh-3.5rem)] flex flex-col">
      {/* Header escuro com saudação e busca */}
      <div className="bg-[#15274f] text-white px-6 sm:px-10 pt-8 pb-16">
        <div className="mx-auto max-w-6xl flex flex-col md:flex-row md:items-center gap-4 md:gap-8">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight whitespace-nowrap">
            Olá, {saudacao}!
          </h1>
          <div className="relative flex-1 max-w-2xl">
            <Search className="h-5 w-5 absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar subsistema ou módulo..."
              className="h-12 pl-12 rounded-full bg-white text-foreground placeholder:text-muted-foreground border-0 shadow-sm"
            />
          </div>
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
              Nenhum subsistema encontrado para "{busca}".
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
