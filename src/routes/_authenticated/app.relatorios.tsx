import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { exportToExcel } from "@/lib/export-csv";
import { toast } from "sonner";
import {
  Download, CalendarDays, Users, ClipboardList, FileText, DollarSign,
  Stethoscope, Clock, Brain, FlaskConical, BellRing, FileHeart, Target,
  CreditCard, ShieldCheck, Building2, BookOpen, MessageCircle, Bell, Workflow,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/relatorios")({
  component: RelatoriosPage,
});

type Relatorio = {
  id: string;
  titulo: string;
  descricao: string;
  icon: React.ComponentType<{ className?: string }>;
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
      const { data } = await supabase
        .from("agendamentos")
        .select("inicio, fim, status, observacao, pacientes(nome), medicos(nome), procedimentos(nome)")
        .eq("clinica_id", clinicaId)
        .gte("inicio", ini!)
        .lte("inicio", fim! + "T23:59:59")
        .order("inicio");
      return (data ?? []).map((r: any) => ({
        Inicio: r.inicio, Fim: r.fim, Status: r.status,
        Paciente: r.pacientes?.nome ?? "", Medico: r.medicos?.nome ?? "",
        Procedimento: r.procedimentos?.nome ?? "", Observacao: r.observacao ?? "",
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
    titulo: "Procedimentos",
    descricao: "Catálogo de procedimentos e valores.",
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
      const { data } = await supabase.from("fin_lancamentos")
        .select("tipo, descricao, valor, data_vencimento, data_pagamento, status, categoria")
        .eq("clinica_id", clinicaId)
        .gte("data_vencimento", ini!).lte("data_vencimento", fim!)
        .order("data_vencimento", { ascending: false });
      return (data ?? []) as any;
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
        .select("nome, descricao, ativo").eq("clinica_id", clinicaId).order("nome");
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
        <p className="text-muted-foreground">Baixe planilhas Excel de cada módulo do sistema.</p>
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {RELATORIOS.map((r) => {
          const Icon = r.icon;
          return (
            <Card key={r.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Icon className="h-5 w-5" style={{ color: r.cor }} />
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
    </div>
  );
}