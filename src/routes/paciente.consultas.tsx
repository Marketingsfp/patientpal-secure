import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Activity, Video, ClipboardList, LogOut, Calendar } from "lucide-react";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";

export const Route = createFileRoute("/paciente/consultas")({
  component: MinhasConsultasPage,
  head: () => ({
    meta: [
      { title: "Minhas consultas — ClinicaOS" },
      { name: "description", content: "Veja suas consultas marcadas, preencha anamneses e entre na sala de telemedicina." },
    ],
  }),
});

interface Consulta {
  id: string; inicio: string; fim: string; status: string;
  teleconsulta: boolean; token_publico: string; procedimento: string | null;
  paciente_nome: string; medico_nome: string | null;
  medico_especialidade: string | null; clinica_nome: string | null;
}

function MinhasConsultasPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [consultas, setConsultas] = useState<Consulta[]>([]);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate({ to: "/login", search: { redirect: "/paciente/consultas" } as any });
        return;
      }
      setUserEmail(session.user.email ?? null);
      const { data, error } = await supabase.rpc("minhas_consultas");
      if (error) mostrarErro(error);
      else setConsultas((data ?? []) as Consulta[]);
      setLoading(false);
    })();
  }, [navigate]);

  async function sair() {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  }

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
        <nav className="mx-auto max-w-2xl px-4 pb-2 flex gap-2 text-sm overflow-x-auto">
          <Link to="/paciente" className="px-3 py-1.5 rounded-md hover:bg-muted whitespace-nowrap">Início</Link>
          <Link to="/paciente/consultas" className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground whitespace-nowrap">Consultas</Link>
          <Link to="/paciente/cartoes" className="px-3 py-1.5 rounded-md hover:bg-muted whitespace-nowrap">Cartões</Link>
          <Link to="/paciente/financeiro" className="px-3 py-1.5 rounded-md hover:bg-muted whitespace-nowrap">Financeiro</Link>
          <Link to="/paciente/perfil" className="px-3 py-1.5 rounded-md hover:bg-muted whitespace-nowrap">Perfil</Link>
        </nav>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-4">
        <h1 className="text-xl font-bold">Minhas consultas</h1>
        {userEmail && <p className="text-xs text-muted-foreground">{userEmail}</p>}

        {loading ? (
          <p className="mt-6 text-sm text-muted-foreground">Carregando…</p>
        ) : consultas.length === 0 ? (
          <Card className="mt-6 p-6 text-center text-sm text-muted-foreground">
            Nenhuma consulta encontrada para o seu e-mail.
            <br />
            Confirme com a clínica se o cadastro do paciente usa este mesmo e-mail.
          </Card>
        ) : (
          <div className="mt-4 space-y-3">
            {consultas.map((c) => {
              const dt = new Date(c.inicio);
              const dataFmt = dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
              const horaFmt = dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
              return (
                <Card key={c.id} className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="text-center bg-primary/10 rounded-lg px-3 py-2 min-w-16">
                      <p className="text-xs uppercase text-muted-foreground">{dataFmt.split(" ")[1]}</p>
                      <p className="font-bold text-lg leading-tight">{dataFmt.split(" ")[0]}</p>
                      <p className="text-xs text-primary font-medium">{horaFmt}</p>
                    </div>
                    <div className="flex-1 min-w-0">
                      {c.medico_nome && (
                        <p className="font-semibold truncate">Dr(a). {c.medico_nome}</p>
                      )}
                      {c.medico_especialidade && (
                        <p className="text-xs text-muted-foreground">{c.medico_especialidade}</p>
                      )}
                      {c.procedimento && (
                        <p className="text-xs text-muted-foreground truncate">{c.procedimento}</p>
                      )}
                      {c.clinica_nome && (
                        <p className="text-xs text-muted-foreground truncate">{c.clinica_nome}</p>
                      )}
                      <p className="text-xs mt-1 capitalize">{c.status}</p>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Link to="/p/$token" params={{ token: c.token_publico }} className="contents">
                      <Button variant="outline" size="sm" className="w-full">
                        <ClipboardList className="h-4 w-4 mr-1" /> Anamnese
                      </Button>
                    </Link>
                    <Link
                      to="/p/$token"
                      params={{ token: c.token_publico }}
                      search={{} as any}
                      className="contents"
                    >
                      <Button size="sm" className="w-full">
                        <Video className="h-4 w-4 mr-1" /> Entrar
                      </Button>
                    </Link>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        <Card className="mt-6 p-4 text-xs text-muted-foreground flex items-start gap-2">
          <Calendar className="h-4 w-4 mt-0.5 shrink-0" />
          <span>Você recebe um <strong>link único</strong> da clínica por SMS/WhatsApp. Esse portal mostra todas as suas consultas cadastradas com este e-mail.</span>
        </Card>
      </main>
    </div>
  );
}