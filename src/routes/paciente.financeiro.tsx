import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Activity, LogOut, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";

export const Route = createFileRoute("/paciente/financeiro")({
  component: PortalFinanceiroPage,
  head: () => ({
    meta: [
      { title: "Financeiro — Portal do Paciente" },
      { name: "description", content: "Acompanhe mensalidades e lançamentos em aberto." },
    ],
  }),
});

interface Mensalidade { id: string; numero_parcela: number; vencimento: string; valor: number; status: string; contrato_numero: number | null; plano_nome: string | null; dias_atraso: number; }
interface Lancamento { id: string; descricao: string; vencimento: string | null; valor: number; dias_atraso: number; }
interface Resumo {
  mensalidades: Mensalidade[];
  lancamentos: Lancamento[];
  total_aberto: number;
  total_atrasado: number;
  qtd_atrasadas: number;
}

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function PortalFinanceiroPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [pacienteIds, setPacienteIds] = useState<string[]>([]);
  const [resumos, setResumos] = useState<Resumo[]>([]);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate({ to: "/login", search: { redirect: "/paciente/financeiro" } as never });
        return;
      }
      const email = session.user.email?.toLowerCase();
      if (!email) { setLoading(false); return; }
      const { data: pacs, error } = await supabase
        .from("pacientes")
        .select("id")
        .ilike("email", email);
      if (error) {
        mostrarErro(error);
        setLoading(false);
        return;
      }
      const ids = (pacs ?? []).map((p: { id: string }) => p.id);
      setPacienteIds(ids);
      const results: Resumo[] = [];
      for (const id of ids) {
        const { data, error: rpcErr } = await supabase.rpc("pendencias_paciente", { _paciente_id: id });
        if (rpcErr) continue;
        if (data) results.push(data as unknown as Resumo);
      }
      setResumos(results);
      setLoading(false);
    })();
  }, [navigate]);

  async function sair() {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  }

  const totalAberto = resumos.reduce((s, r) => s + (Number(r.total_aberto) || 0), 0);
  const totalAtrasado = resumos.reduce((s, r) => s + (Number(r.total_atrasado) || 0), 0);
  const todasMensalidades = resumos.flatMap(r => r.mensalidades ?? []);
  const todosLancamentos = resumos.flatMap(r => r.lancamentos ?? []);

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
          <Link to="/paciente/consultas" className="px-3 py-1.5 rounded-md hover:bg-muted whitespace-nowrap">Consultas</Link>
          <Link to="/paciente/cartoes" className="px-3 py-1.5 rounded-md hover:bg-muted whitespace-nowrap">Cartões</Link>
          <Link to="/paciente/financeiro" className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground whitespace-nowrap">Financeiro</Link>
          <Link to="/paciente/perfil" className="px-3 py-1.5 rounded-md hover:bg-muted whitespace-nowrap">Perfil</Link>
        </nav>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-4 space-y-4">
        <h1 className="text-xl font-bold">Financeiro</h1>

        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : pacienteIds.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            Não encontramos cadastro de paciente com este e-mail.
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Card className="p-4">
                <p className="text-xs text-muted-foreground">Total em aberto</p>
                <p className="text-2xl font-bold mt-1">{fmt(totalAberto)}</p>
              </Card>
              <Card className={`p-4 ${totalAtrasado > 0 ? "border-rose-300 bg-rose-50" : ""}`}>
                <p className="text-xs text-muted-foreground">Em atraso</p>
                <p className={`text-2xl font-bold mt-1 ${totalAtrasado > 0 ? "text-rose-600" : ""}`}>{fmt(totalAtrasado)}</p>
              </Card>
            </div>

            <section>
              <h2 className="font-semibold mb-2">Mensalidades</h2>
              {todasMensalidades.length === 0 ? (
                <Card className="p-4 text-sm text-muted-foreground flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Nenhuma mensalidade em aberto.
                </Card>
              ) : (
                <div className="space-y-2">
                  {todasMensalidades.map(m => (
                    <Card key={m.id} className="p-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{m.plano_nome ?? "Mensalidade"} — parcela {m.numero_parcela}</p>
                        <p className="text-xs text-muted-foreground">
                          Venc. {new Date(m.vencimento).toLocaleDateString("pt-BR")}
                          {m.dias_atraso > 0 && <span className="text-rose-600 ml-1">• {m.dias_atraso}d atraso</span>}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-sm">{fmt(Number(m.valor))}</p>
                        {m.dias_atraso > 0 && <AlertTriangle className="h-4 w-4 text-rose-600 ml-auto" />}
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h2 className="font-semibold mb-2">Outros lançamentos</h2>
              {todosLancamentos.length === 0 ? (
                <Card className="p-4 text-sm text-muted-foreground flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Nenhum lançamento em aberto.
                </Card>
              ) : (
                <div className="space-y-2">
                  {todosLancamentos.map(l => (
                    <Card key={l.id} className="p-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{l.descricao}</p>
                        {l.vencimento && (
                          <p className="text-xs text-muted-foreground">
                            Venc. {new Date(l.vencimento).toLocaleDateString("pt-BR")}
                            {l.dias_atraso > 0 && <span className="text-rose-600 ml-1">• {l.dias_atraso}d atraso</span>}
                          </p>
                        )}
                      </div>
                      <p className="font-bold text-sm">{fmt(Number(l.valor))}</p>
                    </Card>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}