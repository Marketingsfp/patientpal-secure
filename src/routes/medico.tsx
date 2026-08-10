import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Activity, LogOut, Search, User as UserIcon, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/medico")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  component: MedicoHome,
  head: () => ({ meta: [{ title: "Meus pacientes — ClinicaOS" }] }),
});

interface MedicoInfo {
  medico_id: string;
  medico_nome: string;
  clinica_id: string;
}

interface PacienteRow {
  id: string;
  nome: string;
  cpf: string | null;
  telefone: string | null;
  ultimo_atendimento: string | null;
}

function MedicoHome() {
  const navigate = useNavigate();
  const [info, setInfo] = useState<MedicoInfo | null>(null);
  const [pacientes, setPacientes] = useState<PacienteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      setErro(null);

      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) {
        navigate({ to: "/login", replace: true });
        return;
      }

      // Localiza o cadastro de médico vinculado a este usuário
      const { data: medico } = await supabase
        .from("medicos")
        .select("id, nome, clinica_id, ativo")
        .eq("user_id", uid)
        .eq("ativo", true)
        .maybeSingle();

      if (!medico) {
        setErro(
          "Sua conta não está vinculada a um cadastro de médico ativo. Peça para a clínica vincular seu usuário ao seu cadastro.",
        );
        setLoading(false);
        return;
      }

      // Busca pacientes que já tiveram algum agendamento com este médico
      const { data: ags, error: agErr } = await supabase
        .from("agendamentos")
        .select("paciente_id, data_hora, pacientes:paciente_id(id, nome, cpf, telefone)")
        .eq("medico_id", medico.id)
        .order("data_hora", { ascending: false })
        .limit(1000);

      if (agErr) {
        setErro("Não foi possível carregar seus pacientes agora. Tente novamente.");
        setLoading(false);
        return;
      }

      // Deduplica preservando o último atendimento
      const mapa = new Map<string, PacienteRow>();
      for (const a of ags ?? []) {
        const p = (a as unknown as {
          paciente_id: string;
          data_hora: string;
          pacientes: { id: string; nome: string; cpf: string | null; telefone: string | null } | null;
        }).pacientes;
        if (!p) continue;
        if (!mapa.has(p.id)) {
          mapa.set(p.id, {
            id: p.id,
            nome: p.nome,
            cpf: p.cpf,
            telefone: p.telefone,
            ultimo_atendimento:
              (a as unknown as { data_hora: string }).data_hora ?? null,
          });
        }
      }

      if (!cancel) {
        setInfo({
          medico_id: medico.id,
          medico_nome: medico.nome,
          clinica_id: medico.clinica_id,
        });
        setPacientes(Array.from(mapa.values()));
        setLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [navigate]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return pacientes;
    return pacientes.filter(
      (p) =>
        p.nome.toLowerCase().includes(q) ||
        (p.cpf ?? "").toLowerCase().includes(q) ||
        (p.telefone ?? "").toLowerCase().includes(q),
    );
  }, [pacientes, busca]);

  const sair = async () => {
    await supabase.auth.signOut();
    toast.success("Sessão encerrada");
    navigate({ to: "/login", replace: true });
  };

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header enxuto */}
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Activity className="h-4 w-4" />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold">ClinicaOS</div>
              <div className="text-xs text-muted-foreground">
                {info?.medico_nome ? `Dr(a). ${info.medico_nome}` : "Área do médico"}
              </div>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={sair}>
            <LogOut className="mr-2 h-4 w-4" />
            Sair
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        <div className="mb-4">
          <h1 className="text-2xl font-semibold tracking-tight">Meus pacientes</h1>
          <p className="text-sm text-muted-foreground">
            Pacientes que já tiveram agendamento com você.
          </p>
        </div>

        <div className="relative mb-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, CPF ou telefone..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="h-11 pl-9"
          />
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-10 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
          </div>
        ) : erro ? (
          <Card className="p-6 text-center text-sm text-destructive">{erro}</Card>
        ) : filtrados.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            {busca
              ? "Nenhum paciente encontrado para essa busca."
              : "Você ainda não tem pacientes com agendamento registrado."}
          </Card>
        ) : (
          <div className="grid gap-2">
            {filtrados.map((p) => (
              <Card
                key={p.id}
                className="flex items-center justify-between gap-3 p-4 transition hover:bg-accent/40"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <UserIcon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate font-medium">{p.nome}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {[p.cpf, p.telefone].filter(Boolean).join(" · ") || "—"}
                    </div>
                  </div>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  {p.ultimo_atendimento
                    ? new Date(p.ultimo_atendimento).toLocaleDateString("pt-BR")
                    : "—"}
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}