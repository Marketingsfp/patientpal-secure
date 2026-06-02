import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { MiniBarChart } from "@/components/charts/MiniBarChart";
import { MiniPieChart } from "@/components/charts/MiniPieChart";
import { exportToExcel } from "@/lib/export-csv";
import { toast } from "sonner";
import {
  Download, CalendarDays, Users, ClipboardList, FileText, DollarSign,
  Stethoscope, Clock, Brain, FlaskConical, BellRing, FileHeart, Target,
  CreditCard, ShieldCheck, Building2, BookOpen, MessageCircle, Bell, Workflow,
  HeartPulse, LayoutDashboard, TrendingUp, TrendingDown, Wallet,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/relatorios")({
  component: RelatoriosPage,
});

type Relatorio = {
  id: string;
  titulo: string;
  descricao: string;
  icon: React.ComponentType<any>;
  cor: string;
  usaPeriodo?: boolean;
  carregar: (ctx: { clinicaId: string; ini?: string; fim?: string }) => Promise<Record<string, unknown>[]>;
};

const hoje = new Date().toISOString().slice(0, 10);
const mesAtras = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

const RELATORIOS: Relatorio[] = [
  {
    id: "agendamentos",
    titulo: "Agenda / Agendamentos",
    descricao: "Todos agendamentos no período selecionado.",
    icon: CalendarDays,
    cor: "#60a5fa",
    usaPeriodo: true,
    carregar: async ({ clinicaId, ini, fim }) => {
      const { data, error } = await supabase
        .from("agendamentos")
        .select("inicio, fim, status, observacoes, procedimento, paciente_nome, pacientes(nome), medicos(nome)")
        .eq("clinica_id", clinicaId)
        .gte("inicio", ini!)
        .lte("inicio", fim! + "T23:59:59")
        .order("inicio");
      if (error) { console.error("relatorio agendamentos:", error); throw error; }
      return (data ?? []).map((r: any) => ({
        Inicio: r.inicio, Fim: r.fim, Status: r.status,
        Paciente: r.pacientes?.nome ?? r.paciente_nome ?? "",
        Medico: r.medicos?.nome ?? "",
        "Serviço": r.procedimento ?? "",
        Observacao: r.observacoes ?? "",
      }));
    },
  },
  {
    id: "pacientes",
    titulo: "Clientes / Pacientes",
    descricao: "Cadastro completo de pacientes.",
    icon: Users, cor: "#c084fc",
    carregar: async ({ clinicaId }) => {
      const { data } = await supabase.from("pacientes")
        .select("nome, cpf, telefone, email, data_nascimento, sexo, created_at")
        .eq("clinica_id", clinicaId).order("nome");
      return (data ?? []) as any;
    },
  },
  {
    id: "procedimentos",
    titulo: "Serviços",
    descricao: "Catálogo de serviços e valores.",
    icon: ClipboardList, cor: "#fb923c",
    carregar: async ({ clinicaId }) => {
      const { data } = await supabase.from("procedimentos")
        .select("nome, codigo, valor, duracao_min, ativo")
        .eq("clinica_id", clinicaId).order("nome");
      return (data ?? []) as any;
    },
  },
  {
    id: "orcamentos",
    titulo: "Orçamentos",
    descricao: "Orçamentos emitidos no período.",
    icon: FileText, cor: "#34d399",
    usaPeriodo: true,
    carregar: async ({ clinicaId, ini, fim }) => {
      const { data } = await supabase.from("orcamentos")
        .select("numero, status, valor_total, desconto, valor_final, created_at, pacientes(nome)")
        .eq("clinica_id", clinicaId)
        .gte("created_at", ini!).lte("created_at", fim! + "T23:59:59")
        .order("created_at", { ascending: false });
      return (data ?? []).map((r: any) => ({
        Numero: r.numero, Status: r.status, Paciente: r.pacientes?.nome ?? "",
        Valor: r.valor_total, Desconto: r.desconto, Final: r.valor_final, Data: r.created_at,
      }));
    },
  },
  {
    id: "financeiro",
    titulo: "Financeiro — Lançamentos",
    descricao: "Receitas e despesas no período.",
    icon: DollarSign, cor: "#facc15",
    usaPeriodo: true,
    carregar: async ({ clinicaId, ini, fim }) => {
      const { data, error } = await supabase.from("fin_lancamentos")
        .select("data, tipo, descricao, valor, status, forma_pagamento, observacoes, fin_categorias(nome), fin_contas(nome), pacientes(nome), medicos(nome)")
        .eq("clinica_id", clinicaId)
        .gte("data", ini!).lte("data", fim!)
        .order("data", { ascending: false });
      if (error) { console.error("relatorio financeiro:", error); throw error; }
      return (data ?? []).map((r: any) => ({
        Data: r.data,
        Tipo: r.tipo,
        Descrição: r.descricao,
        Categoria: r.fin_categorias?.nome ?? "",
        Conta: r.fin_contas?.nome ?? "",
        Paciente: r.pacientes?.nome ?? "",
        Médico: r.medicos?.nome ?? "",
        "Forma de pagamento": r.forma_pagamento ?? "",
        Status: r.status,
        Valor: r.valor,
        Observações: r.observacoes ?? "",
      }));
    },
  },
  {
    id: "contratos",
    titulo: "Cartão Benefícios / Contratos",
    descricao: "Contratos de assinatura e mensalidades.",
    icon: CreditCard, cor: "#22d3ee",
    carregar: async ({ clinicaId }) => {
      const { data } = await supabase.from("contratos_assinatura")
        .select("numero, status, valor_mensal, data_inicio, data_fim, pacientes(nome), planos_assinatura(nome)")
        .eq("clinica_id", clinicaId).order("data_inicio", { ascending: false });
      return (data ?? []).map((r: any) => ({
        Numero: r.numero, Status: r.status, Paciente: r.pacientes?.nome ?? "",
        Plano: r.planos_assinatura?.nome ?? "", ValorMensal: r.valor_mensal,
        Inicio: r.data_inicio, Fim: r.data_fim,
      }));
    },
  },
  {
    id: "crm",
    titulo: "CRM — Oportunidades",
    descricao: "Funil de vendas e oportunidades.",
    icon: Target, cor: "#f472b6",
    carregar: async ({ clinicaId }) => {
      const { data } = await supabase.from("crm_oportunidades")
        .select("titulo, valor, status, created_at, crm_etapas(nome), pacientes(nome)")
        .eq("clinica_id", clinicaId).order("created_at", { ascending: false });
      return (data ?? []).map((r: any) => ({
        Titulo: r.titulo, Etapa: r.crm_etapas?.nome ?? "", Status: r.status,
        Valor: r.valor, Paciente: r.pacientes?.nome ?? "", Data: r.created_at,
      }));
    },
  },
  {
    id: "medicos",
    titulo: "Médicos",
    descricao: "Cadastro de médicos.",
    icon: Stethoscope, cor: "#fda4af",
    carregar: async ({ clinicaId }) => {
      const { data } = await supabase.from("medicos")
        .select("nome, crm, uf_crm, telefone, email, ativo")
        .eq("clinica_id", clinicaId).order("nome");
      return (data ?? []) as any;
    },
  },
  {
    id: "especialidades",
    titulo: "Especialidades",
    descricao: "Lista de especialidades.",
    icon: Stethoscope, cor: "#f0abfc",
    carregar: async ({ clinicaId }) => {
      const { data } = await supabase.from("especialidades")
        .select("nome, descricao, ativo").order("nome");
      void clinicaId;
      return (data ?? []) as any;
    },
  },
  {
    id: "disponibilidades",
    titulo: "Horários médicos",
    descricao: "Disponibilidades cadastradas.",
    icon: Clock, cor: "#a78bfa",
    carregar: async ({ clinicaId }) => {
      const { data } = await supabase.from("medico_disponibilidades")
        .select("dia_semana, hora_inicio, hora_fim, intervalo_min, limite_pacientes_dia, medicos(nome)")
        .eq("clinica_id", clinicaId);
      return (data ?? []).map((r: any) => ({
        Medico: r.medicos?.nome ?? "", DiaSemana: r.dia_semana,
        Inicio: r.hora_inicio, Fim: r.hora_fim,
        IntervaloMin: r.intervalo_min, LimitePacientesDia: r.limite_pacientes_dia,
      }));
    },
  },
  {
    id: "exames",
    titulo: "Resultados de Exames",
    descricao: "Resultados de exames registrados.",
    icon: FlaskConical, cor: "#fde047",
    usaPeriodo: true,
    carregar: async ({ clinicaId, ini, fim }) => {
      const { data } = await supabase.from("exame_resultados")
        .select("tipo_exame, status, data_exame, observacoes, pacientes(nome)")
        .eq("clinica_id", clinicaId)
        .gte("data_exame", ini!).lte("data_exame", fim!)
        .order("data_exame", { ascending: false });
      return (data ?? []).map((r: any) => ({
        Paciente: r.pacientes?.nome ?? "", Exame: r.tipo_exame,
        Status: r.status, Data: r.data_exame, Observacoes: r.observacoes ?? "",
      }));
    },
  },
  {
    id: "alertas",
    titulo: "Enfermeira IA — Alertas",
    descricao: "Alertas gerados pela IA.",
    icon: BellRing, cor: "#ef4444",
    carregar: async ({ clinicaId }) => {
      const { data } = await supabase.from("alertas_enfermagem")
        .select("titulo, descricao, severidade, status, created_at, pacientes(nome)")
        .eq("clinica_id", clinicaId).order("created_at", { ascending: false });
      return (data ?? []).map((r: any) => ({
        Titulo: r.titulo, Severidade: r.severidade, Status: r.status,
        Paciente: r.pacientes?.nome ?? "", Descricao: r.descricao, Data: r.created_at,
      }));
    },
  },
  {
    id: "prontuarios",
    titulo: "Prontuários",
    descricao: "Prontuários e atendimentos.",
    icon: FileHeart, cor: "#f9a8d4",
    usaPeriodo: true,
    carregar: async ({ clinicaId, ini, fim }) => {
      const { data } = await supabase.from("prontuarios")
        .select("data_atendimento, queixa_principal, hipotese_diagnostica, conduta, pacientes(nome), medicos(nome)")
        .eq("clinica_id", clinicaId)
        .gte("data_atendimento", ini!).lte("data_atendimento", fim! + "T23:59:59")
        .order("data_atendimento", { ascending: false });
      return (data ?? []).map((r: any) => ({
        Data: r.data_atendimento, Paciente: r.pacientes?.nome ?? "",
        Medico: r.medicos?.nome ?? "", Queixa: r.queixa_principal,
        Hipotese: r.hipotese_diagnostica, Conduta: r.conduta,
      }));
    },
  },
  {
    id: "auditoria",
    titulo: "Auditoria",
    descricao: "Histórico de alterações.",
    icon: ShieldCheck, cor: "#f87171",
    usaPeriodo: true,
    carregar: async ({ clinicaId, ini, fim }) => {
      const { data } = await supabase.from("audit_log")
        .select("created_at, user_email, action, table_name, record_id")
        .eq("clinica_id", clinicaId)
        .gte("created_at", ini!).lte("created_at", fim! + "T23:59:59")
        .order("created_at", { ascending: false }).limit(5000);
      return (data ?? []) as any;
    },
  },
  {
    id: "documentos",
    titulo: "Documentos emitidos",
    descricao: "Documentos gerados no período.",
    icon: FileText, cor: "#34d399",
    usaPeriodo: true,
    carregar: async ({ clinicaId, ini, fim }) => {
      const { data } = await supabase.from("documentos_emitidos")
        .select("tipo, titulo, created_at, pacientes(nome), medicos(nome)")
        .eq("clinica_id", clinicaId)
        .gte("created_at", ini!).lte("created_at", fim! + "T23:59:59")
        .order("created_at", { ascending: false });
      return (data ?? []).map((r: any) => ({
        Data: r.created_at, Tipo: r.tipo, Titulo: r.titulo,
        Paciente: r.pacientes?.nome ?? "", Medico: r.medicos?.nome ?? "",
      }));
    },
  },
  {
    id: "equipe",
    titulo: "Equipe",
    descricao: "Membros da clínica.",
    icon: Users, cor: "#93c5fd",
    carregar: async ({ clinicaId }) => {
      const { data } = await supabase.from("clinica_memberships")
        .select("role, created_at, profiles(nome, email)")
        .eq("clinica_id", clinicaId);
      return (data ?? []).map((r: any) => ({
        Nome: r.profiles?.nome ?? "", Email: r.profiles?.email ?? "",
        Papel: r.role, Desde: r.created_at,
      }));
    },
  },
  {
    id: "clinicas",
    titulo: "Clínicas",
    descricao: "Dados da clínica.",
    icon: Building2, cor: "#22d3ee",
    carregar: async ({ clinicaId }) => {
      const { data } = await supabase.from("clinicas")
        .select("nome, cnpj, telefone, email, endereco, created_at").eq("id", clinicaId);
      return (data ?? []) as any;
    },
  },
  {
    id: "triagem-enfermagem",
    titulo: "Triagem — Enfermagem",
    descricao: "Atendimentos iniciais da enfermagem com sinais vitais, doenças e medicamentos.",
    icon: HeartPulse, cor: "#ef4444",
    usaPeriodo: true,
    carregar: async ({ clinicaId, ini, fim }) => {
      const { data } = await supabase
        .from("triagens_enfermagem")
        .select("created_at, enfermeira_nome, peso_kg, altura_cm, imc, pa_sistolica, pa_diastolica, freq_cardiaca, temperatura, saturacao, glicemia, queixa_principal, doencas, medicamentos, alergias, observacoes, pacientes(nome, cpf), agendamentos(inicio, procedimento)")
        .eq("clinica_id", clinicaId)
        .gte("created_at", ini! + "T00:00:00")
        .lte("created_at", fim! + "T23:59:59")
        .order("created_at", { ascending: false });
      return (data ?? []).map((r: any) => ({
        Data: r.created_at,
        Paciente: r.pacientes?.nome ?? "",
        CPF: r.pacientes?.cpf ?? "",
        Agendamento: r.agendamentos?.inicio ?? "",
        "Serviço": r.agendamentos?.procedimento ?? "",
        Enfermeira: r.enfermeira_nome ?? "",
        "Peso (kg)": r.peso_kg ?? "",
        "Altura (cm)": r.altura_cm ?? "",
        IMC: r.imc ?? "",
        "PA Sistólica": r.pa_sistolica ?? "",
        "PA Diastólica": r.pa_diastolica ?? "",
        "FC (bpm)": r.freq_cardiaca ?? "",
        "Temperatura (°C)": r.temperatura ?? "",
        "Saturação (%)": r.saturacao ?? "",
        "Glicemia (mg/dL)": r.glicemia ?? "",
        "Queixa principal": r.queixa_principal ?? "",
        Doenças: Array.isArray(r.doencas) ? r.doencas.join(", ") : "",
        Medicamentos: r.medicamentos ?? "",
        Alergias: r.alergias ?? "",
        Observações: r.observacoes ?? "",
      }));
    },
  },
];

function RelatoriosPage() {
  const { clinicaAtual } = useClinica();
  const [ini, setIni] = useState(mesAtras);
  const [fim, setFim] = useState(hoje);
  const [loading, setLoading] = useState<string | null>(null);

  async function baixar(r: Relatorio) {
    if (!clinicaAtual?.clinica_id) {
      toast.error("Selecione uma clínica");
      return;
    }
    setLoading(r.id);
    try {
      const rows = await r.carregar({ clinicaId: clinicaAtual.clinica_id, ini, fim });
      if (rows.length === 0) {
        toast.info("Sem dados no período selecionado.");
        return;
      }
      exportToExcel(rows, `relatorio-${r.id}-${hoje}`);
      toast.success(`${rows.length} registros exportados.`);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao gerar relatório");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Relatórios</h1>
        <p className="text-muted-foreground">Visualize um dashboard ou baixe planilhas Excel.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Período (para relatórios com data)</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-4 items-end">
          <div>
            <Label htmlFor="ini">De</Label>
            <Input id="ini" type="date" value={ini} onChange={(e) => setIni(e.target.value)} className="w-40" />
          </div>
          <div>
            <Label htmlFor="fim">Até</Label>
            <Input id="fim" type="date" value={fim} onChange={(e) => setFim(e.target.value)} className="w-40" />
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="dashboard">
        <TabsList>
          <TabsTrigger value="dashboard" className="gap-2">
            <LayoutDashboard className="h-4 w-4" /> Dashboard
          </TabsTrigger>
          <TabsTrigger value="downloads" className="gap-2">
            <Download className="h-4 w-4" /> Baixar planilhas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-4">
          <DashboardView clinicaId={clinicaAtual?.clinica_id} ini={ini} fim={fim} />
        </TabsContent>

        <TabsContent value="downloads" className="mt-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {RELATORIOS.map((r) => {
          const Icon = r.icon;
          return (
            <Card key={r.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Icon className="h-5 w-5" color={r.cor} />
                  <CardTitle className="text-base">{r.titulo}</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">{r.descricao}</p>
                {r.usaPeriodo && (
                  <p className="text-xs text-muted-foreground">Usa o período acima.</p>
                )}
                <Button
                  onClick={() => baixar(r)}
                  disabled={loading === r.id}
                  size="sm"
                  className="w-full"
                >
                  <Download className="h-4 w-4 mr-2" />
                  {loading === r.id ? "Gerando..." : "Baixar Excel"}
                </Button>
              </CardContent>
            </Card>
          );
        })}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================================
// Dashboard view — KPIs e gráficos no período selecionado
// ============================================================

const fmtBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

interface DashboardData {
  totalAgend: number;
  agendPorStatus: { name: string; value: number }[];
  agendPorMedico: { name: string; value: number }[];
  receitas: number;
  despesas: number;
  finPorCategoria: { name: string; value: number }[];
  finPorDia: { label: string; receita: number; despesa: number }[];
  novosPacientes: number;
  prontuariosCount: number;
}

function DashboardView({
  clinicaId,
  ini,
  fim,
}: {
  clinicaId?: string;
  ini: string;
  fim: string;
}) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!clinicaId) return;
    let cancel = false;
    (async () => {
      setLoading(true);
      try {
        const [agend, fin, pac, pront] = await Promise.all([
          supabase
            .from("agendamentos")
            .select("status, medicos(nome)")
            .eq("clinica_id", clinicaId)
            .gte("inicio", ini)
            .lte("inicio", fim + "T23:59:59"),
          supabase
            .from("fin_lancamentos")
            .select("data, tipo, valor, status, fin_categorias(nome)")
            .eq("clinica_id", clinicaId)
            .gte("data", ini)
            .lte("data", fim),
          supabase
            .from("pacientes")
            .select("id", { count: "exact", head: true })
            .eq("clinica_id", clinicaId)
            .gte("created_at", ini)
            .lte("created_at", fim + "T23:59:59"),
          supabase
            .from("prontuarios")
            .select("id", { count: "exact", head: true })
            .eq("clinica_id", clinicaId)
            .gte("data_atendimento", ini)
            .lte("data_atendimento", fim + "T23:59:59"),
        ]);

        const agendRows = (agend.data ?? []) as any[];
        const statusMap = new Map<string, number>();
        const medicoMap = new Map<string, number>();
        agendRows.forEach((r) => {
          statusMap.set(r.status ?? "—", (statusMap.get(r.status ?? "—") ?? 0) + 1);
          const m = r.medicos?.nome ?? "Sem médico";
          medicoMap.set(m, (medicoMap.get(m) ?? 0) + 1);
        });

        const finRows = ((fin.data ?? []) as any[]).filter(
          (r) => r.status !== "cancelado",
        );
        let receitas = 0;
        let despesas = 0;
        const catMap = new Map<string, number>();
        const diaMap = new Map<string, { receita: number; despesa: number }>();
        finRows.forEach((r) => {
          const v = Number(r.valor) || 0;
          const dia = (r.data as string).slice(0, 10);
          const bucket = diaMap.get(dia) ?? { receita: 0, despesa: 0 };
          if (r.tipo === "receita") {
            receitas += v;
            bucket.receita += v;
          } else {
            despesas += v;
            bucket.despesa += v;
          }
          diaMap.set(dia, bucket);
          const cat = r.fin_categorias?.nome ?? "Sem categoria";
          catMap.set(cat, (catMap.get(cat) ?? 0) + v);
        });

        const finPorDia = Array.from(diaMap.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([dia, v]) => ({
            label: dia.slice(8, 10) + "/" + dia.slice(5, 7),
            receita: v.receita,
            despesa: v.despesa,
          }));

        if (cancel) return;
        setData({
          totalAgend: agendRows.length,
          agendPorStatus: Array.from(statusMap, ([name, value]) => ({ name, value })),
          agendPorMedico: Array.from(medicoMap, ([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 8),
          receitas,
          despesas,
          finPorCategoria: Array.from(catMap, ([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 8),
          finPorDia,
          novosPacientes: pac.count ?? 0,
          prontuariosCount: pront.count ?? 0,
        });
      } catch (e: any) {
        console.error("dashboard relatorios:", e);
        toast.error(e?.message ?? "Erro ao carregar dashboard");
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [clinicaId, ini, fim]);

  const saldo = useMemo(
    () => (data ? data.receitas - data.despesas : 0),
    [data],
  );

  if (!clinicaId) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          Selecione uma clínica para visualizar o dashboard.
        </CardContent>
      </Card>
    );
  }

  if (loading || !data) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          Carregando dados…
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={<CalendarDays className="h-5 w-5" />} label="Agendamentos" value={data.totalAgend.toString()} tint="text-blue-600" />
        <Kpi icon={<Users className="h-5 w-5" />} label="Novos pacientes" value={data.novosPacientes.toString()} tint="text-purple-600" />
        <Kpi icon={<FileHeart className="h-5 w-5" />} label="Prontuários" value={data.prontuariosCount.toString()} tint="text-pink-600" />
        <Kpi icon={<Wallet className="h-5 w-5" />} label="Saldo" value={fmtBRL(saldo)} tint={saldo >= 0 ? "text-emerald-600" : "text-red-600"} />
        <Kpi icon={<TrendingUp className="h-5 w-5" />} label="Receitas" value={fmtBRL(data.receitas)} tint="text-emerald-600" />
        <Kpi icon={<TrendingDown className="h-5 w-5" />} label="Despesas" value={fmtBRL(data.despesas)} tint="text-red-600" />
      </div>

      {/* Financeiro por dia */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Receitas vs Despesas (por dia)</CardTitle>
        </CardHeader>
        <CardContent>
          {data.finPorDia.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Sem lançamentos no período.</p>
          ) : (
            <MiniBarChart
              labels={data.finPorDia.map((d) => d.label)}
              series={[
                { name: "Receitas", color: "#10b981", values: data.finPorDia.map((d) => d.receita) },
                { name: "Despesas", color: "#ef4444", values: data.finPorDia.map((d) => d.despesa) },
              ]}
              formatY={(n) => "R$ " + Math.round(n).toLocaleString("pt-BR")}
            />
          )}
        </CardContent>
      </Card>

      {/* Pies */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Agendamentos por status</CardTitle></CardHeader>
          <CardContent>
            <MiniPieChart data={data.agendPorStatus} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Agendamentos por médico (top 8)</CardTitle></CardHeader>
          <CardContent>
            <MiniPieChart data={data.agendPorMedico} />
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Financeiro por categoria (top 8)</CardTitle></CardHeader>
          <CardContent>
            <MiniPieChart data={data.finPorCategoria} formatValue={fmtBRL} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Kpi({
  icon, label, value, tint,
}: { icon: React.ReactNode; label: string; value: string; tint: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className={`flex items-center gap-2 ${tint}`}>{icon}<span className="text-sm text-muted-foreground">{label}</span></div>
        <p className={`text-2xl font-semibold mt-1 ${tint}`}>{value}</p>
      </CardContent>
    </Card>
  );
}