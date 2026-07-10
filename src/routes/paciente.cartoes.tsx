import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Activity,
  CreditCard,
  LogOut,
  Calendar,
  Users,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";

export const Route = createFileRoute("/paciente/cartoes")({
  component: MeusCartoesPage,
  head: () => ({
    meta: [
      { title: "Meus cartões — ClinicaOS" },
      {
        name: "description",
        content: "Veja seu cartão benefícios digital, validade, dependentes e mensalidades.",
      },
    ],
  }),
});

interface Mensalidade {
  id: string;
  parcela: number;
  vencimento: string;
  valor: number;
  status: string;
  pago_em: string | null;
}
interface Dependente {
  id: string;
  nome: string;
  parentesco: string | null;
  tipo: string;
}
interface Cartao {
  id: string;
  numero: number;
  data_inicio: string;
  vigencia_meses: number;
  status: string;
  paciente_nome: string;
  validade: string;
  plano_nome: string;
  plano_tipo: string;
  descricao_beneficios: string | null;
  clinica_nome: string | null;
  clinica_telefone: string | null;
  papel: "titular" | "dependente";
  titular_email: string | null;
  dependentes: Dependente[];
  mensalidades: Mensalidade[];
}

function MeusCartoesPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [cartoes, setCartoes] = useState<Cartao[]>([]);

  useEffect(() => {
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        navigate({ to: "/login", search: { redirect: "/paciente/cartoes" } as any });
        return;
      }
      setEmail(session.user.email ?? null);
      const { data, error } = await supabase.rpc("meus_cartoes" as any);
      if (error) mostrarErro(error);
      else setCartoes((data ?? []) as Cartao[]);
      setLoading(false);
    })();
  }, [navigate]);

  async function sair() {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  }

  const fmtMoeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const fmtData = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("pt-BR");

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
          <Link to="/paciente" className="px-3 py-1.5 rounded-md hover:bg-muted whitespace-nowrap">
            Início
          </Link>
          <Link
            to="/paciente/consultas"
            className="px-3 py-1.5 rounded-md hover:bg-muted whitespace-nowrap"
          >
            Consultas
          </Link>
          <Link
            to="/paciente/cartoes"
            className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground whitespace-nowrap"
          >
            Cartões
          </Link>
          <Link
            to="/paciente/financeiro"
            className="px-3 py-1.5 rounded-md hover:bg-muted whitespace-nowrap"
          >
            Financeiro
          </Link>
          <Link
            to="/paciente/perfil"
            className="px-3 py-1.5 rounded-md hover:bg-muted whitespace-nowrap"
          >
            Perfil
          </Link>
        </nav>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-4">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <CreditCard className="h-5 w-5" /> Meus cartões
        </h1>
        {email && <p className="text-xs text-muted-foreground">{email}</p>}

        {loading ? (
          <p className="mt-6 text-sm text-muted-foreground">Carregando…</p>
        ) : cartoes.length === 0 ? (
          <Card className="mt-6 p-6 text-center text-sm text-muted-foreground">
            Nenhum cartão benefícios encontrado para o seu e-mail.
            <br />
            Confirme com a clínica se o cadastro usa este mesmo e-mail.
          </Card>
        ) : (
          <div className="mt-4 space-y-6">
            {cartoes.map((c) => {
              const isVerde = c.plano_tipo === "cartao_consulta";
              const proxima = c.mensalidades.find((m) => m.status === "aberto");
              const pagas = c.mensalidades.filter((m) => m.status === "pago").length;
              return (
                <div key={c.id} className="space-y-3">
                  {/* Carteirinha digital */}
                  <div
                    className={`rounded-2xl p-5 text-white shadow-lg ${isVerde ? "bg-gradient-to-br from-emerald-600 to-emerald-800" : "bg-gradient-to-br from-blue-600 to-blue-900"}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs uppercase tracking-wider opacity-80">
                        {c.plano_nome}
                      </span>
                      <CreditCard className="h-5 w-5 opacity-80" />
                    </div>
                    <p className="mt-4 text-lg font-semibold leading-tight">{c.paciente_nome}</p>
                    <p className="text-xs opacity-80 capitalize">{c.papel}</p>
                    <div className="mt-4 flex items-end justify-between text-xs">
                      <div>
                        <p className="opacity-70">Contrato</p>
                        <p className="font-mono font-semibold">
                          Nº {String(c.numero).padStart(5, "0")}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="opacity-70">Validade</p>
                        <p className="font-semibold">{fmtData(c.validade)}</p>
                      </div>
                    </div>
                    {c.clinica_nome && (
                      <p className="mt-3 text-xs opacity-80 border-t border-white/20 pt-2">
                        {c.clinica_nome}
                        {c.clinica_telefone ? ` · ${c.clinica_telefone}` : ""}
                      </p>
                    )}
                  </div>

                  {c.descricao_beneficios && (
                    <Card className="p-3 text-xs text-muted-foreground whitespace-pre-wrap">
                      {c.descricao_beneficios}
                    </Card>
                  )}

                  {c.dependentes.length > 0 && (
                    <Card className="p-3">
                      <p className="text-xs font-semibold flex items-center gap-1 mb-2">
                        <Users className="h-3.5 w-3.5" /> Dependentes ({c.dependentes.length})
                      </p>
                      <ul className="space-y-1 text-sm">
                        {c.dependentes.map((d) => (
                          <li key={d.id} className="flex justify-between">
                            <span>{d.nome}</span>
                            <span className="text-xs text-muted-foreground">
                              {d.parentesco || d.tipo}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </Card>
                  )}

                  <Card className="p-3">
                    <p className="text-xs font-semibold flex items-center gap-1 mb-2">
                      <Calendar className="h-3.5 w-3.5" /> Mensalidades
                    </p>
                    {proxima ? (
                      <div className="mb-2 p-2 rounded-md bg-amber-50 dark:bg-amber-950/30 text-xs flex items-center gap-2">
                        <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
                        <span>
                          Próximo vencimento: <strong>{fmtData(proxima.vencimento)}</strong> —{" "}
                          {fmtMoeda(Number(proxima.valor))}
                        </span>
                      </div>
                    ) : (
                      <div className="mb-2 p-2 rounded-md bg-emerald-50 dark:bg-emerald-950/30 text-xs flex items-center gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Tudo em dia
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground mb-2">
                      {pagas} de {c.mensalidades.length} parcelas pagas
                    </p>
                    <ul className="space-y-1 text-xs max-h-40 overflow-y-auto">
                      {c.mensalidades.map((m) => (
                        <li
                          key={m.id}
                          className="flex justify-between border-b border-border/40 py-1"
                        >
                          <span>
                            #{m.parcela} · {fmtData(m.vencimento)}
                          </span>
                          <span className="flex items-center gap-2">
                            {fmtMoeda(Number(m.valor))}
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] uppercase ${m.status === "pago" ? "bg-emerald-100 text-emerald-700" : m.status === "atrasado" ? "bg-red-100 text-red-700" : "bg-muted text-muted-foreground"}`}
                            >
                              {m.status}
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </Card>
                </div>
              );
            })}
          </div>
        )}

        <Card className="mt-6 p-4 text-xs text-muted-foreground">
          O pagamento é feito diretamente na clínica. Em caso de dúvidas, entre em contato pelo
          telefone informado no cartão.
        </Card>
      </main>
    </div>
  );
}
