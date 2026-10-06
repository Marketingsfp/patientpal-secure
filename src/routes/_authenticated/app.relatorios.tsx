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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { exportToExcel } from "@/lib/export-csv";
import { toast } from "sonner";
import { mostrarErro, traduzirErro } from "@/lib/traduzir-erro";
import {
  Download,
  CalendarDays,
  Users,
  ClipboardList,
  FileText,
  DollarSign,
  Stethoscope,
  Clock,
  Brain,
  FlaskConical,
  BellRing,
  FileHeart,
  Target,
  CreditCard,
  ShieldCheck,
  Building2,
  BookOpen,
  MessageCircle,
  Bell,
  Workflow,
  HeartPulse,
  LayoutDashboard,
  TrendingUp,
  TrendingDown,
  Wallet,
  Settings2,
  RotateCcw,
  Boxes,
  PhoneCall,
  CloudRain,
  Sun,
} from "lucide-react";
import { MarcacoesPorAtendente } from "@/components/relatorios/marcacoes-por-atendente";
import { getClimaPeriodo, type ClimaDia } from "@/lib/clima";
import { CuboBI } from "@/components/relatorios/CuboBI";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { DateInputBR } from "@/components/ui/date-input-br";
import { hojeBR } from "@/lib/date-utils";
import { buscarPaginado, type ConsultaPaginavel } from "@/lib/financeiro/paginacao";
import { buscarPorIds, nomesPorId } from "@/lib/relatorios/buscar-por-ids";
import { buscarPorDia } from "@/lib/relatorios/buscar-por-dia";
import { ehVagaLivre, FILTRO_SEM_VAGA_LIVRE } from "@/lib/agenda/vaga-livre";
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
  carregar: (ctx: {
    clinicaId: string;
    ini?: string;
    fim?: string;
  }) => Promise<Record<string, unknown>[]>;
};

// Datas no fuso da clínica, calculadas na hora: `toISOString()` dá o dia em
// UTC, que depois das 21h já é amanhã e deslocava o período padrão.
const hoje = () => hojeBR();
const mesAtras = () => {
  const d = new Date(hojeBR() + "T12:00:00");
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
};

// O PostgREST devolve no máximo 1.000 linhas por pedido; sem paginar, a
// planilha saía cortada em 1.000 sem aviso. `teto` é a trava contra um período
// aberto demais baixar o histórico inteiro para o navegador — quando batido, o
// relatório avisa em vez de entregar meia planilha calada.
const LINHAS_POR_PAGINA = 1000;
async function todas<T>(montar: () => ConsultaPaginavel<T>, teto = 100): Promise<T[]> {
  const rows = await buscarPaginado(montar, { maxPaginas: teto, porOnda: 6 });
  if (rows.length >= teto * LINHAS_POR_PAGINA) {
    throw new Error(
      `O período tem mais de ${(teto * LINHAS_POR_PAGINA).toLocaleString("pt-BR")} registros. Reduza o período e baixe em partes.`,
    );
  }
  return rows;
}

const RELATORIOS: Relatorio[] = [
  {
    id: "agendamentos",
    titulo: "Agenda / Agendamentos",
    descricao: "Todos agendamentos no período selecionado.",
    icon: CalendarDays,
    cor: "#60a5fa",
    usaPeriodo: true,
    carregar: async ({ clinicaId, ini, fim }) => {
      const data = await buscarPorDia<any>(ini!, fim!, (de, ate) =>
        supabase
          .from("agendamentos")
          .select(
            "id, inicio, fim, status, observacoes, procedimento, paciente_nome, paciente_id, medicos(nome)",
          )
          .eq("clinica_id", clinicaId)
          .gte("inicio", de)
          .lt("inicio", ate)
          .or(FILTRO_SEM_VAGA_LIVRE)
          .order("inicio")
          .order("id"),
      );
      return data
        .filter((r: any) => !ehVagaLivre(r))
        .map((r: any) => ({
          Inicio: r.inicio,
          Fim: r.fim,
          Status: r.status,
          Paciente: r.paciente_nome ?? "",
          Medico: r.medicos?.nome ?? "",
          Serviço: r.procedimento ?? "",
          Observacao: r.observacoes ?? "",
        }));
    },
  },
  {
    id: "pacientes",
    titulo: "Clientes / Pacientes",
    descricao:
      "Cadastro completo de pacientes. São centenas de milhares — pode levar alguns minutos.",
    icon: Users,
    cor: "#c084fc",
    carregar: async ({ clinicaId }) => {
      const data = await todas<any>(
        () =>
          supabase
            .from("pacientes")
            .select("nome, cpf, telefone, email, data_nascimento, sexo, created_at, id")
            .eq("clinica_id", clinicaId)
            .order("nome")
            .order("id"),
        400,
      );
      return data.map(({ id: _id, ...r }: any) => r);
    },
  },
  {
    id: "procedimentos",
    titulo: "Serviços",
    descricao: "Catálogo de serviços e valores.",
    icon: ClipboardList,
    cor: "#fb923c",
    carregar: async ({ clinicaId }) => {
      const data = await todas<any>(() =>
        supabase
          .from("procedimentos")
          .select(
            "id, nome, codigo, grupo, valor_dinheiro, valor_dinheiro_pix, valor_padrao, valor_cartao, duracao_minutos, ativo",
          )
          .eq("clinica_id", clinicaId)
          .order("nome")
          .order("id"),
      );
      // Mesmo valor que a tela Serviços mostra como preço do serviço.
      return data.map((r: any) => ({
        Nome: r.nome,
        Código: r.codigo ?? "",
        Grupo: r.grupo ?? "",
        "Valor (dinheiro/PIX)": Number(
          r.valor_dinheiro ?? r.valor_dinheiro_pix ?? r.valor_padrao ?? 0,
        ),
        "Valor (cartão)": r.valor_cartao ?? "",
        "Duração (min)": r.duracao_minutos ?? "",
        Ativo: r.ativo ? "Sim" : "Não",
      }));
    },
  },
  {
    id: "orcamentos",
    titulo: "Orçamentos",
    descricao: "Orçamentos emitidos no período.",
    icon: FileText,
    cor: "#34d399",
    usaPeriodo: true,
    carregar: async ({ clinicaId, ini, fim }) => {
      const data = await buscarPorDia<any>(ini!, fim!, (de, ate) =>
        supabase
          .from("orcamentos")
          .select("id, numero, status, valor_total, desconto, created_at, paciente_nome")
          .eq("clinica_id", clinicaId)
          .gte("created_at", de)
          .lt("created_at", ate)
          .order("created_at")
          .order("id"),
      );
      // `valor_total` já é gravado com o desconto abatido (tela Orçamentos).
      return data.map((r: any) => ({
        Numero: r.numero,
        Status: r.status,
        Paciente: r.paciente_nome ?? "",
        "Valor bruto": (Number(r.valor_total) || 0) + (Number(r.desconto) || 0),
        Desconto: Number(r.desconto) || 0,
        "Valor final": Number(r.valor_total) || 0,
        Data: r.created_at,
      }));
    },
  },
  {
    id: "financeiro",
    titulo: "Financeiro — Lançamentos",
    descricao: "Receitas e despesas no período.",
    icon: DollarSign,
    cor: "#facc15",
    usaPeriodo: true,
    carregar: async ({ clinicaId, ini, fim }) => {
      const data = await buscarPorDia<any>(ini!, fim!, (de, ate) =>
        supabase
          .from("fin_lancamentos")
          .select(
            // `fin_lancamentos` tem duas chaves estrangeiras para `medicos`
            // (medico_id e medico_laudador_id), então o vínculo precisa ser
            // nomeado ou o PostgREST devolve PGRST201 e o relatório não abre.
            "id, data, tipo, descricao, valor, status, forma_pagamento, observacoes, fin_categorias(nome), fin_contas(nome), pacientes(nome), medicos!fin_lancamentos_medico_id_fkey(nome)",
          )
          .eq("clinica_id", clinicaId)
          .gte("data", de)
          .lt("data", ate)
          .order("data")
          .order("id"),
      );
      return data.map((r: any) => ({
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
    icon: CreditCard,
    cor: "#22d3ee",
    carregar: async ({ clinicaId }) => {
      const data = await todas<any>(() =>
        supabase
          .from("contratos_assinatura")
          .select(
            "id, numero, status, valor_mensal, data_inicio, data_fim, paciente_nome, cb_convenios(nome)",
          )
          .eq("clinica_id", clinicaId)
          .order("data_inicio", { ascending: false })
          .order("id"),
      );
      return data.map((r: any) => ({
        Numero: r.numero,
        Status: r.status,
        Paciente: r.paciente_nome ?? "",
        Plano: r.cb_convenios?.nome ?? "",
        ValorMensal: r.valor_mensal,
        Inicio: r.data_inicio,
        Fim: r.data_fim,
      }));
    },
  },
  {
    id: "crm",
    titulo: "CRM — Oportunidades",
    descricao: "Funil de vendas e oportunidades.",
    icon: Target,
    cor: "#f472b6",
    carregar: async ({ clinicaId }) => {
      const data = await todas<any>(() =>
        supabase
          .from("crm_oportunidades")
          .select("id, nome_lead, telefone, valor_estimado, status, origem, created_at, etapa_id")
          .eq("clinica_id", clinicaId)
          .order("created_at", { ascending: false })
          .order("id"),
      );
      const etapas = await nomesPorId(
        "crm_etapas",
        data.map((r: any) => r.etapa_id),
      );
      return data.map((r: any) => ({
        Lead: r.nome_lead ?? "",
        Telefone: r.telefone ?? "",
        Etapa: etapas.get(r.etapa_id) ?? "",
        Status: r.status,
        Origem: r.origem ?? "",
        "Valor estimado": r.valor_estimado,
        Data: r.created_at,
      }));
    },
  },
  {
    id: "medicos",
    titulo: "Médicos",
    descricao: "Cadastro de médicos.",
    icon: Stethoscope,
    cor: "#fda4af",
    carregar: async ({ clinicaId }) => {
      const data = await todas<any>(() =>
        supabase
          .from("medicos")
          .select("id, nome, crm, crm_uf, telefone, email, ativo")
          .eq("clinica_id", clinicaId)
          .order("nome")
          .order("id"),
      );
      return data.map((r: any) => ({
        Nome: r.nome,
        CRM: r.crm ?? "",
        UF: r.crm_uf ?? "",
        Telefone: r.telefone ?? "",
        Email: r.email ?? "",
        Ativo: r.ativo ? "Sim" : "Não",
      }));
    },
  },
  {
    id: "especialidades",
    titulo: "Especialidades",
    descricao: "Lista de especialidades.",
    icon: Stethoscope,
    cor: "#f0abfc",
    carregar: async () => {
      const { data, error } = await supabase
        .from("especialidades")
        .select("nome, descricao, ativo")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as any;
    },
  },
  {
    id: "disponibilidades",
    titulo: "Horários médicos",
    descricao: "Disponibilidades cadastradas.",
    icon: Clock,
    cor: "#a78bfa",
    carregar: async ({ clinicaId }) => {
      const data = await todas<any>(() =>
        supabase
          .from("medico_disponibilidades")
          .select(
            "id, dia_semana, hora_inicio, hora_fim, intervalo_min, limite_pacientes, ativo, vigencia_inicio, vigencia_fim, medico_id",
          )
          .eq("clinica_id", clinicaId)
          .order("id"),
      );
      const medicos = await nomesPorId(
        "medicos",
        data.map((r: any) => r.medico_id),
      );
      return data.map((r: any) => ({
        Medico: medicos.get(r.medico_id) ?? "",
        DiaSemana: r.dia_semana,
        Inicio: r.hora_inicio,
        Fim: r.hora_fim,
        IntervaloMin: r.intervalo_min,
        LimitePacientes: r.limite_pacientes ?? "",
        Ativo: r.ativo ? "Sim" : "Não",
        "Vigência início": r.vigencia_inicio ?? "",
        "Vigência fim": r.vigencia_fim ?? "",
      }));
    },
  },
  {
    id: "exames",
    titulo: "Resultados de Exames",
    descricao: "Resultados de exames registrados.",
    icon: FlaskConical,
    cor: "#fde047",
    usaPeriodo: true,
    carregar: async ({ clinicaId, ini, fim }) => {
      const data = await buscarPorDia<any>(ini!, fim!, (de, ate) =>
        supabase
          .from("exame_resultados")
          .select("id, tipo_exame, status, data_coleta, resultado_texto, paciente_nome")
          .eq("clinica_id", clinicaId)
          .gte("data_coleta", de)
          .lt("data_coleta", ate)
          .order("data_coleta")
          .order("id"),
      );
      return data.map((r: any) => ({
        Paciente: r.paciente_nome ?? "",
        Exame: r.tipo_exame,
        Status: r.status,
        "Data da coleta": r.data_coleta,
        Resultado: r.resultado_texto ?? "",
      }));
    },
  },
  {
    id: "alertas",
    titulo: "Enfermeira IA — Alertas",
    descricao: "Alertas gerados pela IA.",
    icon: BellRing,
    cor: "#ef4444",
    carregar: async ({ clinicaId }) => {
      const data = await todas<any>(() =>
        supabase
          .from("alertas_enfermagem")
          .select("id, titulo, descricao, severidade, status, created_at, paciente_nome")
          .eq("clinica_id", clinicaId)
          .order("created_at", { ascending: false })
          .order("id"),
      );
      return data.map((r: any) => ({
        Titulo: r.titulo,
        Severidade: r.severidade,
        Status: r.status,
        Paciente: r.paciente_nome ?? "",
        Descricao: r.descricao,
        Data: r.created_at,
      }));
    },
  },
  {
    id: "prontuarios",
    titulo: "Prontuários",
    descricao: "Prontuários e atendimentos.",
    icon: FileHeart,
    cor: "#f9a8d4",
    usaPeriodo: true,
    carregar: async ({ clinicaId, ini, fim }) => {
      const data = await buscarPorDia<any>(ini!, fim!, (de, ate) =>
        supabase
          .from("prontuarios")
          .select(
            "id, data, queixa_principal, hipotese_diagnostica, conduta, paciente_id, medico_id",
          )
          .eq("clinica_id", clinicaId)
          .gte("data", de)
          .lt("data", ate)
          .order("data")
          .order("id"),
      );
      const [pacientes, medicos] = await Promise.all([
        nomesPorId(
          "pacientes",
          data.map((r: any) => r.paciente_id),
        ),
        nomesPorId(
          "medicos",
          data.map((r: any) => r.medico_id),
        ),
      ]);
      return data.map((r: any) => ({
        Data: r.data,
        Paciente: pacientes.get(r.paciente_id) ?? "",
        Medico: medicos.get(r.medico_id) ?? "",
        Queixa: r.queixa_principal,
        Hipotese: r.hipotese_diagnostica,
        Conduta: r.conduta,
      }));
    },
  },
  {
    id: "auditoria",
    titulo: "Auditoria",
    descricao: "Histórico de alterações. Movimento alto — prefira períodos curtos.",
    icon: ShieldCheck,
    cor: "#f87171",
    usaPeriodo: true,
    carregar: async ({ clinicaId, ini, fim }) => {
      const data = await buscarPorDia<any>(ini!, fim!, (de, ate) =>
        supabase
          .from("audit_log")
          .select("id, created_at, user_email, action, table_name, record_id")
          .eq("clinica_id", clinicaId)
          .gte("created_at", de)
          .lt("created_at", ate)
          .order("created_at")
          .order("id"),
      );
      return data.map(({ id: _id, ...r }: any) => r);
    },
  },
  {
    id: "documentos",
    titulo: "Documentos emitidos",
    descricao: "Documentos gerados no período.",
    icon: FileText,
    cor: "#34d399",
    usaPeriodo: true,
    carregar: async ({ clinicaId, ini, fim }) => {
      const data = await buscarPorDia<any>(ini!, fim!, (de, ate) =>
        supabase
          .from("documentos_emitidos")
          .select("id, tipo, titulo, created_at, paciente_id, medico_id")
          .eq("clinica_id", clinicaId)
          .gte("created_at", de)
          .lt("created_at", ate)
          .order("created_at")
          .order("id"),
      );
      const [pacientes, medicos] = await Promise.all([
        nomesPorId(
          "pacientes",
          data.map((r: any) => r.paciente_id),
        ),
        nomesPorId(
          "medicos",
          data.map((r: any) => r.medico_id),
        ),
      ]);
      return data.map((r: any) => ({
        Data: r.created_at,
        Tipo: r.tipo,
        Titulo: r.titulo,
        Paciente: pacientes.get(r.paciente_id) ?? "",
        Medico: medicos.get(r.medico_id) ?? "",
      }));
    },
  },
  {
    id: "equipe",
    titulo: "Equipe",
    descricao: "Membros da clínica.",
    icon: Users,
    cor: "#93c5fd",
    carregar: async ({ clinicaId }) => {
      const data = await todas<any>(() =>
        supabase
          .from("clinica_memberships")
          .select("id, role, ativo, created_at, user_id")
          .eq("clinica_id", clinicaId)
          .order("created_at")
          .order("id"),
      );
      const perfis = await nomesPorId(
        "profiles",
        data.map((r: any) => r.user_id),
      );
      return data.map((r: any) => ({
        Nome: perfis.get(r.user_id) ?? "",
        Papel: r.role,
        Ativo: r.ativo === false ? "Não" : "Sim",
        Desde: r.created_at,
      }));
    },
  },
  {
    id: "clinicas",
    titulo: "Clínicas",
    descricao: "Dados da clínica.",
    icon: Building2,
    cor: "#22d3ee",
    carregar: async ({ clinicaId }) => {
      const { data, error } = await supabase
        .from("clinicas")
        .select("nome, cnpj, telefone, email, endereco, created_at")
        .eq("id", clinicaId);
      if (error) throw error;
      return (data ?? []) as any;
    },
  },
  {
    id: "triagem-enfermagem",
    titulo: "Triagem — Enfermagem",
    descricao: "Atendimentos iniciais da enfermagem com sinais vitais, doenças e medicamentos.",
    icon: HeartPulse,
    cor: "#ef4444",
    usaPeriodo: true,
    carregar: async ({ clinicaId, ini, fim }) => {
      const data = await buscarPorDia<any>(ini!, fim!, (de, ate) =>
        supabase
          .from("triagens_enfermagem")
          .select(
            "id, created_at, enfermeira_nome, peso_kg, altura_cm, imc, pa_sistolica, pa_diastolica, freq_cardiaca, temperatura, saturacao, glicemia, queixa_principal, doencas, medicamentos, alergias, observacoes, paciente_id, agendamento_id",
          )
          .eq("clinica_id", clinicaId)
          .gte("created_at", de)
          .lt("created_at", ate)
          .order("created_at")
          .order("id"),
      );
      const [pacientes, agendamentos] = await Promise.all([
        buscarPorIds<{ id: string; nome: string | null; cpf: string | null }>(
          "pacientes",
          "id, nome, cpf",
          data.map((r: any) => r.paciente_id),
        ),
        buscarPorIds<{ id: string; inicio: string | null; procedimento: string | null }>(
          "agendamentos",
          "id, inicio, procedimento",
          data.map((r: any) => r.agendamento_id),
        ),
      ]);
      return data.map((r: any) => {
        const pac = pacientes.get(r.paciente_id);
        const ag = agendamentos.get(r.agendamento_id);
        return {
          Data: r.created_at,
          Paciente: pac?.nome ?? "",
          CPF: pac?.cpf ?? "",
          Agendamento: ag?.inicio ?? "",
          Serviço: ag?.procedimento ?? "",
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
        };
      });
    },
  },
];

function RelatoriosPage() {
  const { clinicaAtual } = useClinica();
  const [ini, setIni] = useState(mesAtras);
  const [fim, setFim] = useState(hoje);
  const [loading, setLoading] = useState<string | null>(null);

  // Produtividade individual é ferramenta de supervisão: aparece pela marcação
  // pessoa a pessoa (`pode_autorizar`, tela Equipe) somada a um perfil de
  // gestão. Checar só `role === "admin"` mostraria o desempenho da equipe para
  // as 28 pessoas que têm esse perfil, boa parte operando o balcão. A função
  // do banco repete a mesma checagem — esconder a aba não é permissão.
  const ehSupervisor =
    !!clinicaAtual?.pode_autorizar &&
    (clinicaAtual.role === "admin" || clinicaAtual.role === "gestor");

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
      exportToExcel(rows, `relatorio-${r.id}-${hoje()}`);
      toast.success(`${rows.length} registros exportados.`);
    } catch (e: any) {
      mostrarErro(e);
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

      <Tabs defaultValue="dashboard">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3">
          <TabsList>
            <TabsTrigger value="dashboard" className="gap-2">
              <LayoutDashboard className="h-4 w-4" /> Dashboard
            </TabsTrigger>
            <TabsTrigger value="cubo" className="gap-2">
              <Boxes className="h-4 w-4" /> Cubo BI
            </TabsTrigger>
            <TabsTrigger value="agendamentos-diario" className="gap-2">
              <PhoneCall className="h-4 w-4" /> Agendamentos do Dia
            </TabsTrigger>
            {ehSupervisor && (
              <TabsTrigger value="marcacoes-atendente" className="gap-2">
                <Users className="h-4 w-4" /> Marcações por atendente
              </TabsTrigger>
            )}
            <TabsTrigger value="downloads" className="gap-2">
              <Download className="h-4 w-4" /> Baixar planilhas
            </TabsTrigger>
          </TabsList>
          <div className="flex items-end gap-2">
            <div>
              <Label htmlFor="ini" className="text-xs text-muted-foreground">
                De
              </Label>
              <DateInputBR
                id="ini"
                value={ini}
                onChange={(e) => setIni(e.target.value)}
                className="h-9 w-36"
              />
            </div>
            <div>
              <Label htmlFor="fim" className="text-xs text-muted-foreground">
                Até
              </Label>
              <DateInputBR
                id="fim"
                value={fim}
                onChange={(e) => setFim(e.target.value)}
                className="h-9 w-36"
              />
            </div>
          </div>
        </div>

        <TabsContent value="dashboard" className="mt-4">
          <DashboardView clinicaId={clinicaAtual?.clinica_id} ini={ini} fim={fim} />
        </TabsContent>

        <TabsContent value="cubo" className="mt-4">
          <CuboBI clinicaId={clinicaAtual?.clinica_id} ini={ini} fim={fim} />
        </TabsContent>

        <TabsContent value="agendamentos-diario" className="mt-4">
          <AgendamentosDiarioView
            clinicaId={clinicaAtual?.clinica_id}
            ini={ini}
            fim={fim}
            ehSupervisor={ehSupervisor}
          />
        </TabsContent>

        {/* Traz os próprios filtros (período de atendimento x período de
            marcação, situação, profissional), que são diferentes do "De/Até"
            do topo — este relatório separa o dia do atendimento do dia em que
            a atendente lançou a ficha. */}
        {ehSupervisor && (
          <TabsContent value="marcacoes-atendente" className="mt-4">
            <MarcacoesPorAtendente />
          </TabsContent>
        )}

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

const fmtBRL = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

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

interface RawData {
  agend: Array<{
    id: string;
    paciente_nome: string | null;
    procedimento: string | null;
    inicio: string;
    status: string | null;
    medico: string | null;
  }>;
  fin: Array<{
    id: string;
    data: string;
    tipo: string;
    valor: number;
    descricao: string | null;
    categoria: string | null;
    status: string | null;
  }>;
  pacientes: Array<{ id: string; nome: string; created_at: string }>;
  prontuarios: Array<{ id: string; data: string; paciente: string | null }>;
}

// O detalhamento ao clicar num card lista no máximo isto — 34 mil linhas numa
// janela travam o navegador. A planilha completa sai em "Baixar planilhas".
const LIMITE_DETALHE = 500;

function DashboardView({ clinicaId, ini, fim }: { clinicaId?: string; ini: string; fim: string }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [raw, setRaw] = useState<RawData | null>(null);
  const [falhou, setFalhou] = useState(false);
  const [drill, setDrill] = useState<
    null | "agend" | "novos" | "pront" | "saldo" | "receitas" | "despesas"
  >(null);
  // Clima diário (chuva) no período — carregado à parte para não travar o dashboard
  const [clima, setClima] = useState<Map<string, ClimaDia> | null>(null);
  const [climaIndisponivel, setClimaIndisponivel] = useState(false);

  useEffect(() => {
    if (!clinicaId) return;
    let cancel = false;
    setClima(null);
    setClimaIndisponivel(false);
    (async () => {
      try {
        const m = await getClimaPeriodo(clinicaId, ini, fim);
        if (cancel) return;
        if (m === null) setClimaIndisponivel(true);
        else setClima(m);
      } catch (e) {
        console.error("clima:", e);
        if (!cancel) setClimaIndisponivel(true);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [clinicaId, ini, fim]);

  useEffect(() => {
    if (!clinicaId) return;
    let cancel = false;
    (async () => {
      setLoading(true);
      setFalhou(false);
      try {
        // Lido dia a dia (`buscarPorDia`): sem paginar, o PostgREST cortava em
        // 1.000 linhas ("1000" num mês de 34 mil agendamentos); paginando o mês
        // de uma vez, as páginas finais faziam o banco rechecar a permissão de
        // todas as linhas anteriores e a tela estourava o tempo do servidor.
        // Nomes de médico e categoria vêm à parte pelo mesmo motivo — juntados
        // na consulta, o banco rechecava a permissão deles linha a linha. O
        // prontuário guarda a data em `data` (não `data_atendimento`).
        // Vagas livres da grade ("DISPONIVEL") ficam de fora, pela mesma regra
        // do Dashboard Operacional — contá-las inflava o dia de ~310 para ~850.
        const [agendTodas, finTodas, pacRows, prontRows] = await Promise.all([
          buscarPorDia<any>(ini, fim, (de, ate) =>
            supabase
              .from("agendamentos")
              .select("id, paciente_nome, paciente_id, procedimento, inicio, status, medico_id")
              .eq("clinica_id", clinicaId)
              .gte("inicio", de)
              .lt("inicio", ate)
              .or(FILTRO_SEM_VAGA_LIVRE)
              .order("inicio")
              .order("id"),
          ),
          buscarPorDia<any>(ini, fim, (de, ate) =>
            supabase
              .from("fin_lancamentos")
              .select("id, data, tipo, valor, status, descricao, categoria_id")
              .eq("clinica_id", clinicaId)
              .gte("data", de)
              .lt("data", ate)
              .order("data")
              .order("id"),
          ),
          buscarPorDia<any>(ini, fim, (de, ate) =>
            supabase
              .from("pacientes")
              .select("id, nome, created_at")
              .eq("clinica_id", clinicaId)
              .gte("created_at", de)
              .lt("created_at", ate)
              .order("created_at")
              .order("id"),
          ),
          buscarPorDia<any>(ini, fim, (de, ate) =>
            supabase
              .from("prontuarios")
              .select("id, data, paciente_id")
              .eq("clinica_id", clinicaId)
              .gte("data", de)
              .lt("data", ate)
              .order("data")
              .order("id"),
          ),
        ]);
        const agendRows = agendTodas.filter((r) => !ehVagaLivre(r));
        const [nomesPront, nomesMedico, nomesCategoria] = await Promise.all([
          nomesPorId(
            "pacientes",
            prontRows.map((p) => p.paciente_id),
          ),
          nomesPorId(
            "medicos",
            agendRows.map((r) => r.medico_id),
          ),
          nomesPorId(
            "fin_categorias",
            finTodas.map((r) => r.categoria_id),
          ),
        ]);

        // Agendamento de dia já passado que segue "agendado" é ficha que a
        // recepção não fechou: ganha fatia própria no gráfico para aparecer
        // como pendência. Só a exibição muda — o status no banco fica como
        // está (presença nunca é deduzida aqui).
        const hojeClinica = hoje();
        const diaClinica = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" });
        const statusMap = new Map<string, number>();
        const medicoMap = new Map<string, number>();
        agendRows.forEach((r) => {
          const status =
            r.status === "agendado" && diaClinica.format(new Date(r.inicio)) < hojeClinica
              ? "Sem baixa (data passada)"
              : (r.status ?? "—");
          statusMap.set(status, (statusMap.get(status) ?? 0) + 1);
          const m = nomesMedico.get(r.medico_id) ?? "Sem médico";
          medicoMap.set(m, (medicoMap.get(m) ?? 0) + 1);
        });

        const finRows = finTodas.filter((r) => r.status !== "cancelado");
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
          const cat = nomesCategoria.get(r.categoria_id) ?? "Sem categoria";
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
        setRaw({
          agend: agendRows.map((r: any) => ({
            id: r.id,
            paciente_nome: r.paciente_nome ?? null,
            procedimento: r.procedimento ?? null,
            inicio: r.inicio,
            status: r.status ?? null,
            medico: nomesMedico.get(r.medico_id) ?? null,
          })),
          fin: finRows.map((r: any) => ({
            id: r.id,
            data: r.data,
            tipo: r.tipo,
            valor: Number(r.valor) || 0,
            descricao: r.descricao ?? null,
            categoria: nomesCategoria.get(r.categoria_id) ?? null,
            status: r.status ?? null,
          })),
          pacientes: pacRows.map((p) => ({
            id: p.id,
            nome: p.nome,
            created_at: p.created_at,
          })),
          prontuarios: prontRows.map((p) => ({
            id: p.id,
            data: p.data,
            paciente: nomesPront.get(p.paciente_id) ?? null,
          })),
        });
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
          novosPacientes: pacRows.length,
          prontuariosCount: prontRows.length,
        });
      } catch (e: any) {
        console.error("dashboard relatorios:", e);
        mostrarErro(e);
        if (!cancel) setFalhou(true);
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [clinicaId, ini, fim]);

  const saldo = useMemo(() => (data ? data.receitas - data.despesas : 0), [data]);

  // Linhas do card Movimento × Clima: um registro por dia do período (até hoje),
  // cruzando chuva com nº de agendamentos e receita do dia.
  const climaRows = useMemo(() => {
    if (!raw) return [];
    const fimReal = fim > hoje() ? hoje() : fim;
    if (ini > fimReal) return [];
    const agendPorDia = new Map<string, number>();
    raw.agend.forEach((a) => {
      const d = a.inicio.slice(0, 10);
      agendPorDia.set(d, (agendPorDia.get(d) ?? 0) + 1);
    });
    const receitaPorDia = new Map<string, number>();
    raw.fin.forEach((f) => {
      if (f.tipo !== "receita") return;
      const d = f.data.slice(0, 10);
      receitaPorDia.set(d, (receitaPorDia.get(d) ?? 0) + f.valor);
    });
    const rows: { dia: string; clima: ClimaDia | null; agend: number; receita: number }[] = [];
    const cursor = new Date(ini + "T12:00:00");
    const end = new Date(fimReal + "T12:00:00");
    while (cursor <= end) {
      const d = cursor.toISOString().slice(0, 10);
      rows.push({
        dia: d,
        clima: clima?.get(d) ?? null,
        agend: agendPorDia.get(d) ?? 0,
        receita: receitaPorDia.get(d) ?? 0,
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    return rows;
  }, [raw, clima, ini, fim]);

  // Média só sobre dias de expediente já encerrados: dia com 0 agendamentos
  // (domingo, feriado, clínica fechada) e hoje (parcial) ficam na tabela, mas
  // fora da média — senão puxam o comparativo para baixo.
  const climaResumo = useMemo(() => {
    const hojeISO = hoje();
    const comClima = climaRows.filter((r) => r.clima !== null);
    const considerados = comClima.filter((r) => r.agend > 0 && r.dia < hojeISO);
    const chuva = considerados.filter((r) => r.clima!.choveu);
    const semChuva = considerados.filter((r) => !r.clima!.choveu);
    const media = (l: typeof climaRows) =>
      l.length === 0 ? null : l.reduce((acc, r) => acc + r.agend, 0) / l.length;
    return {
      diasChuva: chuva.length,
      diasSem: semChuva.length,
      diasSemMovimento: comClima.filter((r) => r.agend === 0 && r.dia < hojeISO).length,
      hojeNaTabela: comClima.some((r) => r.dia === hojeISO),
      mediaAgendChuva: media(chuva),
      mediaAgendSem: media(semChuva),
    };
  }, [climaRows]);

  function exportarClima() {
    const flat = climaRows.map((r) => ({
      Data: r.dia.split("-").reverse().join("/"),
      "Choveu?": r.clima ? (r.clima.choveu ? "Sim" : "Não") : "Sem dado",
      "Precipitação (mm)": r.clima?.precipitacao_mm ?? "",
      "Temp. mín (°C)": r.clima?.temp_min ?? "",
      "Temp. máx (°C)": r.clima?.temp_max ?? "",
      Agendamentos: r.agend,
      Receita: r.receita,
    }));
    if (!flat.length) {
      toast.info("Nada para exportar.");
      return;
    }
    exportToExcel(flat, `movimento-clima-${ini}-a-${fim}`);
  }

  // ---------- widgets editáveis ----------
  const ALL_WIDGETS: { id: string; label: string; group: "kpi" | "chart" }[] = [
    { id: "kpi_agend", label: "KPI — Agendamentos", group: "kpi" },
    { id: "kpi_novos", label: "KPI — Novos pacientes", group: "kpi" },
    { id: "kpi_pront", label: "KPI — Prontuários", group: "kpi" },
    { id: "kpi_saldo", label: "KPI — Saldo", group: "kpi" },
    { id: "kpi_rec", label: "KPI — Receitas", group: "kpi" },
    { id: "kpi_desp", label: "KPI — Despesas", group: "kpi" },
    { id: "ch_fin_dia", label: "Gráfico — Receitas vs Despesas por dia", group: "chart" },
    { id: "ch_clima", label: "Tabela — Movimento × Clima (chuva)", group: "chart" },
    { id: "ch_agend_status", label: "Gráfico — Agendamentos por status", group: "chart" },
    { id: "ch_agend_medico", label: "Gráfico — Agendamentos por médico", group: "chart" },
    { id: "ch_fin_cat", label: "Gráfico — Financeiro por categoria", group: "chart" },
  ];
  const STORAGE_KEY = `relatorios.dashboard.widgets.${clinicaId ?? "default"}`;
  const [enabled, setEnabled] = useState<Record<string, boolean>>(() => {
    if (typeof window === "undefined")
      return Object.fromEntries(ALL_WIDGETS.map((w) => [w.id, true]));
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {
      // JSON corrompido ou storage indisponível: cai no padrão (tudo ligado).
    }
    return Object.fromEntries(ALL_WIDGETS.map((w) => [w.id, true]));
  });
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      setEnabled(raw ? JSON.parse(raw) : Object.fromEntries(ALL_WIDGETS.map((w) => [w.id, true])));
    } catch {
      // Preferência de widgets é cosmética: mantém o que já está em tela.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [STORAGE_KEY]);
  function toggle(id: string, val: boolean) {
    setEnabled((prev) => {
      const next = { ...prev, [id]: val };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Persistência best-effort; o toggle já valeu no estado do React.
      }
      return next;
    });
  }
  function resetWidgets() {
    const next = Object.fromEntries(ALL_WIDGETS.map((w) => [w.id, true]));
    setEnabled(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Persistência best-effort; o reset já valeu no estado do React.
    }
  }
  const on = (id: string) => enabled[id] !== false;

  if (!clinicaId) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          Selecione uma clínica para visualizar o dashboard.
        </CardContent>
      </Card>
    );
  }

  if (falhou && !loading) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          Não foi possível carregar o dashboard. Troque o período ou recarregue a página.
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

  const finDetalhe = (raw?.fin ?? []).filter((f) =>
    drill === "saldo" ? true : drill === "receitas" ? f.tipo === "receita" : f.tipo !== "receita",
  );
  const totalDetalhe = !raw
    ? 0
    : drill === "agend"
      ? raw.agend.length
      : drill === "novos"
        ? raw.pacientes.length
        : drill === "pront"
          ? raw.prontuarios.length
          : finDetalhe.length;

  const kpiVisible = ALL_WIDGETS.filter((w) => w.group === "kpi" && on(w.id)).length;
  const chartsVisible = ALL_WIDGETS.filter((w) => w.group === "chart" && on(w.id)).length;

  return (
    <div className="space-y-6">
      {/* Barra de configuração */}
      <div className="flex justify-end">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <Settings2 className="h-4 w-4" /> Personalizar dashboard
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium">Itens exibidos</p>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1 text-xs"
                onClick={resetWidgets}
              >
                <RotateCcw className="h-3 w-3" /> Restaurar
              </Button>
            </div>
            <div className="space-y-3 max-h-80 overflow-auto">
              {(["kpi", "chart"] as const).map((g) => (
                <div key={g}>
                  <p className="text-xs uppercase text-muted-foreground mb-1">
                    {g === "kpi" ? "Indicadores" : "Gráficos"}
                  </p>
                  {ALL_WIDGETS.filter((w) => w.group === g).map((w) => (
                    <label
                      key={w.id}
                      className="flex items-center gap-2 py-1 cursor-pointer text-sm"
                    >
                      <Checkbox
                        checked={on(w.id)}
                        onCheckedChange={(v) => toggle(w.id, v === true)}
                      />
                      <span>{w.label}</span>
                    </label>
                  ))}
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* KPIs */}
      {kpiVisible > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {on("kpi_agend") && (
            <Kpi
              icon={<CalendarDays className="h-5 w-5" />}
              label="Agendamentos"
              value={data.totalAgend.toLocaleString("pt-BR")}
              tint="text-blue-600"
              onClick={() => setDrill("agend")}
            />
          )}
          {on("kpi_novos") && (
            <Kpi
              icon={<Users className="h-5 w-5" />}
              label="Novos pacientes"
              value={data.novosPacientes.toLocaleString("pt-BR")}
              tint="text-purple-600"
              onClick={() => setDrill("novos")}
            />
          )}
          {on("kpi_pront") && (
            <Kpi
              icon={<FileHeart className="h-5 w-5" />}
              label="Prontuários"
              value={data.prontuariosCount.toLocaleString("pt-BR")}
              tint="text-pink-600"
              onClick={() => setDrill("pront")}
            />
          )}
          {on("kpi_saldo") && (
            <Kpi
              icon={<Wallet className="h-5 w-5" />}
              label="Saldo"
              value={fmtBRL(saldo)}
              tint={saldo >= 0 ? "text-emerald-600" : "text-red-600"}
              onClick={() => setDrill("saldo")}
            />
          )}
          {on("kpi_rec") && (
            <Kpi
              icon={<TrendingUp className="h-5 w-5" />}
              label="Receitas"
              value={fmtBRL(data.receitas)}
              tint="text-emerald-600"
              onClick={() => setDrill("receitas")}
            />
          )}
          {on("kpi_desp") && (
            <Kpi
              icon={<TrendingDown className="h-5 w-5" />}
              label="Despesas"
              value={fmtBRL(data.despesas)}
              tint="text-red-600"
              onClick={() => setDrill("despesas")}
            />
          )}
        </div>
      )}

      {/* Financeiro por dia */}
      {on("ch_fin_dia") && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Receitas vs Despesas (por dia)</CardTitle>
          </CardHeader>
          <CardContent>
            {data.finPorDia.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Sem lançamentos no período.
              </p>
            ) : (
              <MiniBarChart
                labels={data.finPorDia.map((d) => d.label)}
                series={[
                  {
                    name: "Receitas",
                    color: "#10b981",
                    values: data.finPorDia.map((d) => d.receita),
                  },
                  {
                    name: "Despesas",
                    color: "#ef4444",
                    values: data.finPorDia.map((d) => d.despesa),
                  },
                ]}
                formatY={(n) => "R$ " + Math.round(n).toLocaleString("pt-BR")}
              />
            )}
          </CardContent>
        </Card>
      )}

      {/* Movimento × Clima — chuva por dia vs agendamentos/receita */}
      {on("ch_clima") && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base flex items-center gap-2">
                <CloudRain className="h-4 w-4 text-sky-500" /> Movimento × Clima (por dia)
              </CardTitle>
              <Button onClick={exportarClima} variant="outline" size="sm" className="gap-2">
                <Download className="h-4 w-4" /> Exportar Excel
              </Button>
            </div>
            {clima && climaResumo.diasChuva + climaResumo.diasSem > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                {climaResumo.diasChuva} dia{climaResumo.diasChuva === 1 ? "" : "s"} com chuva e{" "}
                {climaResumo.diasSem} sem chuva no período
                {(climaResumo.diasSemMovimento > 0 || climaResumo.hojeNaTabela) &&
                  ` (fora da média: ${[
                    climaResumo.diasSemMovimento > 0 &&
                      `${climaResumo.diasSemMovimento} dia${climaResumo.diasSemMovimento === 1 ? "" : "s"} sem agendamento`,
                    climaResumo.hojeNaTabela && "hoje, ainda em andamento",
                  ]
                    .filter(Boolean)
                    .join(" e ")})`}
                .
                {climaResumo.mediaAgendChuva !== null && climaResumo.mediaAgendSem !== null && (
                  <>
                    {" "}
                    Média de agendamentos:{" "}
                    <b className="text-sky-600">
                      {climaResumo.mediaAgendChuva.toFixed(1)}/dia com chuva
                    </b>{" "}
                    vs{" "}
                    <b className="text-amber-600">
                      {climaResumo.mediaAgendSem.toFixed(1)}/dia sem chuva
                    </b>
                    .
                  </>
                )}
              </p>
            )}
          </CardHeader>
          <CardContent>
            {climaIndisponivel ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                Não foi possível obter o clima. Cadastre a cidade ou as coordenadas
                (latitude/longitude) da clínica.
              </p>
            ) : !clima ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Carregando clima…</p>
            ) : climaRows.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Sem dias no período.</p>
            ) : (
              <div className="max-h-96 overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-28">Data</TableHead>
                      <TableHead className="w-40">Clima</TableHead>
                      <TableHead className="w-28 text-right">Chuva (mm)</TableHead>
                      <TableHead className="w-32 text-right">Temp. mín/máx</TableHead>
                      <TableHead className="text-right">Agendamentos</TableHead>
                      <TableHead className="text-right">Receita</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {climaRows.map((r) => (
                      <TableRow
                        key={r.dia}
                        className={r.clima?.choveu ? "bg-sky-50/60 dark:bg-sky-950/20" : undefined}
                      >
                        <TableCell className="text-xs whitespace-nowrap">
                          {r.dia.split("-").reverse().join("/")}
                        </TableCell>
                        <TableCell className="text-sm">
                          {r.clima ? (
                            r.clima.choveu ? (
                              <span className="inline-flex items-center gap-1.5 text-sky-700 dark:text-sky-400 font-medium">
                                <CloudRain className="h-4 w-4" /> Chuva
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                                <Sun className="h-4 w-4" /> Sem chuva
                              </span>
                            )
                          ) : (
                            <span className="text-xs text-muted-foreground">Sem dado</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-xs">
                          {r.clima?.precipitacao_mm != null
                            ? r.clima.precipitacao_mm.toFixed(1)
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right text-xs whitespace-nowrap">
                          {r.clima?.temp_min != null && r.clima?.temp_max != null
                            ? `${Math.round(r.clima.temp_min)}° / ${Math.round(r.clima.temp_max)}°`
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right font-semibold">{r.agend}</TableCell>
                        <TableCell className="text-right text-xs">{fmtBRL(r.receita)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Pies */}
      {chartsVisible > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          {on("ch_agend_status") && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Agendamentos por status</CardTitle>
              </CardHeader>
              <CardContent>
                <MiniPieChart data={data.agendPorStatus} />
              </CardContent>
            </Card>
          )}
          {on("ch_agend_medico") && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Agendamentos por médico (top 8)</CardTitle>
              </CardHeader>
              <CardContent>
                <MiniPieChart data={data.agendPorMedico} />
              </CardContent>
            </Card>
          )}
          {on("ch_fin_cat") && (
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Financeiro por categoria (top 8)</CardTitle>
              </CardHeader>
              <CardContent>
                <MiniPieChart data={data.finPorCategoria} formatValue={fmtBRL} />
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {kpiVisible === 0 && chartsVisible === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Nenhum item selecionado. Use "Personalizar dashboard" para escolher o que exibir.
          </CardContent>
        </Card>
      )}

      <Dialog
        open={!!drill}
        onOpenChange={(v) => {
          if (!v) setDrill(null);
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {drill === "agend" && "Agendamentos no período"}
              {drill === "novos" && "Novos pacientes no período"}
              {drill === "pront" && "Prontuários no período"}
              {drill === "saldo" && "Lançamentos do período (saldo)"}
              {drill === "receitas" && "Receitas no período"}
              {drill === "despesas" && "Despesas no período"}
            </DialogTitle>
            <DialogDescription>
              {totalDetalhe > LIMITE_DETALHE
                ? `Mostrando os primeiros ${LIMITE_DETALHE} de ${totalDetalhe.toLocaleString("pt-BR")} registros. A lista completa sai em "Baixar planilhas".`
                : "Detalhamento dos registros do período selecionado."}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-auto">
            {drill === "agend" && raw && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Início</TableHead>
                    <TableHead>Paciente</TableHead>
                    <TableHead>Médico</TableHead>
                    <TableHead>Procedimento</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {raw.agend.slice(0, LIMITE_DETALHE).map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="whitespace-nowrap">
                        {new Date(a.inicio).toLocaleString("pt-BR")}
                      </TableCell>
                      <TableCell>{a.paciente_nome ?? "—"}</TableCell>
                      <TableCell>{a.medico ?? "—"}</TableCell>
                      <TableCell>{a.procedimento ?? "—"}</TableCell>
                      <TableCell>{a.status ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {drill === "novos" && raw && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Cadastrado em</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {raw.pacientes.slice(0, LIMITE_DETALHE).map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>{p.nome}</TableCell>
                      <TableCell>{new Date(p.created_at).toLocaleString("pt-BR")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {drill === "pront" && raw && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Paciente</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {raw.prontuarios.slice(0, LIMITE_DETALHE).map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>{new Date(p.data).toLocaleString("pt-BR")}</TableCell>
                      <TableCell>{p.paciente ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {(drill === "saldo" || drill === "receitas" || drill === "despesas") && raw && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {finDetalhe.slice(0, LIMITE_DETALHE).map((f) => (
                    <TableRow key={f.id}>
                      <TableCell className="whitespace-nowrap">
                        {f.data.slice(0, 10).split("-").reverse().join("/")}
                      </TableCell>
                      <TableCell>{f.tipo}</TableCell>
                      <TableCell>{f.descricao ?? "—"}</TableCell>
                      <TableCell>{f.categoria ?? "—"}</TableCell>
                      <TableCell
                        className={`text-right font-semibold ${f.tipo === "receita" ? "text-emerald-600" : "text-rose-600"}`}
                      >
                        {f.tipo === "despesa" ? "-" : ""}
                        {fmtBRL(f.valor)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  tint,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tint: string;
  onClick?: () => void;
}) {
  return (
    <Card
      onClick={onClick}
      className={onClick ? "cursor-pointer hover:bg-muted/50 transition-colors" : undefined}
    >
      <CardContent className="pt-6">
        <div className={`flex items-center gap-2 ${tint}`}>
          {icon}
          <span className="text-sm text-muted-foreground">{label}</span>
        </div>
        <p className={`text-2xl font-semibold mt-1 ${tint}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

// ============= AGENDAMENTOS DO DIA (por Atendente / Setor) =============
// Linha da função `rel_agendamentos_marcados`. Quem marcou e quando vêm da
// auditoria: `agendamentos.criado_por` nunca foi preenchida e `created_at` é o
// dia em que a VAGA foi gerada na grade, não o dia em que o paciente foi
// marcado. `usuario_id`/`usuario_nome` só vêm para a supervisão.
type AgendDiaRow = {
  agendamento_id: string;
  marcado_em: string;
  usuario_id: string | null;
  usuario_nome: string | null;
  paciente_nome: string | null;
  inicio: string;
  procedimento: string | null;
  status: string | null;
  medico_id: string | null;
};

const SEM_NOME_SETOR = "Sem usuário";
const SEM_NOME_ATENDENTE = "Site, integração ou sistema";

function AgendamentosDiarioView({
  clinicaId,
  ini,
  fim,
  ehSupervisor,
}: {
  clinicaId?: string;
  ini: string;
  fim: string;
  ehSupervisor: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [rows, setRows] = useState<AgendDiaRow[]>([]);
  const [setorMap, setSetorMap] = useState<Map<string, string>>(new Map()); // user_id -> setor nome
  const [medMap, setMedMap] = useState<Map<string, string>>(new Map());
  // Quantas linhas cada atendente está mostrando ("setor|atendente" → limite).
  const [limites, setLimites] = useState<Map<string, number>>(new Map());
  const limiteDe = (setor: string, nome: string) =>
    limites.get(`${setor}|${nome}`) ?? LIMITE_DETALHE;
  const mostrarMais = (setor: string, nome: string, limite: number) =>
    setLimites((m) => new Map(m).set(`${setor}|${nome}`, limite));

  useEffect(() => {
    if (!clinicaId) return;
    let cancel = false;
    (async () => {
      setLoading(true);
      setLimites(new Map());
      setErro(null);
      try {
        // Dia a dia (a função recebe o mesmo dia como início e fim): um mês
        // passa de 9 mil marcações e o PostgREST devolve no máximo 1.000 por
        // página. Mais recente primeiro.
        const list = (
          await buscarPorDia<AgendDiaRow>(ini, fim, (de) =>
            (supabase as any)
              .rpc("rel_agendamentos_marcados", {
                _clinica_id: clinicaId,
                _marc_ini: de,
                _marc_fim: de,
              })
              .order("marcado_em")
              .order("agendamento_id"),
          )
        ).reverse();
        const userIds = Array.from(
          new Set(list.map((r) => r.usuario_id).filter(Boolean) as string[]),
        );
        const medIds = Array.from(
          new Set(list.map((r) => r.medico_id).filter(Boolean) as string[]),
        );
        const [contratosRes, mMap] = await Promise.all([
          userIds.length
            ? supabase
                .from("hr_contratos")
                .select("user_id, setor_id, status, data_admissao")
                .eq("clinica_id", clinicaId)
                .in("user_id", userIds)
            : Promise.resolve({ data: [] as any[] }),
          nomesPorId("medicos", medIds),
        ]);
        // Pega o contrato ativo mais recente por usuário
        const userSetor = new Map<string, string | null>();
        const ordered = ((contratosRes.data ?? []) as any[]).sort((a, b) =>
          String(b.data_admissao ?? "").localeCompare(String(a.data_admissao ?? "")),
        );
        for (const c of ordered) {
          if (!userSetor.has(c.user_id)) userSetor.set(c.user_id, c.setor_id ?? null);
        }
        const setorIds = Array.from(
          new Set(Array.from(userSetor.values()).filter(Boolean) as string[]),
        );
        const setorNome = new Map<string, string>();
        if (setorIds.length) {
          const { data: secs } = await supabase
            .from("setores")
            .select("id, nome")
            .in("id", setorIds);
          ((secs ?? []) as any[]).forEach((s) => setorNome.set(s.id, s.nome ?? "—"));
        }
        const sMap = new Map<string, string>();
        for (const [uid, sid] of userSetor) {
          sMap.set(uid, sid ? (setorNome.get(sid) ?? "Sem setor") : "Sem setor");
        }
        if (cancel) return;
        setRows(list);
        setMedMap(mMap);
        setSetorMap(sMap);
      } catch (e: any) {
        if (cancel) return;
        setRows([]);
        // Função ainda não aplicada no banco: avisa em vez de "nenhum agendamento".
        setErro(
          e?.code === "PGRST202"
            ? "Esta aba precisa de uma atualização no banco que ainda não foi aplicada."
            : traduzirErro(e),
        );
        mostrarErro(e);
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [clinicaId, ini, fim]);

  // Supervisão: setor e atendente. Demais: um grupo só, sem nome de ninguém
  // (o banco nem devolve o nome para quem não tem a alçada).
  const setorDe = (r: AgendDiaRow) =>
    !ehSupervisor
      ? "Agendamentos marcados"
      : r.usuario_id
        ? (setorMap.get(r.usuario_id) ?? "Sem setor")
        : SEM_NOME_SETOR;
  const atendenteDe = (r: AgendDiaRow) =>
    !ehSupervisor
      ? "Todas as atendentes"
      : r.usuario_id
        ? (r.usuario_nome ?? "—")
        : SEM_NOME_ATENDENTE;

  const agrupado = useMemo(() => {
    const bySetor = new Map<string, Map<string, AgendDiaRow[]>>();
    for (const r of rows) {
      const setor = setorDe(r);
      const atendente = atendenteDe(r);
      if (!bySetor.has(setor)) bySetor.set(setor, new Map());
      const byAt = bySetor.get(setor)!;
      if (!byAt.has(atendente)) byAt.set(atendente, []);
      byAt.get(atendente)!.push(r);
    }
    return Array.from(bySetor.entries())
      .map(([setor, m]) => ({
        setor,
        total: Array.from(m.values()).reduce((acc, l) => acc + l.length, 0),
        atendentes: Array.from(m.entries())
          .map(([nome, lista]) => ({ nome, lista }))
          .sort((a, b) => b.lista.length - a.lista.length),
      }))
      .sort((a, b) => b.total - a.total);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, setorMap, ehSupervisor]);

  const totalGeral = rows.length;

  function exportar() {
    const flat = rows.map((r) => {
      return {
        "Marcado em": new Date(r.marcado_em).toLocaleString("pt-BR"),
        ...(ehSupervisor ? { Setor: setorDe(r), Atendente: atendenteDe(r) } : {}),
        Paciente: r.paciente_nome ?? "",
        "Data Consulta": new Date(r.inicio).toLocaleString("pt-BR"),
        Procedimento: r.procedimento ?? "",
        Médico: r.medico_id ? (medMap.get(r.medico_id) ?? "—") : "",
        Status: r.status ?? "",
      };
    });
    if (!flat.length) {
      toast.info("Nada para exportar.");
      return;
    }
    exportToExcel(flat, `agendamentos-diario-${ini}-a-${fim}`);
  }

  if (!clinicaId) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          Selecione uma clínica.
        </CardContent>
      </Card>
    );
  }
  if (loading) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">Carregando…</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Agendamentos marcados no período</h2>
          <p className="text-sm text-muted-foreground">
            Conta pelo dia em que o paciente foi <b>marcado no sistema</b> (não pela data da
            consulta).
            {ehSupervisor
              ? " Agrupado por setor e atendente."
              : " O nome de quem marcou aparece só para a supervisão."}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Total no período</div>
            <div className="text-2xl font-bold">{totalGeral}</div>
          </div>
          <Button onClick={exportar} variant="outline" size="sm" className="gap-2">
            <Download className="h-4 w-4" /> Exportar Excel
          </Button>
        </div>
      </div>

      {erro ? (
        <Card>
          <CardContent className="py-10 text-center text-destructive">
            Não foi possível carregar os agendamentos: {erro}
          </CardContent>
        </Card>
      ) : agrupado.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Nenhum paciente marcado no período.
          </CardContent>
        </Card>
      ) : (
        agrupado.map((g) => (
          <Card key={g.setor}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  {g.setor}
                </CardTitle>
                <span className="text-sm font-semibold">
                  {g.total} agendamento{g.total === 1 ? "" : "s"}
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {g.atendentes.map((a) => (
                <div key={a.nome} className="rounded-md border">
                  <div className="flex items-center justify-between bg-muted/40 px-3 py-2">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Users className="h-4 w-4 text-muted-foreground" /> {a.nome}
                    </div>
                    <span className="text-sm font-semibold">{a.lista.length}</span>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-40">Marcado em</TableHead>
                        <TableHead>Paciente</TableHead>
                        <TableHead className="w-44">Data consulta</TableHead>
                        <TableHead>Procedimento</TableHead>
                        <TableHead>Médico</TableHead>
                        <TableHead className="w-28">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {a.lista.slice(0, limiteDe(g.setor, a.nome)).map((r) => (
                        <TableRow key={r.agendamento_id}>
                          <TableCell className="text-xs">
                            {new Date(r.marcado_em).toLocaleString("pt-BR")}
                          </TableCell>
                          <TableCell className="text-sm">{r.paciente_nome ?? "—"}</TableCell>
                          <TableCell className="text-xs">
                            {new Date(r.inicio).toLocaleString("pt-BR")}
                          </TableCell>
                          <TableCell className="text-sm">{r.procedimento ?? "—"}</TableCell>
                          <TableCell className="text-sm">
                            {r.medico_id ? (medMap.get(r.medico_id) ?? "—") : "—"}
                          </TableCell>
                          <TableCell className="text-xs">{r.status ?? "—"}</TableCell>
                        </TableRow>
                      ))}
                      {/* Mais recentes primeiro, em blocos — milhares de linhas de uma vez
                          travam a tela. Antes parava nas 500 primeiras sem como continuar. */}
                      {a.lista.length > limiteDe(g.setor, a.nome) && (
                        <TableRow>
                          <TableCell colSpan={6} className="text-xs text-muted-foreground">
                            <div className="flex flex-wrap items-center gap-3 py-1">
                              <span>
                                Mostrando as {limiteDe(g.setor, a.nome).toLocaleString("pt-BR")}{" "}
                                mais recentes de {a.lista.length.toLocaleString("pt-BR")}.
                              </span>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  mostrarMais(
                                    g.setor,
                                    a.nome,
                                    limiteDe(g.setor, a.nome) + LIMITE_DETALHE,
                                  )
                                }
                              >
                                Mostrar mais {LIMITE_DETALHE}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => mostrarMais(g.setor, a.nome, a.lista.length)}
                              >
                                Mostrar todos
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              ))}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
