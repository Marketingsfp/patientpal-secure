import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { usePodeEscrever } from "@/hooks/use-permissoes";
import { useMedicoContext } from "@/hooks/use-medico-context";
import { EncerrarExpedienteButton } from "@/components/medicos/EncerrarExpedienteButton";
import { isCPFValido, somenteDigitos } from "@/lib/cpf";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { LancamentoDialog } from "@/components/financeiro/lancamento-dialog";
import { ProcedimentoCell } from "@/components/agenda/procedimento-cell";
import { PatientSearchInput } from "@/components/patient-search-input";
import { PacienteQuickActions } from "@/components/agenda/paciente-quick-actions";
import { FaceCaptureDialog } from "@/components/face/FaceCaptureDialog";
import { FichaEmUsoAlert } from "@/components/agenda/ficha-em-uso-alert";
import { PacienteResumoBar } from "@/components/agenda/paciente-resumo-bar";
import { PatientQuickCompleteSheet } from "@/components/patient-quick-complete-sheet";
import { TurboModeToggle } from "@/components/agenda/turbo-mode-toggle";
import { useTurboDisabled } from "@/hooks/use-turbo-disabled";
import { DividirOrcamentoDialog, type DividirItem } from "@/components/agenda/dividir-orcamento-dialog";
import { calcularAvisoLimitePendentes } from "@/lib/agenda/aviso-limite-pendentes";
import { SupervisorAuthDialog } from "@/components/supervisor-auth-dialog";
import {
  CalendarDays,
  Plus,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
  MoreHorizontal,
  Star,
  Flag,
  Printer,
  Download,
  Video,
  UserPlus,
  UserMinus,
  Clock,
  DollarSign,
  ShieldCheck,
  BadgeCheck,
  IdCard,
  Play,
  FileText,
  Undo2,
  CheckCircle2,
  User,
  Camera,
} from "lucide-react";
import { printGuiaAtendimento, printGuiaAtendimentoAgrupada } from "@/lib/print-gr";
import { printComprovanteAgendamento } from "@/lib/print-comprovante-agendamento";
import { VoiceInput } from "@/components/voice-input";
import { exportToExcel } from "@/lib/export-csv";
import { usePickEmitente } from "@/components/nfse/use-pick-emitente";
import { usePickTomador, aplicarValorParcial } from "@/components/nfse/use-pick-tomador";
import { usePromptDescricaoNfse } from "@/components/nfse/use-prompt-descricao";
import { useAuth } from "@/hooks/use-auth";
import {
  getProcedimentosAgenda,
  getMedicoProcedimentosAgenda,
  getMedicoConveniosAgenda,
  getProcedimentosComValor,
} from "@/lib/agenda/refs-cache";
import { useServerFn } from "@tanstack/react-start";
import { listarEquipe } from "@/lib/equipe.functions";
import { emitirNfse, consultarNfse } from "@/lib/nfse.functions";
import { criarAgendamento } from "@/lib/agenda/criar-agendamento.functions";
import { IdadeIcon } from "@/components/idade-icon";

import { DateInputBR } from "@/components/ui/date-input-br";
export const Route = createFileRoute("/_authenticated/app/agenda")({
  component: AgendaPage,
});

type Status = "agendado" | "confirmado" | "realizado" | "cancelado" | "faltou";
type TipoAtendimento = "convenio" | "particular";
type Agendamento = {
  id: string;
  paciente_nome: string;
  paciente_id: string | null;
  medico_id: string | null;
  inicio: string;
  fim: string;
  procedimento: string | null;
  status: Status;
  observacoes: string | null;
  data_pagamento?: string | null;
  medico_nome?: string | null;
  medico_sexo?: string | null;
  agenda_id?: string | null;
  orcamento_id?: string | null;
  orcamento_numero?: number | null;
  pacote_id?: string | null;
  tipo_atendimento?: TipoAtendimento | null;
  atendimento_grupo_id?: string | null;
  ficha_numero?: number | null;
  forma_pagamento_prevista?: string | null;
};
type Medico = {
  id: string;
  nome: string;
  sexo?: string | null;
  usa_sistema?: boolean;
  especialidade_id?: string | null;
  procedimento_padrao_id?: string | null;
  procedimento_padrao_em_branco?: boolean | null;
  procedimento_padrao_nome?: string | null;
  especialidade_nome?: string | null;
};
type Especialidade = { id: string; nome: string };
type Paciente = { id: string; nome: string };
type ProcedimentoRef = {
  id: string;
  nome: string;
  tipo: string | null;
  grupo?: string | null;
  tipo_procedimento?: string | null;
};
type MedicoProcedimentoRef = {
  medico_id: string | null;
  procedimento_id: string;
  especialidade_id?: string | null;
  created_at?: string | null;
};

const STATUS_LABEL: Record<Status, string> = {
  agendado: "Agendado",
  confirmado: "Confirmado",
  realizado: "Realizado",
  cancelado: "Cancelado",
  faltou: "Faltou",
};

// 🔥 CORES ATUALIZADAS - Mais suaves e acessíveis
const STATUS_COR: Record<Status, string> = {
  agendado: "bg-blue-50 text-blue-700 border border-blue-200",
  confirmado: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  realizado: "bg-green-600 text-white border border-green-700",
  cancelado: "bg-rose-50 text-rose-700 border border-rose-200",
  faltou: "bg-amber-50 text-amber-700 border border-amber-200",
};

const DIAS_SEMANA = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SAB"];
const PAGE_SIZE = 100;

const normalizar = (s: string) =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const chaveNomeAgenda = (s: string) =>
  normalizar(s)
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const isSlotLivre = (pacienteNome: string | null | undefined) => {
  const nome = normalizar(pacienteNome ?? "").trim();
  return nome === "disponivel" || nome === "bloqueio";
};

const primeiroValorValido = (...valores: unknown[]) => {
  const numeros = valores.map((valor) => Number(valor)).filter((valor) => Number.isFinite(valor));
  return numeros.find((valor) => valor > 0) ?? numeros[0] ?? 0;
};

const valorCartaoProcedimento = (proc: any) =>
  primeiroValorValido(proc?.valor_cartao_credito, proc?.valor_cartao_debito, proc?.valor_cartao, proc?.valor_padrao);

// Busca robusta de procedimento por nome. Usa lista pré-carregada (lookup local)
// e, se não achar OU vier sem valores, faz fallback direto no banco com ilike.
async function buscarProcedimentoPorNome(
  clinicaId: string,
  nome: string,
  lista: any[] | null | undefined,
): Promise<any | null> {
  // Tenta primeiro o nome COMPLETO (ex.: "ECOCARDIOGRAMA (ADULTO)"). Só se
  // não houver match exato caímos para uma versão sem sufixo entre parênteses
  // — que é uma heurística para disambiguação de especialidade
  // (ex.: "CONSULTA (CARDIOLOGIA)"). Sem isso, procedimentos cujo NOME REAL
  // termina em "(ADULTO)"/"(INFANTIL)"/etc. eram truncados e o fallback ilike
  // podia casar com outro procedimento parecido (ex.: "USG ECOCARDIOGRAMA
  // FETAL"), aplicando o valor errado no modal de cobrança.
  const nomeCompleto = (nome ?? "").trim();
  const nomeSemSufixo = nomeCompleto.replace(/\s*\([^()]*\)\s*$/, "").trim();
  const nomeBase = nomeCompleto || nomeSemSufixo;
  const alvo = nomeBase
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  const norm = (s: string) =>
    (s ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  // 1) Sempre tentar primeiro uma busca FRESCA no banco pelo nome exato
  //    (case-insensitive). Isso garante que o valor venha do cadastro atual
  //    e não de um cache em memória que pode estar desatualizado.
  const temValor = (p: any) =>
    p &&
    [
      p.valor_dinheiro,
      p.valor_pix,
      p.valor_padrao,
      p.valor_cartao,
      p.valor_cartao_credito,
      p.valor_cartao_debito,
      p.valor_dinheiro_pix,
    ].some((v) => Number(v) > 0);
  // Tenta match exato no banco: 1) nome completo, 2) sem sufixo (parênteses).
  for (const tentativa of [nomeCompleto, nomeSemSufixo].filter((s, i, a) => s && a.indexOf(s) === i)) {
    try {
      const alvoT = norm(tentativa);
      const { data: exatoDb } = await supabase
        .from("procedimentos")
        .select(
          "nome,valor_dinheiro,valor_pix,valor_padrao,valor_cartao,valor_cartao_credito,valor_cartao_debito,valor_dinheiro_pix",
        )
        .eq("clinica_id", clinicaId)
        .eq("ativo", true)
        .ilike("nome", tentativa)
        .limit(5);
      const exatoComValor =
        (exatoDb ?? []).find((p: any) => norm(p.nome ?? "") === alvoT && temValor(p)) ??
        (exatoDb ?? []).find((p: any) => norm(p.nome ?? "") === alvoT);
      if (exatoComValor) return exatoComValor;
    } catch {
      /* segue para próxima tentativa */
    }
  }
  const arr = lista ?? [];
  // Prioriza matches que TÊM valores cadastrados, para evitar pegar linhas
  // placeholder (ex.: "CONSULTA 110 E 130" com tudo zerado) na frente da
  // "CONSULTA CLINICA MEDICA" / "CONSULTA" com preços reais.
  const exatos = arr.filter((p) => norm(p.nome ?? "") === alvo);
  const includes = arr.filter((p) => norm(p.nome ?? "").includes(alvo));
  const reverso = arr.filter((p) => alvo.includes(norm(p.nome ?? "")));
  let proc: any =
    exatos.find(temValor) ??
    exatos[0] ??
    includes.find(temValor) ??
    includes[0] ??
    reverso.find(temValor) ??
    reverso[0];
  if (temValor(proc)) return proc;
  // Se a lista pré-carregada já contém os valores (formato completo) e
  // achamos o procedimento, mesmo sem valor não vale a pena bater no banco
  // de novo — economiza ~300-800ms por clique.
  const listaTemValores = arr.length > 0 && arr.some((p) => "valor_dinheiro" in p);
  if (proc && listaTemValores) return proc;
  // Fallback: consulta direta no banco com ilike (case-insensitive),
  // usando %nome% para casar variações como "ELETROCARDIOGRAMA (ECG)"
  // quando o agendamento está como "ELETROCARDIOGRAMA".
  const padrao = `%${nomeBase}%`;
  const { data } = await supabase
    .from("procedimentos")
    .select(
      "nome,valor_dinheiro,valor_pix,valor_padrao,valor_cartao,valor_cartao_credito,valor_cartao_debito,valor_dinheiro_pix",
    )
    .eq("clinica_id", clinicaId)
    .ilike("nome", padrao)
    .limit(10);
  // Prefere match exato com valor; depois qualquer um com valor; depois o primeiro.
  const exatoComValor = (data ?? []).find((p) => norm(p.nome ?? "") === alvo && temValor(p));
  const qualquerComValor = (data ?? []).find((p) => temValor(p));
  const escolhido = exatoComValor ?? qualquerComValor ?? (data ?? [])[0];
  if (temValor(escolhido)) return escolhido;
  return proc ?? escolhido ?? null;
}

// Fetchers com cache in-memory (60s / 300s) vivem em src/lib/agenda/refs-cache.ts.
// Adaptadores locais para preservar o restante do arquivo sem renomeações.
const fetchProcedimentosAgenda = getProcedimentosAgenda;
const fetchMedicoProcedimentosAgenda = getMedicoProcedimentosAgenda;

type DescontoConvenio =
  | { tipo: "percentual"; valor: number }
  | { tipo: "valor"; valor: number }
  | { tipo: "gratuidade"; valor: 0 }
  | { tipo: "valor_fixo"; valor: number; valorOutros: number };

type ConvenioInfo = {
  convenioNome: string;
  emDia: boolean;
  parcelasAtrasadas: number;
  desconto: DescontoConvenio | null;
  avisoLimite?: string;
  bloquear?: boolean;
};

function aplicarDesconto(valor: number, d: DescontoConvenio): number {
  if (d.tipo === "gratuidade") return 0;
  if (d.tipo === "percentual") return Math.max(0, valor * (1 - Number(d.valor) / 100));
  if (d.tipo === "valor_fixo") return Math.max(0, Number(d.valor) || 0);
  return Math.max(0, valor - Number(d.valor));
}

/** Aplica desconto considerando o canal de pagamento (dinheiro vs outros). */
function aplicarDescontoPorForma(valor: number, forma: string, d: DescontoConvenio): number {
  if (d.tipo === "valor_fixo") {
    const ehDinheiro = forma === "dinheiro";
    const v = ehDinheiro ? Number(d.valor) : Number(d.valorOutros);
    return Math.max(0, v || 0);
  }
  return aplicarDesconto(valor, d);
}

async function obterInfoConvenioPaciente(params: {
  clinicaId: string;
  pacienteId: string | null | undefined;
  medicoId: string | null | undefined;
  procedimentoNome: string;
  agendamentoId?: string | null;
  dataRef?: string | null; // ISO do agendamento (para checar limite no dia)
}): Promise<ConvenioInfo | null> {
  const { clinicaId, pacienteId, medicoId, procedimentoNome, agendamentoId, dataRef } = params;
  if (!pacienteId) return null;

  // 1) Contrato ativo: paciente como titular OU dependente ativo
  const { data: titularContratos } = await supabase
    .from("contratos_assinatura")
    .select("id,convenio_id,contrato_origem_id,numero_renovacoes,sem_carencia,cb_convenios(nome)")
    .eq("clinica_id", clinicaId)
    .eq("status", "ativo")
    .eq("paciente_id", pacienteId)
    .limit(5);
  let contrato: { id: string; convenio_id: string | null; contrato_origem_id?: string | null; numero_renovacoes?: number | null; sem_carencia?: boolean | null; cb_convenios: { nome: string } | null } | null =
    ((titularContratos ?? [])[0] as any) ?? null;

  if (!contrato) {
    const { data: deps } = await supabase
      .from("contrato_dependentes")
      .select("contrato_id,ativo,contratos_assinatura!inner(id,clinica_id,status,convenio_id,contrato_origem_id,numero_renovacoes,sem_carencia,cb_convenios(nome))")
      .eq("paciente_id", pacienteId)
      .eq("ativo", true)
      .limit(5);
    const cand = ((deps ?? []) as any[])
      .map((d) => d.contratos_assinatura)
      .find((c: any) => c && c.clinica_id === clinicaId && c.status === "ativo");
    if (cand) contrato = cand;
  }
  if (!contrato || !contrato.convenio_id) return null;

  const convenioNome = contrato.cb_convenios?.nome ?? "Convênio";

  // 2) Verifica mensalidades em atraso do contrato
  const hojeStr = new Date().toISOString().slice(0, 10);
  const { data: mens } = await supabase
    .from("contrato_mensalidades")
    .select("status,vencimento")
    .eq("contrato_id", contrato.id)
    .in("status", ["pendente", "aberto", "atrasado"])
    .lte("vencimento", hojeStr);
  const parcelasAtrasadas = (mens ?? []).length;
  const emDia = parcelasAtrasadas === 0;

  // 2b) Conta mensalidades pagas do contrato (para checagem de carência).
  const { count: pagasCount } = await supabase
    .from("contrato_mensalidades")
    .select("id", { count: "exact", head: true })
    .eq("contrato_id", contrato.id)
    .eq("status", "pago");
  const mensalidadesPagas = pagasCount ?? 0;

  // 3) Busca procedimento_id e especialidade do médico
  // Remove sufixo de desambiguação " (ESPECIALIDADE)" para casar com o cadastro
  // — a agenda grava o serviço como "CONSULTA (GINECOLOGIA)" mas o cadastro tem
  // só "CONSULTA". Sem isso, procedimentoTipo/procedimentoId ficavam null e
  // regras por tipo/especialidade não eram aplicadas.
  const procNomeBase = (procedimentoNome ?? "").replace(/\s*\([^()]*\)\s*$/, "").trim();
  const procNorm = procNomeBase
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  const { data: procs } = await supabase
    .from("procedimentos")
    .select("id,nome,tipo")
    .eq("clinica_id", clinicaId)
    .eq("ativo", true)
    .limit(5000);
  const procRow =
    (procs ?? []).find(
      (p: any) =>
        (p.nome ?? "")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .trim() === procNorm,
    ) ??
    (procs ?? []).find((p: any) =>
      (p.nome ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .includes(procNorm),
    );
  const procedimentoId = (procRow as any)?.id ?? null;
  const procedimentoTipo = ((procRow as any)?.tipo ?? "").toString().toLowerCase() || null;

  let especialidadeId: string | null = null;
  if (medicoId) {
    const { data: med } = await supabase.from("medicos").select("especialidade_id").eq("id", medicoId).maybeSingle();
    especialidadeId = (med as any)?.especialidade_id ?? null;
  }

  // Fallback: alguns médicos têm a especialidade somente na tabela N:N
  // medico_especialidades (e não na coluna medicos.especialidade_id).
  // Sem esse fallback, o benefício por especialidade não era encontrado e
  // o sistema exibia "sem benefício para este procedimento" mesmo com a
  // especialidade configurada no Cartão Consulta.
  let especialidadesMedico: string[] = especialidadeId ? [especialidadeId] : [];
  if (medicoId) {
    const { data: medEsps } = await supabase
      .from("medico_especialidades")
      .select("especialidade_id")
      .eq("medico_id", medicoId);
    const extras = ((medEsps ?? []) as Array<{ especialidade_id: string | null }>)
      .map((r) => r.especialidade_id)
      .filter((x): x is string => !!x);
    especialidadesMedico = Array.from(new Set([...especialidadesMedico, ...extras]));
    if (!especialidadeId && extras[0]) especialidadeId = extras[0];
  }

  // 4) Fonte única de regras de desconto: cb_convenio_regras (aba Regras de Preço).
  //    A Agenda passou a ler exatamente as mesmas regras que o Caixa usa —
  //    a aba antiga "Benefícios (regras)" (cb_beneficios) foi removida.
  const { data: regrasRaw } = await (supabase as any)
    .from("cb_convenio_regras")
    .select(
      "id,convenio_id,especialidade_id,procedimento_id,tipo,modo,valor,percentual,prioridade,ativo,carencia_mensalidades,gratuito,limite_qtd,limite_periodo,limite_escopo,excedente_modo,excedente_percentual,excedente_valor,grupo_gratuidade",
    )
    .eq("convenio_id", contrato.convenio_id)
    .eq("ativo", true);
  const regrasCb = (regrasRaw ?? []) as any[];
  const { findRegra, carenciaCumprida } = await import("@/lib/cb-regras");

  // Escolhe a regra mais específica dentre as especialidades possíveis do médico.
  const espsTentativa: (string | null)[] = especialidadesMedico.length ? [...especialidadesMedico, null] : [null];
  let regraMatch: any = null;
  for (const eid of espsTentativa) {
    const r = findRegra(regrasCb as any, eid, procedimentoTipo, procedimentoId);
    if (r) {
      regraMatch = r;
      break;
    }
  }

  // Deriva desconto a partir da regra escolhida (gratuidade > modo).
  let desconto: DescontoConvenio | null = null;
  let beneficioEscolhido: any = null;
  if (regraMatch) {
    beneficioEscolhido = {
      ...regraMatch,
      // Campos derivados para compatibilidade com o resto do fluxo (limite/excedente).
      escopo: regraMatch.procedimento_id ? "servico" : "especialidade",
    };
    if (regraMatch.gratuito) {
      desconto = { tipo: "gratuidade", valor: 0 };
    } else if (regraMatch.modo === "valor_fixo") {
      const v = Number(regraMatch.valor) || 0;
      desconto = { tipo: "valor_fixo", valor: v, valorOutros: v };
    } else if (regraMatch.modo === "percentual_desconto") {
      desconto = { tipo: "percentual", valor: Number(regraMatch.percentual) || 0 };
    }
  }

  // 4b) Carência: se o contrato não cumpriu a carência mínima, suspende o desconto
  //     (paga particular). Já era feito antes, agora fica junto com o resto.
  let avisoLimite: string | undefined;
  let bloquear = false;
  // Contratos oriundos de renovação (extensão do mesmo contrato ou troca de
  // plano gerando novo contrato) não têm carência — o paciente já é cliente
  // do convênio há pelo menos um ciclo. Considera renovação quando o contrato
  // já foi renovado ao menos uma vez ou tem contrato de origem.
  const isRenovacao =
    Number((contrato as any)?.numero_renovacoes ?? 0) > 0 ||
    !!(contrato as any)?.contrato_origem_id ||
    !!(contrato as any)?.sem_carencia;
  if (regraMatch && !isRenovacao && !carenciaCumprida(regraMatch, mensalidadesPagas)) {
    const n = Number(regraMatch.carencia_mensalidades) || 0;
    desconto = null;
    beneficioEscolhido = null;
    avisoLimite = `Convênio ${convenioNome}: benefício disponível somente após a ${n}ª mensalidade paga (contrato tem ${mensalidadesPagas} paga(s)). Cobrando valor particular.`;
  }

  // 5) Checa limite de uso do benefício escolhido (ex.: "1 consulta R$9,99/dia/contrato")
  if (beneficioEscolhido && beneficioEscolhido.limite_qtd && emDia) {
    const dataBase = dataRef ? new Date(dataRef) : new Date();
    const periodo = (beneficioEscolhido.limite_periodo ?? "dia") as string;
    // Janela do período (dia/semana/mes) ou histórico completo (contrato).
    let janelaInicio: Date | null = null;
    let janelaFim: Date | null = null;
    if (periodo === "semana") {
      const d = new Date(dataBase);
      const dow = (d.getDay() + 6) % 7; // 0 = segunda
      janelaInicio = new Date(d);
      janelaInicio.setDate(d.getDate() - dow);
      janelaInicio.setHours(0, 0, 0, 0);
      janelaFim = new Date(janelaInicio);
      janelaFim.setDate(janelaInicio.getDate() + 6);
      janelaFim.setHours(23, 59, 59, 999);
    } else if (periodo === "mes") {
      janelaInicio = new Date(dataBase.getFullYear(), dataBase.getMonth(), 1, 0, 0, 0, 0);
      janelaFim = new Date(dataBase.getFullYear(), dataBase.getMonth() + 1, 0, 23, 59, 59, 999);
    } else if (periodo === "contrato") {
      janelaInicio = null;
      janelaFim = null;
    } else {
      janelaInicio = new Date(dataBase);
      janelaInicio.setHours(0, 0, 0, 0);
      janelaFim = new Date(dataBase);
      janelaFim.setHours(23, 59, 59, 999);
    }

    // Pacientes que compartilham a cota do contrato
    let pacientesCota: string[] = [];
    const escopoLim = beneficioEscolhido.limite_escopo as string | null;
    if (escopoLim === "paciente") {
      pacientesCota = [pacienteId];
    } else {
      // titular + dependentes ativos do contrato (contrato ou titular_ou_dependente)
      pacientesCota = [contrato.id ? "" : ""]; // placeholder, substituído abaixo
      const { data: tit } = await supabase
        .from("contratos_assinatura")
        .select("paciente_id")
        .eq("id", contrato.id)
        .maybeSingle();
      const { data: depsCota } = await supabase
        .from("contrato_dependentes")
        .select("paciente_id")
        .eq("contrato_id", contrato.id)
        .eq("ativo", true);
      pacientesCota = Array.from(
        new Set([
          ...((tit as any)?.paciente_id ? [(tit as any).paciente_id as string] : []),
          ...((depsCota ?? []) as Array<{ paciente_id: string }>).map((d) => d.paciente_id),
        ]),
      );
    }

    if (pacientesCota.length > 0) {
      let q = supabase
        .from("agendamentos")
        .select("id,medico_id,procedimento,paciente_id,status,inicio", { count: "exact" })
        .eq("clinica_id", clinicaId)
        .in("paciente_id", pacientesCota)
        .neq("status", "cancelado");
      if (janelaInicio) q = q.gte("inicio", janelaInicio.toISOString());
      if (janelaFim) q = q.lte("inicio", janelaFim.toISOString());
      if (agendamentoId) q = q.neq("id", agendamentoId);
      const { data: agsDia } = await q;

      // Se o benefício é por especialidade, filtra pelos agendamentos cujo
      // médico tem a mesma especialidade.
      let usados = 0;
      let agsFiltrados: Array<{
        id: string;
        medico_id: string | null;
        paciente_id?: string | null;
        status?: string | null;
        inicio?: string | null;
      }> = [];
      if (beneficioEscolhido.escopo === "especialidade" && beneficioEscolhido.especialidade_id) {
        const medicoIds = Array.from(
          new Set(
            ((agsDia ?? []) as Array<{ medico_id: string | null }>)
              .map((a) => a.medico_id)
              .filter((x): x is string => !!x),
          ),
        );
        if (medicoIds.length) {
          const { data: meds } = await supabase.from("medicos").select("id,especialidade_id").in("id", medicoIds);
          const { data: medEspN } = await supabase
            .from("medico_especialidades")
            .select("medico_id,especialidade_id")
            .in("medico_id", medicoIds);
          const espByMed = new Map<string, Set<string>>();
          ((meds ?? []) as Array<{ id: string; especialidade_id: string | null }>).forEach((m) => {
            const s = espByMed.get(m.id) ?? new Set<string>();
            if (m.especialidade_id) s.add(m.especialidade_id);
            espByMed.set(m.id, s);
          });
          ((medEspN ?? []) as Array<{ medico_id: string; especialidade_id: string | null }>).forEach((m) => {
            const s = espByMed.get(m.medico_id) ?? new Set<string>();
            if (m.especialidade_id) s.add(m.especialidade_id);
            espByMed.set(m.medico_id, s);
          });
          agsFiltrados = (
            (agsDia ?? []) as Array<{
              id: string;
              medico_id: string | null;
              paciente_id?: string | null;
              status?: string | null;
              inicio?: string | null;
            }>
          ).filter((a) => {
            if (!a.medico_id) return false;
            const s = espByMed.get(a.medico_id);
            return s ? s.has(beneficioEscolhido.especialidade_id) : false;
          });
        }
      } else {
        agsFiltrados = (agsDia ?? []) as Array<{
          id: string;
          medico_id: string | null;
          paciente_id?: string | null;
          status?: string | null;
          inicio?: string | null;
        }>;
      }
      // Grupo de gratuidade compartilhada: se a regra pertence a um grupo,
      // a cota é dividida entre todos os procedimentos do grupo. Filtramos os
      // agendamentos por nome do procedimento (agendamentos.procedimento é
      // texto) usando os nomes dos procedimentos vinculados ao mesmo grupo.
      if (beneficioEscolhido.grupo_gratuidade) {
        const grupoProcIds = Array.from(
          new Set(
            (regrasCb as Array<{ grupo_gratuidade: string | null; procedimento_id: string | null }>)
              .filter((r) => r.grupo_gratuidade === beneficioEscolhido.grupo_gratuidade && r.procedimento_id)
              .map((r) => r.procedimento_id as string),
          ),
        );
        if (grupoProcIds.length) {
          const { data: procsNomes } = await supabase.from("procedimentos").select("nome").in("id", grupoProcIds);
          const normProc = (s: string | null | undefined) =>
            (s ?? "")
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .trim()
              .toUpperCase();
          const nomesSet = new Set(((procsNomes ?? []) as Array<{ nome: string | null }>).map((p) => normProc(p.nome)));
          const agsWithProc = agsFiltrados as Array<{
            id: string;
            medico_id: string | null;
            paciente_id?: string | null;
            status?: string | null;
            inicio?: string | null;
            procedimento?: string | null;
          }>;
          agsFiltrados = agsWithProc.filter((a) => nomesSet.has(normProc(a.procedimento)));
        }
      }
      // Regra: o limite só é consumido quando o agendamento efetivamente foi
      // pago. O status na tabela `agendamentos` nem sempre muda para
      // "realizado" após a cobrança no caixa — o sinal mais confiável é a
      // existência de um `fin_lancamentos` (receita, confirmado) vinculado ao
      // agendamento. Combinamos ambos.
      const idsFiltrados = agsFiltrados.map((a) => a.id).filter(Boolean);
      const pagosIds = new Set<string>();
      if (idsFiltrados.length > 0) {
        const { data: lancs } = await supabase
          .from("fin_lancamentos")
          .select("agendamento_id")
          .eq("clinica_id", clinicaId)
          .eq("tipo", "receita")
          .eq("status", "confirmado")
          .in("agendamento_id", idsFiltrados);
        ((lancs ?? []) as Array<{ agendamento_id: string | null }>).forEach((l) => {
          if (l.agendamento_id) pagosIds.add(l.agendamento_id);
        });
      }
      const isPago = (a: { id: string; status?: string | null }) =>
        a.status === "realizado" || a.status === "pago" || pagosIds.has(a.id);
      const agsPagos = agsFiltrados.filter((a) => isPago(a));
      const agsPendentes = agsFiltrados.filter((a) => !isPago(a));
      usados = agsPagos.length;

      // Escopo "titular ou dependente (exclusivo)": se qualquer OUTRO paciente
      // do contrato já consumiu na janela, a cota é considerada esgotada.
      let esgotadoExclusivo = false;
      if (escopoLim === "titular_ou_dependente") {
        esgotadoExclusivo = agsPagos.some((a) => a.paciente_id && a.paciente_id !== pacienteId);
      }

      if (usados >= Number(beneficioEscolhido.limite_qtd) || esgotadoExclusivo) {
        const modo = beneficioEscolhido.excedente_modo;
        const escopoTxt =
          escopoLim === "paciente"
            ? "paciente"
            : escopoLim === "titular_ou_dependente"
              ? "titular-ou-dependente"
              : "contrato";
        const periodoTxt =
          periodo === "semana" ? "semana" : periodo === "mes" ? "mês" : periodo === "contrato" ? "contrato" : "dia";
        // Se a regra é gratuita e o limite já foi consumido, monta um texto
        // detalhado com data/paciente/médico do consumidor (pode ser o
        // titular ou dependente do mesmo contrato).
        let consumidorTxt = "";
        if (beneficioEscolhido.gratuito && agsPagos.length > 0) {
          const consumidor = agsPagos.slice().sort((a, b) => {
            const ta = a.inicio ? new Date(a.inicio).getTime() : 0;
            const tb = b.inicio ? new Date(b.inicio).getTime() : 0;
            return tb - ta;
          })[0];
          let medicoNome = "";
          let pacienteNome = "";
          if (consumidor?.medico_id) {
            const { data: m } = await supabase
              .from("medicos")
              .select("nome")
              .eq("id", consumidor.medico_id)
              .maybeSingle();
            medicoNome = (m as { nome?: string } | null)?.nome ?? "";
          }
          if (consumidor?.paciente_id) {
            const { data: p } = await supabase
              .from("pacientes")
              .select("nome")
              .eq("id", consumidor.paciente_id)
              .maybeSingle();
            pacienteNome = (p as { nome?: string } | null)?.nome ?? "";
          }
          const dt = consumidor?.inicio ? new Date(consumidor.inicio) : null;
          const dtTxt = dt
            ? `${dt.toLocaleDateString("pt-BR")} às ${dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
            : "";
          consumidorTxt = `Gratuidade de ${procedimentoNome} deste convênio já foi utilizada${dtTxt ? ` em ${dtTxt}` : ""}${pacienteNome ? ` por ${pacienteNome}` : ""}${medicoNome ? ` com Dr(a). ${medicoNome}` : ""}.\n`;
        }
        if (modo === "bloquear") {
          bloquear = true;
          desconto = null;
          avisoLimite = consumidorTxt
            ? `${consumidorTxt}Este atendimento fica bloqueado pelo convênio.`
            : esgotadoExclusivo
              ? `Cota exclusiva já usada por outro membro do contrato — agendamento bloqueado pelo convênio.`
              : `Limite de ${beneficioEscolhido.limite_qtd}/${periodoTxt} por ${escopoTxt} atingido — agendamento bloqueado pelo convênio.`;
        } else if (modo === "particular") {
          desconto = null;
          avisoLimite = consumidorTxt
            ? `${consumidorTxt}Cobrando valor particular cheio neste atendimento.`
            : `Limite de ${beneficioEscolhido.limite_qtd}/${periodoTxt} por ${escopoTxt} atingido — cobrando valor particular cheio.`;
        } else if (modo === "valor_fixo") {
          const v = Number(beneficioEscolhido.excedente_valor) || 0;
          desconto = { tipo: "valor_fixo", valor: v, valorOutros: v };
          avisoLimite = consumidorTxt
            ? `${consumidorTxt}Cobrando valor fixo excedente de R$ ${v.toFixed(2)} neste atendimento.`
            : `Limite atingido — cobrando valor fixo excedente R$ ${v.toFixed(2)}.`;
        } else if (modo === "percentual_particular") {
          const pct = Number(beneficioEscolhido.excedente_percentual) || 0;
          // pct = desconto sobre o particular; ex.: 50 → paga 50% do particular
          desconto = { tipo: "percentual", valor: pct };
          avisoLimite = consumidorTxt
            ? `${consumidorTxt}Cobrando ${100 - pct}% do valor particular neste atendimento.`
            : `Limite de ${beneficioEscolhido.limite_qtd}/${periodoTxt} por ${escopoTxt} atingido — cobrando ${100 - pct}% do valor particular.`;
        } else if (modo === "regra_padrao_convenio") {
          // Fallback: procura a próxima regra do mesmo convênio para este
          // procedimento excluindo regras gratuitas. Aplica o desconto dessa
          // regra como se o benefício gratuito não existisse.
          let fallback: any = null;
          for (const eid of espsTentativa) {
            const r = findRegra(regrasCb as any, eid, procedimentoTipo, procedimentoId, { excludeGratuito: true });
            if (r) {
              fallback = r;
              break;
            }
          }
          if (fallback) {
            if (fallback.modo === "valor_fixo") {
              const v = Number(fallback.valor) || 0;
              desconto = { tipo: "valor_fixo", valor: v, valorOutros: v };
              avisoLimite = consumidorTxt
                ? `${consumidorTxt}Aplicando o desconto padrão do convênio (R$ ${v.toFixed(2)}).`
                : `Limite de ${beneficioEscolhido.limite_qtd}/${periodoTxt} por ${escopoTxt} atingido — aplicando desconto padrão do convênio (R$ ${v.toFixed(2)}).`;
            } else if (fallback.modo === "percentual_desconto") {
              const p = Number(fallback.percentual) || 0;
              desconto = { tipo: "percentual", valor: p };
              avisoLimite = consumidorTxt
                ? `${consumidorTxt}Aplicando o desconto padrão do convênio (${p}% off).`
                : `Limite de ${beneficioEscolhido.limite_qtd}/${periodoTxt} por ${escopoTxt} atingido — aplicando desconto padrão do convênio (${p}% off).`;
            } else {
              desconto = null;
              avisoLimite = consumidorTxt
                ? `${consumidorTxt}Sem regra padrão configurada — cobrando particular.`
                : `Limite atingido e sem regra padrão do convênio — cobrando valor particular.`;
            }
          } else {
            desconto = null;
            avisoLimite = consumidorTxt
              ? `${consumidorTxt}Não há regra padrão do convênio para este procedimento — cobrando valor particular.`
              : `Limite atingido e não há regra padrão do convênio — cobrando valor particular.`;
          }
        }
      } else if (agsPendentes.length >= 1) {
        // Cota ainda não consumida, mas existem outros agendamentos pendentes
        // que compartilham a cota — aviso informativo (não altera desconto).
        const aviso = calcularAvisoLimitePendentes({
          beneficio: beneficioEscolhido,
          pendentes: agsPendentes as { procedimento?: string | null }[],
          usados,
          procedimentoNome,
        });
        if (aviso) avisoLimite = aviso;
      }
    }
  }

  return { convenioNome, emDia, parcelasAtrasadas, desconto, avisoLimite, bloquear };
}

const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const EMPTY = {
  paciente_nome: "",
  paciente_id: "",
  medico_id: "",
  inicio: "",
  fim: "",
  procedimento: "",
  procedimentos: [] as string[],
  status: "agendado" as Status,
  observacoes: "",
  data_pagamento: "",
  orcamento_id: "",
  orcamento_numero: "",
  orcamento_itens: [] as string[],
  tipo_atendimento: "particular" as TipoAtendimento,
  forma_pagamento_prevista: "" as string,
};

function AgendaPage() {
  const { clinicaAtual } = useClinica();
  const turboDisabled = useTurboDisabled();
  const podeEscrever = usePodeEscrever("agenda");
  const { medicoId: medicoLogadoId, isMedicoOnly } = useMedicoContext();
  const [usuarioEhMedico, setUsuarioEhMedico] = useState(false);
  const corClinica = (() => {
    const n = (clinicaAtual?.clinica.nome ?? "").toLowerCase();
    if (n.includes("são francisco") || n.includes("sao francisco")) return "#14532d";
    if (n.includes("menino jesus")) return "#172554";
    if (n.includes("consulta hoje")) return "#5b21b6";
    return "hsl(var(--border))";
  })();
  const bordaClinica = { borderColor: corClinica, borderWidth: 2 } as const;
  const { user } = useAuth();
  const { pick: pickEmitenteNfse, dialog: emitenteNfseDialog } = usePickEmitente();
  const { pick: pickTomadorNfse, dialog: tomadorNfseDialog } = usePickTomador();
  const { prompt: pedirDescricaoNfse, dialog: descricaoNfseDialog } = usePromptDescricaoNfse();
  const [dataRef, setDataRef] = useState(() => {
    const d = new Date();
    // se hoje for sáb/dom, avança para o próximo dia útil (funcionamento)
    while (d.getDay() === 0) d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [dataFim, setDataFim] = useState<string | null>(null);
  // Padrão: filtro de data é "a partir de" — traz o dia selecionado em
  // diante, para que a recepção veja os próximos agendamentos do paciente
  // sem precisar ampliar a janela manualmente. Marcando o checkbox
  // "Exibir apenas a data selecionada" o filtro passa a trazer só o dia
  // escolhido (comportamento antigo).
  const [apenasData, setApenasData] = useState(false);
  const [mostrarLivres, setMostrarLivres] = useState(true);
  const [filtroMedico, setFiltroMedico] = useState<string>("todos");
  const [filtroEspecialidade, setFiltroEspecialidade] = useState<string>("todos");
  const [filtroAgenda, setFiltroAgenda] = useState<string>("todos");
  const [agendasPorMedico, setAgendasPorMedico] = useState<Map<string, { id: string; nome: string }[]>>(new Map());
  // Lookup id-da-agenda → nome, usado pelo filtro "Tipo de agenda" quando
  // agrupa por NOME (evita duplicidades quando vários médicos têm agendas
  // homônimas, ex.: "AGENDA", "CONSULTAS").
  const agendaNomePorId = useMemo(() => {
    const m = new Map<string, string>();
    for (const arr of agendasPorMedico.values()) {
      for (const a of arr) m.set(a.id, a.nome);
    }
    return m;
  }, [agendasPorMedico]);
  const [procIdsPorAgenda, setProcIdsPorAgenda] = useState<Map<string, Set<string>>>(new Map());
  // Solicitações de estorno pendentes por agendamento — a linha correspondente
  // fica em vermelho e, para o médico, o paciente é ocultado até o financeiro
  // decidir.
  const [estornoPendAgs, setEstornoPendAgs] = useState<Set<string>>(new Set());
  const [filtroDiaSemana, setFiltroDiaSemana] = useState<string>("todos");
  const [filtroStatus, setFiltroStatus] = useState<string>("todos");
  const [filtroCliente, setFiltroCliente] = useState("");
  const [filtroFicha, setFiltroFicha] = useState("");
  const [filtroApenasMultiplo, setFiltroApenasMultiplo] = useState<boolean>(false);
  const [page, setPage] = useState(1);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [items, setItems] = useState<Agendamento[]>([]);
  const [pagosSet, setPagosSet] = useState<Set<string>>(new Set());
  const [pagoInfoMap, setPagoInfoMap] = useState<Map<string, { valor: number; forma: string | null }>>(new Map());
  // Mapa agendamento_id → NFS-e mais recente (id/status/url_pdf).
  const [nfseMap, setNfseMap] = useState<
    Map<string, { id: string; status: string | null; url_pdf: string | null; numero: string | null }>
  >(new Map());
  const [nascMap, setNascMap] = useState<Map<string, string | null>>(new Map());
  const [convenioMap, setConvenioMap] = useState<Map<string, string>>(new Map());
  const [etapaMap, setEtapaMap] = useState<Map<string, string>>(new Map());
  const [medicos, setMedicos] = useState<Medico[]>([]);
  const [recursoIds, setRecursoIds] = useState<Set<string>>(new Set());
  const [exames, setExames] = useState<{ id: string; nome: string }[]>([]);
  const [procedimentosList, setProcedimentosList] = useState<
    { id: string; nome: string; tipo_procedimento?: string | null }[]
  >([]);
  const [procPorMedico, setProcPorMedico] = useState<Map<string, Set<string>>>(new Map());
  const [procOpcoesPorMedico, setProcOpcoesPorMedico] = useState<Map<string, { id: string; nome: string }[]>>(
    new Map(),
  );
  const [procNomesPorMedico, setProcNomesPorMedico] = useState<Map<string, Set<string>>>(new Map());
  // Contagem histórica de uso de cada procedimento na clínica (últimos 365 dias).
  // Chave: normalizar(nome). Usado para ordenar as opções no agendamento
  // colocando os exames mais solicitados no topo (ex.: Top 10 USG/RX/TC/RM).
  const [procedimentoUsoMap, setProcedimentoUsoMap] = useState<Map<string, number>>(new Map());
  const [especialidades, setEspecialidades] = useState<Especialidade[]>([]);
  const [medicoEspec, setMedicoEspec] = useState<Map<string, Set<string>>>(new Map());
  const [pacientes, setPacientes] = useState<Paciente[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Agendamento | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [buscandoOrc, setBuscandoOrc] = useState(false);
  // Dialog de divisão de orçamento (vários grupos de procedimentos → vários agendamentos vinculados)
  const [dividirOpen, setDividirOpen] = useState(false);
  const [dividirCtx, setDividirCtx] = useState<{
    orcamento: { id: string; numero: number; paciente_id: string | null; paciente_nome: string | null };
    itens: DividirItem[];
    inicioPadrao: string;
  } | null>(null);
  // IDs dos itens do orçamento que serão consumidos pelo agendamento atual
  // (fluxo de 1 grupo). Gravados em `agendamento_orcamento_itens` após o save.
  const [pendingOrcItemIds, setPendingOrcItemIds] = useState<string[]>([]);
  // Modo Turbo: sheet "Completar cadastro" acionado pela PacienteResumoBar
  const [quickCompleteOpen, setQuickCompleteOpen] = useState(false);
  // Informações do contrato ativo de cartão benefícios do paciente selecionado no modal.
  // Usado para mostrar o seletor "Tipo de atendimento" (Convênio × Particular) e alertar sobre mensalidade em atraso.
  const [contratoPacienteInfo, setContratoPacienteInfo] = useState<{
    convenioNome: string;
    totalAberto: number;
    qtdAtrasadas: number;
  } | null>(null);
  const contratoPacienteReqId = useRef(0);
  useEffect(() => {
    if (!open || !clinicaAtual || !form.paciente_id) {
      setContratoPacienteInfo(null);
      return;
    }
    const reqId = ++contratoPacienteReqId.current;
    const pacId = form.paciente_id;
    const clinicaId = clinicaAtual.clinica_id;
    (async () => {
      // 1) Contrato ativo (titular ou dependente)
      const { data: titular } = await supabase
        .from("contratos_assinatura")
        .select("id, cb_convenios(nome)")
        .eq("clinica_id", clinicaId)
        .eq("status", "ativo")
        .eq("paciente_id", pacId)
        .limit(1);
      let contrato: { id: string; convenioNome: string } | null = null;
      const t0 = (titular ?? [])[0] as any;
      if (t0) contrato = { id: t0.id, convenioNome: t0.cb_convenios?.nome ?? "Convênio" };
      if (!contrato) {
        const { data: deps } = await supabase
          .from("contrato_dependentes")
          .select("contratos_assinatura!inner(id,clinica_id,status,cb_convenios(nome))")
          .eq("paciente_id", pacId)
          .eq("ativo", true)
          .limit(5);
        const cand = ((deps ?? []) as any[])
          .map((d) => d.contratos_assinatura)
          .find((c: any) => c && c.clinica_id === clinicaId && c.status === "ativo");
        if (cand) contrato = { id: cand.id, convenioNome: cand.cb_convenios?.nome ?? "Convênio" };
      }
      if (reqId !== contratoPacienteReqId.current) return;
      if (!contrato) {
        setContratoPacienteInfo(null);
        return;
      }
      // 2) Mensalidades vencidas
      const hojeStr = new Date().toISOString().slice(0, 10);
      const { data: mens } = await supabase
        .from("contrato_mensalidades")
        .select("valor,vencimento,status")
        .eq("contrato_id", contrato.id)
        .in("status", ["pendente", "aberto", "atrasado"])
        .lte("vencimento", hojeStr);
      if (reqId !== contratoPacienteReqId.current) return;
      const lista = (mens ?? []) as Array<{ valor: number | string; vencimento: string }>;
      const totalAberto = lista.reduce((s, m) => s + (Number(m.valor) || 0), 0);
      setContratoPacienteInfo({
        convenioNome: contrato.convenioNome,
        totalAberto,
        qtdAtrasadas: lista.length,
      });
      // Regra: se o paciente tem cartão convênio e está EM DIA → "Convênio".
      // Se está EM ATRASO → "Particular". Aplica também na edição de
      // agendamentos antigos que ficaram gravados incorretamente como
      // "particular" mesmo com o cartão em dia.
      setForm((f) => ({
        ...f,
        tipo_atendimento: lista.length === 0 ? "convenio" : "particular",
      }));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, form.paciente_id, clinicaAtual?.clinica_id]);
  // Abre o diálogo "Novo agendamento" pré-preenchido a partir de querystring
  // (usado pelo botão "Agendar" da conversa do WhatsApp).
  const novoFromUrlConsumido = useRef(false);
  useEffect(() => {
    if (novoFromUrlConsumido.current) return;
    if (typeof window === "undefined") return;
    if (!clinicaAtual) return;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("novo") !== "1") return;
    novoFromUrlConsumido.current = true;
    if (!podeEscrever) {
      toast.error("Você não tem permissão de edição neste módulo.");
      return;
    }
    const pacIdParam = sp.get("novoPacId") || "";
    const pacNomeParam = sp.get("novoPacNome") || "";
    const telParam = sp.get("novoTelefone") || "";
    const base = new Date(`${dataRef}T09:00:00`);
    const end = new Date(base.getTime() + 30 * 60000);
    void (async () => {
      let pacienteId = "";
      let pacienteNome = pacNomeParam;
      if (pacIdParam) {
        const { data: pac } = await supabase
          .from("pacientes")
          .select("id,nome")
          .eq("clinica_id", clinicaAtual.clinica_id)
          .eq("id", pacIdParam)
          .maybeSingle();
        if (pac) {
          pacienteId = pac.id;
          pacienteNome = pac.nome ?? pacNomeParam;
        }
      }
      setEditing(null);
      setForm({
        ...EMPTY,
        inicio: toLocalInput(base.toISOString()),
        fim: toLocalInput(end.toISOString()),
        paciente_id: pacienteId,
        paciente_nome: pacienteNome,
        observacoes: !pacienteId && telParam ? `Contato WhatsApp: ${telParam}` : "",
      });
      setOpen(true);
    })();
    // Limpa os params da URL para não reabrir ao recarregar.
    const url = new URL(window.location.href);
    ["novo", "novoPacId", "novoPacNome", "novoTelefone"].forEach((k) => url.searchParams.delete(k));
    window.history.replaceState({}, "", url.pathname + (url.search ? `?${url.searchParams}` : ""));
  }, [clinicaAtual?.clinica_id, dataRef]);
  // Reagendamento
  const [reagendandoAg, setReagendandoAg] = useState<Agendamento | null>(null);
  const [reagSalvando, setReagSalvando] = useState(false);
  // Reagendamento em lote (vários pacientes para outra agenda)
  const [reagLoteSalvando, setReagLoteSalvando] = useState(false);
  // Ids dos pacientes selecionados em modo de reagendamento em lote (mesmo fluxo do individual: clicar num slot DISPONÍVEL)
  const [reagLoteIds, setReagLoteIds] = useState<string[] | null>(null);

  const iniciarReagendamento = (a: Agendamento) => {
    if (!podeEscrever) {
      toast.error("Você não tem permissão de edição neste módulo.");
      return;
    }
    if (a.status === "realizado") {
      toast.error("Atendimento já realizado — peça ao financeiro para estornar antes de reagendar.");
      return;
    }
    setReagendandoAg(a);
    toast.info("Selecione um horário disponível na agenda para confirmar o reagendamento.");
  };
  const cancelarReagendamento = () => setReagendandoAg(null);

  const confirmarReagendamentoNoSlot = async (slot: Agendamento) => {
    if (!podeEscrever) {
      toast.error("Você não tem permissão de edição neste módulo.");
      return;
    }
    const origem = reagendandoAg;
    if (!origem || reagSalvando) return;
    if (slot.id === origem.id) {
      toast.info("Esse já é o horário atual.");
      return;
    }
    if (!isSlotLivre(slot.paciente_nome)) {
      toast.error("Esse horário não está disponível. Escolha um slot DISPONÍVEL.");
      return;
    }
    setReagSalvando(true);
    const trilha = `[Reagendado em ${new Date().toLocaleString("pt-BR")}] de ${new Date(origem.inicio).toLocaleString("pt-BR")} para ${new Date(slot.inicio).toLocaleString("pt-BR")}`;
    // Libera origem + ocupa destino + transfere lançamentos financeiros numa
    // única transação (RPC) — se qualquer etapa falhar, o Postgres desfaz
    // tudo. Antes eram 3 updates client-side separados: se o 2º falhasse, a
    // origem já tinha sido liberada e o paciente "sumia" do horário original.
    const { error } = await supabase.rpc("reagendar_atendimento", {
      _origem_id: origem.id,
      _destino_id: slot.id,
      _trilha_msg: trilha,
    } as never);
    if (error) {
      setReagSalvando(false);
      mostrarErro(error);
      return;
    }
    setReagSalvando(false);
    setReagendandoAg(null);
    toast.success(`Reagendado para ${new Date(slot.inicio).toLocaleString("pt-BR")}.`);
    await load();
  };

  const [pagamentoOpen, setPagamentoOpen] = useState(false);
  const [pagamentoDesc, setPagamentoDesc] = useState("");
  const [pagamentoAgId, setPagamentoAgId] = useState<string | null>(null);
  const [pagamentoExtraIds, setPagamentoExtraIds] = useState<string[]>([]);
  const [pagamentoForma, setPagamentoForma] = useState<string>("");
  // Peso por atendimento p/ rateio quando o pagamento é agrupado.
  // key = agendamento_id, value = valor cheio (cartão preferido, senão dinheiro).
  const [pagamentoPesos, setPagamentoPesos] = useState<Record<string, number>>({});
  // Rótulo curto por atendimento p/ compor a descrição individual do lançamento.
  const [pagamentoRotulos, setPagamentoRotulos] = useState<Record<string, string>>({});
  // Nome do paciente do pagamento agrupado (para compor descrições individuais).
  const [pagamentoPacienteNome, setPagamentoPacienteNome] = useState<string>("");
  // Sinaliza que após o pagamento+impressão devemos abrir a emissão da NFS-e.
  const emitirNotaAposRef = useRef(false);
  const emitenteNotaAposRef = useRef<string | null>(null);
  const navigate = useNavigate();
  // ── Desconto aplicado ANTES de "Salvar e Pagar" (com autorização da supervisão).
  type DescontoPendente = { tipo: "valor" | "percentual"; input: string; autorizadoPor: string; motivo: string };
  const [descontoPendente, setDescontoPendente] = useState<DescontoPendente | null>(null);
  const [descontoDlgOpen, setDescontoDlgOpen] = useState(false);
  const [supervisorOpen, setSupervisorOpen] = useState(false);
  const [descForm, setDescForm] = useState<{
    tipo: "valor" | "percentual";
    input: string;
    motivo: string;
    autorizadoPor: string;
  }>({ tipo: "valor", input: "", motivo: "", autorizadoPor: "" });
  const ehSupervisorDesc = ["admin", "gestor", "financeiro"].includes(clinicaAtual?.role ?? "");
  // Aplica desconto pendente a um valor (R$).
  const aplicarDescontoPendente = (valor: number): number => {
    if (!descontoPendente) return valor;
    const n = Number(String(descontoPendente.input).replace(",", ".")) || 0;
    if (n <= 0) return valor;
    const d = descontoPendente.tipo === "percentual" ? valor * (Math.min(100, n) / 100) : Math.min(valor, n);
    return Math.max(0, valor - d);
  };
  const descricaoComDesconto = (desc: string): string => {
    if (!descontoPendente) return desc;
    const n = Number(String(descontoPendente.input).replace(",", ".")) || 0;
    const txt = descontoPendente.tipo === "percentual" ? `${n}%` : `R$ ${n.toFixed(2)}`;
    const partes = [
      `Desconto: ${txt}`,
      `Autorizado por: ${descontoPendente.autorizadoPor}`,
      descontoPendente.motivo ? `Motivo: ${descontoPendente.motivo}` : null,
    ]
      .filter(Boolean)
      .join(" — ");
    return desc ? `${desc}\n${partes}` : partes;
  };
  const [pacInfoOpen, setPacInfoOpen] = useState(false);
  const [pacInfoLoading, setPacInfoLoading] = useState(false);
  const [pacInfo, setPacInfo] = useState<Record<string, any> | null>(null);

  const abrirInfoPaciente = async (pacienteId: string | null | undefined, nomeFallback: string) => {
    setPacInfoOpen(true);
    setPacInfo({ nome: nomeFallback });
    if (!pacienteId) return;
    setPacInfoLoading(true);
    const { data } = await supabase
      .from("pacientes")
      .select("id,nome,cpf,telefone,email,data_nascimento,numero_pasta,cidade,estado,bairro,logradouro,numero,foto_url")
      .eq("id", pacienteId)
      .maybeSingle();
    if (data) {
      const base: any = { ...data };
      const camposComplementares = [
        "telefone",
        "email",
        "cep",
        "logradouro",
        "numero",
        "bairro",
        "cidade",
        "estado",
        "foto_url",
      ];
      const faltando = camposComplementares.filter((k) => !base[k]);
      if (faltando.length > 0 && clinicaAtual) {
        try {
          const cpfDigits = String(base.cpf ?? "").replace(/\D/g, "");
          let q = supabase
            .from("pacientes")
            .select("id,cpf,nome,data_nascimento,telefone,email,cep,logradouro,numero,bairro,cidade,estado,foto_url")
            .eq("clinica_id", clinicaAtual.clinica_id)
            .neq("id", base.id);
          if (base.data_nascimento) q = q.eq("data_nascimento", base.data_nascimento);
          if (!base.data_nascimento && base.nome) q = q.ilike("nome", base.nome);
          const { data: irmaos } = await q.limit(20);
          const match = (irmaos ?? []).filter((p: any) => {
            if (cpfDigits.length >= 11) {
              return String(p.cpf ?? "").replace(/\D/g, "") === cpfDigits;
            }
            return (
              String(p.nome ?? "")
                .trim()
                .toUpperCase() ===
              String(base.nome ?? "")
                .trim()
                .toUpperCase()
            );
          });
          for (const k of faltando) {
            const v = match
              .map((p: any) => p[k])
              .find((x: any) => x !== null && x !== undefined && String(x).length > 0);
            if (v) base[k] = v;
          }
        } catch (e) {
          console.warn("pacInfo fallback duplicatas:", e);
        }
      }
      setPacInfo(base);
    }
    setPacInfoLoading(false);
  };
  type FormaOpcao = { forma: string; label: string; valor: number };
  const [formaPagOpen, setFormaPagOpen] = useState(false);
  const [formaPagOpcoes, setFormaPagOpcoes] = useState<FormaOpcao[]>([]);
  const [formaPagCtx, setFormaPagCtx] = useState<{
    agId: string;
    desc: string;
    paciente?: string;
    procedimento?: string;
    medico?: string;
    especialidade?: string;
  } | null>(null);
  // Aviso do convênio (limite/gratuidade/bloqueio) — modal persistente que
  // o atendente precisa fechar para continuar o atendimento.
  const [avisoConvenio, setAvisoConvenio] = useState<{ tom: "warning" | "error"; mensagem: string } | null>(null);
  // Modal de confirmação da gratuidade — pergunta "usar agora ou depois"
  // antes de aplicar o benefício. Se "depois", cobra particular.
  const [gratuidadePrompt, setGratuidadePrompt] = useState<{
    convenioNome: string;
    resolve: (choice: "agora" | "depois" | "cancel") => void;
  } | null>(null);
  const perguntarGratuidade = (convenioNome: string): Promise<"agora" | "depois" | "cancel"> =>
    new Promise((resolve) => setGratuidadePrompt({ convenioNome, resolve }));
  const [novoPacOpen, setNovoPacOpen] = useState(false);
  const [novoPac, setNovoPac] = useState({ nome: "", cpf: "", telefone: "", data_nascimento: "", email: "" });
  const [faceOpen, setFaceOpen] = useState(false);
  const [descritorFace, setDescritorFace] = useState<number[] | null>(null);
  const [savingPac, setSavingPac] = useState(false);
  const [equipeList, setEquipeList] = useState<
    Array<{ nome: string | null; email: string | null; user_id: string | null; role: string | null }>
  >([]);
  type AuditRow = {
    id: string;
    action: string;
    table_name: string;
    user_email: string | null;
    created_at: string;
    dados_antes: Record<string, unknown> | null;
    dados_depois: Record<string, unknown> | null;
  };
  const [auditAg, setAuditAg] = useState<Agendamento | null>(null);
  const [auditRows, setAuditRows] = useState<AuditRow[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  type NotaHist = {
    id: string;
    user_email: string | null;
    user_nome: string | null;
    texto: string;
    created_at: string;
  };
  const [notasHist, setNotasHist] = useState<NotaHist[]>([]);
  type EstornoHist = {
    id: string;
    status: string;
    motivo: string | null;
    resposta: string | null;
    solicitado_por: string | null;
    solicitado_em: string;
    resolvido_por: string | null;
    resolvido_em: string | null;
  };
  const [estornosHist, setEstornosHist] = useState<EstornoHist[]>([]);
  const [nomePorUidExtra, setNomePorUidExtra] = useState<Map<string, string>>(new Map());
  const [notaTexto, setNotaTexto] = useState("");
  const [savingNota, setSavingNota] = useState(false);

  // Visão "Por médico — vários dias" (estilo planilha)
  const [viewMode, setViewMode] = useState<"dia" | "medico">("dia");

  const fnListarEquipe = useServerFn(listarEquipe);
  const emitirNfseFn = useServerFn(emitirNfse);
  const consultarNfseFn = useServerFn(consultarNfse);
  const fnCriarAgendamento = useServerFn(criarAgendamento);
  const carregarEquipe = async () => {
    if (!clinicaAtual || equipeList.length > 0) return;
    try {
      const data = await fnListarEquipe({ data: { clinicaId: clinicaAtual.clinica_id } });
      setEquipeList(
        (data as any[]).map((m) => ({
          nome: m.nome,
          email: m.email,
          user_id: m.user_id ?? null,
          role: m.role ?? null,
        })),
      );
    } catch (_) {
      /* silencioso */
    }
  };

  const abrirAuditoria = async (a: Agendamento) => {
    setAuditAg(a);
    setAuditLoading(true);
    setAuditRows([]);
    setNotasHist([]);
    setEstornosHist([]);
    setNomePorUidExtra(new Map());
    setNotaTexto("");
    void carregarEquipe();
    // 1) histórico do próprio agendamento
    const { data: agAudit, error } = await supabase
      .from("audit_log" as never)
      .select("id, action, table_name, user_email, created_at, dados_antes, dados_depois")
      .eq("record_id", a.id)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      setAuditLoading(false);
      mostrarErro(error);
      return;
    }
    // 2) lançamentos financeiros vinculados ao agendamento (para status do repasse médico)
    const { data: lancs } = await supabase.from("fin_lancamentos").select("id").eq("agendamento_id", a.id);
    const lancIds = (lancs ?? []).map((l) => l.id);
    let lancAudit: AuditRow[] = [];
    if (lancIds.length > 0) {
      const { data: la } = await supabase
        .from("audit_log" as never)
        .select("id, action, table_name, user_email, created_at, dados_antes, dados_depois")
        .in("record_id", lancIds)
        .eq("table_name", "fin_lancamentos")
        .order("created_at", { ascending: false })
        .limit(200);
      lancAudit = (la as unknown as AuditRow[]) ?? [];
    }
    const todos = [...((agAudit as unknown as AuditRow[]) ?? []), ...lancAudit].sort((x, y) =>
      x.created_at < y.created_at ? 1 : -1,
    );
    setAuditLoading(false);
    setAuditRows(todos);
    const { data: nts } = await supabase
      .from("agendamento_historico_notas" as never)
      .select("id, user_email, user_nome, texto, created_at")
      .eq("agendamento_id", a.id)
      .order("created_at", { ascending: false })
      .limit(500);
    setNotasHist((nts as unknown as NotaHist[]) ?? []);

    // 3) Solicitações de estorno vinculadas a este agendamento (direta ou via lançamentos)
    const filtros: string[] = [`agendamento_id.eq.${a.id}`];
    if (lancIds.length > 0) filtros.push(`lancamento_id.in.(${lancIds.join(",")})`);
    const { data: ests } = await supabase
      .from("estorno_solicitacoes")
      .select("id, status, motivo, resposta, solicitado_por, solicitado_em, resolvido_por, resolvido_em")
      .or(filtros.join(","))
      .limit(100);
    const estornos = (ests ?? []) as unknown as EstornoHist[];
    setEstornosHist(estornos);

    // Resolve nomes de uuids que aparecem em estornos e não estão em equipeList.
    const uids = new Set<string>();
    estornos.forEach((e) => {
      if (e.solicitado_por) uids.add(e.solicitado_por);
      if (e.resolvido_por) uids.add(e.resolvido_por);
    });
    if (uids.size > 0) {
      const { data: profs } = await supabase.from("profiles").select("id, nome").in("id", Array.from(uids));
      const m = new Map<string, string>();
      ((profs ?? []) as Array<{ id: string; nome: string | null }>).forEach((p) => {
        if (p.nome) m.set(p.id, p.nome);
      });
      setNomePorUidExtra(m);
    }
  };

  const adicionarNotaHist = async () => {
    if (!auditAg || !clinicaAtual) return;
    const txt = notaTexto.trim();
    if (!txt) return;
    if (txt.length > 1000) {
      toast.error("Máximo 1000 caracteres");
      return;
    }
    setSavingNota(true);
    const nome = (user?.user_metadata as { nome?: string } | null)?.nome ?? null;
    const { data, error } = await supabase
      .from("agendamento_historico_notas" as never)
      .insert({
        clinica_id: clinicaAtual.clinica_id,
        agendamento_id: auditAg.id,
        user_email: user?.email ?? null,
        user_nome: nome,
        texto: txt,
      } as never)
      .select("id, user_email, user_nome, texto, created_at")
      .single();
    setSavingNota(false);
    if (error) {
      mostrarErro(error);
      return;
    }
    setNotasHist((prev) => [data as unknown as NotaHist, ...prev]);
    setNotaTexto("");
  };

  const cadastrarPacienteRapido = async (e: FormEvent) => {
    e.preventDefault();
    if (!podeEscrever) {
      toast.error("Você não tem permissão de edição neste módulo.");
      return;
    }
    if (!clinicaAtual) return;
    if (!novoPac.nome.trim()) {
      toast.error("Informe o nome");
      return;
    }
    if (!novoPac.data_nascimento) {
      toast.error("Informe a data de nascimento");
      return;
    }
    if (!novoPac.telefone.trim()) {
      toast.error("Informe o telefone");
      return;
    }
    if (novoPac.cpf.trim() && !isCPFValido(novoPac.cpf)) {
      toast.error("CPF inválido");
      return;
    }
    setSavingPac(true);
    const { data, error } = await supabase
      .from("pacientes")
      .insert({
        clinica_id: clinicaAtual.clinica_id,
        nome: novoPac.nome.trim(),
        cpf: novoPac.cpf.trim() ? somenteDigitos(novoPac.cpf) : null,
        telefone: novoPac.telefone.trim() || null,
        data_nascimento: novoPac.data_nascimento || null,
        email: novoPac.email.trim() || null,
      })
      .select("id,nome")
      .single();
    setSavingPac(false);
    if (error) {
      mostrarErro(error);
      return;
    }
    setPacientes((prev) => [...prev, { id: data.id, nome: data.nome }].sort((a, b) => a.nome.localeCompare(b.nome)));
    setForm((f) => ({ ...f, paciente_nome: data.nome, paciente_id: data.id }));
    if (descritorFace) {
      const { error: bioErr } = await supabase.from("paciente_biometria").insert({
        paciente_id: data.id,
        clinica_id: clinicaAtual.clinica_id,
        descriptor: descritorFace as unknown as number[],
      } as never);
      if (bioErr) {
        console.error("Erro ao salvar biometria:", bioErr);
        toast.warning(`Paciente salvo, mas a foto não foi registrada: ${bioErr.message}`);
      }
    }
    setNovoPac({ nome: "", cpf: "", telefone: "", data_nascimento: "", email: "" });
    setDescritorFace(null);
    setNovoPacOpen(false);
    toast.success("Paciente cadastrado");
  };

  // Sequência de load: cada chamada recebe um id crescente; respostas de um
  // load antigo que chegam depois de um mais novo são descartadas (evita que
  // um refresh em corrida sobrescreva a lista atual).
  const loadReqId = useRef(0);
  // Aponta sempre para o `load` mais recente — usado pelo handler realtime
  // para não cair em stale closure (ver comentário na assinatura realtime).
  const loadFnRef = useRef<() => void>(() => { });

  const load = async () => {
    if (!clinicaAtual) return;
    const reqId = ++loadReqId.current;
    setLoading(true);
    let q = supabase
      .from("agendamentos")
      .select(
        "id,paciente_nome,paciente_id,medico_id,inicio,fim,procedimento,status,observacoes,token_publico,data_pagamento,fluxo_etapa,agenda_id,orcamento_id,pacote_id,tipo_atendimento,atendimento_grupo_id,ficha_numero,forma_pagamento_prevista,medico:medicos(nome,sexo),orcamento:orcamentos(numero)" as never,
      )
      .eq("clinica_id", clinicaAtual.clinica_id)
      .order("inicio", { ascending: apenasData ? false : true });
    // "agendado" agora significa "qualquer ficha com paciente alocado",
    // então não restringe por status no servidor — filtra em memória.
    const statusEspecifico =
      filtroStatus !== "todos" && filtroStatus !== "livres" && filtroStatus !== "agendado" && filtroStatus !== "pago";
    if (statusEspecifico) {
      q = q.eq("status", filtroStatus as Status).limit(1000);
    }
    // Empurra o filtro de profissional para o servidor quando definido.
    // Sem isso, a busca de 30 dias pode estourar o limite padrão de 1000
    // linhas do PostgREST e descartar os agendamentos do profissional/dia
    // selecionado.
    if (filtroMedico !== "todos") {
      q = q.eq("medico_id", filtroMedico);
    }
    // Empurra a busca por nome de cliente para o servidor — sem isso a
    // janela de 30 dias pode trazer mais que o limite do PostgREST e
    // descartar justamente o paciente buscado.
    const termoCli = filtroCliente.trim();
    const digitosCli = termoCli.replace(/\D/g, "");
    // Se o usuário digitou 3+ dígitos, tratamos como busca por CPF:
    // buscamos os pacientes com cpf_digits casando e filtramos os
    // agendamentos por esses paciente_id. Caso contrário, busca por nome.
    if (digitosCli.length >= 3) {
      const { data: pacsCpf } = await supabase
        .from("pacientes")
        .select("id")
        .eq("clinica_id", clinicaAtual.clinica_id)
        .ilike("cpf_digits", `${digitosCli}%`)
        .limit(200);
      const ids = (pacsCpf ?? []).map((p: { id: string }) => p.id);
      if (ids.length === 0) {
        if (reqId !== loadReqId.current) return;
        setLoading(false);
        setItems([]);
        setPage(1);
        return;
      }
      q = q.in("paciente_id", ids);
    } else if (termoCli.length >= 2) {
      const termo = termoCli
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase();
      q = q.ilike("paciente_nome", `%${termo}%`);
    }
    if (apenasData) {
      // "Exibir apenas a data selecionada" — restringe ao dia escolhido
      // (ou ao intervalo, se o usuário definiu uma data final no picker).
      const inicio = new Date(`${dataRef}T00:00:00`).toISOString();
      const fimDia = dataFim ?? dataRef;
      const fim = new Date(`${fimDia}T23:59:59`).toISOString();
      q = q.gte("inicio", inicio).lte("inicio", fim);
    } else if (!statusEspecifico) {
      // Padrão "a partir de": mostra tudo do dia selecionado em diante.
      // Se o usuário definiu uma data final no picker de intervalo,
      // respeita o intervalo; caso contrário, não aplica limite superior.
      // O `.range(0, 9999)` do PostgREST já protege contra volume excessivo.
      const inicio = new Date(`${dataRef}T00:00:00`).toISOString();
      q = q.gte("inicio", inicio);
      if (dataFim) {
        const f = new Date(`${dataFim}T23:59:59`).toISOString();
        q = q.lte("inicio", f);
      }
    }
    if (!statusEspecifico) {
      q = q.range(0, 9999);
    }
    const { data, error } = await q;
    // Descarta a resposta se um load mais novo já começou (refresh em corrida).
    if (reqId !== loadReqId.current) return;
    setLoading(false);
    if (error) {
      mostrarErro(error);
      return;
    }
    const mapped = (
      (data ?? []) as unknown as Array<
        Agendamento & {
          medico?: { nome: string | null; sexo: string | null } | null;
          orcamento?: { numero: number | null } | null;
        }
      >
    ).map((a) => ({
      ...a,
      paciente_nome: isSlotLivre(a.paciente_nome) ? "DISPONÍVEL" : a.paciente_nome,
      medico_id: a.medico_id ?? null,
      medico_nome: a.medico_nome ?? a.medico?.nome ?? null,
      medico_sexo: a.medico_sexo ?? a.medico?.sexo ?? null,
      orcamento_numero: a.orcamento_numero ?? a.orcamento?.numero ?? null,
    }));
    setItems(mapped as Agendamento[]);
    setPage(1);
    setSelecionados(new Set());
    const agendaRows = (mapped ?? []) as unknown as Array<Agendamento & { fluxo_etapa?: string | null }>;
    setEtapaMap(new Map(agendaRows.map((r) => [r.id, r.fluxo_etapa ?? "aguardando_recepcao"] as [string, string])));
    // Busca dados auxiliares dos pacientes em paralelo para não atrasar a agenda.
    const pacIds = Array.from(
      new Set(agendaRows.map((a) => a.paciente_id as string | null).filter((x): x is string => !!x)),
    );
    if (pacIds.length) {
      const [{ data: nasc }, { data: contratos }, { data: deps }] = await Promise.all([
        supabase.from("pacientes").select("id,data_nascimento").in("id", pacIds),
        supabase
          .from("contratos_assinatura")
          .select("paciente_id,status,cb_convenios(nome)")
          .eq("clinica_id", clinicaAtual.clinica_id)
          .eq("status", "ativo")
          .in("paciente_id", pacIds),
        supabase
          .from("contrato_dependentes")
          .select("paciente_id,ativo,contratos_assinatura!inner(clinica_id,status,cb_convenios(nome))")
          .in("paciente_id", pacIds)
          .eq("ativo", true)
          .eq("contratos_assinatura.clinica_id", clinicaAtual.clinica_id)
          .eq("contratos_assinatura.status", "ativo"),
      ]);
      const map = new Map<string, string | null>();
      (nasc ?? []).forEach((p: any) => map.set(p.id, p.data_nascimento ?? null));
      setNascMap(map);
      const cmap = new Map<string, string>();
      ((contratos ?? []) as Array<{ paciente_id: string; cb_convenios: { nome: string } | null }>).forEach((c) => {
        if (c.paciente_id && !cmap.has(c.paciente_id)) {
          cmap.set(c.paciente_id, c.cb_convenios?.nome ?? "Convênio");
        }
      });
      (
        (deps ?? []) as Array<{
          paciente_id: string | null;
          contratos_assinatura: { cb_convenios: { nome: string } | null } | null;
        }>
      ).forEach((d) => {
        if (d.paciente_id && !cmap.has(d.paciente_id)) {
          cmap.set(d.paciente_id, d.contratos_assinatura?.cb_convenios?.nome ?? "Convênio");
        }
      });
      setConvenioMap(cmap);
    } else {
      setNascMap(new Map());
      setConvenioMap(new Map());
    }
    // Marca agendamentos pagos (receita vinculada em fin_lancamentos)
    const ids = agendaRows.map((a) => a.id);
    // Fichas DISPONÍVEIS não podem ser exibidas como "Pago" — ignoramos
    // qualquer lançamento órfão que tenha ficado vinculado a uma ficha
    // que foi posteriormente liberada por um reagendamento.
    const idsComPaciente = new Set(agendaRows.filter((a) => !isSlotLivre(a.paciente_nome)).map((a) => a.id));
    const idsParaPagamento = Array.from(idsComPaciente);
    if (idsParaPagamento.length) {
      // Batch em lotes para não estourar o limite de URL do PostgREST
      // quando há muitos agendamentos no dia.
      const CHUNK = 200;
      const pagosIds: string[] = [];
      const infoMap = new Map<string, { valor: number; forma: string | null }>();
      for (let i = 0; i < idsParaPagamento.length; i += CHUNK) {
        const slice = idsParaPagamento.slice(i, i + CHUNK);
        const { data: pg, error: pgErr } = await supabase
          .from("fin_lancamentos")
          .select("agendamento_id, valor, forma_pagamento")
          .eq("clinica_id", clinicaAtual.clinica_id)
          .eq("tipo", "receita")
          .eq("status", "confirmado")
          .in("agendamento_id", slice);
        if (pgErr) continue;
        (
          (pg ?? []) as Array<{
            agendamento_id: string | null;
            valor: number | string | null;
            forma_pagamento: string | null;
          }>
        ).forEach((r) => {
          if (!r.agendamento_id) return;
          pagosIds.push(r.agendamento_id);
          const prev = infoMap.get(r.agendamento_id);
          const v = Number(r.valor ?? 0);
          infoMap.set(r.agendamento_id, {
            valor: (prev?.valor ?? 0) + v,
            forma: prev?.forma ?? r.forma_pagamento ?? null,
          });
        });
      }
      setPagosSet(new Set(pagosIds.filter((x) => idsComPaciente.has(x))));
      setPagoInfoMap(infoMap);
      // Carrega NFS-e existentes para os agendamentos do dia (uma por agendamento, a mais recente).
      try {
        const nMap = new Map<
          string,
          { id: string; status: string | null; url_pdf: string | null; numero: string | null }
        >();
        for (let i = 0; i < idsParaPagamento.length; i += CHUNK) {
          const slice = idsParaPagamento.slice(i, i + CHUNK);
          const { data: ns } = await supabase
            .from("nfse")
            .select("id, agendamento_id, status, url_pdf, numero, created_at")
            .eq("clinica_id", clinicaAtual.clinica_id)
            .in("agendamento_id", slice)
            .order("created_at", { ascending: false });
          (
            (ns ?? []) as Array<{
              id: string;
              agendamento_id: string | null;
              status: string | null;
              url_pdf: string | null;
              numero: string | null;
            }>
          ).forEach((r) => {
            if (!r.agendamento_id) return;
            if (!nMap.has(r.agendamento_id)) {
              nMap.set(r.agendamento_id, { id: r.id, status: r.status, url_pdf: r.url_pdf, numero: r.numero });
            }
          });
        }
        setNfseMap(nMap);
      } catch {
        setNfseMap(new Map());
      }
    } else {
      setPagosSet(new Set());
      setPagoInfoMap(new Map());
      setNfseMap(new Map());
    }
  };

  const loadRef = async () => {
    if (!clinicaAtual) return;
    const [m, e, me, pr, sr, mcRows, mp, agendasRes] = await Promise.all([
      supabase
        .from("medicos")
        .select("id,nome,sexo,usa_sistema,especialidade_id,procedimento_padrao_id,procedimento_padrao_em_branco")
        .eq("clinica_id", clinicaAtual.clinica_id)
        .eq("ativo", true)
        .order("nome"),
      supabase.from("especialidades").select("id,nome").eq("ativo", true).order("nome"),
      supabase
        .from("medico_especialidades")
        .select("medico_id,especialidade_id,medicos!inner(clinica_id)")
        .eq("medicos.clinica_id", clinicaAtual.clinica_id),
      fetchProcedimentosAgenda(clinicaAtual.clinica_id),
      supabase
        .from("procedimento_split_regras")
        .select("medico_id,procedimento_id")
        .eq("clinica_id", clinicaAtual.clinica_id)
        .not("medico_id", "is", null),
      getMedicoConveniosAgenda(clinicaAtual.clinica_id),
      fetchMedicoProcedimentosAgenda(clinicaAtual.clinica_id),
      supabase
        .from("medico_agendas")
        .select("id,nome,medico_id,ativo,ordem")
        .eq("clinica_id", clinicaAtual.clinica_id)
        .eq("ativo", true)
        .order("ordem", { ascending: true })
        .order("nome", { ascending: true }),
    ]);
    const agendasData = agendasRes.data;
    const ag = new Map<string, { id: string; nome: string }[]>();
    for (const a of (agendasData ?? []) as Array<{ id: string; nome: string; medico_id: string | null }>) {
      if (!a.medico_id) continue;
      const arr = ag.get(a.medico_id) ?? [];
      arr.push({ id: a.id, nome: a.nome });
      ag.set(a.medico_id, arr);
    }
    setAgendasPorMedico(ag);
    // Vínculos serviço↔agenda (para limitar serviços no agendamento conforme agenda escolhida)
    const agendaIds = (agendasData ?? []).map((a) => (a as { id: string }).id);
    const vincPorAgenda = new Map<string, Set<string>>();
    if (agendaIds.length > 0) {
      const { data: vincs } = await supabase
        .from("medico_agenda_procedimentos")
        .select("agenda_id, procedimento_id")
        .in("agenda_id", agendaIds);
      for (const v of (vincs ?? []) as Array<{ agenda_id: string; procedimento_id: string }>) {
        if (!vincPorAgenda.has(v.agenda_id)) vincPorAgenda.set(v.agenda_id, new Set());
        vincPorAgenda.get(v.agenda_id)!.add(v.procedimento_id);
      }
    }
    setProcIdsPorAgenda(vincPorAgenda);
    const todos = Array.isArray(pr) ? pr : [];
    const procedimentosPorId = new Map(todos.map((p) => [p.id, { id: p.id, nome: p.nome, grupo: p.grupo ?? null }]));
    const especialidadesPorId = new Map<string, string>(((e.data ?? []) as Especialidade[]).map((x) => [x.id, x.nome]));
    type RawMedicoAgenda = Medico;
    const medicosBase = ((m.data ?? []) as unknown as RawMedicoAgenda[]).map((x) => ({
      ...x,
      procedimento_padrao_nome: x.procedimento_padrao_id
        ? (procedimentosPorId.get(x.procedimento_padrao_id)?.nome ?? null)
        : null,
      especialidade_nome: x.especialidade_id ? (especialidadesPorId.get(x.especialidade_id) ?? null) : null,
      __recurso: false,
    }));
    setRecursoIds(new Set());
    setMedicos(medicosBase as Medico[]);
    // Pacientes não são mais carregados em massa aqui: a seleção usa busca
    // server-side em PatientSearchInput. Isso evita travar a agenda em bases grandes.
    setPacientes([]);
    setEspecialidades((e.data ?? []) as Especialidade[]);
    {
      const ex = todos.filter((x) => x.tipo === "exame");
      const vistos = new Set<string>();
      const unicos: { id: string; nome: string }[] = [];
      for (const e of ex) {
        const k = normalizar(e.nome);
        if (vistos.has(k)) continue;
        vistos.add(k);
        unicos.push({ id: e.id, nome: e.nome });
      }
      setExames(unicos);
    }
    setProcedimentosList(
      todos.map(({ id, nome, tipo_procedimento }) => ({ id, nome, tipo_procedimento: tipo_procedimento ?? null })),
    );
    const map = new Map<string, Set<string>>();
    for (const r of (me.data ?? []) as Array<{ medico_id: string; especialidade_id: string }>) {
      if (!map.has(r.medico_id)) map.set(r.medico_id, new Set());
      map.get(r.medico_id)!.add(r.especialidade_id);
    }
    // Também considera a especialidade principal salva em `medicos.especialidade_id`
    // (nem todo médico tem entrada em `medico_especialidades`). Sem isso, o filtro
    // "Especialidade" da agenda não encontra agendamentos desses médicos.
    for (const md of medicosBase) {
      if (md.especialidade_id) {
        if (!map.has(md.id)) map.set(md.id, new Set());
        map.get(md.id)!.add(md.especialidade_id);
      }
    }
    setMedicoEspec(map);
    // Médicos com mais de uma especialidade: precisam mostrar o serviço como "NOME (ESPECIALIDADE)".
    const medicoMultiEsp = new Set<string>();
    for (const [mid, set] of map.entries()) {
      if (set.size > 1) medicoMultiEsp.add(mid);
    }
    const pm = new Map<string, Set<string>>();
    for (const r of (sr.data ?? []) as Array<{ medico_id: string | null; procedimento_id: string }>) {
      if (!r.medico_id) continue;
      if (!pm.has(r.medico_id)) pm.set(r.medico_id, new Set());
      pm.get(r.medico_id)!.add(r.procedimento_id);
    }
    const procOpcoesMap = new Map<string, { id: string; nome: string }[]>();
    const procOpcoesVistos = new Map<string, Set<string>>();
    // Serviços vinculados ao médico pela aba "Especialidades" do cadastro do médico.
    // Esta é a fonte principal e preserva a mesma ordem exibida no cadastro do médico.
    for (const r of (Array.isArray(mp) ? mp : []) as MedicoProcedimentoRef[]) {
      if (!r.medico_id) continue;
      if (!pm.has(r.medico_id)) pm.set(r.medico_id, new Set());
      pm.get(r.medico_id)!.add(r.procedimento_id);
      const proc = procedimentosPorId.get(r.procedimento_id);
      if (!proc) continue;
      if (!procOpcoesMap.has(r.medico_id)) procOpcoesMap.set(r.medico_id, []);
      if (!procOpcoesVistos.has(r.medico_id)) procOpcoesVistos.set(r.medico_id, new Set());
      const vistos = procOpcoesVistos.get(r.medico_id)!;
      // Prioridade: especialidade explícita gravada na linha (novo modelo).
      // Fallback (legado, sem especialidade gravada): só decora com o grupo
      // quando o médico tem mais de uma especialidade.
      const espNomeExplicito = r.especialidade_id ? (especialidadesPorId.get(r.especialidade_id) ?? null) : null;
      const grupo = (proc.grupo ?? "").trim();
      const decorado = espNomeExplicito
        ? `${proc.nome} (${espNomeExplicito.toUpperCase()})`
        : medicoMultiEsp.has(r.medico_id) && grupo
          ? `${proc.nome} (${grupo.toUpperCase()})`
          : proc.nome;
      const chave = normalizar(decorado);
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      procOpcoesMap.get(r.medico_id)!.push({ id: proc.id, nome: decorado });
    }
    setProcPorMedico(pm);
    setProcOpcoesPorMedico(procOpcoesMap);
    const medicosIds = new Set(((m.data ?? []) as unknown as Medico[]).map((x) => x.id));
    const nm = new Map<string, Set<string>>();
    for (const r of (mcRows ?? []) as Array<{ medico_id: string; nome: string }>) {
      if (!r.medico_id || !medicosIds.has(r.medico_id)) continue;
      if (!nm.has(r.medico_id)) nm.set(r.medico_id, new Set());
      nm.get(r.medico_id)!.add(normalizar(r.nome));
    }
    setProcNomesPorMedico(nm);
  };

  useEffect(() => {
    loadRef();
  }, [clinicaAtual?.clinica_id]);

  // Sincroniza cadastros (serviços do médico, vínculos serviço↔agenda,
  // especialidades, recursos de enfermagem) sempre que o diálogo de
  // agendamento é aberto. Sem isso, um serviço adicionado ao médico em
  // outra aba/dispositivo só aparece após um refresh da página.
  useEffect(() => {
    if (open) void loadRef();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Fallback definitivo: se ao selecionar um médico a lista local de
  // serviços vier vazia (por qualquer motivo — cache defasado, RLS,
  // race com loadRef), busca direto no banco e popula o mapa.
  useEffect(() => {
    const medicoId = form.medico_id;
    if (!medicoId || !clinicaAtual?.clinica_id) return;
    const jaTem = (procOpcoesPorMedico.get(medicoId)?.length ?? 0) > 0;
    if (jaTem) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("medico_procedimentos")
        .select("procedimento_id, especialidade_id, procedimentos!inner(id,nome,grupo,ativo)")
        .eq("medico_id", medicoId);
      if (error || cancelled || !Array.isArray(data)) return;
      const opcoes: { id: string; nome: string }[] = [];
      const vistos = new Set<string>();
      const ids = new Set<string>();
      for (const r of data as Array<{
        procedimento_id: string;
        procedimentos: { id: string; nome: string; grupo: string | null; ativo: boolean | null } | null;
      }>) {
        const p = r.procedimentos;
        if (!p || p.ativo === false) continue;
        const k = normalizar(p.nome);
        if (vistos.has(k)) continue;
        vistos.add(k);
        ids.add(p.id);
        opcoes.push({ id: p.id, nome: p.nome });
      }
      if (opcoes.length === 0) return;
      setProcOpcoesPorMedico((prev) => {
        if ((prev.get(medicoId)?.length ?? 0) > 0) return prev;
        const next = new Map(prev);
        next.set(medicoId, opcoes);
        return next;
      });
      setProcPorMedico((prev) => {
        const cur = prev.get(medicoId);
        if (cur && cur.size >= ids.size) return prev;
        const next = new Map(prev);
        const merged = new Set(cur ?? []);
        for (const id of ids) merged.add(id);
        next.set(medicoId, merged);
        return next;
      });
      // garante que os procedimentos apareçam em procedimentosList para
      // o caminho `procedimentosList.filter(...)` (linha 1264) funcionar.
      setProcedimentosList((prev) => {
        const known = new Set(prev.map((p) => p.id));
        const adicionar = opcoes.filter((o) => !known.has(o.id));
        if (adicionar.length === 0) return prev;
        return [...prev, ...adicionar];
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [form.medico_id, clinicaAtual?.clinica_id, procOpcoesPorMedico]);

  // Carrega contagem histórica de procedimentos (últimos 365 dias) para
  // ordenar as opções por popularidade no momento do agendamento.
  useEffect(() => {
    if (!clinicaAtual?.clinica_id) return;
    let cancelled = false;
    (async () => {
      // Usa RPC `procedimentos_popularidade` (GROUP BY no banco) em vez de
      // baixar até 20.000 agendamentos para contar no navegador.
      const { data, error } = await (
        supabase as unknown as {
          rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
        }
      ).rpc("procedimentos_popularidade", { p_clinica_id: clinicaAtual.clinica_id });
      const counts = new Map<string, number>();
      if (!error && Array.isArray(data)) {
        for (const row of data as Array<{ procedimento: string | null; total: number | string }>) {
          if (!row.procedimento) continue;
          counts.set(normalizar(row.procedimento), Number(row.total) || 0);
        }
      }
      if (!cancelled) setProcedimentoUsoMap(counts);
    })();
    return () => {
      cancelled = true;
    };
  }, [clinicaAtual?.clinica_id]);

  useEffect(() => {
    load();
  }, [clinicaAtual?.clinica_id, dataRef, dataFim, apenasData, filtroStatus, filtroMedico, filtroCliente]);

  // Mantém a ref sempre apontando para o `load` atual (com os filtros/data
  // vigentes). Sem isso, a assinatura realtime abaixo — que só re-roda quando
  // a clínica muda — chamaria um `load` "congelado" no estado do mount,
  // fazendo agendamentos "sumirem" no refresh automático (a lista era
  // sobrescrita com o recorte antigo) até uma nova pesquisa manual.
  loadFnRef.current = load;

  // Realtime: recarrega quando agendamentos mudam (outro recepcionista,
  // pagamento no caixa, etc.). Debounce simples para evitar refetch em rajada.
  useEffect(() => {
    if (!clinicaAtual) return;
    let t: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => {
        void loadFnRef.current();
      }, 400);
    };
    const ch = supabase
      .channel(`agenda-rt-${clinicaAtual.clinica_id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "agendamentos", filter: `clinica_id=eq.${clinicaAtual.clinica_id}` },
        schedule,
      )
      .subscribe();
    return () => {
      if (t) clearTimeout(t);
      void supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinicaAtual?.clinica_id]);

  // Perfil de médico: trava o filtro no próprio profissional
  useEffect(() => {
    if (isMedicoOnly && medicoLogadoId) setFiltroMedico(medicoLogadoId);
  }, [isMedicoOnly, medicoLogadoId]);

  // Carrega os agendamentos que têm uma solicitação de estorno PENDENTE.
  // O `agendamento_id` pode estar preenchido diretamente na solicitação ou
  // ser derivado do `lancamento_id` → `fin_lancamentos.agendamento_id`.
  useEffect(() => {
    if (!clinicaAtual) {
      setEstornoPendAgs(new Set());
      return;
    }
    let cancelado = false;
    const carregar = async () => {
      const { data } = await supabase
        .from("estorno_solicitacoes")
        .select("agendamento_id, lancamento_id")
        .eq("clinica_id", clinicaAtual.clinica_id)
        .eq("status", "pendente");
      const set = new Set<string>();
      const lancIds: string[] = [];
      for (const r of (data ?? []) as Array<{ agendamento_id: string | null; lancamento_id: string | null }>) {
        if (r.agendamento_id) set.add(r.agendamento_id);
        else if (r.lancamento_id) lancIds.push(r.lancamento_id);
      }
      if (lancIds.length > 0) {
        const { data: lancs } = await supabase.from("fin_lancamentos").select("agendamento_id").in("id", lancIds);
        for (const l of (lancs ?? []) as Array<{ agendamento_id: string | null }>) {
          if (l.agendamento_id) set.add(l.agendamento_id);
        }
      }
      if (!cancelado) setEstornoPendAgs(set);
    };
    void carregar();
    const ch = supabase
      .channel(`agenda-estornos-${clinicaAtual.clinica_id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "estorno_solicitacoes",
          filter: `clinica_id=eq.${clinicaAtual.clinica_id}`,
        },
        () => {
          void carregar();
        },
      )
      .subscribe();
    return () => {
      cancelado = true;
      void supabase.removeChannel(ch);
    };
  }, [clinicaAtual?.clinica_id]);

  // Verifica se o usuário logado é médico da clínica atual (para liberar status "Realizado")
  useEffect(() => {
    (async () => {
      if (!user?.id || !clinicaAtual) {
        setUsuarioEhMedico(false);
        return;
      }
      const { data } = await supabase
        .from("medicos")
        .select("id")
        .eq("user_id", user.id)
        .eq("clinica_id", clinicaAtual.clinica_id)
        .eq("ativo", true)
        .limit(1)
        .maybeSingle();
      setUsuarioEhMedico(!!data);
    })();
  }, [user?.id, clinicaAtual?.clinica_id]);

  // Duração padrão (minutos) inferida dos slots existentes por médico
  const duracaoPorMedico = useMemo(() => {
    const buckets = new Map<string, number[]>();
    for (const a of items) {
      if (!a.medico_id || !a.inicio || !a.fim) continue;
      const d = Math.round((new Date(a.fim).getTime() - new Date(a.inicio).getTime()) / 60000);
      if (d > 0 && d <= 480) {
        if (!buckets.has(a.medico_id)) buckets.set(a.medico_id, []);
        buckets.get(a.medico_id)!.push(d);
      }
    }
    const out = new Map<string, number>();
    for (const [mid, arr] of buckets) {
      arr.sort((x, y) => x - y);
      out.set(mid, arr[Math.floor(arr.length / 2)]);
    }
    return out;
  }, [items]);

  const calcFimAuto = (inicio: string, medicoId: string) => {
    if (!inicio) return "";
    const dur = (medicoId && duracaoPorMedico.get(medicoId)) || 30;
    const d = new Date(inicio);
    if (isNaN(d.getTime())) return "";
    d.setMinutes(d.getMinutes() + dur);
    return toLocalInput(d.toISOString());
  };

  // Opções de procedimento disponíveis para um médico específico (cadastro do médico)
  const opcoesProcedimentoMedico = (medicoId: string | null, agendaId?: string | null) => {
    if (!medicoId) return [] as { id: string; nome: string }[];
    const opcoesCadastradas = procOpcoesPorMedico.get(medicoId);
    // União com os serviços vinculados diretamente à agenda selecionada
    // (via `medico_agenda_procedimentos`). Isso garante que serviços
    // configurados na agenda apareçam mesmo se ainda não estiverem no
    // cadastro do médico (a intersecção antes escondia essas linhas e
    // fazia o seletor mostrar só 1 exame).
    const complementoAgenda = (lista: { id: string; nome: string }[]) => {
      if (!agendaId) return lista;
      const agendasDoMedico = agendasPorMedico.get(medicoId) ?? [];
      if (!agendasDoMedico.some((a) => a.id === agendaId)) return lista;
      const idsAgenda = procIdsPorAgenda.get(agendaId);
      if (!idsAgenda || idsAgenda.size === 0) return lista;
      const jaTem = new Set(lista.map((p) => p.id));
      const nomesJaTem = new Set(lista.map((p) => normalizar(p.nome)));
      const extras: { id: string; nome: string }[] = [];
      for (const p of procedimentosList) {
        if (!idsAgenda.has(p.id)) continue;
        if (jaTem.has(p.id) || nomesJaTem.has(normalizar(p.nome))) continue;
        extras.push({ id: p.id, nome: p.nome });
      }
      if (extras.length === 0) return lista;
      return [...lista, ...extras];
    };
    if (opcoesCadastradas && opcoesCadastradas.length > 0) {
      // Preserva a ordem do cadastro (created_at asc) — Top 10 aparecem primeiro.
      return complementoAgenda([...opcoesCadastradas]);
    }
    const ids = procPorMedico.get(medicoId);
    const nomes = procNomesPorMedico.get(medicoId);
    const temConfig = (ids && ids.size > 0) || (nomes && nomes.size > 0);
    if (!temConfig) {
      // Sem cadastro no médico, mas com vínculos na agenda: usa a agenda
      // como fonte de verdade.
      return complementoAgenda([]);
    }
    const lista = procedimentosList.filter(
      (p) => (ids?.has(p.id) ?? false) || (nomes?.has(normalizar(p.nome)) ?? false),
    );
    return complementoAgenda(lista);
  };

  const procedimentoPadraoDoMedico = (medicoId: string | null | undefined) => {
    if (!medicoId) return "";
    const med = medicos.find((m) => m.id === medicoId);
    if (!med) return "";
    if (med.procedimento_padrao_em_branco) return "";
    if (!med.procedimento_padrao_id) return "";
    return (
      med.procedimento_padrao_nome ?? procedimentosList.find((p) => p.id === med.procedimento_padrao_id)?.nome ?? ""
    );
  };

  const procedimentoEfetivo = (medicoId: string | null | undefined, procedimento: string | null | undefined) => {
    const atual = (procedimento ?? "").trim();
    const med = medicoId ? medicos.find((m) => m.id === medicoId) : null;
    const padrao = procedimentoPadraoDoMedico(medicoId);
    if (padrao && (!atual || normalizar(atual) === normalizar(med?.especialidade_nome ?? ""))) return padrao;
    return atual;
  };

  const procedimentoFormulario = (medicoId: string | null | undefined, procedimento: string | null | undefined) => {
    const atual = procedimentoEfetivo(medicoId, procedimento);
    const med = medicoId ? medicos.find((m) => m.id === medicoId) : null;
    if (atual && med?.especialidade_nome && normalizar(atual) === normalizar(med.especialidade_nome)) {
      // Só zera se for realmente a especialidade sintética — se o texto
      // corresponder a um procedimento cadastrado para o médico/recurso
      // (ex.: recurso "TESTE ERGOMETRICO" que executa o exame homônimo),
      // mantém o valor para não perder o serviço no submit.
      const opts = opcoesProcedimentoMedico(
        medicoId ?? null,
        editing?.agenda_id ?? (filtroAgenda !== "todos" && !filtroAgenda.startsWith("nome:") ? filtroAgenda : null),
      );
      const alvo = normalizar(atual);
      const ehProcedimentoReal =
        opts.some((o) => normalizar(o.nome) === alvo) ||
        normalizar(procedimentoPadraoDoMedico(medicoId) ?? "") === alvo;
      if (!ehProcedimentoReal) return "";
    }
    return atual;
  };

  const procedimentosFormulario = (medicoId: string | null | undefined, procedimento: string | null | undefined) => {
    const texto = procedimentoFormulario(medicoId, procedimento).trim();
    if (!texto) return [];
    return texto
      .split(/\s+\+\s+/)
      .map((p) => p.trim())
      .filter(Boolean);
  };

  const medicoEhLaboratorioFormulario = (medicoId: string | null | undefined) => {
    if (!medicoId) return false;
    const med = medicos.find((m) => m.id === medicoId);
    // Regra (2026-07-16): médico só é tratado como "de laboratório" quando
    // a especialidade dele contém "Laborat". Procedimentos avulsos com
    // `tipo_procedimento='laboratorio'` cadastrados em médicos de outras
    // especialidades (ex.: dermato/clínico com uma cobrança de análise)
    // NÃO reclassificam o médico como laboratório.
    if (normalizar(med?.especialidade_nome ?? "").includes("laborat")) return true;
    const espIds = medicoEspec.get(medicoId);
    if (!espIds || espIds.size === 0) return false;
    return Array.from(espIds).some((id) =>
      normalizar(especialidades.find((e) => e.id === id)?.nome ?? "").includes("laborat"),
    );
  };

  // Rótulo de fallback quando um agendamento não tem procedimento nomeado.
  // Agendamentos de laboratório NÃO podem exibir "Consulta"; usam
  // "EXAMES LABORATORIAIS" para deixar claro o tipo de atendimento.
  const rotuloFallbackProc = (medicoId: string | null | undefined) =>
    medicoEhLaboratorioFormulario(medicoId) ? "EXAMES LABORATORIAIS" : "CONSULTA";

  const procedimentoEhImagem = (label: string) => {
    // Preferência: consulta a categoria no cadastro do procedimento.
    const alvo = normalizar(label);
    const p = procedimentosList.find((pp) => normalizar(pp.nome) === alvo);
    const tp = (p?.tipo_procedimento ?? "").toLowerCase();
    if (tp === "imagem") return true;
    if (tp === "laboratorio" || tp === "consulta" || tp === "cirurgia" || tp === "procedimento") return false;
    const u = normalizar(label).toUpperCase();
    return (
      u.includes("ULTRASS") ||
      /\bUSG\b|\bUS\b/.test(u) ||
      u.includes("TOMOGRAF") ||
      /\bTC\b/.test(u) ||
      u.includes("RESSON") ||
      /\bRM\b|\bRNM\b|\bMRI\b/.test(u) ||
      u.includes("RAIO") ||
      u.includes("RADIOGRAF") ||
      /\bRX\b|\bR-X\b/.test(u)
    );
  };

  const opcoesServicoFormulario = () => {
    const base: { value: string; label: string }[] = [{ value: "none", label: "— Selecione —" }];
    if (!form.medico_id) return base;
    const opts = opcoesProcedimentoMedico(
      form.medico_id,
      editing?.agenda_id ?? (filtroAgenda !== "todos" && !filtroAgenda.startsWith("nome:") ? filtroAgenda : null),
    ).map((p) => ({ value: p.nome, label: p.nome }));
    const padrao = procedimentoPadraoDoMedico(form.medico_id);
    if (padrao && !opts.some((o) => normalizar(o.value) === normalizar(padrao))) {
      opts.unshift({ value: padrao, label: `${padrao} (principal)` });
    }
    const atual = (form.procedimento ?? "").trim();
    const especialidadeMedico = medicos.find((m) => m.id === form.medico_id)?.especialidade_nome ?? "";
    const atualEhEspecialidadeSintetica = especialidadeMedico && normalizar(atual) === normalizar(especialidadeMedico);
    if (atual && !atualEhEspecialidadeSintetica && !opts.some((o) => normalizar(o.value) === normalizar(atual))) {
      opts.push({ value: atual, label: atual });
    }
    const detectModalidade = (label: string): "us" | "rx" | "tc" | "rm" | null => {
      const u = label.toUpperCase();
      if (u.includes("ULTRASS") || /\bUSG\b|\bUS\b/.test(u)) return "us";
      if (u.includes("TOMOGRAF") || /\bTC\b/.test(u)) return "tc";
      if (u.includes("RESSON") || /\bRM\b|\bRNM\b|\bMRI\b/.test(u)) return "rm";
      if (u.includes("RAIO") || u.includes("RADIOGRAF") || /\bRX\b|\bR-X\b/.test(u)) return "rx";
      return null;
    };
    type Curado = { all: string[]; not?: string[] };
    const curadosPorModalidade: Record<"us" | "rx" | "tc" | "rm", Curado[]> = {
      us: [
        { all: ["OBSTETRIC", "1"], not: ["MORFOLOG", "DOPPLER"] },
        { all: ["MORFOLOG", "1"], not: ["GEMELAR", "DOPPLER"] },
        { all: ["MORFOLOG", "2"], not: ["GEMELAR", "DOPPLER"] },
        { all: ["OBSTETRIC", "DOPPLER"], not: ["MORFOLOG"] },
        { all: ["TRANSVAGINAL"] },
        { all: ["MAMA"] },
        { all: ["ABDOME TOTAL"] },
        { all: ["PELV"], not: ["TRANSVAGINAL"] },
        { all: ["VIAS URINARIAS"] },
        { all: ["TIREOIDE"] },
        { all: ["PROSTATA"] },
        { all: ["RINS"] },
      ],
      rx: [
        { all: ["TORAX"] },
        { all: ["COLUNA LOMBAR"] },
        { all: ["COLUNA CERVICAL"] },
        { all: ["JOELHO"] },
        { all: ["MAO"] },
        { all: ["PE"] },
        { all: ["PUNHO"] },
        { all: ["BACIA"] },
        { all: ["CRANIO"] },
        { all: ["ABDOME"] },
      ],
      tc: [
        { all: ["CRANIO"] },
        { all: ["TORAX"], not: ["CONTRASTE"] },
        { all: ["ABDOME TOTAL"] },
        { all: ["COLUNA LOMBAR"] },
        { all: ["SEIOS DA FACE"] },
        { all: ["COLUNA CERVICAL"] },
        { all: ["ABDOME SUPERIOR"] },
        { all: ["PESCOCO"] },
        { all: ["TORAX", "CONTRASTE"] },
        { all: ["PELVE"] },
      ],
      rm: [
        { all: ["CRANIO"] },
        { all: ["COLUNA LOMBAR"] },
        { all: ["COLUNA CERVICAL"] },
        { all: ["JOELHO"] },
        { all: ["OMBRO"] },
        { all: ["ABDOME"] },
        { all: ["COLUNA TORACICA"] },
        { all: ["PELVE"] },
        { all: ["QUADRIL"] },
        { all: ["TORNOZELO"] },
      ],
    };
    const scoreCurado = (label: string, mod: "us" | "rx" | "tc" | "rm") => {
      const L = normalizar(label).toUpperCase();
      const lista = curadosPorModalidade[mod];
      for (let i = 0; i < lista.length; i++) {
        const c = lista[i];
        if (c.not && c.not.some((n) => L.includes(n))) continue;
        if (c.all.every((k) => L.includes(k))) return lista.length - i;
      }
      return 0;
    };
    type ScoredOpt = {
      value: string;
      label: string;
      mod: ReturnType<typeof detectModalidade>;
      score: number;
      curado: number;
    };
    const scored: ScoredOpt[] = opts.map((o) => {
      const mod = detectModalidade(o.label);
      const uso = procedimentoUsoMap.get(normalizar(o.value)) ?? 0;
      const curado = mod ? scoreCurado(o.label, mod) : 0;
      return { ...o, mod, curado, score: curado * 1000 + uso };
    });
    const rankByValue = new Map<string, number>();
    const topOrdenado: ScoredOpt[] = [];
    (["us", "rx", "tc", "rm"] as const).forEach((mod) => {
      const lista = scored
        .filter((s) => s.mod === mod && s.curado > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);
      lista.forEach((s) => topOrdenado.push(s));
    });
    topOrdenado.forEach((s, i) => rankByValue.set(s.value, i + 1));
    const topOpts = topOrdenado.map((s) => ({ value: s.value, label: `${rankByValue.get(s.value)}. ${s.label}` }));
    const restoOpts = scored
      .filter((s) => !rankByValue.has(s.value))
      .map((s) => ({ value: s.value, label: s.label }))
      .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
    return [...base, ...topOpts, ...restoOpts];
  };

  // Atualiza inline o procedimento de um agendamento (do badge na coluna Serviço)
  const atualizarProcedimento = async (ag: Agendamento, novoNome: string) => {
    if (!podeEscrever) {
      toast.error("Você não tem permissão de edição neste módulo.");
      return;
    }
    const nomeFinal = novoNome.trim();
    // Sentinela vazio: limpa o procedimento (volta ao padrão do médico).
    const limpar = nomeFinal === "";
    if (!limpar && nomeFinal === (ag.procedimento ?? "")) return;
    const anterior = ag.procedimento;
    setItems((prev) => prev.map((x) => (x.id === ag.id ? { ...x, procedimento: limpar ? null : nomeFinal } : x)));
    const { error } = await supabase
      .from("agendamentos")
      .update({ procedimento: limpar ? null : nomeFinal })
      .eq("id", ag.id);
    if (error) {
      setItems((prev) => prev.map((x) => (x.id === ag.id ? { ...x, procedimento: anterior } : x)));
      toast.error("Não foi possível atualizar o procedimento");
      return;
    }
    toast.success(limpar ? "Serviço removido" : `Serviço alterado para ${nomeFinal}`);
  };

  const fichaPorId = useMemo(() => {
    const m = new Map<string, string>();
    // Numeração POSICIONAL por (dia, profissional): cada médico ou recurso de
    // enfermagem tem a própria sequência 001, 002, 003… dentro do dia, na
    // ordem do horário. O filtro visual (médico, status, cliente…) NÃO afeta
    // esses números — sempre calculamos sobre TODOS os items carregados, para
    // que a ficha exibida seja estável entre reloads e entre filtros.
    const contadores = new Map<string, number>();
    const ordenados = [...items].sort((a, b) => {
      const t = a.inicio.localeCompare(b.inicio);
      if (t !== 0) return t;
      // Mesmo horário: desempata em ordem alfabética do paciente (pt-BR,
      // acento-insensível) para a numeração da fila ficar crescente e estável.
      return (a.paciente_nome ?? "").localeCompare(b.paciente_nome ?? "", "pt-BR", { sensitivity: "base" });
    });
    ordenados.forEach((a) => {
      const dia = a.inicio.slice(0, 10);
      // Chave por profissional: usa medico_id (que já engloba recursos de
      // enfermagem, mapeados como "médicos virtuais" no load()). Slots sem
      // profissional atribuído são numerados em um bucket próprio por dia.
      const prof = a.medico_id ?? "__sem_profissional__";
      // Cada agenda do médico tem sua própria sequência de fichas (001, 002…).
      // Decisão confirmada com o gestor: ao filtrar por uma agenda específica
      // (ex.: só CONSULTAS), a numeração fica limpa e sequencial — é assim que
      // a ficha física funciona por fila. Na Lista SEM filtro de agenda
      // (todas juntas), números iguais entre agendas diferentes são esperados
      // (são filas distintas), não duplicação.
      const agenda = a.agenda_id ?? "__sem_agenda__";
      const chave = `${dia}::${prof}::${agenda}`;
      const n = (contadores.get(chave) ?? 0) + 1;
      contadores.set(chave, n);
      m.set(a.id, String(n).padStart(3, "0"));
    });
    return m;
  }, [items]);

  const filtrados = useMemo(() => {
    return items.filter((a) => {
      if (!mostrarLivres && isSlotLivre(a.paciente_nome)) return false;
      if (filtroMedico !== "todos" && a.medico_id !== filtroMedico) return false;
      const ehLivre = isSlotLivre(a.paciente_nome);
      if (filtroStatus === "livres") {
        if (!ehLivre) return false;
      } else if (filtroStatus === "agendado") {
        if (ehLivre) return false;
      } else if (filtroStatus === "pago") {
        if (ehLivre) return false;
        if (!a.data_pagamento) return false;
      } else if (filtroStatus !== "todos") {
        if (ehLivre) return false;
        if (a.status !== filtroStatus) return false;
      }
      if (filtroCliente && !normalizar(a.paciente_nome).includes(normalizar(filtroCliente))) return false;
      if (filtroFicha) {
        const f = fichaPorId.get(a.id) ?? "";
        if (!f.includes(filtroFicha.padStart(Math.min(filtroFicha.length, 3), "0"))) return false;
      }
      if (filtroDiaSemana !== "todos") {
        const d = new Date(a.inicio).getDay();
        if (String(d) !== filtroDiaSemana) return false;
      }
      if (filtroEspecialidade !== "todos") {
        if (!a.medico_id) return false;
        const set = medicoEspec.get(a.medico_id);
        if (!set || !set.has(filtroEspecialidade)) return false;
      }
      if (filtroAgenda !== "todos") {
        // Agendamentos criados via "Atendimento Múltiplo" não são vinculados a
        // uma agenda específica (podem envolver médicos/recursos diferentes),
        // então não os escondemos quando o usuário filtra por agenda.
        if (filtroAgenda.startsWith("nome:")) {
          // Filtro por NOME da agenda (dedupe entre múltiplos médicos):
          // aplicado quando o usuário está com "TODOS" os profissionais.
          const alvo = filtroAgenda.slice(5);
          const nomeAg = (a.agenda_id ? agendaNomePorId.get(a.agenda_id) : "") ?? "";
          if (chaveNomeAgenda(nomeAg) !== alvo && !a.atendimento_grupo_id) return false;
        } else {
          if (a.agenda_id !== filtroAgenda && !a.atendimento_grupo_id) return false;
        }
      }
      if (filtroApenasMultiplo && !a.atendimento_grupo_id) return false;
      return true;
    });
  }, [
    items,
    mostrarLivres,
    filtroMedico,
    filtroStatus,
    filtroCliente,
    filtroFicha,
    filtroDiaSemana,
    filtroEspecialidade,
    filtroAgenda,
    filtroApenasMultiplo,
    agendaNomePorId,
    medicoEspec,
    fichaPorId,
  ]);

  const totais = useMemo(
    () => ({
      total: filtrados.length,
      confirmados: filtrados.filter((i) => i.status === "confirmado").length,
      realizados: filtrados.filter((i) => i.status === "realizado").length,
      pendentes: filtrados.filter((i) => i.status === "agendado").length,
    }),
    [filtrados],
  );

  const totalPages = Math.max(1, Math.ceil(filtrados.length / PAGE_SIZE));
  const filtradosOrdenados = useMemo(
    () =>
      [...filtrados].sort((a, b) => {
        const t = a.inicio.localeCompare(b.inicio);
        if (t !== 0) return t;
        return (a.paciente_nome ?? "").localeCompare(b.paciente_nome ?? "", "pt-BR", { sensitivity: "base" });
      }),
    [filtrados],
  );
  const paginados = filtradosOrdenados.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const limparFiltros = () => {
    setFiltroMedico("todos");
    setFiltroEspecialidade("todos");
    setFiltroDiaSemana("todos");
    setFiltroAgenda("todos");
    setFiltroStatus("todos");
    setFiltroCliente("");
    setFiltroFicha("");
  };

  const toggleSel = (id: string) => {
    const s = new Set(selecionados);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    setSelecionados(s);
  };
  const toggleAll = () => {
    if (selecionados.size === paginados.length) setSelecionados(new Set());
    else setSelecionados(new Set(paginados.map((p) => p.id)));
  };

  const cobrarSelecionados = async () => {
    if (!podeEscrever) {
      toast.error("Você não tem permissão de edição neste módulo.");
      return;
    }
    if (!clinicaAtual) return;
    const ids = Array.from(selecionados);
    const itens = items.filter((a) => ids.includes(a.id));
    if (itens.length === 0) {
      toast.info("Selecione ao menos um atendimento.");
      return;
    }
    const pacientes = new Set(itens.map((i) => i.paciente_nome));
    if (pacientes.size > 1) {
      toast.error("Selecione atendimentos do mesmo paciente para cobrar em uma única vez.");
      return;
    }
    const algumPago = itens.some((i) => pagosSet.has(i.id));
    if (algumPago) {
      toast.info("Há atendimentos já pagos na seleção. Desmarque-os antes de cobrar.");
      return;
    }
    try {
      // Verificação fresca + carga de procedimentos em PARALELO (cache 60s)
      const [{ data: jaPagosLote }, procs] = await Promise.all([
        supabase
          .from("fin_lancamentos")
          .select("agendamento_id")
          .eq("clinica_id", clinicaAtual.clinica_id)
          .eq("tipo", "receita")
          .eq("status", "confirmado")
          .in("agendamento_id", ids),
        getProcedimentosComValor(clinicaAtual.clinica_id),
      ]);
      if ((jaPagosLote ?? []).length > 0) {
        const pagos = new Set(
          ((jaPagosLote ?? []) as Array<{ agendamento_id: string | null }>)
            .map((r) => r.agendamento_id)
            .filter((x): x is string => !!x),
        );
        setPagosSet((prev) => {
          const n = new Set(prev);
          pagos.forEach((id) => n.add(id));
          return n;
        });
        toast.info("Há atendimentos já pagos na seleção. Desmarque-os antes de cobrar.");
        return;
      }
      let totalDinheiro = 0,
        totalPix = 0,
        totalDebito = 0,
        totalCredito = 0;
      // Resolve todos os procedimentos em paralelo (cada um pode cair em
      // fallback no banco; em paralelo o tempo total fica ~= 1 chamada).
      const procsResolvidos = await Promise.all(
        itens.map((it) =>
          buscarProcedimentoPorNome(
            clinicaAtual.clinica_id,
            it.procedimento ?? rotuloFallbackProc(it.medico_id),
            procs,
          ),
        ),
      );
      const pesos: Record<string, number> = {};
      const rotulos: Record<string, string> = {};
      (procsResolvidos as any[]).forEach((p, idx) => {
        const valorCartao = valorCartaoProcedimento(p);
        const valorDin = primeiroValorValido(p?.valor_dinheiro, p?.valor_dinheiro_pix, p?.valor_padrao);
        totalDinheiro += valorDin;
        totalPix += valorCartao;
        totalDebito += valorCartao;
        totalCredito += valorCartao;
        // Peso p/ rateio: prioriza valor de cartão (cheio); se 0, usa dinheiro.
        pesos[itens[idx].id] = valorCartao > 0 ? valorCartao : valorDin;
        rotulos[itens[idx].id] = itens[idx].procedimento ?? rotuloFallbackProc(itens[idx].medico_id);
      });
      setPagamentoPesos(pesos);
      setPagamentoRotulos(rotulos);
      const paciente = itens[0].paciente_nome;
      setPagamentoPacienteNome(paciente);
      const desc = `${paciente} — ${itens.map((i) => i.procedimento ?? rotuloFallbackProc(i.medico_id)).join(" + ")} (${itens.length} serviços)`;
      const opcoes: FormaOpcao[] = [
        { forma: "dinheiro", label: "Dinheiro", valor: totalDinheiro },
        { forma: "pix", label: "Pix", valor: totalPix },
        { forma: "cartao_debito", label: "Cartão de Débito", valor: totalDebito },
        { forma: "cartao_credito", label: "Cartão de Crédito", valor: totalCredito },
      ];
      setFormaPagOpcoes(opcoes);
      setFormaPagCtx({
        agId: itens.map((i) => i.id).join(","),
        desc,
        paciente,
        procedimento: `${itens.map((i) => i.procedimento ?? rotuloFallbackProc(i.medico_id)).join(" + ")} (${itens.length} serviços)`,
        medico: (() => {
          const m = medicos.find((mm) => mm.id === itens[0].medico_id);
          return m?.nome ?? undefined;
        })(),
        especialidade: (() => {
          const m = medicos.find((mm) => mm.id === itens[0].medico_id);
          return m?.especialidade_nome ?? undefined;
        })(),
      });
      setFormaPagOpen(true);
    } catch (e: any) {
      console.error("[cobrarSelecionados]", e);
      mostrarErro(e);
    }
  };

  const isManager = clinicaAtual?.role === "admin" || clinicaAtual?.role === "gestor";

  const baixarLoteRealizado = async () => {
    if (!podeEscrever) {
      toast.error("Você não tem permissão de edição neste módulo.");
      return;
    }
    if (!clinicaAtual) return;
    const roleOk =
      usuarioEhMedico ||
      ["admin", "gestor", "financeiro", "recepcao"].includes((clinicaAtual?.role ?? "").toLowerCase());
    if (!roleOk) {
      toast.error("Sem permissão para marcar como 'Realizado'.");
      return;
    }
    const ids = Array.from(selecionados);
    const itens = items.filter((a) => ids.includes(a.id));
    if (itens.length === 0) {
      toast.info("Selecione ao menos um atendimento.");
      return;
    }
    const hojeFim = new Date();
    hojeFim.setHours(23, 59, 59, 999);
    const futuros = itens.filter((i) => new Date(i.inicio).getTime() > hojeFim.getTime());
    const validos = itens.filter(
      (i) =>
        !isSlotLivre(i.paciente_nome) &&
        i.status !== "realizado" &&
        i.status !== "cancelado" &&
        new Date(i.inicio).getTime() <= hojeFim.getTime(),
    );
    if (futuros.length > 0) {
      toast.error(
        `${futuros.length} atendimento(s) de data futura ignorado(s) — só é possível baixar atendimentos de hoje ou datas passadas.`,
      );
    }
    if (validos.length === 0) {
      toast.info("Nenhum atendimento elegível na seleção.");
      return;
    }
    if (!confirm(`Baixar ${validos.length} atendimento(s) como Realizado?`)) return;
    const uid = (await supabase.auth.getUser()).data.user?.id;
    const nowIso = new Date().toISOString();
    const { error } = await supabase
      .from("agendamentos")
      .update({
        status: "realizado",
        fluxo_etapa: "finalizado",
        fluxo_atualizado_em: nowIso,
        executado_por: uid,
        executado_em: nowIso,
      } as never)
      .in(
        "id",
        validos.map((v) => v.id),
      );
    if (error) {
      mostrarErro(error);
      return;
    }
    toast.success(`${validos.length} atendimento(s) baixado(s) como Realizado.`);
    setSelecionados(new Set());
    await load();
  };

  const reabrirAtendimento = async (a: Agendamento) => {
    if (!podeEscrever) {
      toast.error("Você não tem permissão de edição neste módulo.");
      return;
    }
    if (!clinicaAtual) return;
    const roleOk = ["admin", "gestor", "financeiro"].includes((clinicaAtual?.role ?? "").toLowerCase());
    if (!roleOk) {
      toast.error("Apenas admin/gestor/financeiro pode reabrir um atendimento.");
      return;
    }
    if (a.status !== "realizado") {
      toast.info("Este atendimento não está marcado como realizado.");
      return;
    }
    // Verifica se há repasse pago vinculado
    const { data: lanc } = await supabase
      .from("fin_lancamentos")
      .select("id, repasse_pago, repasse_lancamento_id")
      .eq("agendamento_id", a.id)
      .eq("tipo", "receita")
      .maybeSingle();
    const temRepassePago = !!(lanc && (lanc as any).repasse_pago);
    const msg = temRepassePago
      ? `Reabrir atendimento de ${a.paciente_nome}?\n\n⚠️ O repasse JÁ foi pago. A despesa do repasse será ESTORNADA e o status voltará para "Confirmado".\n\nO pagamento da receita NÃO será estornado (use Financeiro → Estornar pagamento se necessário).`
      : `Reabrir atendimento de ${a.paciente_nome}?\n\nO status voltará para "Confirmado".`;
    if (!confirm(msg)) return;
    try {
      if (temRepassePago) {
        const desp = (lanc as any).repasse_lancamento_id as string | null;
        if (desp) {
          // Cancela em vez de apagar: mantém o histórico contábil da despesa
          // de repasse (auditoria, relatórios) — o restante do sistema já
          // trata status='cancelado' como estornado/inativo (mesma convenção
          // usada em Financeiro > Estorno e Financeiro > Movimento).
          const { error: eCancel } = await supabase
            .from("fin_lancamentos")
            .update({ status: "cancelado" } as never)
            .eq("id", desp);
          if (eCancel) throw eCancel;
        }
        const { error: eUpd } = await supabase
          .from("fin_lancamentos")
          .update({
            repasse_pago: false,
            repasse_pago_em: null,
            repasse_forma_pagamento: null,
            repasse_conta_id: null,
            repasse_lancamento_id: null,
          } as never)
          .eq("id", (lanc as any).id);
        if (eUpd) throw eUpd;
      }
      const { error: eAg } = await supabase
        .from("agendamentos")
        .update({ status: "confirmado" } as never)
        .eq("id", a.id);
      if (eAg) throw eAg;
      toast.success(temRepassePago ? "Atendimento reaberto e repasse estornado." : "Atendimento reaberto.");
      await load();
    } catch (err: any) {
      mostrarErro(err);
    }
  };

  const excluirSelecionados = async () => {
    if (!podeEscrever) {
      toast.error("Você não tem permissão de edição neste módulo.");
      return;
    }
    if (!clinicaAtual) return;
    if (!isManager) {
      toast.error("Você não tem permissão para excluir horários.");
      return;
    }
    const ids = Array.from(selecionados);
    const itens = items.filter((a) => ids.includes(a.id));
    if (itens.length === 0) {
      toast.info("Selecione ao menos um horário.");
      return;
    }
    const bloqueados = itens.filter(
      (i) => pagosSet.has(i.id) || (!isSlotLivre(i.paciente_nome) && i.status !== "agendado"),
    );
    if (bloqueados.length > 0) {
      toast.error(
        `${bloqueados.length} agendamento(s) não podem ser excluídos (já pagos ou em atendimento). Desmarque-os.`,
      );
      return;
    }
    if (!confirm(`Excluir ${ids.length} horário(s)? Esta ação não pode ser desfeita.`)) return;
    const { error } = await supabase.from("agendamentos").delete().in("id", ids);
    if (error) {
      mostrarErro(error);
      return;
    }
    toast.success(`${ids.length} horário(s) excluído(s).`);
    setSelecionados(new Set());
    await load();
  };

  // === Reagendamento em lote: move vários agendamentos para outra agenda já aberta ===
  const abrirReagLote = () => {
    if (!podeEscrever) {
      toast.error("Você não tem permissão de edição neste módulo.");
      return;
    }
    if (!clinicaAtual) return;
    if (!isManager) {
      toast.error("Apenas gestores podem reagendar em lote.");
      return;
    }
    const ids = Array.from(selecionados);
    const itens = items.filter((a) => ids.includes(a.id));
    if (itens.length === 0) {
      toast.info("Selecione ao menos um paciente para reagendar.");
      return;
    }
    // Ignora silenciosamente fichas vazias; bloqueia apenas pacientes já atendidos
    const atendidos = itens.filter((i) => i.status === "realizado");
    if (atendidos.length > 0) {
      toast.error(`${atendidos.length} paciente(s) já atendido(s) não podem ser reagendados. Desmarque-os.`);
      return;
    }
    const validos = itens.filter((i) => !isSlotLivre(i.paciente_nome));
    if (validos.length === 0) {
      toast.info("Nenhum paciente válido para reagendar (todas as fichas selecionadas estão vazias).");
      return;
    }
    // Mesmo fluxo do reagendamento individual: ativa modo lote e aguarda o clique num slot DISPONÍVEL
    const idsOrdenados = validos
      .slice()
      .sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime())
      .map((i) => i.id);
    setReagendandoAg(null);
    setReagLoteIds(idsOrdenados);
    toast.info(
      `Selecione um horário disponível na agenda para reagendar os ${idsOrdenados.length} paciente(s) selecionado(s).`,
    );
  };

  const cancelarReagLote = () => setReagLoteIds(null);

  // Confirma o reagendamento em lote ao clicar num slot DISPONÍVEL (a partir desse slot, ocupa os próximos N livres)
  const confirmarReagLoteNoSlot = async (slot: Agendamento) => {
    if (!podeEscrever) {
      toast.error("Você não tem permissão de edição neste módulo.");
      return;
    }
    if (!clinicaAtual) return;
    const ids = reagLoteIds ?? [];
    if (ids.length === 0 || reagLoteSalvando) return;
    if (!slot.medico_id) {
      toast.error("Slot sem médico definido.");
      return;
    }
    if (!isSlotLivre(slot.paciente_nome)) {
      toast.error("Esse horário não está disponível. Escolha um slot DISPONÍVEL.");
      return;
    }
    // Busca os agendamentos de origem direto no banco (os IDs podem não estar em `items`
    // se o usuário trocou os filtros da tela depois de selecionar).
    const { data: fontesRaw, error: eFontes } = await supabase
      .from("agendamentos")
      .select("id,paciente_id,paciente_nome,inicio,fim,medico_id,status,procedimento,observacoes,data_pagamento")
      .in("id", ids)
      .limit(1000);
    if (eFontes) {
      mostrarErro(eFontes);
      return;
    }
    const fontes = ((fontesRaw ?? []) as Array<Agendamento>)
      .filter((a) => a.status !== "realizado" && !isSlotLivre(a.paciente_nome))
      .sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime());
    if (fontes.length === 0) {
      toast.error("Nenhum paciente selecionado.");
      return;
    }

    // Carrega a agenda de destino (mesmo médico/dia do slot clicado)
    const dataAlvo = new Date(slot.inicio);
    const di = new Date(dataAlvo);
    di.setHours(0, 0, 0, 0);
    const df = new Date(dataAlvo);
    df.setHours(23, 59, 59, 999);
    const { data: destinoRaw, error: eDest } = await supabase
      .from("agendamentos")
      .select("id,paciente_id,paciente_nome,inicio,fim,medico_id,status,procedimento")
      .eq("clinica_id", clinicaAtual.clinica_id)
      .eq("medico_id", slot.medico_id)
      .gte("inicio", di.toISOString())
      .lte("inicio", df.toISOString())
      .order("inicio", { ascending: true })
      .limit(1000);
    if (eDest) {
      mostrarErro(eDest);
      return;
    }
    const destino = (destinoRaw ?? []) as Array<{
      id: string;
      paciente_id: string | null;
      paciente_nome: string;
      inicio: string;
      fim: string;
      medico_id: string | null;
      status: string;
      procedimento: string | null;
    }>;
    const fichaInicial = destino.findIndex((s) => s.id === slot.id) + 1;
    if (fichaInicial <= 0) {
      toast.error("Não foi possível localizar a ficha do slot escolhido.");
      return;
    }

    // Slots disponíveis a partir da ficha inicial, excluindo as próprias fontes
    const idsFonte = new Set(fontes.map((f) => f.id));
    const candidatos = destino.slice(fichaInicial - 1).filter((s) => !idsFonte.has(s.id));
    const livres = candidatos.filter((s) => isSlotLivre(s.paciente_nome));
    if (livres.length < fontes.length) {
      toast.error(
        `Não há horários livres suficientes a partir da ficha ${String(fichaInicial).padStart(3, "0")} ` +
        `(precisa de ${fontes.length}, encontrou ${livres.length}).`,
      );
      return;
    }
    const alvos = livres.slice(0, fontes.length);

    setReagLoteSalvando(true);
    const agora = new Date().toLocaleString("pt-BR");
    // Cada par (origem → alvo) é independente, então continuam em paralelo —
    // mas agora cada par roda como uma única transação (RPC), não mais como
    // dois updates paralelos separados. Antes, se o update do destino
    // falhasse, o da origem (rodando ao mesmo tempo) já tinha sido aplicado
    // mesmo assim, liberando o paciente sem realocar corretamente.
    const resultados = await Promise.all(
      fontes.map(async (origem, i) => {
        const alvo = alvos[i];
        const trilha = `[Reagendado em lote em ${agora}] de ${new Date(origem.inicio).toLocaleString("pt-BR")} para ${new Date(alvo.inicio).toLocaleString("pt-BR")}`;
        const { error } = await supabase.rpc("reagendar_atendimento", {
          _origem_id: origem.id,
          _destino_id: alvo.id,
          _trilha_msg: trilha,
        } as never);
        if (error) {
          mostrarErro(error, `mover ${origem.paciente_nome}`);
          return false;
        }
        return true;
      }),
    );
    const okCount = resultados.filter(Boolean).length;
    setReagLoteSalvando(false);
    setReagLoteIds(null);
    setSelecionados(new Set());
    toast.success(`${okCount} paciente(s) reagendado(s) a partir da ficha ${String(fichaInicial).padStart(3, "0")}.`);
    await load();
  };

  const [pagamentoValor, setPagamentoValor] = useState("");
  // Paciente "copiado" via menu Opções para colar no próximo slot livre clicado
  const [pacienteCopia, setPacienteCopia] = useState<{ id: string; nome: string } | null>(null);

  const copiarPacienteSelecionado = () => {
    if (!podeEscrever) {
      toast.error("Você não tem permissão de edição neste módulo.");
      return;
    }
    if (selecionados.size !== 1) {
      toast.error("Selecione apenas 1 agendamento do paciente para copiar.");
      return;
    }
    const id = Array.from(selecionados)[0];
    const ag = items.find((x) => x.id === id);
    if (!ag || isSlotLivre(ag.paciente_nome) || !ag.paciente_id) {
      toast.error("O agendamento selecionado não possui paciente cadastrado.");
      return;
    }
    setPacienteCopia({ id: ag.paciente_id, nome: ag.paciente_nome });
    setSelecionados(new Set());
    toast.success(`Paciente copiado: ${ag.paciente_nome}. Clique em um horário livre para agendar.`);
  };

  const openNew = () => {
    if (!podeEscrever) {
      toast.error("Você não tem permissão de edição neste módulo.");
      return;
    }
    setEditing(null);
    const base = new Date(`${dataRef}T09:00:00`);
    const end = new Date(base.getTime() + 30 * 60000);
    // Pré-preenche a partir dos filtros ativos da agenda.
    const medicoFiltro = filtroMedico !== "todos" && medicos.some((m) => m.id === filtroMedico) ? filtroMedico : "";
    let pacienteId = "";
    let pacienteNome = "";
    const termoCli = filtroCliente.trim();
    if (termoCli) {
      const alvo = normalizar(termoCli);
      const matches = pacientes.filter((p) => normalizar(p.nome).includes(alvo));
      if (matches.length === 1) {
        pacienteId = matches[0].id;
        pacienteNome = matches[0].nome;
      } else {
        pacienteNome = termoCli;
      }
    }
    const fimAuto = medicoFiltro
      ? calcFimAuto(toLocalInput(base.toISOString()), medicoFiltro)
      : toLocalInput(end.toISOString());
    let procedimento = "";
    if (medicoFiltro) {
      const padrao = procedimentoPadraoDoMedico(medicoFiltro);
      if (padrao) procedimento = padrao;
    }
    setForm({
      ...EMPTY,
      inicio: toLocalInput(base.toISOString()),
      fim: fimAuto,
      medico_id: medicoFiltro,
      paciente_id: pacienteId,
      paciente_nome: pacienteNome,
      procedimento,
    });
    setOpen(true);
  };

  const buscarOrcamento = async (numeroOverride?: number) => {
    if (!clinicaAtual) return;
    const num = numeroOverride ?? parseInt(form.orcamento_numero.replace(/\D/g, ""), 10);
    if (!num || num <= 0) {
      toast.error("Informe o nº do orçamento.");
      return;
    }
    setBuscandoOrc(true);
    try {
      const { data: orc, error } = await supabase
        .from("orcamentos")
        .select("id, numero, paciente_id, paciente_nome, status")
        .eq("clinica_id", clinicaAtual.clinica_id)
        .eq("numero", num)
        .maybeSingle();
      if (error) {
        mostrarErro(error);
        return;
      }
      if (!orc) {
        toast.error(`Orçamento nº ${num} não encontrado.`);
        return;
      }
      if (orc.status === "cancelado") {
        toast.error("Orçamento cancelado.");
        return;
      }
      const { data: itens, error: e2 } = await supabase
        .from("orcamento_itens")
        .select("id, descricao, procedimento_id")
        .eq("orcamento_id", orc.id)
        .order("ordem");
      if (e2) {
        mostrarErro(e2);
        return;
      }
      const itsAll = (itens ?? []) as { id: string; descricao: string; procedimento_id: string | null }[];
      if (itsAll.length === 0) {
        toast.error("Orçamento sem itens.");
        return;
      }
      // Filtra itens já consumidos por agendamentos ativos. Permite agendar
      // o restante quando o orçamento foi aproveitado em partes.
      const { data: consumidosRows } = await supabase
        .from("agendamento_orcamento_itens")
        .select("orcamento_item_id, agendamento_id, agendamentos!inner(status)")
        .eq("orcamento_id", orc.id);
      const consumidos = new Set<string>(
        ((consumidosRows ?? []) as Array<{ orcamento_item_id: string; agendamentos: { status: string } | null }>)
          .filter((r) => r.agendamentos?.status !== "cancelado")
          .map((r) => r.orcamento_item_id),
      );
      const editingItemIdsLiberar = editing?.id
        ? new Set<string>(
          ((consumidosRows ?? []) as Array<{ orcamento_item_id: string; agendamento_id: string }>)
            .filter((r) => r.agendamento_id === editing.id)
            .map((r) => r.orcamento_item_id),
        )
        : new Set<string>();
      const its = itsAll.filter((i) => !consumidos.has(i.id) || editingItemIdsLiberar.has(i.id));
      if (its.length === 0) {
        toast.error(`Todos os ${itsAll.length} itens deste orçamento já foram agendados.`);
        return;
      }
      const totalConsumidos = itsAll.length - its.length;
      if (totalConsumidos > 0) {
        toast.info(`${totalConsumidos} de ${itsAll.length} itens já agendados. Restam ${its.length} para agendar.`);
      }
      const procIds = Array.from(new Set(its.map((i) => i.procedimento_id).filter((x): x is string => !!x)));
      let procs: { id: string; grupo: string | null; tipo: string | null }[] = [];
      if (procIds.length) {
        const { data: pdata, error: e3 } = await supabase
          .from("procedimentos")
          .select("id, grupo, tipo")
          .in("id", procIds);
        if (e3) {
          mostrarErro(e3);
          return;
        }
        procs = (pdata ?? []) as { id: string; grupo: string | null; tipo: string | null }[];
      }
      const norm = (g: string | null | undefined) =>
        (g ?? "")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toUpperCase()
          .trim();
      const procPorId = new Map(procs.map((p) => [p.id, p]));
      const isLab = (pid: string | null) => {
        if (!pid) return false;
        const p = procPorId.get(pid);
        if (!p) return false;
        const g = norm(p.grupo);
        const t = norm(p.tipo);
        return g === "LABORATORIO" || t === "EXAME" || t === "LABORATORIO";
      };
      const todosLab = its.every((i) => isLab(i.procedimento_id));
      // (Bloqueio antigo removido: agora permitimos agendamentos parciais,
      // controlados via `agendamento_orcamento_itens`.)
      const nomes = its.map((i) => i.descricao);
      const procStr = todosLab
        ? `LABORATÓRIO (${nomes.length} EXAMES): ${nomes.join(", ")}`
        : nomes.length === 1
          ? nomes[0]
          : `${nomes.length} ITENS: ${nomes.join(", ")}`;
      // Resolve paciente: se o orçamento não tiver paciente_id, tenta achar
      // por nome/cpf na clínica para preencher automaticamente (e mantém
      // o campo editável caso o usuário queira trocar).
      let pacId: string | null = orc.paciente_id ?? null;
      let pacNome: string | null = orc.paciente_nome ?? null;
      if (!pacId && pacNome) {
        const nomeNorm = pacNome
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toUpperCase()
          .trim();
        const { data: pac } = await supabase
          .from("pacientes")
          .select("id, nome")
          .eq("clinica_id", clinicaAtual.clinica_id)
          .eq("ativo", true)
          // A1 — usa igualdade + índice btree em (clinica_id, ativo, nome)
          // em vez de ilike, que forçava seq scan em 242k linhas (~6s).
          // Os nomes são normalizados pela trigger uppercase_text_fields.
          .eq("nome", nomeNorm)
          .limit(2);
        if (pac && pac.length === 1) {
          pacId = pac[0].id;
          pacNome = pac[0].nome;
        }
      }
      // Agrupa por "grupo" (mais específico) ou tipo. Se houver mais de um grupo
      // distinto, abre o painel de divisão em vez de criar um único agendamento.
      const grupoDe = (pid: string | null): string => {
        if (!pid) return "OUTROS";
        const p = procPorId.get(pid);
        if (!p) return "OUTROS";
        return norm(p.grupo) || norm(p.tipo) || "OUTROS";
      };
      const gruposDistintos = new Set(its.map((i) => grupoDe(i.procedimento_id)));
      if (!todosLab && gruposDistintos.size > 1) {
        // Constrói lista de itens enriquecidos para o dialog
        const itensRicos: DividirItem[] = its.map((i) => {
          const p = i.procedimento_id ? procPorId.get(i.procedimento_id) : null;
          return {
            id: i.id,
            descricao: i.descricao,
            procedimento_id: i.procedimento_id,
            grupo: p?.grupo ?? null,
            tipo: p?.tipo ?? null,
          };
        });
        const inicioPadrao = form.inicio || toLocalInput(new Date(`${dataRef}T09:00:00`).toISOString());
        setDividirCtx({
          orcamento: {
            id: orc.id,
            numero: orc.numero,
            paciente_id: pacId,
            paciente_nome: pacNome,
          },
          itens: itensRicos,
          inicioPadrao,
        });
        setOpen(false); // fecha o modal de "novo agendamento" se estiver aberto
        setDividirOpen(true);
        return;
      }
      // Fluxo de 1 grupo: registra os IDs restantes para gravar o vínculo
      // após o save do agendamento.
      setPendingOrcItemIds(its.map((i) => i.id));
      setForm((f) => ({
        ...f,
        orcamento_id: orc.id,
        orcamento_numero: String(orc.numero),
        orcamento_itens: nomes,
        paciente_id: pacId ?? f.paciente_id,
        paciente_nome: pacNome ?? f.paciente_nome,
        procedimento: procStr,
        procedimentos: procStr ? [procStr] : [],
      }));
      toast.success(`Orçamento #${String(orc.numero).padStart(5, "0")} vinculado.`);
    } finally {
      setBuscandoOrc(false);
    }
  };

  const limparOrcamento = () => {
    setForm((f) => ({ ...f, orcamento_id: "", orcamento_numero: "", orcamento_itens: [] }));
    setPendingOrcItemIds([]);
  };

  // Abre o diálogo de novo agendamento já com o nº de orçamento preenchido
  // e dispara a busca automaticamente. Usado por:
  //  - URL: /app/agenda?orc=123
  //  - postMessage: { type: 'agendar-orcamento', numero: 123 } (split view)
  const abrirNovoComOrcamento = (numero: number) => {
    if (!podeEscrever) {
      toast.error("Você não tem permissão de edição neste módulo.");
      return;
    }
    if (!clinicaAtual) return;
    const inicio = toLocalInput(new Date(`${dataRef}T09:00:00`).toISOString());
    const fim = toLocalInput(new Date(`${dataRef}T09:30:00`).toISOString());
    setEditing(null);
    setForm({ ...EMPTY, inicio, fim, orcamento_numero: String(numero) });
    setOpen(true);
    void buscarOrcamento(numero);
  };

  useEffect(() => {
    if (!clinicaAtual) return;
    // Param da URL (apenas na primeira carga válida)
    try {
      const sp = new URLSearchParams(window.location.search);
      const orcParam = sp.get("orc");
      if (orcParam) {
        const n = parseInt(orcParam.replace(/\D/g, ""), 10);
        if (n > 0) {
          abrirNovoComOrcamento(n);
          sp.delete("orc");
          const novo = `${window.location.pathname}${sp.toString() ? `?${sp.toString()}` : ""}${window.location.hash}`;
          window.history.replaceState(null, "", novo);
        }
      }
    } catch {
      /* ignore */
    }
    const onMsg = (ev: MessageEvent) => {
      const d = ev.data;
      if (!d || typeof d !== "object") return;
      if (d.type === "agendar-orcamento" && typeof d.numero === "number") {
        abrirNovoComOrcamento(d.numero);
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinicaAtual?.clinica_id]);

  const openSlot = (a: Agendamento) => {
    if (reagendandoAg) {
      void confirmarReagendamentoNoSlot(a);
      return;
    }
    if (reagLoteIds) {
      void confirmarReagLoteNoSlot(a);
      return;
    }
    if (!podeEscrever) {
      toast.error("Você não tem permissão de edição neste módulo.");
      return;
    }
    setEditing(a);
    setForm({
      paciente_nome: pacienteCopia?.nome ?? "",
      paciente_id: pacienteCopia?.id ?? "",
      medico_id: a.medico_id ?? "",
      inicio: toLocalInput(a.inicio),
      fim: toLocalInput(a.fim),
      procedimento: procedimentoFormulario(a.medico_id, a.procedimento),
      procedimentos: procedimentosFormulario(a.medico_id, a.procedimento),
      status: "agendado",
      observacoes: a.observacoes ?? "",
      data_pagamento: a.data_pagamento ?? "",
      orcamento_id: "",
      orcamento_numero: "",
      orcamento_itens: [],
      tipo_atendimento: (a.tipo_atendimento as TipoAtendimento | null) ?? "particular",
      forma_pagamento_prevista: (a as { forma_pagamento_prevista?: string | null }).forma_pagamento_prevista ?? "",
    });
    if (pacienteCopia) setPacienteCopia(null);
    setOpen(true);
  };

  const openEdit = async (a: Agendamento) => {
    if (!podeEscrever) {
      toast.error("Você não tem permissão de edição neste módulo.");
      return;
    }
    if (reagendandoAg) {
      toast.error("Esse horário já está ocupado. Escolha um slot disponível.");
      return;
    }
    if (reagLoteIds) {
      toast.error("Esse horário já está ocupado. Escolha um slot DISPONÍVEL.");
      return;
    }
    setEditing(a);
    // Recarrega itens do orçamento vinculado para exibir a lista de exames no diálogo
    let itensOrc: string[] = [];
    if (a.orcamento_id) {
      const { data: its } = await supabase
        .from("orcamento_itens")
        .select("descricao")
        .eq("orcamento_id", a.orcamento_id)
        .order("ordem");
      itensOrc = ((its ?? []) as { descricao: string }[]).map((x) => x.descricao);
    }
    // Se o agendamento veio sem paciente_id (ex.: criado a partir de um
    // orçamento que também não tinha o vínculo), tenta resolver pelo nome
    // dentro da clínica atual e backfilla o cadastro tanto no agendamento
    // quanto no orçamento, evitando o aviso "Paciente não cadastrado".
    let resolvedPacId: string = a.paciente_id ?? "";
    let resolvedPacNome: string = a.paciente_nome;
    if (!resolvedPacId && a.paciente_nome && clinicaAtual) {
      // A1 — normaliza o nome antes de bater no banco e usa igualdade,
      // aproveitando o índice btree em (clinica_id, ativo, nome). Elimina
      // o ilike que forçava seq scan em 242k linhas na Menino Jesus.
      const nomeBusca = a.paciente_nome
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
        .trim();
      const { data: cands } = await supabase
        .from("pacientes")
        .select("id, nome")
        .eq("clinica_id", clinicaAtual.clinica_id)
        .eq("ativo", true)
        .eq("nome", nomeBusca)
        .limit(5);
      const lista = (cands ?? []) as { id: string; nome: string }[];
      const norm = (s: string) =>
        s
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toUpperCase()
          .trim()
          .replace(/\s+/g, " ");
      const alvo = norm(nomeBusca);
      const exato = lista.find((p) => norm(p.nome) === alvo) ?? (lista.length === 1 ? lista[0] : null);
      if (exato) {
        resolvedPacId = exato.id;
        resolvedPacNome = exato.nome;
        // Backfill silencioso (não bloqueia a abertura do diálogo se falhar)
        void supabase.from("agendamentos").update({ paciente_id: exato.id }).eq("id", a.id);
        if (a.orcamento_id) {
          void supabase
            .from("orcamentos")
            .update({ paciente_id: exato.id })
            .eq("id", a.orcamento_id)
            .is("paciente_id", null);
        }
      }
    }
    setForm({
      paciente_nome: resolvedPacNome,
      paciente_id: resolvedPacId,
      medico_id: a.medico_id ?? "",
      inicio: toLocalInput(a.inicio),
      fim: toLocalInput(a.fim),
      procedimento: procedimentoFormulario(a.medico_id, a.procedimento),
      procedimentos: procedimentosFormulario(a.medico_id, a.procedimento),
      status: a.status,
      observacoes: a.observacoes ?? "",
      data_pagamento: a.data_pagamento ?? "",
      orcamento_id: a.orcamento_id ?? "",
      orcamento_numero: a.orcamento_numero ? String(a.orcamento_numero) : "",
      orcamento_itens: itensOrc,
      tipo_atendimento: (a.tipo_atendimento as TipoAtendimento | null) ?? "particular",
      forma_pagamento_prevista: (a as { forma_pagamento_prevista?: string | null }).forma_pagamento_prevista ?? "",
    });
    setOpen(true);
  };

  const submit = async (e: FormEvent, irParaPagamento = false) => {
    e.preventDefault();
    if (!podeEscrever) {
      toast.error("Você não tem permissão de edição neste módulo.");
      return;
    }
    if (!clinicaAtual) return;
    if (editing && pagosSet.has(editing.id)) {
      toast.error("Agendamento já pago — somente visualização.");
      return;
    }
    if (!form.paciente_nome.trim()) {
      toast.error("Informe o paciente");
      return;
    }
    if (!form.paciente_id) {
      toast.error(
        'Selecione um paciente cadastrado na lista ou clique em "Cadastrar agora" para criar o cadastro antes de salvar.',
      );
      return;
    }
    if (!form.inicio || !form.fim) {
      toast.error("Defina início e fim");
      return;
    }
    if (new Date(form.fim) <= new Date(form.inicio)) {
      toast.error("O horário final deve ser após o inicial");
      return;
    }
    const multiPermitido =
      !!form.medico_id &&
      (medicoEhLaboratorioFormulario(form.medico_id) ||
        opcoesServicoFormulario().some((o) => procedimentoEhImagem(o.label)));
    const procedimentosParaSalvar = Array.from(
      new Set(
        (multiPermitido && form.procedimentos.length > 0 ? form.procedimentos : [form.procedimento])
          .map((p) => procedimentoFormulario(form.medico_id, p).trim())
          .filter(Boolean),
      ),
    );
    // Regra (2026-07-16): procedimento passou a ser OBRIGATÓRIO em todo
    // agendamento de paciente. Elimina o rótulo de fallback ("CONSULTA" /
    // "EXAMES LABORATORIAIS") aparecer em cima de campo vazio.
    const procedimentoTexto = procedimentosParaSalvar.join(" + ");
    if (!procedimentoTexto.trim()) {
      toast.error("Selecione o procedimento antes de salvar.");
      return;
    }
    const multiExamesModo =
      procedimentosParaSalvar.length > 1
        ? medicoEhLaboratorioFormulario(form.medico_id)
          ? "laboratorio"
          : "imagem"
        : null;
    const mudouHorarioOuMedico =
      !editing ||
      editing.medico_id !== form.medico_id ||
      new Date(editing.inicio).getTime() !== new Date(form.inicio).getTime() ||
      new Date(editing.fim).getTime() !== new Date(form.fim).getTime();
    if (editing && pagosSet.has(editing.id) && form.paciente_nome.trim() !== editing.paciente_nome) {
      toast.error("Não é permitido alterar o nome do paciente em agendamento já pago.");
      return;
    }
    setSaving(true);
    const payload = {
      clinica_id: clinicaAtual.clinica_id,
      paciente_nome: form.paciente_nome.trim(),
      paciente_id: form.paciente_id || null,
      medico_id: form.medico_id || null,
      inicio: new Date(form.inicio).toISOString(),
      fim: new Date(form.fim).toISOString(),
      procedimento: procedimentoTexto || null,
      status: form.status,
      observacoes: form.observacoes.trim() || null,
      data_pagamento: form.data_pagamento ? form.data_pagamento : null,
      orcamento_id: form.orcamento_id || null,
      tipo_atendimento: form.tipo_atendimento,
      forma_pagamento_prevista: form.forma_pagamento_prevista ? form.forma_pagamento_prevista : null,
    };
    // Miolo server-side (validação de paciente completo, agenda aberta + slot livre,
    // inadimplência de cartão, INSERT/UPDATE do agendamento e vínculos com
    // agendamento_orcamento_itens) foi extraído para `criarAgendamento`
    // (src/lib/agenda/criar-agendamento.functions.ts) — cópia 1:1 da lógica original.
    const result = await fnCriarAgendamento({
      data: {
        clinica_id: clinicaAtual.clinica_id,
        editing_id: editing?.id ?? null,
        payload: payload as never,
        checagens: {
          validar_paciente_completo: true,
          validar_agenda_aberta: !!form.medico_id && mudouHorarioOuMedico && !recursoIds.has(form.medico_id),
          validar_inadimplencia: !!form.paciente_id && form.tipo_atendimento === "convenio",
        },
        procedimentos: procedimentosParaSalvar,
        multi_exames_modo: multiExamesModo,
        pending_orc_item_ids: pendingOrcItemIds,
      },
    });
    if (!result.ok) {
      setSaving(false);
      if ("validation_error" in result) {
        const opts = result.validation_error.toast_duration
          ? { duration: result.validation_error.toast_duration }
          : undefined;
        toast.error(result.validation_error.message, opts);
      } else {
        mostrarErro(result.pg_error);
      }
      return;
    }
    if (result.vinculo_warning) {
      mostrarErro(result.vinculo_warning.pg_error, "agendamento salvo, mas vínculo com itens do orçamento falhou");
    }
    const novoId: string | null = result.id;
    setPendingOrcItemIds([]);
    setSaving(false);
    toast.success("Salvo");
    setOpen(false);
    await load();
    if (irParaPagamento && novoId) {
      let [lista, info] = await Promise.all([
        getProcedimentosComValor(clinicaAtual.clinica_id),
        // Atendimento marcado como "Particular" ignora o convênio do paciente
        // de propósito — cobra valor cheio, sem desconto/bloqueio/gratuidade.
        payload.tipo_atendimento === "particular"
          ? Promise.resolve(null)
          : obterInfoConvenioPaciente({
            clinicaId: clinicaAtual.clinica_id,
            pacienteId: payload.paciente_id,
            medicoId: payload.medico_id,
            procedimentoNome: payload.procedimento ?? "",
            agendamentoId: novoId,
            dataRef: payload.inicio ?? null,
          }),
      ]);
      // Multi-exame: quando há mais de um procedimento (imagem ou laboratório),
      // o payload.procedimento vem concatenado ("A + B + C") e não encontra match
      // no cadastro. Resolvemos cada procedimento individualmente e somamos.
      const nomesParaValorar =
        procedimentosParaSalvar.length > 0
          ? procedimentosParaSalvar
          : [payload.procedimento ?? rotuloFallbackProc(payload.medico_id)];
      const procsIndividuais = await Promise.all(
        nomesParaValorar.map((nome) => buscarProcedimentoPorNome(clinicaAtual.clinica_id, nome, lista)),
      );
      let vDinheiro = 0,
        vPix = 0,
        vDebito = 0,
        vCredito = 0;
      for (const p of procsIndividuais as any[]) {
        const valorCartao = valorCartaoProcedimento(p);
        vDinheiro += primeiroValorValido(p?.valor_dinheiro, p?.valor_dinheiro_pix, p?.valor_padrao);
        vPix += valorCartao;
        vDebito += valorCartao;
        vCredito += valorCartao;
      }
      let opcoes: FormaOpcao[] = [
        { forma: "dinheiro", label: "Dinheiro", valor: vDinheiro },
        { forma: "pix", label: "Pix", valor: vPix },
        { forma: "cartao_debito", label: "Cartão de Débito", valor: vDebito },
        { forma: "cartao_credito", label: "Cartão de Crédito", valor: vCredito },
      ];
      let descSuffix = "";
      const opcoesOrc = payload.orcamento_id ? await opcoesPagamentoDeOrcamento(payload.orcamento_id) : null;
      // Gratuidade: pergunta se o paciente quer usar agora ou depois.
      // Se "depois", zera o desconto para cobrar particular nesta cobrança.
      if (info?.desconto?.tipo === "gratuidade" && !opcoesOrc) {
        const escolha = await perguntarGratuidade(info.convenioNome);
        if (escolha === "cancel") return;
        if (escolha === "depois") info = { ...info, desconto: null };
      }
      if (opcoesOrc) {
        opcoes = opcoesOrc;
      } else if (info) {
        if (!info.emDia) {
          setAvisoConvenio({
            tom: "error",
            mensagem: `Convênio ${info.convenioNome} em atraso (${info.parcelasAtrasadas} parcela(s)). Cobrando valor cheio.`,
          });
          descSuffix = ` — ${info.convenioNome} EM ATRASO`;
        } else if (info.bloquear) {
          setAvisoConvenio({
            tom: "error",
            mensagem: info.avisoLimite ?? "Limite do convênio atingido — agendamento bloqueado.",
          });
          descSuffix = ` — ${info.convenioNome} BLOQUEADO`;
        } else if (info.desconto) {
          opcoes = opcoes.map((o) => ({ ...o, valor: aplicarDescontoPorForma(o.valor, o.forma, info.desconto!) }));
          const rotulo =
            info.desconto.tipo === "gratuidade"
              ? "GRATUIDADE"
              : info.desconto.tipo === "percentual"
                ? `-${info.desconto.valor}%`
                : info.desconto.tipo === "valor_fixo"
                  ? `R$ ${Number(info.desconto.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} dinheiro / R$ ${Number(info.desconto.valorOutros).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} outros`
                  : `-R$ ${Number(info.desconto.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
          descSuffix = ` — Convênio ${info.convenioNome} (${rotulo})`;
          if (info.avisoLimite) setAvisoConvenio({ tom: "warning", mensagem: info.avisoLimite });
          else toast.success(`Desconto do convênio ${info.convenioNome} aplicado (${rotulo}).`);
        } else if (info.avisoLimite) {
          setAvisoConvenio({ tom: "warning", mensagem: info.avisoLimite });
          descSuffix = ` — ${info.convenioNome} (limite atingido)`;
        } else {
          setAvisoConvenio({
            tom: "warning",
            mensagem: `Cliente possui convênio ${info.convenioNome}, mas sem benefício para este procedimento.`,
          });
        }
      }
      setFormaPagOpcoes(opcoes);
      setFormaPagCtx({
        // Agrupa o principal + irmãos (imagem multi-exame) para que a mesma
        // cobrança marque todos os agendamentos correspondentes como pagos.
        agId: [novoId, ...(result.sibling_ids ?? [])].join(","),
        desc: `${payload.paciente_nome} — ${payload.procedimento ?? rotuloFallbackProc(payload.medico_id)}${descSuffix}`,
        paciente: payload.paciente_nome ?? "",
        procedimento: `${payload.procedimento ?? rotuloFallbackProc(payload.medico_id)}${descSuffix}`,
        medico: medicos.find((m) => m.id === payload.medico_id)?.nome ?? undefined,
        especialidade: medicos.find((m) => m.id === payload.medico_id)?.especialidade_nome ?? undefined,
      });
      setFormaPagOpen(true);
    }
  };

  const remove = async (a: Agendamento) => {
    if (!podeEscrever) {
      toast.error("Você não tem permissão de edição neste módulo.");
      return;
    }
    // "Excluir" no menu (...) da linha NÃO apaga a ficha — apenas libera o horário
    // (remove o cliente e volta o slot para DISPONÍVEL). Para excluir o número da ficha,
    // selecione a linha e use "Excluir horários selecionados" no menu de Opções.
    if (pagosSet.has(a.id)) {
      toast.error("Este agendamento já foi pago. Estorne no Financeiro antes de liberar.");
      return;
    }
    if (
      !confirm(`Liberar este horário? O cliente ${a.paciente_nome} será removido, mas a ficha continuará disponível.`)
    )
      return;
    const { error } = await supabase
      .from("agendamentos")
      .update({
        paciente_id: null,
        paciente_nome: "DISPONÍVEL",
        procedimento: null,
        observacoes: null,
        status: "agendado",
        data_pagamento: null,
        orcamento_id: null,
      } as never)
      .eq("id", a.id);
    if (error) mostrarErro(error);
    else {
      toast.success("Horário liberado.");
      await load();
    }
  };

  const mudarStatus = async (a: Agendamento, status: Status) => {
    if (!podeEscrever) {
      toast.error("Você não tem permissão de edição neste módulo.");
      return;
    }
    if (status === "realizado" && !usuarioEhMedico) {
      // Atendentes do financeiro/recepção também podem baixar como realizado
      // (necessário p/ exames em que a casa executa e o médico apenas lauda,
      // e para destravar o fluxo de repasse).
      const roleOk = ["admin", "gestor", "financeiro", "recepcao"].includes((clinicaAtual?.role ?? "").toLowerCase());
      if (!roleOk) {
        toast.error("Sem permissão para marcar como 'Realizado'.");
        return;
      }
    }
    if (status === "realizado") {
      const inicio = new Date(a.inicio);
      const hojeFim = new Date();
      hojeFim.setHours(23, 59, 59, 999);
      if (inicio.getTime() > hojeFim.getTime()) {
        toast.error("Não é possível baixar como Realizado um atendimento de data futura.");
        return;
      }
    }
    // Ao cancelar, libera o vínculo com o orçamento para que ele possa ser
    // re-agendado em outro horário sem ficar preso a este slot.
    const payload: { status: Status; orcamento_id?: null } = { status };
    if (status === "cancelado" && a.orcamento_id) payload.orcamento_id = null;
    // Cancelamento em cascata: se o agendamento faz parte de um pacote (orçamento dividido),
    // pergunta se deve cancelar todos os agendamentos vinculados.
    let idsParaAtualizar: string[] = [a.id];
    if (status === "cancelado" && a.pacote_id) {
      const { data: irmaos } = await supabase
        .from("agendamentos")
        .select("id,inicio,procedimento,status")
        .eq("pacote_id", a.pacote_id)
        .neq("status", "cancelado");
      const outros = ((irmaos ?? []) as Array<{ id: string; inicio: string; procedimento: string | null }>).filter(
        (x) => x.id !== a.id,
      );
      if (outros.length > 0) {
        const lista = outros
          .sort((x, y) => new Date(x.inicio).getTime() - new Date(y.inicio).getTime())
          .map((x) => `• ${new Date(x.inicio).toLocaleString("pt-BR")} — ${x.procedimento ?? ""}`)
          .join("\n");
        const ok = confirm(
          `Este agendamento faz parte de um pacote do orçamento, com mais ${outros.length} item(ns) vinculado(s):\n\n${lista}\n\nClique OK para cancelar TODOS do pacote.\nClique Cancelar para cancelar APENAS este.`,
        );
        if (ok) idsParaAtualizar = [a.id, ...outros.map((x) => x.id)];
      }
    }
    const { error } = await supabase.from("agendamentos").update(payload).in("id", idsParaAtualizar);
    if (error) mostrarErro(error);
    else {
      if (idsParaAtualizar.length > 1) toast.success(`${idsParaAtualizar.length} agendamentos do pacote cancelados.`);
      await load();
    }
  };

  const iniciarAtendimentoEnf = async (a: Agendamento) => {
    if (!podeEscrever) {
      toast.error("Você não tem permissão de edição neste módulo.");
      return;
    }
    const inicio = new Date(a.inicio);
    const hojeFim = new Date();
    hojeFim.setHours(23, 59, 59, 999);
    if (inicio.getTime() > hojeFim.getTime()) {
      toast.error("Não é possível dar baixa em um atendimento de data futura.");
      return;
    }
    if (a.status === "realizado") {
      toast.info("Este atendimento já foi baixado.");
      return;
    }
    if (!confirm(`Dar baixa como Realizado no atendimento de ${a.paciente_nome}?`)) return;
    const uid = (await supabase.auth.getUser()).data.user?.id;
    if (!uid) {
      toast.error("Sessão expirada");
      return;
    }
    const { error } = await supabase
      .from("agendamentos")
      .update({
        status: "realizado",
        executado_por: uid,
        executado_em: new Date().toISOString(),
      } as never)
      .eq("id", a.id);
    if (error) {
      mostrarErro(error);
      return;
    }
    toast.success("Baixa registrada — executor e horário gravados.");
    await load();
  };

  const concluirAtendimentoManual = async (a: Agendamento) => {
    if (!podeEscrever) {
      toast.error("Você não tem permissão de edição neste módulo.");
      return;
    }
    if (a.status === "realizado") {
      toast.info("Atendimento já concluído.");
      return;
    }
    if (
      !confirm(
        `Concluir atendimento de ${a.paciente_nome}?\n\nO médico fará o prontuário em papel. O sistema registra a consulta como realizada e libera o repasse.`,
      )
    )
      return;
    const uid = (await supabase.auth.getUser()).data.user?.id;
    if (!uid) {
      toast.error("Sessão expirada");
      return;
    }
    const { error } = await supabase
      .from("agendamentos")
      .update({
        status: "realizado",
        fluxo_etapa: "finalizado",
        fluxo_atualizado_em: new Date().toISOString(),
        executado_por: uid,
        executado_em: new Date().toISOString(),
      } as never)
      .eq("id", a.id);
    if (error) {
      mostrarErro(error);
      return;
    }
    toast.success("Atendimento concluído");
    await load();
  };

  // Lê os valores fechados de um orçamento e devolve as 4 opções de pagamento.
  // Quando o orçamento tem `valores_pagamento` por forma, usa cada um;
  // caso contrário aplica o (valor_total - desconto) em todas as formas.
  const opcoesPagamentoDeOrcamento = async (orcamentoId: string): Promise<FormaOpcao[] | null> => {
    const { data, error } = await supabase
      .from("orcamentos")
      .select("valor_total, valores_pagamento")
      .eq("id", orcamentoId)
      .maybeSingle();
    if (error || !data) return null;
    // `valor_total` do orçamento JÁ é líquido (subtotal - desconto).
    // Não subtrair `desconto` de novo aqui — isso causava desconto duplicado
    // ao converter o orçamento em cobrança na agenda.
    const totalLiquido = Math.max(0, Number(data.valor_total ?? 0));
    const vals = (data.valores_pagamento ?? {}) as Record<string, number> | null;
    const pegar = (label: string) => {
      const v = vals ? Number(vals[label] ?? 0) : 0;
      return v > 0 ? v : totalLiquido;
    };
    return [
      { forma: "dinheiro", label: "Dinheiro", valor: pegar("Dinheiro") },
      { forma: "pix", label: "Pix", valor: pegar("Pix") },
      { forma: "cartao_debito", label: "Cartão de Débito", valor: pegar("Cartão de Débito") },
      { forma: "cartao_credito", label: "Cartão de Crédito", valor: pegar("Cartão de Crédito") },
    ];
  };

  const cobrarAgendamento = async (a: Agendamento) => {
    if (!podeEscrever) {
      toast.error("Você não tem permissão de edição neste módulo.");
      return;
    }
    if (!clinicaAtual) return;
    if (pagosSet.has(a.id)) {
      toast.info("Este agendamento já foi pago.");
      return;
    }
    try {
      // Se o agendamento veio de um orçamento, usa SEMPRE os valores do orçamento
      // (o procedimento pode ser texto livre tipo "LABORATÓRIO (4 EXAMES): ..."
      // que não bate com a tabela de procedimentos e zeraria as opções).
      const opcoesOrc = a.orcamento_id ? await opcoesPagamentoDeOrcamento(a.orcamento_id) : null;
      // Verificação fresca no banco: impede faturar duas vezes mesmo se o cache
      // local estiver desatualizado (ex.: outro usuário pagou em outra aba, ou
      // o pagamento foi transferido de uma ficha reagendada).
      // Roda em paralelo: checagem de pago + lista de procedimentos (cache)
      // + info de convênio do paciente. Antes era serial (3-5s); agora ~= a
      // chamada mais lenta.
      let [{ data: jaPagos }, lista, info] = await Promise.all([
        supabase
          .from("fin_lancamentos")
          .select("id")
          .eq("clinica_id", clinicaAtual.clinica_id)
          .eq("tipo", "receita")
          .eq("status", "confirmado")
          .eq("agendamento_id", a.id)
          .limit(1),
        getProcedimentosComValor(clinicaAtual.clinica_id),
        // Atendimento marcado como "Particular" ignora o convênio do paciente
        // de propósito — cobra valor cheio, sem desconto/bloqueio/gratuidade.
        a.tipo_atendimento === "particular"
          ? Promise.resolve(null)
          : obterInfoConvenioPaciente({
            clinicaId: clinicaAtual.clinica_id,
            pacienteId: a.paciente_id,
            medicoId: a.medico_id,
            procedimentoNome: a.procedimento ?? "",
            agendamentoId: a.id,
            dataRef: a.inicio ?? null,
          }),
      ]);
      if ((jaPagos ?? []).length > 0) {
        toast.info("Este agendamento já foi pago.");
        setPagosSet((prev) => {
          const n = new Set(prev);
          n.add(a.id);
          return n;
        });
        return;
      }
      // Multi-exame (laboratório/imagem): quando o nome vem concatenado com " + ",
      // resolvemos cada item individualmente e somamos. Para agendamento simples,
      // o split retorna apenas um item e o comportamento permanece igual.
      const nomesParaValorar = (a.procedimento ?? rotuloFallbackProc(a.medico_id))
        .split(/\s+\+\s+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const procsIndividuais = await Promise.all(
        (nomesParaValorar.length > 0 ? nomesParaValorar : [rotuloFallbackProc(a.medico_id)]).map((nome) =>
          buscarProcedimentoPorNome(clinicaAtual.clinica_id, nome, lista),
        ),
      );
      let vDinheiro = 0,
        vPix = 0,
        vDebito = 0,
        vCredito = 0;
      for (const p of procsIndividuais as any[]) {
        const valorCartao = valorCartaoProcedimento(p);
        vDinheiro += primeiroValorValido(p?.valor_dinheiro, p?.valor_dinheiro_pix, p?.valor_padrao);
        vPix += valorCartao;
        vDebito += valorCartao;
        vCredito += valorCartao;
      }
      let opcoes: FormaOpcao[] = [
        { forma: "dinheiro", label: "Dinheiro", valor: vDinheiro },
        { forma: "pix", label: "Pix", valor: vPix },
        { forma: "cartao_debito", label: "Cartão de Débito", valor: vDebito },
        { forma: "cartao_credito", label: "Cartão de Crédito", valor: vCredito },
      ];
      let descSuffix = "";
      // Gratuidade: pergunta se quer usar agora ou depois (antes de qualquer
      // registro). "Depois" → cobra particular sem consumir o benefício.
      if (info?.desconto?.tipo === "gratuidade" && !opcoesOrc) {
        const escolha = await perguntarGratuidade(info.convenioNome);
        if (escolha === "cancel") return;
        if (escolha === "depois") info = { ...info, desconto: null };
      }
      if (opcoesOrc) {
        // Valores do orçamento já consideram desconto/convênio definidos na hora
        // de gerar o orçamento — não aplicamos nada por cima.
        opcoes = opcoesOrc;
      } else if (info) {
        if (!info.emDia) {
          setAvisoConvenio({
            tom: "error",
            mensagem: `Convênio ${info.convenioNome} em atraso (${info.parcelasAtrasadas} parcela(s)). Cobrando valor cheio.`,
          });
          descSuffix = ` — ${info.convenioNome} EM ATRASO`;
        } else if (info.bloquear) {
          setAvisoConvenio({
            tom: "error",
            mensagem: info.avisoLimite ?? "Limite do convênio atingido — cobrança bloqueada.",
          });
          descSuffix = ` — ${info.convenioNome} BLOQUEADO`;
        } else if (info.desconto) {
          opcoes = opcoes.map((o) => ({ ...o, valor: aplicarDescontoPorForma(o.valor, o.forma, info.desconto!) }));
          const rotulo =
            info.desconto.tipo === "gratuidade"
              ? "GRATUIDADE"
              : info.desconto.tipo === "percentual"
                ? `-${info.desconto.valor}%`
                : info.desconto.tipo === "valor_fixo"
                  ? `R$ ${Number(info.desconto.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} dinheiro / R$ ${Number(info.desconto.valorOutros).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} outros`
                  : `-R$ ${Number(info.desconto.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
          descSuffix = ` — Convênio ${info.convenioNome} (${rotulo})`;
          if (info.avisoLimite) setAvisoConvenio({ tom: "warning", mensagem: info.avisoLimite });
          else toast.success(`Desconto do convênio ${info.convenioNome} aplicado (${rotulo}).`);
        } else if (info.avisoLimite) {
          setAvisoConvenio({ tom: "warning", mensagem: info.avisoLimite });
          descSuffix = ` — ${info.convenioNome} (limite atingido)`;
        } else {
          setAvisoConvenio({
            tom: "warning",
            mensagem: `Cliente possui convênio ${info.convenioNome}, mas sem benefício para este procedimento.`,
          });
        }
      }
      // Procedimento sem valor (ex.: REVISÃO / retorno gratuito). Não abre o
      // fluxo de cobrança — registra um lançamento de valor 0 (linha-sombra),
      // marca como pago e avança o fluxo, do mesmo modo que um pagamento normal.
      const totalOpcoes = opcoes.reduce((s, o) => s + (Number(o.valor) || 0), 0);
      // Só auto-registra "SEM COBRANÇA" quando o procedimento foi encontrado
      // no cadastro E realmente está com valor zero. Se nenhum procedimento
      // casou (ex.: laboratório com nome genérico "EXAMES LABORATORIAIS" ou
      // agendamento com procedimento em branco), abrimos o diálogo de forma
      // de pagamento normalmente para o operador digitar o valor.
      const algumProcCasou = (procsIndividuais as any[]).some((p) => p != null);
      const ehLab = medicoEhLaboratorioFormulario(a.medico_id);
      const ehGratuidadeConvenio = info?.desconto?.tipo === "gratuidade" && !opcoesOrc;
      if (!opcoesOrc && totalOpcoes <= 0 && (algumProcCasou || ehGratuidadeConvenio) && !ehLab) {
        const isGrat = ehGratuidadeConvenio;
        const desc = isGrat
          ? `${a.paciente_nome} — ${a.procedimento ?? rotuloFallbackProc(a.medico_id)}${descSuffix}`
          : `${a.paciente_nome} — ${a.procedimento ?? rotuloFallbackProc(a.medico_id)}${descSuffix} — SEM COBRANÇA`;
        if (!a.id) {
          setAvisoConvenio({
            tom: "error",
            mensagem:
              "Não foi possível registrar: agendamento sem identificador. Recarregue a agenda e tente novamente.",
          });
          return;
        }
        // Abordagem B (RPC atômica): banco garante em uma única transação a
        // criação do lançamento + movimento (e a abertura automática da sessão
        // de caixa quando necessário). Se qualquer etapa falhar, tudo é
        // revertido pelo Postgres — não há mais janela para lançamento órfão.
        const nomeUsuario = (user?.user_metadata as { nome?: string } | null)?.nome ?? user?.email ?? null;
        const { error: errRpc } = await supabase.rpc("fn_registrar_lancamento_e_caixa", {
          p_lancamento: {
            clinica_id: clinicaAtual.clinica_id,
            tipo: "receita",
            descricao: desc,
            valor: 0,
            data: new Date().toISOString().slice(0, 10),
            status: "confirmado",
            agendamento_id: a.id,
            forma_pagamento: isGrat ? "convenio_gratuidade" : null,
            observacoes: isGrat
              ? `Gratuidade pelo convênio ${info?.convenioNome ?? ""}.`.trim()
              : "Atendimento sem cobrança (procedimento sem valor).",
          },
          p_movimento: user?.id
            ? {
              user_id: user.id,
              user_nome: nomeUsuario,
              tipo: "recebimento",
              valor: 0,
              descricao: desc,
              forma_pagamento: isGrat ? "convenio_gratuidade" : "sem_cobranca",
            }
            : null,
        });
        if (errRpc) {
          mostrarErro(errRpc, isGrat ? "falha ao registrar gratuidade" : "falha ao registrar atendimento sem cobrança");
          return;
        }
        setPagosSet((prev) => {
          const n = new Set(prev);
          n.add(a.id);
          return n;
        });
        // Auto check-in apenas se o atendimento for do mesmo dia.
        try {
          const hoje = new Date().toISOString().slice(0, 10);
          if (a.inicio && new Date(a.inicio).toISOString().slice(0, 10) === hoje) {
            const { error: errFluxo } = await supabase
              .from("agendamentos")
              .update({ fluxo_etapa: "triagem", fluxo_atualizado_em: new Date().toISOString() } as never)
              .eq("id", a.id);
            if (errFluxo) {
              mostrarErro(errFluxo, "registro salvo, mas falhou ao avançar o fluxo");
            } else {
              setEtapaMap((m) => {
                const n = new Map(m);
                n.set(a.id, "triagem");
                return n;
              });
            }
          }
        } catch (err) {
          mostrarErro(err);
        }
        if (isGrat) {
          toast.success(`Gratuidade aplicada pelo convênio ${info?.convenioNome ?? ""}.`);
          // Imprime GR normalmente com forma "Convênio Gratuidade".
          try {
            const fichaStr = fichaPorId.get(a.id);
            const fichaNumero = fichaStr && fichaStr !== "—" ? Number(fichaStr) : undefined;
            await printGuiaAtendimento({
              agendamentoId: a.id,
              clinicaId: clinicaAtual.clinica_id,
              usuarioNome: user?.user_metadata?.nome ?? user?.email ?? undefined,
              usuarioId: user?.id ?? null,
              pagamento: {
                valor: 0,
                forma_pagamento: "convenio_gratuidade",
                parcelas: null,
                bandeira_cartao: null,
              },
              fichaNumero,
            });
          } catch (err) {
            mostrarErro(err);
          }
        } else {
          toast.success("Atendimento sem cobrança registrado.");
        }
        return;
      }
      setFormaPagOpcoes(opcoes);
      setFormaPagCtx({
        agId: a.id,
        desc: `${a.paciente_nome} — ${a.procedimento ?? rotuloFallbackProc(a.medico_id)}${descSuffix}`,
        paciente: a.paciente_nome ?? "",
        procedimento: `${a.procedimento ?? rotuloFallbackProc(a.medico_id)}${descSuffix}`,
        medico: medicos.find((m) => m.id === a.medico_id)?.nome ?? undefined,
        especialidade: medicos.find((m) => m.id === a.medico_id)?.especialidade_nome ?? undefined,
      });
      setFormaPagOpen(true);
    } catch (e: any) {
      console.error("[cobrarAgendamento]", e);
      mostrarErro(e);
    }
  };

  const confirmarPresenca = async (a: Agendamento) => {
    if (!podeEscrever) {
      toast.error("Você não tem permissão de edição neste módulo.");
      return;
    }
    const { error } = await supabase
      .from("agendamentos")
      .update({ fluxo_etapa: "triagem", fluxo_atualizado_em: new Date().toISOString() } as never)
      .eq("id", a.id);
    if (error) {
      mostrarErro(error);
      return;
    }
    toast.success("Presença confirmada — paciente liberado para a triagem");
    setEtapaMap((m) => {
      const n = new Map(m);
      n.set(a.id, "triagem");
      return n;
    });
  };

  const estornarCheckin = async (a: Agendamento) => {
    if (!podeEscrever) {
      toast.error("Você não tem permissão de edição neste módulo.");
      return;
    }
    if (!window.confirm("Desfazer check-in deste paciente? Ele voltará para 'aguardando recepção'.")) return;
    const { error } = await supabase
      .from("agendamentos")
      .update({ fluxo_etapa: "aguardando_recepcao", fluxo_atualizado_em: new Date().toISOString() } as never)
      .eq("id", a.id);
    if (error) {
      mostrarErro(error);
      return;
    }
    toast.success("Check-in estornado");
    setEtapaMap((m) => {
      const n = new Map(m);
      n.set(a.id, "aguardando_recepcao");
      return n;
    });
  };

  const escolherForma = (op: FormaOpcao) => {
    if (!formaPagCtx) return;
    const ids = formaPagCtx.agId.split(",").filter(Boolean);
    const principal = ids[0] ?? null;
    const extras = ids.slice(1);
    const valorFinal = aplicarDescontoPendente(op.valor);
    setPagamentoDesc(descricaoComDesconto(formaPagCtx.desc));
    setPagamentoValor(valorFinal > 0 ? valorFinal.toFixed(2) : "");
    setPagamentoForma(op.forma);
    setPagamentoAgId(principal);
    setPagamentoExtraIds(extras);
    // Abre o diálogo de pagamento ANTES de fechar o de forma de pagamento.
    // Assim o Radix mantém o overlay/scroll-lock contínuo e a agenda por
    // baixo não pisca nem redimensiona (evita o "desconfigurar" por segundos).
    setPagamentoOpen(true);
    requestAnimationFrame(() => setFormaPagOpen(false));
  };

  const escolherMisto = () => {
    if (!formaPagCtx) return;
    const ids = formaPagCtx.agId.split(",").filter(Boolean);
    const principal = ids[0] ?? null;
    const extras = ids.slice(1);
    // pega o maior valor disponível como referência (geralmente todas as formas têm valor próximo)
    const valorRef = Math.max(0, ...formaPagOpcoes.map((o) => o.valor));
    const valorFinal = aplicarDescontoPendente(valorRef);
    setPagamentoDesc(descricaoComDesconto(formaPagCtx.desc));
    setPagamentoValor(valorFinal > 0 ? valorFinal.toFixed(2) : "");
    setPagamentoForma("__misto__");
    setPagamentoAgId(principal);
    setPagamentoExtraIds(extras);
    setPagamentoOpen(true);
    requestAnimationFrame(() => setFormaPagOpen(false));
  };

  // Pagamento com valor manual: abre o diálogo de lançamento com valor vazio
  // e sem forma pré-selecionada, permitindo ao usuário digitar livremente.
  const escolherManual = () => {
    if (!formaPagCtx) return;
    const ids = formaPagCtx.agId.split(",").filter(Boolean);
    const principal = ids[0] ?? null;
    const extras = ids.slice(1);
    setPagamentoDesc(`${descricaoComDesconto(formaPagCtx.desc)} — valor manual`);
    setPagamentoValor("");
    setPagamentoForma("");
    setPagamentoAgId(principal);
    setPagamentoExtraIds(extras);
    setPagamentoOpen(true);
    requestAnimationFrame(() => setFormaPagOpen(false));
  };

  // Atalhos de teclado no diálogo "Forma de pagamento":
  // 1=Dinheiro, 2=PIX, 3=Débito, 4=Crédito, 5=Mais de uma forma, 6=Valor manual
  // (segue a ordem exibida em formaPagOpcoes; tecla N+1 = misto, N+2 = manual).
  useEffect(() => {
    if (!formaPagOpen) return;
    const onKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement | null;
      if (tgt && (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA" || tgt.isContentEditable)) return;
      if (e.key >= "1" && e.key <= "9") {
        const idx = Number(e.key) - 1;
        if (idx < formaPagOpcoes.length) {
          e.preventDefault();
          escolherForma(formaPagOpcoes[idx]);
        } else if (idx === formaPagOpcoes.length) {
          e.preventDefault();
          escolherMisto();
        } else if (idx === formaPagOpcoes.length + 1) {
          e.preventDefault();
          escolherManual();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [formaPagOpen, formaPagOpcoes, formaPagCtx]);

  // Atalhos da tela Agenda:
  // N = novo encaixe, F = focar filtro de profissional, R = recarregar
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement | null;
      if (tgt) {
        const tag = tgt.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tgt.isContentEditable) return;
        if (tgt.closest('[role="dialog"], [role="listbox"], [role="menu"], [role="combobox"]')) return;
      }
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const k = e.key.toLowerCase();
      if (k === "n") {
        e.preventDefault();
        openNew();
      } else if (k === "f") {
        const el = document.querySelector<HTMLElement>("[data-agenda-filtro-prof]");
        if (el) {
          e.preventDefault();
          el.focus();
        }
      } else if (k === "r") {
        e.preventDefault();
        void load();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Abre a NFS-e emitida (PDF) ou, se ainda não existir, emite uma nova
  // para o agendamento (exige pagamento confirmado).
  const verOuEmitirNota = async (a: Agendamento) => {
    if (!clinicaAtual) return;
    const ex = nfseMap.get(a.id);
    if (ex) {
      if (ex.url_pdf) {
        window.open(ex.url_pdf, "_blank", "noopener,noreferrer");
      } else {
        toast.info(`NFS-e ${ex.numero ?? ""} — status: ${ex.status ?? "—"}. PDF ainda não disponível.`);
        navigate({ to: "/app/nfse" });
      }
      return;
    }
    if (!podeEscrever) {
      toast.error("Você não tem permissão de edição neste módulo.");
      return;
    }
    if (!pagosSet.has(a.id)) {
      toast.error("Registre o pagamento antes de emitir a NFS-e.");
      return;
    }
    if (isSlotLivre(a.paciente_nome) || !a.paciente_id) {
      toast.error("Agendamento sem paciente vinculado — NFS-e não emitida.");
      return;
    }
    try {
      const emitenteIdEscolhido = await pickEmitenteNfse();
      if (!emitenteIdEscolhido) {
        toast.error("Selecione a empresa emitente para emitir a NFS-e.");
        return;
      }
      const { data: pac } = await supabase
        .from("pacientes")
        .select("id, nome, cpf, email, cep, logradouro, numero, bairro, cidade, estado")
        .eq("id", a.paciente_id)
        .maybeSingle();
      if (!pac) {
        toast.error("Paciente não encontrado para emissão da NFS-e.");
        return;
      }
      const valor = pagoInfoMap.get(a.id)?.valor ?? 0;
      const tomador = await pickTomadorNfse({
        paciente: {
          nome: pac.nome,
          cpfCnpj: pac.cpf ?? undefined,
          email: pac.email ?? undefined,
          cep: pac.cep ?? undefined,
          logradouro: pac.logradouro ?? undefined,
          numero: pac.numero ?? undefined,
          bairro: pac.bairro ?? undefined,
          municipio: pac.cidade ?? undefined,
          uf: pac.estado ?? undefined,
        },
        valorBase: Number(valor) || 0,
      });
      if (!tomador) {
        toast.error("Emissão cancelada.");
        return;
      }
      const parcial = aplicarValorParcial(Number(valor) || 0, tomador);
      const descBase = a.procedimento || "Serviços prestados";
      const descComDep = tomador.dependenteAtendido ? `${descBase} — Atendido: ${tomador.dependenteAtendido}` : descBase;
      const descSugerida = `${descComDep}${parcial.descricaoSufixo}`;
      const descFinal = await pedirDescricaoNfse(descSugerida);
      if (!descFinal) { toast.error("Emissão cancelada."); return; }
      const res = await emitirNfseFn({
        data: {
          emitenteId: emitenteIdEscolhido,
          pacienteId: pac.id,
          agendamentoId: a.id,
          valorServicos: parcial.valor,
          descricaoServicos: descFinal,
          tomador,
        },
      });
      const nfseId = (res as { id?: string })?.id;
      if (nfseId) {
        toast.success("NFS-e enviada. Consultando status...");
        await new Promise((r) => setTimeout(r, 4000));
        await consultarNfseFn({ data: { id: nfseId } });
        toast.success("NFS-e emitida com sucesso.");
        // Atualiza o mapa para refletir a NFS-e recém-emitida.
        const { data: nv } = await supabase
          .from("nfse")
          .select("id, status, url_pdf, numero")
          .eq("id", nfseId)
          .maybeSingle();
        if (nv) {
          setNfseMap((prev) => {
            const n = new Map(prev);
            n.set(a.id, { id: nv.id, status: nv.status, url_pdf: nv.url_pdf, numero: nv.numero });
            return n;
          });
          if (nv.url_pdf) window.open(nv.url_pdf, "_blank", "noopener,noreferrer");
        }
      } else {
        toast.warning("NFS-e enviada — acompanhe o status em Financeiro › NFS-e.");
      }
    } catch (err) {
      mostrarErro(err, "falha ao emitir NFS-e");
    }
  };

  const imprimirGR = async (a: Agendamento) => {
    if (!clinicaAtual) return;
    if (!pagosSet.has(a.id)) {
      toast.error("GR só pode ser impressa após o pagamento. Registre o pagamento antes.");
      return;
    }
    try {
      // Reimpressão: carrega a forma/parcelas/bandeira reais do lançamento
      // confirmado deste agendamento para que a 2ª via mantenha exatamente
      // a forma de pagamento escolhida (evita cair no default "DINHEIRO"
      // quando o lançamento não tem forma preenchida).
      let pagamentoInfo:
        | {
          valor: number;
          forma_pagamento: string | null;
          parcelas: number | null;
          bandeira_cartao: string | null;
        }
        | undefined;
      try {
        const { data: lancs } = await supabase
          .from("fin_lancamentos")
          .select("valor, forma_pagamento, parcelas, bandeira_cartao, created_at")
          .eq("agendamento_id", a.id)
          .eq("tipo", "receita")
          .eq("status", "confirmado")
          .order("created_at", { ascending: false });
        const rows = (lancs ?? []) as Array<{
          valor: number | string;
          forma_pagamento: string | null;
          parcelas: number | null;
          bandeira_cartao: string | null;
        }>;
        if (rows.length > 0) {
          const total = rows.reduce((s, r) => s + Number(r.valor ?? 0), 0);
          // Toma a primeira linha com forma preenchida (mais recente); se
          // nenhuma tiver, usa null (o print exibirá "—" no lugar do default).
          const comForma = rows.find((r) => r.forma_pagamento) ?? rows[0];
          pagamentoInfo = {
            valor: total,
            forma_pagamento: comForma.forma_pagamento,
            parcelas: comForma.parcelas,
            bandeira_cartao: comForma.bandeira_cartao,
          };
        }
      } catch {
        /* segue sem enriquecer — printGuiaAtendimento tem fallback próprio */
      }
      const fichaStr = fichaPorId.get(a.id);
      const fichaNumero = fichaStr && fichaStr !== "—" ? Number(fichaStr) : undefined;
      await printGuiaAtendimento({
        agendamentoId: a.id,
        clinicaId: clinicaAtual.clinica_id,
        usuarioNome: user?.user_metadata?.nome ?? user?.email ?? undefined,
        usuarioId: user?.id ?? null,
        pagamento: pagamentoInfo,
        fichaNumero,
      });
    } catch (err) {
      mostrarErro(err);
    }
  };

  const imprimirComprovante = async (a: Agendamento) => {
    if (!clinicaAtual) return;
    try {
      await printComprovanteAgendamento({
        agendamentoId: a.id,
        clinicaId: clinicaAtual.clinica_id,
        usuarioNome: user?.user_metadata?.nome ?? user?.email ?? undefined,
      });
    } catch (err) {
      mostrarErro(err);
    }
  };

  const shiftData = (delta: number) => {
    const d = new Date(`${dataRef}T12:00:00`);
    d.setDate(d.getDate() + delta);
    // pula para o próximo dia de funcionamento (sáb/dom)
    const step = delta >= 0 ? 1 : -1;
    while (d.getDay() === 0) {
      d.setDate(d.getDate() + step);
    }
    setDataRef(d.toISOString().slice(0, 10));
  };

  const prefixoMedico = (sexo?: string | null) => {
    const s = (sexo ?? "").toString().trim().toUpperCase();
    if (s.startsWith("F")) return "Dra.";
    if (s.startsWith("M")) return "Dr.";
    return "Dr(a).";
  };
  const NOMES_EXAME_SEM_PREFIXO = new Set<string>([
    "ECG",
    "EEG",
    "MAPA",
    "HOLTER",
    "ITB",
    "ELETROCARDIOGRAMA",
    "ELETROENCEFALOGRAMA",
    "TESTE ERGOMETRICO",
    "TESTE ERGOMÉTRICO",
    "ERGOMETRIA",
    "SAO FRANCISCO DE PAULA",
    "SÃO FRANCISCO DE PAULA",
  ]);
  const medicoNome = (id: string | null) => {
    const m = medicos.find((x) => x.id === id);
    if (!m) return "—";
    const s = m.nome.trim().toUpperCase();
    if (m.nome.startsWith("🩺") || NOMES_EXAME_SEM_PREFIXO.has(s)) return m.nome;
    return `${prefixoMedico(m.sexo)} ${m.nome}`;
  };
  const medicoNomeAgendamento = (a: Agendamento) => {
    const m = medicos.find((x) => x.id === a.medico_id);
    const isExame = (n?: string | null) => NOMES_EXAME_SEM_PREFIXO.has((n ?? "").trim().toUpperCase());
    if (m) {
      if (m.nome.startsWith("🩺") || isExame(m.nome)) return m.nome;
      return `${prefixoMedico(m.sexo)} ${m.nome}`;
    }
    if (!a.medico_nome) return "—";
    if (isExame(a.medico_nome)) return a.medico_nome;
    return `${prefixoMedico(a.medico_sexo)} ${a.medico_nome}`;
  };
  const fmtHora = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const fmtData = (iso: string) => {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(-2)}`;
  };
  const fmtDiaSemana = (iso: string) => DIAS_SEMANA[new Date(iso).getDay()];

  return (
    <div className="space-y-3">
      {emitenteNfseDialog}
      {tomadorNfseDialog}
      {descricaoNfseDialog}
      {reagendandoAg && (
        <div className="sticky top-0 z-30 -mx-4 px-4 py-2 border-b bg-primary text-primary-foreground shadow-sm">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <CalendarDays className="h-4 w-4 shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="font-semibold uppercase">Reagendando · {reagendandoAg.paciente_nome}</span>
              <span className="ml-2 opacity-90">
                Atual: {new Date(reagendandoAg.inicio).toLocaleString("pt-BR")}
                {reagendandoAg.procedimento ? ` — ${reagendandoAg.procedimento}` : ""}
              </span>
              <span className="ml-2 opacity-90 italic">Clique em um horário disponível na agenda para confirmar.</span>
            </div>
            <Button size="sm" variant="secondary" onClick={cancelarReagendamento} disabled={reagSalvando}>
              {reagSalvando ? "Salvando…" : "Cancelar reagendamento"}
            </Button>
          </div>
        </div>
      )}
      {reagLoteIds && reagLoteIds.length > 0 && (
        <div className="sticky top-0 z-30 -mx-4 px-4 py-2 border-b bg-primary text-primary-foreground shadow-sm">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <CalendarDays className="h-4 w-4 shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="font-semibold uppercase">
                Reagendando · {reagLoteIds.length} paciente(s) selecionado(s)
              </span>
              <span className="ml-2 opacity-90 italic">
                Clique em um horário DISPONÍVEL na agenda. Os pacientes serão alocados em sequência a partir dessa
                ficha.
              </span>
            </div>
            <Button size="sm" variant="secondary" onClick={cancelarReagLote} disabled={reagLoteSalvando}>
              {reagLoteSalvando ? "Salvando…" : "Cancelar reagendamento"}
            </Button>
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 xl:h-12 xl:w-12 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-sm">
            <CalendarDays className="h-5 w-5 xl:h-6 xl:w-6" />
          </div>
          <div>
            <h1 className="text-xl xl:text-2xl font-bold tracking-tight text-slate-900 dark:text-foreground">Agendas</h1>
            <p className="hidden xl:block text-xs text-muted-foreground">Filtre e gerencie os agendamentos da clínica.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {!turboDisabled && <TurboModeToggle />}
          <div className="inline-flex rounded-full border bg-card p-0.5">
            <button
              type="button"
              onClick={() => setViewMode("dia")}
              className={`px-2 py-1 text-[11px] font-medium rounded-full transition-colors ${viewMode === "dia" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              Lista
            </button>
            <button
              type="button"
              onClick={() => setViewMode("medico")}
              className={`px-2 py-1 text-[11px] font-medium rounded-full transition-colors ${viewMode === "medico" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              Por médico
            </button>
          </div>
          <EncerrarExpedienteButton />
          <Button
            asChild
            variant="outline"
            size="sm"
            className="h-7 text-[11px] px-2"
            title="Agendamento rápido em 4 passos"
          >
            <Link
              to="/app/agenda/express"
              activeProps={{ className: "bg-primary text-primary-foreground border-primary hover:bg-primary/90 hover:text-primary-foreground" }}
            >
              <Clock className="h-3 w-3 mr-1.5" /> Agenda Express
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            size="sm"
            className="h-7 text-[11px] px-2"
            title="Cadastrar horários semanais e gerar slots da agenda"
          >
            <Link to="/app/disponibilidades">
              <Clock className="h-3 w-3 mr-1.5" /> Criar/gerar horários
            </Link>
          </Button>
          {podeEscrever && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 text-[11px] px-2" disabled={selecionados.size === 0}>
                  Opções ({selecionados.size})
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={cobrarSelecionados}>💳 Cobrar selecionados (1 pagamento)</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={baixarLoteRealizado}>✅ Baixar selecionados como Realizado</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={copiarPacienteSelecionado} disabled={selecionados.size !== 1}>
                  📋 Copiar dados do paciente
                </DropdownMenuItem>
                {isManager && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={abrirReagLote}>🔁 Reagendar selecionados</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={excluirSelecionados} className="text-destructive focus:text-destructive">
                      🗑️ Excluir horários selecionados
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-[11px] px-2"
            onClick={() => {
              if (!filtrados.length) {
                toast.info("Sem dados para exportar.");
                return;
              }
              exportToExcel(
                filtrados.map((a) => ({
                  data: new Date(a.inicio).toLocaleDateString("pt-BR"),
                  dia: fmtDiaSemana(a.inicio),
                  inicio: fmtHora(a.inicio),
                  fim: fmtHora(a.fim),
                  profissional: medicoNomeAgendamento(a),
                  paciente: a.paciente_nome,
                  procedimento: a.procedimento ?? rotuloFallbackProc(a.medico_id),
                  status: a.status,
                  observacoes: a.observacoes ?? "",
                })),
                `agenda-${dataRef}`,
                [
                  { key: "data", label: "Data" },
                  { key: "dia", label: "Dia" },
                  { key: "inicio", label: "Início" },
                  { key: "fim", label: "Fim" },
                  { key: "profissional", label: "Profissional" },
                  { key: "paciente", label: "Cliente" },
                  { key: "procedimento", label: "Serviço" },
                  { key: "status", label: "Status" },
                  { key: "observacoes", label: "Observações" },
                ],
              );
            }}
          >
            <Download className="h-3 w-3 mr-1.5" /> Exportar Excel
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            {podeEscrever && (
              <DialogTrigger asChild>
                <Button
                  size="sm"
                  data-turbo-novo
                  onClick={openNew}
                  disabled={!clinicaAtual}
                  className="h-7 text-[11px] px-2 bg-primary hover:bg-primary/90 text-primary-foreground"
                >
                  <Plus className="h-3 w-3 mr-1.5" /> Adicionar Encaixe
                </Button>
              </DialogTrigger>
            )}
            <DialogContent className="max-w-3xl max-h-[95vh] overflow-y-auto p-0 gap-0 rounded-2xl border-slate-200 shadow-2xl">
              <DialogHeader className="space-y-0 px-6 pt-1.5 pb-1 border-b border-slate-100 bg-gradient-to-b from-slate-50/60 to-transparent">
                <DialogTitle className="text-sm font-semibold tracking-tight text-slate-900">
                  {editing
                    ? pagosSet.has(editing.id)
                      ? "Visualizar agendamento"
                      : "Editar agendamento"
                    : "Novo agendamento"}
                </DialogTitle>
                <p className="text-[11px] text-slate-500 leading-tight">
                  {editing && pagosSet.has(editing.id)
                    ? "Este agendamento já foi pago. Alterações exigem estorno."
                    : "Preencha os dados abaixo. Campos com * são obrigatórios."}
                </p>
              </DialogHeader>
              <form onSubmit={submit} className="space-y-1.5 px-6 py-2">
                {editing && open && <FichaEmUsoAlert agendamentoId={editing.id} />}
                {editing && pagosSet.has(editing.id) && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/70 text-amber-900 px-3 py-2 text-xs">
                    <span className="mt-0.5">⚠️</span>
                    Este agendamento já foi pago. Para alterações, estorne o pagamento no Financeiro.
                  </div>
                )}
                <fieldset
                  disabled={editing ? pagosSet.has(editing.id) : false}
                  className="space-y-2 contents disabled:opacity-90"
                >
                  <div className="space-y-1 rounded-xl border border-primary/25 bg-primary/[0.04] p-2 text-xs">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Label className="text-[10px] font-semibold uppercase tracking-widest text-primary whitespace-nowrap">
                        Nº do orçamento
                      </Label>
                      <Input
                        inputMode="numeric"
                        placeholder="Ex.: 123"
                        value={form.orcamento_numero}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, orcamento_numero: e.target.value.replace(/\D/g, "") }))
                        }
                        disabled={!!form.orcamento_id || (editing ? pagosSet.has(editing.id) : false)}
                        className="max-w-[110px] h-8 bg-white"
                      />
                      {form.orcamento_id ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={limparOrcamento}
                          disabled={editing ? pagosSet.has(editing.id) : false}
                        >
                          Limpar
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => void buscarOrcamento()}
                          disabled={buscandoOrc}
                        >
                          {buscandoOrc ? "Buscando…" : "Buscar"}
                        </Button>
                      )}
                      {!form.orcamento_id && (
                        <span className="text-[11px] text-slate-500 leading-snug flex-1 min-w-[140px]">
                          Opcional — vincula qualquer orçamento (exames, consultas, procedimentos) em uma única ficha.
                        </span>
                      )}
                    </div>
                    {form.orcamento_id && (
                      <div className="text-xs text-slate-600 space-y-1 pt-1 border-t border-primary/15">
                        <p className="font-medium text-slate-900">
                          Marcando {form.orcamento_itens.length} exame(s) em uma única ficha. Pagamento continua pelo
                          orçamento.
                        </p>
                        {form.orcamento_itens.length > 0 && (
                          <ul className="list-disc list-inside max-h-24 overflow-y-auto pl-1">
                            {form.orcamento_itens.map((n, i) => (
                              <li key={i}>{n}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-700">
                      Paciente <span className="text-rose-500">*</span>
                    </Label>
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <PatientSearchInput
                          clinicaIdsOverride={clinicaAtual ? [clinicaAtual.clinica_id] : undefined}
                          value={
                            form.paciente_id
                              ? {
                                id: form.paciente_id,
                                nome: form.paciente_nome,
                                cpf: null,
                                telefone: null,
                                data_nascimento: null,
                                clinica_id: clinicaAtual?.clinica_id ?? "",
                              }
                              : form.paciente_nome
                                ? {
                                  id: "__pendente__",
                                  nome: form.paciente_nome,
                                  cpf: null,
                                  telefone: null,
                                  data_nascimento: null,
                                  clinica_id: clinicaAtual?.clinica_id ?? "",
                                }
                                : null
                          }
                          onSelect={(p) => {
                            setForm((f) => ({
                              ...f,
                              paciente_nome: p?.nome ?? "",
                              paciente_id: p?.id ?? "",
                            }));
                          }}
                          placeholder="Nome, CPF, nascimento (DD/MM/AAAA) ou prontuário…"
                          autoFocus
                          enableVoice
                        />
                      </div>
                      {podeEscrever && (
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          title="Cadastrar novo paciente"
                          disabled={editing ? pagosSet.has(editing.id) : false}
                          onClick={() => {
                            setNovoPac((p) => ({ ...p, nome: form.paciente_nome }));
                            setNovoPacOpen(true);
                          }}
                        >
                          <UserPlus className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    {editing && pagosSet.has(editing.id) && (
                      <p className="text-xs text-amber-600">
                        Este agendamento já está pago — o nome do paciente não pode ser alterado.
                      </p>
                    )}
                    {form.paciente_nome && !form.paciente_id && (
                      <p className="text-xs text-amber-600 font-medium">
                        Paciente não cadastrado — use o botão ao lado para cadastrar antes de salvar.
                      </p>
                    )}
                    {form.paciente_id && clinicaAtual && (
                      <>
                        <PacienteResumoBar
                          key={`resumo-${form.paciente_id}`}
                          pacienteId={form.paciente_id}
                          clinicaId={clinicaAtual.clinica_id}
                          onCompletarCadastro={() => setQuickCompleteOpen(true)}
                        />
                        <PacienteQuickActions
                          key={form.paciente_id}
                          pacienteId={form.paciente_id}
                          clinicaId={clinicaAtual.clinica_id}
                        />
                      </>
                    )}
                  </div>
                  {contratoPacienteInfo && (
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-slate-700">Tipo de atendimento</Label>
                      <Select
                        value={form.tipo_atendimento}
                        onValueChange={(v) => setForm((f) => ({ ...f, tipo_atendimento: v as TipoAtendimento }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="convenio">Convênio — {contratoPacienteInfo.convenioNome}</SelectItem>
                          <SelectItem value="particular">Particular (paga valor cheio)</SelectItem>
                        </SelectContent>
                      </Select>
                      {contratoPacienteInfo.qtdAtrasadas > 0 && form.tipo_atendimento === "particular" && (
                        <p className="text-xs rounded-md border border-amber-300 bg-amber-50 text-amber-900 px-2 py-1.5">
                          Paciente tem <b>R$ {contratoPacienteInfo.totalAberto.toFixed(2)}</b> em aberto no cartão (
                          {contratoPacienteInfo.qtdAtrasadas} parcela(s) vencida(s)). Este atendimento será cobrado como
                          Particular.
                        </p>
                      )}
                      {contratoPacienteInfo.qtdAtrasadas > 0 && form.tipo_atendimento === "convenio" && (
                        <p className="text-xs rounded-md border border-destructive/40 bg-destructive/5 text-destructive px-2 py-1.5">
                          Convênio bloqueado: paciente tem <b>R$ {contratoPacienteInfo.totalAberto.toFixed(2)}</b> em
                          atraso. Para agendar, mude para <b>Particular</b> ou regularize o débito.
                        </p>
                      )}
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-700">Forma de pagamento prevista</Label>
                    <Select
                      value={form.forma_pagamento_prevista || "nao_informado"}
                      onValueChange={(v) =>
                        setForm((f) => ({ ...f, forma_pagamento_prevista: v === "nao_informado" ? "" : v }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="nao_informado">Não informada (definir na cobrança)</SelectItem>
                        <SelectItem value="dinheiro">Dinheiro</SelectItem>
                        <SelectItem value="pix">PIX</SelectItem>
                        <SelectItem value="cartao_credito">Cartão de Crédito</SelectItem>
                        <SelectItem value="cartao_debito">Cartão de Débito</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-slate-500">
                      Registra como o paciente pretende pagar. A forma real ainda é definida na cobrança.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-700">
                      Médico ou Exame <span className="text-rose-500">*</span>
                    </Label>
                    <SearchableSelect
                      value={form.medico_id || "none"}
                      disabled={!!editing}
                      onChange={(v) => {
                        if (v.startsWith("exame:")) {
                          const nome = v.slice(6);
                          setForm((f) => ({
                            ...f,
                            medico_id: "",
                            procedimento: nome,
                            procedimentos: nome ? [nome] : [],
                          }));
                        } else {
                          setForm((f) => {
                            const medico_id = v === "none" ? "" : v;
                            const fim = f.inicio ? calcFimAuto(f.inicio, medico_id) : f.fim;
                            // Pré-preenche o serviço com o procedimento padrão do médico (se houver)
                            // e substitui apenas serviço vazio ou herdado da especialidade antiga.
                            let procedimento = f.procedimento;
                            if (medico_id) {
                              const med = medicos.find((m) => m.id === medico_id);
                              const padrao = procedimentoPadraoDoMedico(medico_id);
                              const deveAplicarPadrao =
                                !procedimento || normalizar(procedimento) === normalizar(med?.especialidade_nome ?? "");
                              if (padrao && deveAplicarPadrao) {
                                procedimento = padrao;
                              }
                            }
                            return {
                              ...f,
                              medico_id,
                              fim,
                              procedimento,
                              procedimentos: procedimento ? [procedimento] : [],
                            };
                          });
                        }
                      }}
                      placeholder="Selecione médico ou exame"
                      searchPlaceholder="Buscar médico ou exame..."
                      options={[
                        { value: "none", label: "— Sem médico —" },
                        ...medicos.map((m) => ({ value: m.id, label: `👨‍⚕️ ${m.nome}` })),
                        ...exames.map((e) => ({ value: `exame:${e.nome}`, label: `🧪 ${e.nome}` })),
                      ]}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-slate-700">
                          Data consulta/exame <span className="text-rose-500">*</span>
                        </Label>
                        <Input
                          type="datetime-local"
                          value={form.inicio}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              inicio: e.target.value,
                              fim: calcFimAuto(e.target.value, f.medico_id),
                            }))
                          }
                          required
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-slate-700">Data de pagamento</Label>
                        <Input
                          type="text"
                          value={
                            form.data_pagamento
                              ? new Date(form.data_pagamento + "T00:00:00").toLocaleDateString("pt-BR")
                              : "—"
                          }
                          readOnly
                          disabled
                          tabIndex={-1}
                          className="bg-slate-50 cursor-not-allowed text-slate-500"
                        />
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-500 pt-0.5">
                      Preenchida automaticamente pelo sistema quando o pagamento for registrado.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-700">Serviço</Label>
                    {form.medico_id ? (
                      procOpcoesPorMedico.get(form.medico_id)?.length ||
                        procPorMedico.get(form.medico_id)?.size ||
                        procNomesPorMedico.get(form.medico_id)?.size ? (
                        <p className="text-[11px] text-slate-500">
                          Mostrando apenas serviços configurados para este médico.
                        </p>
                      ) : procedimentoPadraoDoMedico(form.medico_id) ? (
                        <p className="text-[11px] text-slate-500">
                          Mostrando o serviço principal do médico. Cadastre mais serviços no cadastro do médico, se
                          necessário.
                        </p>
                      ) : (
                        <p className="text-xs text-amber-600">
                          Este médico não possui serviços cadastrados. Configure-os no cadastro do médico.
                        </p>
                      )
                    ) : (
                      <p className="text-[11px] text-slate-500">
                        Selecione um médico para ver os serviços disponíveis.
                      </p>
                    )}
                    {(() => {
                      const opts = opcoesServicoFormulario();
                      const permiteMulti =
                        !!form.medico_id &&
                        (medicoEhLaboratorioFormulario(form.medico_id) ||
                          opts.some((o) => procedimentoEhImagem(o.label)));
                      const optsMulti = opts.filter((o) => o.value !== "none");
                      return permiteMulti ? (
                        <>
                          <SearchableMultiSelect
                            value={
                              form.procedimentos.length > 0
                                ? form.procedimentos
                                : form.procedimento
                                  ? [form.procedimento]
                                  : []
                            }
                            onChange={(values) =>
                              setForm((f) => ({
                                ...f,
                                procedimentos: values,
                                procedimento: values.join(" + "),
                              }))
                            }
                            placeholder="Selecione um ou mais serviços"
                            searchPlaceholder="Buscar serviço..."
                            options={optsMulti}
                          />
                          <p className="text-[11px] text-slate-500">
                            {optsMulti.length} serviço{optsMulti.length === 1 ? "" : "s"} disponíve
                            {optsMulti.length === 1 ? "l" : "is"} — role para ver todos.
                            {form.procedimentos.length > 1 && (
                              <span className="text-emerald-700"> {form.procedimentos.length} selecionados.</span>
                            )}
                          </p>
                        </>
                      ) : (
                        <SearchableSelect
                          value={form.procedimento || "none"}
                          onChange={(v) =>
                            setForm((f) => ({
                              ...f,
                              procedimento: v === "none" ? "" : v,
                              procedimentos: v === "none" ? [] : [v],
                            }))
                          }
                          placeholder="Selecione o serviço"
                          searchPlaceholder="Buscar serviço..."
                          options={opts}
                        />
                      );
                    })()}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-700">Status</Label>
                    {editing && !isSlotLivre(editing.paciente_nome) ? (
                      <Select
                        value={form.status}
                        onValueChange={(v) => setForm((f) => ({ ...f, status: v as Status }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
                            <SelectItem key={s} value={s}>
                              {STATUS_LABEL[s]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        value={STATUS_LABEL[form.status]}
                        disabled
                        readOnly
                        className="bg-slate-50 text-slate-500"
                      />
                    )}
                    {(!editing || isSlotLivre(editing.paciente_nome)) && (
                      <p className="text-[11px] text-slate-500">
                        Status definido automaticamente. Pode ser alterado depois pelo menu de ações.
                      </p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold text-slate-700">Observações</Label>
                      <VoiceInput
                        size="sm"
                        currentValue={form.observacoes}
                        onTranscript={(t) => setForm((f) => ({ ...f, observacoes: t }))}
                        title="Ditar observações"
                      />
                    </div>
                    <Textarea
                      value={form.observacoes}
                      onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))}
                      rows={2}
                      className="resize-none"
                      placeholder="Anotações internas (opcional)…"
                    />
                  </div>
                </fieldset>
                <DialogFooter className="sticky bottom-0 bg-white pt-3 pb-2 -mx-6 px-6 border-t border-slate-200 shadow-[0_-8px_16px_-12px_rgba(0,0,0,0.15)] mt-4 flex sm:flex-row flex-col gap-2 sm:items-center sm:justify-between">
                  {editing && pagosSet.has(editing.id) ? (
                    <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                      Fechar
                    </Button>
                  ) : (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setDescForm({
                            tipo: descontoPendente?.tipo ?? "valor",
                            input: descontoPendente?.input ?? "",
                            motivo: descontoPendente?.motivo ?? "",
                            autorizadoPor: descontoPendente?.autorizadoPor ?? "",
                          });
                          setDescontoDlgOpen(true);
                        }}
                        className={
                          "sm:self-center " +
                          (descontoPendente
                            ? "border-amber-500 text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                            : "")
                        }
                        title="Aplicar desconto (exige autorização da supervisão)"
                      >
                        {descontoPendente
                          ? `Desconto: ${descontoPendente.tipo === "percentual" ? `${descontoPendente.input}%` : `R$ ${descontoPendente.input}`}`
                          : "Desconto"}
                      </Button>
                      <div className="flex flex-nowrap gap-2 sm:justify-end">
                        <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>
                          Cancelar
                        </Button>
                        <Button
                          type="button"
                          disabled={saving || !form.paciente_id}
                          onClick={(e) => {
                            emitirNotaAposRef.current = false;
                            submit(e as unknown as FormEvent, true);
                          }}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                          title="Salva, registra pagamento e imprime a GR em A4"
                        >
                          Pagar/Imprimir
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={saving || !form.paciente_id}
                          onClick={async (e) => {
                            e.preventDefault();
                            const escolhido = await pickEmitenteNfse();
                            if (!escolhido) {
                              toast.error(
                                "Nenhum emitente NFS-e ativo. Cadastre em Configurações › NFS-e antes de emitir notas.",
                              );
                              return;
                            }
                            emitenteNotaAposRef.current = escolhido;
                            emitirNotaAposRef.current = true;
                            submit(e as unknown as FormEvent, true);
                          }}
                          className="border-sky-600 text-sky-700 hover:bg-sky-50 dark:hover:bg-sky-950/30"
                          title="Salva, registra pagamento, imprime a GR e abre a emissão da NFS-e (a nota é salva ao imprimir o A4)"
                        >
                          Pagar + NFS-e
                        </Button>
                        <Button
                          type="submit"
                          variant="secondary"
                          data-primary
                          disabled={saving || !form.paciente_id}
                          title={!form.paciente_id ? "Selecione um paciente cadastrado antes de salvar" : undefined}
                        >
                          {saving ? "Salvando…" : "Salvar"}
                        </Button>
                      </div>
                    </>
                  )}
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <PatientQuickCompleteSheet
        pacienteId={form.paciente_id || null}
        open={quickCompleteOpen}
        onOpenChange={setQuickCompleteOpen}
        requireNfse
      />

      <Dialog open={formaPagOpen} onOpenChange={setFormaPagOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Forma de pagamento</DialogTitle>
          </DialogHeader>
          <div className="text-sm -mt-2 space-y-1">
            {formaPagCtx?.paciente ? (
              <div className="font-semibold text-primary leading-tight">{formaPagCtx.paciente}</div>
            ) : null}
            {formaPagCtx?.procedimento ? (
              <div className="font-medium text-emerald-600 dark:text-emerald-400 leading-tight">
                {formaPagCtx.procedimento}
              </div>
            ) : (
              <div className="text-muted-foreground">{formaPagCtx?.desc}</div>
            )}
            {formaPagCtx?.medico || formaPagCtx?.especialidade ? (
              <div className="text-xs text-muted-foreground leading-tight">
                {formaPagCtx?.medico ? (
                  <span className="font-medium text-foreground/80">{formaPagCtx.medico}</span>
                ) : null}
                {formaPagCtx?.medico && formaPagCtx?.especialidade ? " · " : ""}
                {formaPagCtx?.especialidade ? <span>{formaPagCtx.especialidade}</span> : null}
              </div>
            ) : null}
            <span className="block text-xs mt-1 text-muted-foreground opacity-80">
              Dica: use as teclas 1–5 para escolher rapidamente.
            </span>
          </div>
          <div className="grid gap-2 mt-2">
            {formaPagOpcoes.map((op, idx) => (
              <Button
                key={op.forma}
                variant="outline"
                className="justify-between h-12"
                onClick={() => escolherForma(op)}
              >
                <span className="flex items-center gap-2">
                  <kbd className="inline-flex h-6 w-6 items-center justify-center rounded border bg-muted text-xs font-mono">
                    {idx + 1}
                  </kbd>
                  {op.label}
                </span>
                <span className="font-semibold">
                  {op.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </span>
              </Button>
            ))}
            <Button variant="default" className="justify-center h-12 mt-1 bg-primary" onClick={escolherMisto}>
              <kbd className="inline-flex h-6 w-6 items-center justify-center rounded border border-primary-foreground/40 bg-primary-foreground/10 text-xs font-mono mr-2">
                {formaPagOpcoes.length + 1}
              </kbd>
              💰 Mais de uma forma de pagamento
            </Button>
            <Button variant="secondary" className="justify-center h-12" onClick={escolherManual}>
              <kbd className="inline-flex h-6 w-6 items-center justify-center rounded border bg-muted text-xs font-mono mr-2">
                {formaPagOpcoes.length + 2}
              </kbd>
              ✏️ Valor manual
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <LancamentoDialog
        open={pagamentoOpen}
        onOpenChange={(v) => {
          setPagamentoOpen(v);
          if (!v) {
            setPagamentoAgId(null);
            setPagamentoExtraIds([]);
            setPagamentoPesos({});
            setPagamentoRotulos({});
            setPagamentoPacienteNome("");
            setDescontoPendente(null);
          }
        }}
        tipo="receita"
        initialDescricao={pagamentoDesc}
        initialValor={pagamentoValor}
        initialFormaPagamento={pagamentoForma}
        agendamentoId={pagamentoAgId}
        onSavedWithData={async (dados) => {
          if (!pagamentoAgId || !clinicaAtual) return;
          const agId = pagamentoAgId;
          // Cobrança agrupada: em vez de 1 lançamento principal + N sombras (R$ 0,00),
          // divide o valor total proporcionalmente entre os N atendimentos e cria
          // 1 lançamento por atendimento — permitindo estorno individual sem
          // afetar os demais do grupo.
          // ALTA-01: se o rateio (RPC) falhar, os atendimentos extras do
          // grupo NÃO têm lançamento/caixa registrado — só o principal (que
          // manteve seu lançamento original, de valor cheio). Antes o código
          // seguia em frente mesmo assim: marcava TODOS como pagos e
          // imprimia a guia do grupo inteiro, escondendo que o repasse dos
          // extras nunca teria lançamento por trás. `idsConfirmados` abaixo
          // restringe pago/fluxo/impressão só ao que realmente foi gravado.
          let rateioFalhou = false;
          if (pagamentoExtraIds.length > 0) {
            const todosIds = [agId, ...pagamentoExtraIds];
            const N = todosIds.length;
            const totalPeso = todosIds.reduce((s, id) => s + (pagamentoPesos[id] ?? 0), 0);
            const valorTotal = Number(dados.valor) || 0;
            // Rateio proporcional pelo peso; se soma de pesos for 0, divide igualmente.
            const valoresRat = todosIds.map((id) =>
              totalPeso > 0
                ? Math.round(((pagamentoPesos[id] ?? 0) / totalPeso) * valorTotal * 100) / 100
                : Math.round((valorTotal / N) * 100) / 100,
            );
            // Ajuste de arredondamento: joga a diferença no principal.
            const somaRat = valoresRat.reduce((s, v) => s + v, 0);
            const diff = Math.round((valorTotal - somaRat) * 100) / 100;
            valoresRat[0] = Math.round((valoresRat[0] + diff) * 100) / 100;

            const grupoId =
              typeof crypto !== "undefined" && "randomUUID" in crypto
                ? crypto.randomUUID()
                : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

            // Usuário atual — usado como criado_por em TODOS os lançamentos do
            // grupo, garantindo que o Movimento de Caixa mostre o operador
            // em todas as linhas do rateio.
            const currentUserId = (await supabase.auth.getUser()).data.user?.id ?? null;

            // 1) Localiza o lançamento principal recém-criado pelo LancamentoDialog
            //    (agendamento_id = principal, tipo = receita, status = confirmado, mais recente)
            //    — só para ler as observações e preservar o trecho "Pagamento misto: ...".
            //    A gravação em si (passo 2 em diante) acontece toda dentro da RPC abaixo.
            const { data: principalRow, error: errPrincipal } = await supabase
              .from("fin_lancamentos")
              .select("id, observacoes, criado_por")
              .eq("clinica_id", clinicaAtual.clinica_id)
              .eq("agendamento_id", agId)
              .eq("tipo", "receita")
              .eq("status", "confirmado")
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            if (errPrincipal) {
              mostrarErro(errPrincipal, "pagamento salvo, mas falhou ao localizar o lançamento principal");
            }

            // Preserva o trecho "Pagamento misto: ..." das observações do
            // principal para que o caixa/relatórios consigam decompor as
            // formas de pagamento em cada lançamento do grupo.
            const obsOriginal = (principalRow as { observacoes?: string | null } | null)?.observacoes ?? "";
            const idxMisto = obsOriginal.indexOf("Pagamento misto:");
            const trechoMisto = idxMisto >= 0 ? obsOriginal.slice(idxMisto).split(" | ")[0] : "";
            // Fallback do nome do paciente e do rótulo do procedimento:
            // quando o fluxo que abriu a cobrança (ex.: multi-imagem criado
            // logo antes) não populou pagamentoPacienteNome / pagamentoRotulos,
            // buscamos direto na lista de agendamentos carregada. Sem isso,
            // as descrições vão para o banco como " — CONSULTA (i/N do grupo)"
            // e o Movimento de Caixa mostra a linha sem paciente.
            const pacNomeFallback = (id: string) =>
              items.find((x) => x.id === id)?.paciente_nome ?? "";
            const rotuloFallback = (id: string) => {
              const it = items.find((x) => x.id === id);
              return (
                pagamentoRotulos[id] ||
                it?.procedimento ||
                rotuloFallbackProc(it?.medico_id) ||
                "CONSULTA"
              );
            };
            const pacNome = pagamentoPacienteNome || pacNomeFallback(agId);
            const rotuloPrincipal = rotuloFallback(agId);

            // 2) Atualiza o principal + insere os N-1 extras (fin_lancamentos e
            //    caixa_movimentos) numa única transação (RPC) — antes eram ~6
            //    chamadas separadas; se alguma falhasse no meio, parte dos
            //    atendimentos ficava paga e parte sem lançamento/caixa correto.
            const itensRateio = todosIds.map((id, i) => ({
              agendamento_id: id,
              valor: valoresRat[i],
              descricao:
                i === 0
                  ? `${pacNome} — ${rotuloPrincipal} (1/${N} do grupo)`
                  : `${pacNome || pacNomeFallback(id)} — ${rotuloFallback(id)} (${i + 1}/${N} do grupo)`,
              observacoes: [`Pagamento agrupado (grupo ${grupoId}) — ${i + 1}/${N} atendimentos`, trechoMisto]
                .filter(Boolean)
                .join(" | "),
            }));
            const { error: errRateio } = await supabase.rpc("finalizar_pagamento_agrupado", {
              _clinica_id: clinicaAtual.clinica_id,
              _grupo_id: grupoId,
              _forma_pagamento: dados.forma_pagamento,
              _criado_por: (principalRow as { criado_por?: string | null } | null)?.criado_por ?? currentUserId,
              _itens: itensRateio,
            } as never);
            if (errRateio) {
              rateioFalhou = true;
              mostrarErro(
                errRateio,
                "Pagamento do atendimento principal foi registrado, mas o rateio com os demais do grupo falhou",
              );
              toast.error(
                `${pagamentoExtraIds.length} atendimento(s) do grupo continuam SEM pagamento registrado — repita a cobrança para eles (não foram marcados como pagos).`,
                { duration: 12000 },
              );
            }
          }
          // Com rateio falho, só o principal foi realmente gravado — os
          // extras ficam de fora de pagosSet/fluxo/impressão.
          const idsConfirmados = rateioFalhou ? [agId] : [agId, ...pagamentoExtraIds];
          setPagosSet((prev) => {
            const next = new Set(prev);
            for (const id of idsConfirmados) next.add(id);
            return next;
          });
          // Avança o fluxo do paciente: após o pagamento no caixa, segue para triagem.
          try {
            const todos = idsConfirmados;
            // Auto check-in: apenas para atendimentos do MESMO DIA do pagamento.
            // Se o pagamento é antecipado (consulta em outro dia), o paciente
            // ainda não chegou — o check-in será feito manualmente na recepção.
            const hoje = new Date().toISOString().slice(0, 10);
            const mesmoDia = todos.filter((id) => {
              const ag = items.find((x) => x.id === id);
              if (!ag) return false;
              return new Date(ag.inicio).toISOString().slice(0, 10) === hoje;
            });
            if (mesmoDia.length > 0) {
              const { error: errFluxo } = await supabase
                .from("agendamentos")
                .update({ fluxo_etapa: "triagem", fluxo_atualizado_em: new Date().toISOString() } as never)
                .in("id", mesmoDia);
              if (errFluxo) {
                mostrarErro(errFluxo, "pagamento salvo, mas falhou ao avançar o fluxo");
              } else {
                setEtapaMap((m) => {
                  const n = new Map(m);
                  for (const id of mesmoDia) n.set(id, "triagem");
                  return n;
                });
              }
            }
          } catch (err) {
            mostrarErro(err);
          }
          // limpa seleção após cobrança agrupada
          if (pagamentoExtraIds.length > 0) {
            setSelecionados(new Set());
          }
          try {
            // Imprime a guia só do que foi de fato confirmado — se o rateio
            // falhou, isso é [agId] (só o principal), não o grupo inteiro.
            await printGuiaAtendimentoAgrupada({
              agendamentoIds: idsConfirmados,
              clinicaId: clinicaAtual.clinica_id,
              usuarioNome: user?.user_metadata?.nome ?? user?.email ?? undefined,
              usuarioId: user?.id ?? null,
              pagamento: {
                valor: dados.valor,
                forma_pagamento: dados.forma_pagamento,
                parcelas: dados.parcelas,
                bandeira_cartao: dados.bandeira_cartao,
                detalhe: dados.pagamentos_detalhe,
              },
            });
            if (!rateioFalhou) {
              toast.success("Pagamento registrado e GR enviado para impressão.");
            }
          } catch (err) {
            mostrarErro(err);
          }
          setPagamentoAgId(null);
          setPagamentoExtraIds([]);
          setDescontoPendente(null);
          // Se o usuário escolheu "Pagar/Imprimir/Nota", abre a tela de
          // atendimentos do financeiro com a linha pronta para emitir a NFS-e.
          if (emitirNotaAposRef.current) {
            emitirNotaAposRef.current = false;
            // Emite a NFS-e automaticamente, sem o usuário precisar reabrir nada.
            try {
              const emitenteIdEscolhido = emitenteNotaAposRef.current ?? (await pickEmitenteNfse());
              emitenteNotaAposRef.current = null;
              if (!emitenteIdEscolhido) {
                toast.error("Selecione a empresa emitente para emitir a NFS-e.");
              } else {
                const ag = items.find((x) => x.id === agId);
                if (!ag?.paciente_id) {
                  toast.error("Agendamento sem paciente vinculado — NFS-e não emitida.");
                } else {
                  const { data: pac } = await supabase
                    .from("pacientes")
                    .select("id, nome, cpf, email, cep, logradouro, numero, bairro, cidade, estado")
                    .eq("id", ag.paciente_id)
                    .maybeSingle();
                  if (!pac) {
                    toast.error("Paciente não encontrado para emissão da NFS-e.");
                  } else {
                    const tomador = await pickTomadorNfse({
                      paciente: {
                        nome: pac.nome,
                        cpfCnpj: pac.cpf ?? undefined,
                        email: pac.email ?? undefined,
                        cep: pac.cep ?? undefined,
                        logradouro: pac.logradouro ?? undefined,
                        numero: pac.numero ?? undefined,
                        bairro: pac.bairro ?? undefined,
                        municipio: pac.cidade ?? undefined,
                        uf: pac.estado ?? undefined,
                      },
                      valorBase: Number(dados.valor) || 0,
                    });
                    if (!tomador) {
                      toast.error("Emissão cancelada.");
                      return;
                    }
                    const parcial = aplicarValorParcial(Number(dados.valor) || 0, tomador);
                    const descBase = ag.procedimento || pagamentoDesc || "Serviços prestados";
                    const descComDep = tomador.dependenteAtendido
                      ? `${descBase} — Atendido: ${tomador.dependenteAtendido}`
                      : descBase;
                    const descSugerida = `${descComDep}${parcial.descricaoSufixo}`;
                    const descFinal = await pedirDescricaoNfse(descSugerida);
                    if (!descFinal) { toast.error("Emissão cancelada."); return; }
                    const res = await emitirNfseFn({
                      data: {
                        emitenteId: emitenteIdEscolhido,
                        pacienteId: pac.id,
                        agendamentoId: agId,
                        valorServicos: parcial.valor,
                        descricaoServicos: descFinal,
                        tomador,
                      },
                    });
                    const nfseId = (res as { id?: string })?.id;
                    if (nfseId) {
                      toast.success("NFS-e enviada. Consultando status...");
                      await new Promise((r) => setTimeout(r, 4000));
                      await consultarNfseFn({ data: { id: nfseId } });
                      toast.success("NFS-e emitida com sucesso.");
                    } else {
                      toast.warning("NFS-e enviada — acompanhe o status em Financeiro › Atendimentos.");
                    }
                  }
                }
              }
            } catch (err) {
              mostrarErro(err, "falha ao emitir NFS-e");
              navigate({ to: "/app/financeiro/atendimentos" });
            }
          }
        }}
      />

      {/* Aviso do convênio — persistente; o atendente precisa fechar. */}
      <Dialog
        open={avisoConvenio !== null}
        onOpenChange={(o) => {
          if (!o) setAvisoConvenio(null);
        }}
      >
        <DialogContent
          className="max-w-md"
          onEscapeKeyDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className={avisoConvenio?.tom === "error" ? "text-destructive" : "text-amber-600"}>
              Aviso do convênio
            </DialogTitle>
          </DialogHeader>
          <div className="whitespace-pre-line text-sm leading-relaxed">{avisoConvenio?.mensagem}</div>
          <DialogFooter>
            <Button
              onClick={() => setAvisoConvenio(null)}
              variant={avisoConvenio?.tom === "error" ? "destructive" : "default"}
            >
              Entendi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmação de gratuidade: usar agora (aplica o benefício) ou depois (cobra particular). */}
      <Dialog
        open={gratuidadePrompt !== null}
        onOpenChange={(o) => {
          if (!o && gratuidadePrompt) {
            gratuidadePrompt.resolve("cancel");
            setGratuidadePrompt(null);
          }
        }}
      >
        <DialogContent
          className="max-w-lg w-[calc(100vw-2rem)]"
          onEscapeKeyDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="text-emerald-700">Gratuidade disponível</DialogTitle>
          </DialogHeader>
          <div className="text-sm leading-relaxed">
            Este paciente tem direito a <b>GRATUIDADE</b> pelo convênio <b>{gratuidadePrompt?.convenioNome}</b> para
            este atendimento.
            <br />
            <br />
            Deseja usar agora ou guardar para uma próxima consulta?
          </div>
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:flex-wrap">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                gratuidadePrompt?.resolve("cancel");
                setGratuidadePrompt(null);
              }}
            >
              Cancelar
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                gratuidadePrompt?.resolve("depois");
                setGratuidadePrompt(null);
              }}
            >
              Usar depois
            </Button>
            <Button
              size="sm"
              onClick={() => {
                gratuidadePrompt?.resolve("agora");
                setGratuidadePrompt(null);
              }}
            >
              Usar agora
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo de desconto (acionado pelo botão no formulário de agendamento). */}
      <Dialog open={descontoDlgOpen} onOpenChange={setDescontoDlgOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Aplicar desconto</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>Tipo</Label>
                <Select
                  value={descForm.tipo}
                  onValueChange={(v) => setDescForm((f) => ({ ...f, tipo: v as "valor" | "percentual" }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="valor">R$ (fixo)</SelectItem>
                    <SelectItem value="percentual">% (percentual)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>{descForm.tipo === "percentual" ? "Percentual (%)" : "Valor (R$)"}</Label>
                <Input
                  inputMode="decimal"
                  value={descForm.input}
                  onChange={(e) => setDescForm((f) => ({ ...f, input: e.target.value.replace(/[^\d.,]/g, "") }))}
                  placeholder={descForm.tipo === "percentual" ? "10" : "20,00"}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Autorizado por {ehSupervisorDesc ? "" : "*"}</Label>
              <Input
                value={descForm.autorizadoPor}
                readOnly={!ehSupervisorDesc}
                onChange={(e) => setDescForm((f) => ({ ...f, autorizadoPor: e.target.value }))}
                placeholder={ehSupervisorDesc ? "Você (supervisor)" : "Será preenchido após autorização"}
              />
            </div>
            <div className="space-y-1">
              <Label>Motivo</Label>
              <Textarea
                rows={2}
                value={descForm.motivo}
                onChange={(e) => setDescForm((f) => ({ ...f, motivo: e.target.value }))}
                placeholder="Opcional"
              />
            </div>
            {!ehSupervisorDesc && (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Exige autorização do supervisor (admin, gestor ou financeiro). Ao confirmar, será solicitada a senha.
              </p>
            )}
          </div>
          <DialogFooter>
            {descontoPendente && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setDescontoPendente(null);
                  setDescontoDlgOpen(false);
                  toast.success("Desconto removido.");
                }}
              >
                Remover
              </Button>
            )}
            <Button type="button" variant="ghost" onClick={() => setDescontoDlgOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => {
                const n = Number(String(descForm.input).replace(",", ".")) || 0;
                if (n <= 0) {
                  toast.error("Informe um valor de desconto maior que zero.");
                  return;
                }
                if (descForm.tipo === "percentual" && n > 100) {
                  toast.error("Percentual não pode passar de 100%.");
                  return;
                }
                if (ehSupervisorDesc) {
                  const autor = descForm.autorizadoPor.trim() || (clinicaAtual?.role ?? "supervisor");
                  setDescontoPendente({
                    tipo: descForm.tipo,
                    input: descForm.input,
                    autorizadoPor: autor,
                    motivo: descForm.motivo.trim(),
                  });
                  setDescontoDlgOpen(false);
                  toast.success("Desconto aplicado.");
                } else {
                  setSupervisorOpen(true);
                }
              }}
            >
              {ehSupervisorDesc ? "Aplicar" : "Autorizar e aplicar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SupervisorAuthDialog
        open={supervisorOpen}
        onOpenChange={setSupervisorOpen}
        acao="aplicar desconto"
        onAuthorized={(info) => {
          setDescontoPendente({
            tipo: descForm.tipo,
            input: descForm.input,
            autorizadoPor: info.nome,
            motivo: descForm.motivo.trim(),
          });
          setDescForm((f) => ({ ...f, autorizadoPor: info.nome }));
          setDescontoDlgOpen(false);
          toast.success("Desconto aplicado com autorização da supervisão.");
        }}
      />

      <Dialog open={novoPacOpen} onOpenChange={setNovoPacOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cadastro rápido de paciente</DialogTitle>
          </DialogHeader>
          <form onSubmit={cadastrarPacienteRapido} className="space-y-3">
            <div className="space-y-1">
              <Label>Nome *</Label>
              <Input
                value={novoPac.nome}
                onChange={(e) => setNovoPac((p) => ({ ...p, nome: e.target.value }))}
                required
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>CPF</Label>
                <Input
                  value={novoPac.cpf}
                  onChange={(e) => {
                    const d = e.target.value.replace(/\D/g, "").slice(0, 11);
                    let v = d;
                    if (d.length > 9) v = `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
                    else if (d.length > 6) v = `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
                    else if (d.length > 3) v = `${d.slice(0, 3)}.${d.slice(3)}`;
                    setNovoPac((p) => ({ ...p, cpf: v }));
                  }}
                  inputMode="numeric"
                  maxLength={14}
                  placeholder="000.000.000-00"
                  className={
                    novoPac.cpf && somenteDigitos(novoPac.cpf).length === 11 && !isCPFValido(novoPac.cpf)
                      ? "border-rose-500 focus-visible:ring-rose-500"
                      : ""
                  }
                />
                {novoPac.cpf && somenteDigitos(novoPac.cpf).length === 11 && !isCPFValido(novoPac.cpf) && (
                  <p className="text-[11px] text-rose-600">CPF inválido</p>
                )}
              </div>
              <div className="space-y-1">
                <Label>Nascimento *</Label>
                <DateInputBR
                  required
                  value={novoPac.data_nascimento}
                  onChange={(e) => setNovoPac((p) => ({ ...p, data_nascimento: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Telefone *</Label>
              <Input
                required
                value={novoPac.telefone}
                onChange={(e) => {
                  const d = e.target.value.replace(/\D/g, "").slice(0, 11);
                  let v = d;
                  if (d.length > 10) v = `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
                  else if (d.length > 6) v = `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
                  else if (d.length > 2) v = `(${d.slice(0, 2)}) ${d.slice(2)}`;
                  else if (d.length > 0) v = `(${d}`;
                  setNovoPac((p) => ({ ...p, telefone: v }));
                }}
                inputMode="tel"
                maxLength={15}
                placeholder="(00) 00000-0000"
              />
            </div>
            <div className="space-y-1">
              <Label>E-mail</Label>
              <Input
                type="email"
                value={novoPac.email}
                onChange={(e) => setNovoPac((p) => ({ ...p, email: e.target.value }))}
              />
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Button
                type="button"
                variant={descritorFace ? "secondary" : "outline"}
                size="sm"
                onClick={() => setFaceOpen(true)}
              >
                {descritorFace ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-1 text-green-600" /> Foto capturada — refazer
                  </>
                ) : (
                  <>
                    <Camera className="h-4 w-4 mr-1" /> Tirar foto (reconhecimento facial)
                  </>
                )}
              </Button>
              {descritorFace && (
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline"
                  onClick={() => setDescritorFace(null)}
                >
                  remover
                </button>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setNovoPacOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={savingPac} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                {savingPac ? "Salvando..." : "Cadastrar"}
              </Button>
            </DialogFooter>
          </form>
          <FaceCaptureDialog
            open={faceOpen}
            onClose={() => setFaceOpen(false)}
            onCaptured={(desc) => {
              setDescritorFace(desc);
              toast.success("Foto capturada. Será vinculada ao cadastrar.");
            }}
            titulo="Cadastrar rosto do paciente"
          />
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!auditAg}
        onOpenChange={(o) => {
          if (!o) {
            setAuditAg(null);
            setAuditRows([]);
            setNotasHist([]);
            setEstornosHist([]);
            setNomePorUidExtra(new Map());
            setNotaTexto("");
          }
        }}
      >
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Histórico
            </DialogTitle>
            {auditAg && (
              <p className="text-sm text-muted-foreground">
                {auditAg.paciente_nome} — {new Date(auditAg.inicio).toLocaleString("pt-BR")}
              </p>
            )}
          </DialogHeader>
          <div className="space-y-2 border-b pb-3">
            <Textarea
              value={notaTexto}
              onChange={(e) => setNotaTexto(e.target.value.slice(0, 1000))}
              placeholder="Adicionar uma observação ao histórico deste agendamento…"
              rows={3}
              className="resize-none"
            />
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">{notaTexto.length}/1000</span>
              <Button
                size="sm"
                onClick={adicionarNotaHist}
                disabled={savingNota || !notaTexto.trim()}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <Plus className="h-4 w-4 mr-1" /> Adicionar
              </Button>
            </div>
          </div>
          <div className="overflow-auto flex-1 -mx-6 px-6">
            {auditLoading ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Carregando...</p>
            ) : (
              (() => {
                // Mapas de nome/cargo (por email e por user_id).
                const nomePorEmail = new Map<string, string>();
                const cargoPorEmail = new Map<string, string>();
                const nomePorUid = new Map<string, string>();
                const cargoPorUid = new Map<string, string>();
                equipeList.forEach((m) => {
                  if (m.email && m.nome) nomePorEmail.set(m.email, m.nome);
                  if (m.email && m.role) cargoPorEmail.set(m.email, m.role);
                  if (m.user_id && m.nome) nomePorUid.set(m.user_id, m.nome);
                  if (m.user_id && m.role) cargoPorUid.set(m.user_id, m.role);
                });
                nomePorUidExtra.forEach((v, k) => {
                  if (!nomePorUid.has(k)) nomePorUid.set(k, v);
                });
                const cargoBonito = (r: string | undefined) => {
                  if (!r) return "";
                  const map: Record<string, string> = {
                    admin: "administrador",
                    gestor: "gestor",
                    financeiro: "financeiro",
                    caixa: "caixa",
                    recepcao: "recepção",
                    medico: "médico",
                    enfermeiro: "enfermeiro",
                    enfermagem: "enfermagem",
                    laboratorio: "laboratório",
                  };
                  return map[r] ?? r;
                };
                const quemPorEmail = (email: string | null | undefined) => {
                  if (!email) return "—";
                  const nome = nomePorEmail.get(email) ?? email;
                  const cargo = cargoBonito(cargoPorEmail.get(email));
                  return cargo ? `${nome} (${cargo})` : nome;
                };
                const quemPorUid = (uid: string | null | undefined) => {
                  if (!uid) return "—";
                  const nome = nomePorUid.get(uid) ?? `Usuário …${uid.slice(-6)}`;
                  const cargo = cargoBonito(cargoPorUid.get(uid));
                  return cargo ? `${nome} (${cargo})` : nome;
                };

                // Rótulos e cores por tipo de ação da timeline.
                type Kind =
                  | "criou_slot"
                  | "agendou"
                  | "reagendou"
                  | "liberou"
                  | "checkin"
                  | "iniciou"
                  | "confirmou"
                  | "realizou"
                  | "cancelou"
                  | "pagamento"
                  | "pagamento_removido"
                  | "observacao"
                  | "estorno_solicitado"
                  | "estorno_aprovado"
                  | "estorno_rejeitado"
                  | "estorno_cancelado"
                  | "alterou"
                  | "criou"
                  | "excluiu"
                  | "nota";
                const kindLabel: Record<Kind, string> = {
                  criou_slot: "Slot gerado",
                  agendou: "Agendou",
                  reagendou: "Reagendou",
                  liberou: "Liberou horário",
                  checkin: "Check-in",
                  iniciou: "Iniciou atendimento",
                  confirmou: "Confirmou",
                  realizou: "Realizado",
                  cancelou: "Cancelou",
                  pagamento: "Pagamento",
                  pagamento_removido: "Pagamento removido",
                  observacao: "Observação alterada",
                  estorno_solicitado: "Estorno solicitado",
                  estorno_aprovado: "Estorno aprovado",
                  estorno_rejeitado: "Estorno rejeitado",
                  estorno_cancelado: "Estorno cancelado",
                  alterou: "Alterou",
                  criou: "Criou",
                  excluiu: "Excluiu",
                  nota: "Nota",
                };
                const green = "bg-emerald-100 text-emerald-700 border-emerald-200";
                const amber = "bg-amber-100 text-amber-700 border-amber-200";
                const rose = "bg-rose-100 text-rose-700 border-rose-200";
                const sky = "bg-sky-100 text-sky-700 border-sky-200";
                const violet = "bg-violet-100 text-violet-700 border-violet-200";
                const kindCor: Record<Kind, string> = {
                  criou_slot: green,
                  agendou: green,
                  reagendou: amber,
                  liberou: rose,
                  checkin: green,
                  iniciou: green,
                  confirmou: green,
                  realizou: green,
                  cancelou: rose,
                  pagamento: green,
                  pagamento_removido: rose,
                  observacao: amber,
                  estorno_solicitado: violet,
                  estorno_aprovado: green,
                  estorno_rejeitado: rose,
                  estorno_cancelado: rose,
                  alterou: amber,
                  criou: green,
                  excluiu: rose,
                  nota: sky,
                };

                // Rótulos amigáveis para colunas do agendamento e do lançamento.
                const colLabelAg: Record<string, string> = {
                  paciente_nome: "Paciente",
                  paciente_id: "Paciente (id)",
                  medico_id: "Profissional",
                  inicio: "Início",
                  fim: "Fim",
                  status: "Status",
                  fluxo_etapa: "Etapa do fluxo",
                  observacoes: "Observações",
                  procedimento: "Procedimento",
                  data_pagamento: "Pagamento",
                  forma_pagamento_prevista: "Forma de pagamento",
                  orcamento_id: "Orçamento",
                };
                const hideAg = new Set([
                  "id",
                  "clinica_id",
                  "created_at",
                  "updated_at",
                  "fluxo_atualizado_em",
                  "token_publico",
                  "agenda_id",
                  "atendimento_grupo_id",
                  "pacote_id",
                  "tipo_atendimento",
                  "ficha_numero",
                  "paciente_id",
                ]);
                const statusPt: Record<string, string> = {
                  agendado: "Agendado",
                  confirmado: "Confirmado",
                  realizado: "Realizado",
                  cancelado: "Cancelado",
                };
                const etapaPt: Record<string, string> = {
                  aguardando_recepcao: "Aguardando recepção",
                  triagem: "Triagem",
                  atendimento: "Em atendimento",
                  exame: "Em exame",
                  finalizado: "Finalizado",
                };
                const isSlot = (nome: unknown) => {
                  if (!nome || typeof nome !== "string") return true;
                  return /disponível|disponivel|slot/i.test(nome);
                };
                const fmtDateTime = (v: unknown) => {
                  if (typeof v !== "string" || !v) return "—";
                  try {
                    return new Date(v).toLocaleString("pt-BR");
                  } catch {
                    return v;
                  }
                };
                const repasseLabel: Record<string, string> = {
                  repasse_pago: "Repasse ao médico",
                  repasse_pago_em: "Data do repasse",
                  repasse_forma_pagamento: "Forma do repasse",
                };
                const allowedLanc = new Set(Object.keys(repasseLabel));
                const fmtValAg = (k: string, v: unknown): string => {
                  if (v == null || v === "") return "—";
                  if (k === "status") return statusPt[String(v)] ?? String(v);
                  if (k === "fluxo_etapa") return etapaPt[String(v)] ?? String(v);
                  if (k === "inicio" || k === "fim") return fmtDateTime(v);
                  if (k === "data_pagamento" && typeof v === "string") {
                    try {
                      return new Date(v).toLocaleString("pt-BR");
                    } catch {
                      return String(v);
                    }
                  }
                  return String(v);
                };
                const fmtValLanc = (k: string, v: unknown) => {
                  if (k === "repasse_pago") return v ? "Pago" : "Pendente";
                  if (k === "repasse_pago_em" && typeof v === "string" && v) {
                    return new Date(v + "T00:00:00").toLocaleDateString("pt-BR");
                  }
                  return v == null || v === "" ? "—" : String(v);
                };

                type Item = { id: string; when: string; quem: string; kind: Kind; body: React.ReactNode };
                const items: Item[] = [];

                for (const r of auditRows) {
                  const antes = (r.dados_antes ?? {}) as Record<string, unknown>;
                  const depois = (r.dados_depois ?? {}) as Record<string, unknown>;
                  const isLanc = r.table_name === "fin_lancamentos";
                  const quem = quemPorEmail(r.user_email);

                  if (isLanc) {
                    const chaves = Array.from(new Set([...Object.keys(antes), ...Object.keys(depois)]))
                      .filter((k) => allowedLanc.has(k))
                      .filter((k) => JSON.stringify(antes[k]) !== JSON.stringify(depois[k]));
                    if (r.action === "UPDATE" && chaves.length === 0) continue;
                    let kind: Kind = "alterou";
                    let body: React.ReactNode = null;
                    if (r.action === "INSERT") {
                      kind = "pagamento";
                      body = `Pagamento da consulta registrado${depois.repasse_pago ? " — repasse já pago" : " — repasse pendente"}.`;
                    } else if (r.action === "DELETE") {
                      kind = "pagamento_removido";
                      body = "Pagamento removido.";
                    } else if (r.action === "UPDATE") {
                      body = (
                        <div className="space-y-0.5">
                          {chaves.map((k) => (
                            <div key={k}>
                              <span className="font-medium">{repasseLabel[k] ?? k}:</span>{" "}
                              <span className="line-through text-rose-600">{fmtValLanc(k, antes[k])}</span>
                              {" → "}
                              <span className="text-emerald-700">{fmtValLanc(k, depois[k])}</span>
                            </div>
                          ))}
                        </div>
                      );
                    }
                    items.push({ id: r.id, when: r.created_at, quem, kind, body });
                    continue;
                  }

                  // Tabela agendamentos
                  if (r.action === "INSERT") {
                    const nome = depois.paciente_nome;
                    const kind: Kind = isSlot(nome) ? "criou_slot" : "agendou";
                    const body =
                      kind === "criou_slot" ? (
                        "Slot da agenda gerado (horário disponibilizado)."
                      ) : (
                        <>
                          Agendou o paciente <b>{String(nome ?? "—")}</b>.
                        </>
                      );
                    items.push({ id: r.id, when: r.created_at, quem, kind, body });
                    continue;
                  }
                  if (r.action === "DELETE") {
                    items.push({
                      id: r.id,
                      when: r.created_at,
                      quem,
                      kind: "excluiu",
                      body: "Registro do agendamento excluído.",
                    });
                    continue;
                  }
                  // UPDATE — detecta ações compostas
                  const chaves = Array.from(new Set([...Object.keys(antes), ...Object.keys(depois)]))
                    .filter((k) => !hideAg.has(k))
                    .filter((k) => JSON.stringify(antes[k]) !== JSON.stringify(depois[k]));
                  if (chaves.length === 0) continue;
                  const set = new Set(chaves);
                  const pacienteMudou = set.has("paciente_nome");
                  const antesLivre = isSlot(antes.paciente_nome);
                  const depoisLivre = isSlot(depois.paciente_nome);

                  // Agendou paciente (slot → alocado)
                  if (pacienteMudou && antesLivre && !depoisLivre) {
                    items.push({
                      id: r.id,
                      when: r.created_at,
                      quem,
                      kind: "agendou",
                      body: (
                        <>
                          Agendou o paciente <b>{String(depois.paciente_nome ?? "—")}</b>.
                        </>
                      ),
                    });
                    continue;
                  }
                  // Liberou horário (alocado → slot)
                  if (pacienteMudou && !antesLivre && depoisLivre) {
                    items.push({
                      id: r.id,
                      when: r.created_at,
                      quem,
                      kind: "liberou",
                      body: (
                        <>
                          Liberou o horário (paciente removido: <b>{String(antes.paciente_nome ?? "—")}</b>).
                        </>
                      ),
                    });
                    continue;
                  }
                  // Reagendou (mudou início/fim, sem trocar paciente)
                  if ((set.has("inicio") || set.has("fim")) && !pacienteMudou && !depoisLivre) {
                    items.push({
                      id: r.id,
                      when: r.created_at,
                      quem,
                      kind: "reagendou",
                      body: (
                        <>
                          Reagendou de <b>{fmtDateTime(antes.inicio)}</b> para <b>{fmtDateTime(depois.inicio)}</b>.
                        </>
                      ),
                    });
                    continue;
                  }
                  // Status
                  if (set.has("status") && !pacienteMudou) {
                    const novo = String(depois.status ?? "");
                    if (novo === "confirmado") {
                      items.push({
                        id: r.id,
                        when: r.created_at,
                        quem,
                        kind: "confirmou",
                        body: "Confirmou o agendamento.",
                      });
                      continue;
                    }
                    if (novo === "realizado") {
                      items.push({
                        id: r.id,
                        when: r.created_at,
                        quem,
                        kind: "realizou",
                        body: "Marcou o atendimento como realizado.",
                      });
                      continue;
                    }
                    if (novo === "cancelado") {
                      items.push({
                        id: r.id,
                        when: r.created_at,
                        quem,
                        kind: "cancelou",
                        body: "Cancelou o agendamento.",
                      });
                      continue;
                    }
                  }
                  // Check-in / atendimento pelo fluxo_etapa
                  if (set.has("fluxo_etapa") && !pacienteMudou) {
                    const novo = String(depois.fluxo_etapa ?? "");
                    if (novo === "aguardando_recepcao" || novo === "triagem") {
                      items.push({
                        id: r.id,
                        when: r.created_at,
                        quem,
                        kind: "checkin",
                        body: "Registrou o check-in do paciente.",
                      });
                      continue;
                    }
                    if (novo === "atendimento" || novo === "exame") {
                      items.push({
                        id: r.id,
                        when: r.created_at,
                        quem,
                        kind: "iniciou",
                        body: "Iniciou o atendimento.",
                      });
                      continue;
                    }
                    if (novo === "finalizado") {
                      items.push({
                        id: r.id,
                        when: r.created_at,
                        quem,
                        kind: "realizou",
                        body: "Finalizou o atendimento.",
                      });
                      continue;
                    }
                  }
                  // Pagamento (data_pagamento null → data)
                  if (set.has("data_pagamento") && !antes.data_pagamento && depois.data_pagamento) {
                    items.push({
                      id: r.id,
                      when: r.created_at,
                      quem,
                      kind: "pagamento",
                      body: "Deu baixa no pagamento do atendimento.",
                    });
                    continue;
                  }
                  // Observação isolada
                  if (chaves.length === 1 && set.has("observacoes")) {
                    items.push({
                      id: r.id,
                      when: r.created_at,
                      quem,
                      kind: "observacao",
                      body: (
                        <div>
                          <span className="line-through text-rose-600 whitespace-pre-wrap">
                            {String(antes.observacoes ?? "—")}
                          </span>
                          {" → "}
                          <span className="text-emerald-700 whitespace-pre-wrap">
                            {String(depois.observacoes ?? "—")}
                          </span>
                        </div>
                      ),
                    });
                    continue;
                  }
                  // Fallback: mostra colunas com rótulos amigáveis
                  items.push({
                    id: r.id,
                    when: r.created_at,
                    quem,
                    kind: "alterou",
                    body: (
                      <div className="space-y-0.5">
                        {chaves.map((k) => (
                          <div key={k}>
                            <span className="font-medium">{colLabelAg[k] ?? k}:</span>{" "}
                            <span className="line-through text-rose-600">{fmtValAg(k, antes[k])}</span>
                            {" → "}
                            <span className="text-emerald-700">{fmtValAg(k, depois[k])}</span>
                          </div>
                        ))}
                      </div>
                    ),
                  });
                }

                // Estornos
                for (const e of estornosHist) {
                  items.push({
                    id: `est-req-${e.id}`,
                    when: e.solicitado_em,
                    quem: quemPorUid(e.solicitado_por),
                    kind: "estorno_solicitado",
                    body: (
                      <div>
                        Solicitou estorno.
                        {e.motivo ? (
                          <div className="text-muted-foreground whitespace-pre-wrap">Motivo: {e.motivo}</div>
                        ) : null}
                      </div>
                    ),
                  });
                  if (e.resolvido_em && e.status !== "pendente") {
                    const k: Kind =
                      e.status === "aprovado"
                        ? "estorno_aprovado"
                        : e.status === "rejeitado"
                          ? "estorno_rejeitado"
                          : "estorno_cancelado";
                    items.push({
                      id: `est-res-${e.id}`,
                      when: e.resolvido_em,
                      quem: quemPorUid(e.resolvido_por),
                      kind: k,
                      body: (
                        <div>
                          {k === "estorno_aprovado"
                            ? "Aprovou o estorno."
                            : k === "estorno_rejeitado"
                              ? "Rejeitou o estorno."
                              : "Cancelou a solicitação de estorno."}
                          {e.resposta ? (
                            <div className="text-muted-foreground whitespace-pre-wrap">Resposta: {e.resposta}</div>
                          ) : null}
                        </div>
                      ),
                    });
                  }
                }

                // Notas manuais
                for (const n of notasHist) {
                  const quem = n.user_nome || quemPorEmail(n.user_email);
                  const origemAuto =
                    !n.user_email &&
                    (n.user_nome === "Totem" || n.user_nome === "Autoatendimento");
                  items.push({
                    id: `nota-${n.id}`,
                    when: n.created_at,
                    quem,
                    kind: origemAuto ? "checkin" : "nota",
                    body: (
                      <div className="flex items-start gap-2 flex-wrap">
                        {origemAuto ? (
                          <Badge
                            variant="outline"
                            className="bg-indigo-100 text-indigo-700 border-indigo-200 shrink-0"
                          >
                            {n.user_nome === "Totem" ? "Totem" : "Autoatendimento"}
                          </Badge>
                        ) : null}
                        <span className="whitespace-pre-wrap">{n.texto}</span>
                      </div>
                    ),
                  });
                }
                items.sort((x, y) => (x.when < y.when ? 1 : -1));
                if (items.length === 0) {
                  return (
                    <p className="text-sm text-muted-foreground py-8 text-center">
                      Nenhum registro para este agendamento.
                    </p>
                  );
                }
                return (
                  <Table>
                    <TableHeader className="sticky top-0 bg-muted/60 backdrop-blur">
                      <TableRow>
                        <TableHead className="w-[140px]">Data</TableHead>
                        <TableHead className="w-[180px]">Usuário</TableHead>
                        <TableHead>Histórico</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((it) => (
                        <TableRow key={it.id} className="align-top">
                          <TableCell className="whitespace-nowrap text-xs text-muted-foreground align-top">
                            {new Date(it.when).toLocaleString("pt-BR")}
                          </TableCell>
                          <TableCell className="text-xs align-top">{it.quem}</TableCell>
                          <TableCell className="text-xs align-top">
                            <div className="flex items-start gap-2">
                              <Badge variant="outline" className={`${kindCor[it.kind]} shrink-0`}>
                                {kindLabel[it.kind]}
                              </Badge>
                              <div className="flex-1">{it.body}</div>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                );
              })()
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setAuditAg(null);
                setAuditRows([]);
              }}
            >
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 🔥 FILTROS AGRUPADOS EM LINHAS LÓGICAS */}
      <div
        className="rounded-2xl border bg-card p-2 xl:p-3 shadow-sm mb-6 [&_input]:h-8 [&_input]:text-xs [&_button[role=combobox]]:h-8 [&_button[role=combobox]]:text-xs"
        style={{ ["--clinic" as never]: corClinica }}
      >
        {/* Linha 1: Filtros principais */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-1 xl:gap-1.5">

          {/* Profissional */}
          <div className="space-y-0">
            <Label className="text-[8px] uppercase tracking-wider text-slate-400 font-semibold">Profissional</Label>
            <MedicoFiltroInput
              medicos={medicos}
              value={filtroMedico}
              onChange={(v) => { if (!isMedicoOnly) { setFiltroMedico(v); setFiltroAgenda("todos"); } }}
              disabled={isMedicoOnly}
              onlyMedicoId={isMedicoOnly ? medicoLogadoId : null}
              compact
            />
          </div>

          {/* Tipo de Agenda */}
          <div className="space-y-0">
            <Label className="text-[8px] uppercase tracking-wider text-slate-400 font-semibold">Tipo de agenda</Label>
            <Select value={filtroAgenda} onValueChange={setFiltroAgenda}>
              <SelectTrigger className="h-8 text-xs w-full">
                <SelectValue placeholder="TODAS" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">TODAS</SelectItem>
                {(() => {
                  // Quando um médico específico está selecionado, listamos
                  // as agendas dele por id (permite distinguir turnos/salas).
                  // Quando é "TODOS", agrupamos por NOME (ex.: "AGENDA",
                  // "CONSULTAS") para não repetir a mesma opção uma vez
                  // por médico.
                  const agendasFiltro =
                    filtroMedico !== "todos"
                      ? (agendasPorMedico.get(filtroMedico) ?? [])
                      : Array.from(agendasPorMedico.values()).flat();
                  const seen = new Set<string>();
                  const out: { key: string; nome: string }[] = [];
                  for (const a of agendasFiltro) {
                    const k = chaveNomeAgenda(a.nome ?? "");
                    if (!k || seen.has(k)) continue;
                    seen.add(k);
                    out.push({ key: k, nome: (a.nome ?? "").trim() });
                  }
                  return out.map((o) => (
                    <SelectItem key={`nome:${o.key}`} value={`nome:${o.key}`}>{o.nome}</SelectItem>
                  ));
                })()}
              </SelectContent>
            </Select>
          </div>

          {/* Situação */}
          <div className="space-y-0">
            <Label className="text-[8px] uppercase tracking-wider text-slate-400 font-semibold">Situação</Label>
            <Select value={filtroStatus} onValueChange={setFiltroStatus}>
              <SelectTrigger className="h-8 text-xs w-full">
                <SelectValue placeholder="TODOS" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">TODOS</SelectItem>
                <SelectItem value="livres">Livres</SelectItem>
                <SelectItem value="pago">Pago</SelectItem>
                {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
                  <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Data */}
          <div className="space-y-0">
            <Label className="text-[8px] uppercase tracking-wider text-slate-400 font-semibold">Data</Label>
            <DataRefField
              dataRef={dataRef}
              dataFim={dataFim}
              setDataRef={setDataRef}
              setDataFim={setDataFim}
              compact
            />
          </div>

          {/* Especialidade */}
          <div className="space-y-0">
            <Label className="text-[8px] uppercase tracking-wider text-slate-400 font-semibold">Especialidade</Label>
            <Select value={filtroEspecialidade} onValueChange={setFiltroEspecialidade}>
              <SelectTrigger className="h-8 text-xs w-full">
                <SelectValue placeholder="TODOS" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">TODOS</SelectItem>
                {especialidades.map(e => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Cliente + Ações rápidas juntos */}
          <div className="space-y-0">
            <Label className="text-[8px] uppercase tracking-wider text-slate-400 font-semibold">Cliente</Label>
            <div className="flex items-center gap-1">
              <Input
                value={filtroCliente}
                onChange={(e) => setFiltroCliente(e.target.value)}
                placeholder="Nome ou CPF..."
                className="h-8 text-xs flex-1 min-w-0"
              />
              <Button size="sm" onClick={load} className="h-8 px-2.5 bg-primary hover:bg-primary/90 shrink-0">
                <Search className="h-3.5 w-3.5" />
              </Button>
              <Button variant="outline" size="sm" onClick={limparFiltros} className="h-8 w-8 p-0 shrink-0">
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
        {/* Toggle "apenas a data selecionada" — alinhado à esquerda do cabeçalho da tabela abaixo */}
        <label className="mt-2 flex items-center gap-2 text-[12px] text-slate-600 cursor-pointer select-none w-fit hover:text-slate-900 transition-colors">
          <Checkbox
            checked={apenasData}
            onCheckedChange={(v) => setApenasData(v === true)}
            className="h-4 w-4 rounded border-slate-300 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
          />
          Exibir apenas a data selecionada
        </label>
        {/* KPIs REMOVIDOS */}
        {/* ESPAÇAMENTO ENTRE FILTROS E TABELA */}
        <div className="h-4 xl:h-8"></div>
        {/* ============ LISTA MOBILE / TABLET (cards empilhados) ============ */}
        <div className="lg:hidden space-y-2">
          {loading ? (
            <div className="text-center py-8 text-muted-foreground text-sm">Carregando…</div>
          ) : !clinicaAtual ? (
            <div className="text-center py-8 text-muted-foreground text-sm">Selecione uma clínica.</div>
          ) : paginados.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">Nenhum agendamento encontrado.</div>
          ) : (
            paginados.map((a) => {
              const fichaNum = fichaPorId.get(a.id) ?? "";
              const realizado = a.status === "realizado";
              const etapaRow = etapaMap.get(a.id) ?? "aguardando_recepcao";
              const hojeIsoLocal = new Date().toISOString().slice(0, 10);
              const ehHoje = (a.inicio ?? "").slice(0, 10) === hojeIsoLocal;
              const pagoHoje = pagosSet.has(a.id) && ehHoje;
              const presente =
                !realizado && (pagoHoje || !["aguardando_recepcao", "finalizado", "cancelado"].includes(etapaRow));
              const estornoPend = estornoPendAgs.has(a.id);
              const ocultarPaciente = estornoPend && isMedicoOnly;
              const ehLivre = isSlotLivre(a.paciente_nome);
              const profLabel = medicoNomeAgendamento(a);

              let bgClass = "bg-card";
              let borderLeft = "border-l-4 border-transparent";
              if (estornoPend) { bgClass = "bg-rose-50"; borderLeft = "border-l-4 border-rose-500"; }
              else if (realizado) { bgClass = "bg-emerald-50"; borderLeft = "border-l-4 border-emerald-500"; }
              else if (presente) { bgClass = "bg-blue-50"; borderLeft = "border-l-4 border-blue-400"; }

              const etapa = etapaMap.get(a.id) ?? "aguardando_recepcao";
              const pendenteCheckin = ["aguardando_recepcao", "recepcao"].includes(etapa);
              const podeCheckin = !ehLivre && !realizado && pagosSet.has(a.id) && pendenteCheckin && podeEscrever;

              return (
                <div
                  key={a.id}
                  className={`rounded-lg border ${bgClass} ${borderLeft} p-3 shadow-sm`}
                >
                  {/* Linha 1: horário + ficha + situação */}
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-semibold text-emerald-700 whitespace-nowrap">
                        {fmtHora(a.inicio)}–{fmtHora(a.fim)}
                      </span>
                      <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                        {fmtData(a.inicio)}
                      </span>
                      {fichaNum && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-foreground/70">
                          #{fichaNum}
                        </span>
                      )}
                    </div>
                    {ehLivre ? (
                      <Badge variant="outline" className="text-[10px] text-emerald-700 border-emerald-300 shrink-0">Livre</Badge>
                    ) : estornoPend ? (
                      <Badge className="bg-rose-100 text-rose-700 border-rose-200 text-[10px] shrink-0">Estorno</Badge>
                    ) : (
                      <Badge className={`${STATUS_COR[a.status]} text-[10px] shrink-0`}>{STATUS_LABEL[a.status]}</Badge>
                    )}
                  </div>

                  {/* Linha 2: paciente */}
                  <div className="mb-1.5">
                    {ocultarPaciente ? (
                      <span className="text-xs italic text-rose-600">— aguardando estorno —</span>
                    ) : ehLivre ? (
                      <span className="text-sm text-muted-foreground italic">Horário livre</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => abrirInfoPaciente(a.paciente_id, a.paciente_nome)}
                        className="flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-primary text-left w-full min-w-0"
                      >
                        {a.status === "confirmado" && (
                          <Star className="h-3 w-3 text-amber-500 fill-amber-500 shrink-0" />
                        )}
                        {a.paciente_id && convenioMap.has(a.paciente_id) && (
                          <IdCard className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                        )}
                        <span className="truncate">{a.paciente_nome}</span>
                        {a.orcamento_numero && (
                          <span className="shrink-0 text-[9px] font-semibold bg-amber-100 text-amber-800 px-1 py-0.5 rounded border border-amber-200">
                            ORÇ
                          </span>
                        )}
                      </button>
                    )}
                  </div>

                  {/* Linha 3: profissional + serviço */}
                  <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground mb-2 min-w-0">
                    <span className="truncate" title={profLabel}>
                      👤 {profLabel}
                    </span>
                    <span className="truncate max-w-[45%] text-right" title={procedimentoEfetivo(a.medico_id, a.procedimento) || ""}>
                      {procedimentoEfetivo(a.medico_id, a.procedimento) || "—"}
                    </span>
                  </div>

                  {/* Linha 4: ações rápidas */}
                  <div className="flex items-center gap-1.5 pt-2 border-t">
                    {ehLivre ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openSlot(a)}
                        className="h-8 flex-1 text-emerald-700 border-emerald-300 hover:bg-emerald-50 text-xs"
                      >
                        <UserPlus className="h-3.5 w-3.5 mr-1.5" />
                        Agendar
                      </Button>
                    ) : (
                      <>
                        {podeCheckin && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => confirmarPresenca(a)}
                            className="h-8 flex-1 text-emerald-700 border-emerald-300 hover:bg-emerald-50 text-xs"
                            title="Check-in"
                          >
                            <BadgeCheck className="h-3.5 w-3.5 mr-1" /> Check-in
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => cobrarAgendamento(a)}
                          className={`h-8 flex-1 text-xs ${pagosSet.has(a.id)
                            ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                            : "border-rose-200 text-rose-600 hover:bg-rose-50"}`}
                          title={pagosSet.has(a.id) ? "Pago" : "Cobrar"}
                        >
                          <DollarSign className="h-3.5 w-3.5 mr-1" strokeWidth={pagosSet.has(a.id) ? 3 : 2.5} />
                          {pagosSet.has(a.id) ? "Pago" : "Cobrar"}
                        </Button>
                        {podeEscrever && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openEdit(a)}
                            className="h-8 px-2 text-xs"
                            title="Editar"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" className="h-8 px-2">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-56">
                            {podeEscrever && (
                              <DropdownMenuItem onClick={() => iniciarReagendamento(a)} disabled={a.status === "realizado"}>
                                <CalendarDays className="h-4 w-4 mr-2" /> Reagendar
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => imprimirGR(a)} disabled={!pagosSet.has(a.id)}>
                              <Printer className="h-4 w-4 mr-2" /> Imprimir GR
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => imprimirComprovante(a)}>
                              <Printer className="h-4 w-4 mr-2" /> Comprovante
                            </DropdownMenuItem>
                            {podeEscrever && !ehLivre && a.status !== "realizado" && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => remove(a)} className="text-amber-600">
                                  <UserMinus className="h-4 w-4 mr-2" /> Desmarcar paciente
                                </DropdownMenuItem>
                              </>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => abrirAuditoria(a)}>
                              <ShieldCheck className="h-4 w-4 mr-2" /> Histórico
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* ============ TABELA DESKTOP (lg+) ============ */}
        {/* Sem overflow-hidden aqui: um ancestral com overflow != visible vira
            o contexto de scroll do sticky, e como este div nunca rola
            internamente (quem rola é o <main> do app-shell), o cabeçalho
            "sticky top-0" parava de acompanhar o scroll da página. */}
        <div className="hidden lg:block rounded-lg border border-border bg-card overflow-x-auto">
          <Table className="min-w-[820px] xl:min-w-[900px]">
            <TableHeader className="sticky top-0 z-20">
              <TableRow className="bg-muted">
                <TableHead className="w-8 rounded-tl-lg" title="Selecione para ações em lote">
                  <Checkbox
                    checked={paginados.length > 0 && selecionados.size === paginados.length}
                    onCheckedChange={toggleAll}
                  />
                </TableHead>
                <TableHead className="w-14 text-center font-semibold text-xs uppercase text-muted-foreground">
                  Ficha
                </TableHead>
                <TableHead className="w-20 font-semibold text-xs uppercase text-muted-foreground">Data</TableHead>
                <TableHead className="w-28 font-semibold text-xs uppercase text-muted-foreground">Horário</TableHead>
                <TableHead className="min-w-[110px] xl:min-w-[130px] font-semibold text-xs uppercase text-muted-foreground">
                  Profissional
                </TableHead>
                <TableHead className="min-w-[130px] xl:min-w-[150px] font-semibold text-xs uppercase text-muted-foreground">
                  Cliente
                </TableHead>
                <TableHead className="min-w-[100px] xl:min-w-[110px] font-semibold text-xs uppercase text-muted-foreground">
                  Serviço
                </TableHead>
                <TableHead className="w-28 font-semibold text-xs uppercase text-muted-foreground">Situação</TableHead>
                <TableHead className="w-[100px] text-right font-semibold text-xs uppercase text-muted-foreground rounded-tr-lg">
                  Ações
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    Carregando…
                  </TableCell>
                </TableRow>
              ) : !clinicaAtual ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    Selecione uma clínica.
                  </TableCell>
                </TableRow>
              ) : paginados.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    Nenhum agendamento encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                paginados.map((a) => {
                  const fichaNum = fichaPorId.get(a.id) ?? "";
                  const realizado = a.status === "realizado";
                  const etapaRow = etapaMap.get(a.id) ?? "aguardando_recepcao";
                  const hojeIsoLocal = new Date().toISOString().slice(0, 10);
                  const ehHoje = (a.inicio ?? "").slice(0, 10) === hojeIsoLocal;
                  const pagoHoje = pagosSet.has(a.id) && ehHoje;
                  const presente =
                    !realizado && (pagoHoje || !["aguardando_recepcao", "finalizado", "cancelado"].includes(etapaRow));
                  const estornoPend = estornoPendAgs.has(a.id);
                  const ocultarPaciente = estornoPend && isMedicoOnly;
                  const ehLivre = isSlotLivre(a.paciente_nome);

                  // Cor de fundo da linha
                  let bgClass = "";
                  let borderLeft = "";
                  if (estornoPend) {
                    bgClass = "bg-rose-50 hover:bg-rose-100";
                    borderLeft = "border-l-4 border-rose-500";
                  } else if (realizado) {
                    bgClass = "bg-emerald-50 hover:bg-emerald-100";
                    borderLeft = "border-l-4 border-emerald-500";
                  } else if (presente) {
                    bgClass = "bg-blue-50 hover:bg-blue-100";
                    borderLeft = "border-l-4 border-blue-400";
                  }

                  return (
                    <TableRow key={a.id} className={`${bgClass} ${borderLeft} transition-colors`}>
                      {/* Checkbox */}
                      <TableCell className="py-1.5">
                        <Checkbox
                          checked={selecionados.has(a.id)}
                          onCheckedChange={() => toggleSel(a.id)}
                          disabled={ehLivre || realizado}
                        />
                      </TableCell>

                      {/* Ficha */}
                      <TableCell className="text-center font-mono text-sm font-medium py-1.5">
                        {fichaNum || "—"}
                      </TableCell>

                      {/* Data */}
                      <TableCell className="py-1.5 text-sm">{fmtData(a.inicio)}</TableCell>

                      {/* Horário */}
                      <TableCell className="py-1.5 text-sm font-medium text-emerald-600">
                        {fmtHora(a.inicio)} - {fmtHora(a.fim)}
                      </TableCell>

                      {/* Profissional */}
                      <TableCell className="py-1.5">
                        {(() => {
                          const label = medicoNomeAgendamento(a);
                          const m = medicos.find((x) => x.id === a.medico_id);
                          const manual = m && m.usa_sistema === false && !recursoIds.has(m.id);
                          return (
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm truncate max-w-[110px]" title={label}>
                                {label}
                              </span>
                              {manual && (
                                <span className="shrink-0 text-[9px] font-medium uppercase bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded border border-amber-200">
                                  Papel
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      </TableCell>

                      {/* Cliente */}
                      <TableCell className="py-1.5">
                        {ocultarPaciente ? (
                          <span className="text-xs italic text-rose-600">— aguardando estorno —</span>
                        ) : ehLivre ? (
                          <span className="text-sm font-medium text-primary/60">Nenhum paciente agendado</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => abrirInfoPaciente(a.paciente_id, a.paciente_nome)}
                            className="flex items-center gap-1.5 text-sm text-foreground hover:text-primary hover:underline max-w-full"
                            title={a.paciente_nome}
                          >
                            {a.status === "confirmado" && (
                              <Star className="h-3 w-3 text-amber-500 fill-amber-500 shrink-0" />
                            )}
                            {a.paciente_id && <IdadeIcon nascimento={nascMap.get(a.paciente_id) ?? null} size={25} />}
                            {a.paciente_id && convenioMap.has(a.paciente_id) && (
                              <span
                                title={`Cartão ${convenioMap.get(a.paciente_id)}`}
                                className="shrink-0 inline-flex"
                              >
                                <IdCard className="h-3.5 w-3.5 text-emerald-600" />
                              </span>
                            )}
                            <span className="truncate max-w-[300px]">{a.paciente_nome}</span>
                            {a.orcamento_numero && (
                              <span className="shrink-0 text-[9px] font-semibold bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded border border-amber-200">
                                ORÇ
                              </span>
                            )}
                          </button>
                        )}
                      </TableCell>

                      {/* Serviço */}
                      <TableCell className="py-1.5">
                        <ProcedimentoCell
                          valor={procedimentoEfetivo(a.medico_id, a.procedimento)}
                          opcoes={opcoesProcedimentoMedico(a.medico_id)}
                          padrao={
                            procedimentoPadraoDoMedico(a.medico_id) ||
                            (medicoEhLaboratorioFormulario(a.medico_id) ? "EXAMES LABORATORIAIS" : "")
                          }
                          semFallback={!!medicos.find((m) => m.id === a.medico_id)?.procedimento_padrao_em_branco}
                          disabled={ehLivre}
                          onChange={(novo) => atualizarProcedimento(a, novo)}
                        />
                      </TableCell>

                      {/* Situação */}
                      <TableCell className="py-2.5">
                        {ehLivre ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openSlot(a)}
                            className="h-7 px-3 text-emerald-600 border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 font-medium text-xs w-full"
                          >
                            <UserPlus className="h-3 w-3 mr-1.5" />
                            Agendar
                          </Button>
                        ) : estornoPend ? (
                          <Badge className="bg-rose-100 text-rose-700 border-rose-200 text-xs">
                            Estorno solicitado
                          </Badge>
                        ) : (
                          <Badge className={`${STATUS_COR[a.status]} text-xs`}>{STATUS_LABEL[a.status]}</Badge>
                        )}
                      </TableCell>

                      {/* Ações - Botões na linha + Menu */}
                      <TableCell className="py-1.5 text-right">
                        <div className="flex items-center justify-end gap-0.5">
                          {/* Check-in (✅) - aparece apenas para pacientes presentes */}
                          {!ehLivre &&
                            !realizado &&
                            (() => {
                              const etapa = etapaMap.get(a.id) ?? "aguardando_recepcao";
                              const pendenteCheckin = ["aguardando_recepcao", "recepcao"].includes(etapa);
                              if (pagosSet.has(a.id) && pendenteCheckin && podeEscrever) {
                                return (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    title="Confirmar presença (check-in)"
                                    onClick={() => confirmarPresenca(a)}
                                    className="h-7 w-7 rounded-md border border-emerald-300 text-emerald-600 hover:bg-emerald-50"
                                  >
                                    <BadgeCheck className="h-3.5 w-3.5" />
                                  </Button>
                                );
                              }
                              if (!pendenteCheckin && !ehLivre) {
                                return (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    disabled
                                    title="Check-in já realizado"
                                    className="h-7 w-7 rounded-md border border-emerald-400 bg-emerald-50 text-emerald-600 disabled:opacity-100"
                                  >
                                    <BadgeCheck className="h-3.5 w-3.5" />
                                  </Button>
                                );
                              }
                              return null;
                            })()}

                          {/* Pagar (💰) */}
                          {!ehLivre && (
                            <Button
                              variant="ghost"
                              size="icon"
                              title={(() => {
                                if (!pagosSet.has(a.id)) return "Registrar pagamento";
                                const info = pagoInfoMap.get(a.id);
                                if (!info) return "Pago";
                                const v = info.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
                                return `Pago • ${v}`;
                              })()}
                              onClick={() => cobrarAgendamento(a)}
                              className={`h-7 w-7 rounded-md border-2 ${pagosSet.has(a.id)
                                ? "border-emerald-500 bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
                                : "border-rose-200 text-rose-500 hover:border-rose-400 hover:bg-rose-50"
                                }`}
                            >
                              <DollarSign className="h-3.5 w-3.5" strokeWidth={pagosSet.has(a.id) ? 3 : 2.5} />
                            </Button>
                          )}

                          {/* NFS-e (📄) */}
                          {!ehLivre &&
                            (() => {
                              const nf = nfseMap.get(a.id);
                              const emitida = !!nf;
                              const podeEmitir = pagosSet.has(a.id);
                              if (!emitida && !podeEmitir) return null;
                              return (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  title={emitida ? `NFS-e ${nf?.numero ?? ""}` : "Emitir NFS-e"}
                                  onClick={() => verOuEmitirNota(a)}
                                  className={`h-7 w-7 rounded-md border-2 ${emitida
                                    ? "border-sky-400 bg-sky-50 text-sky-600 hover:bg-sky-100"
                                    : "border-sky-200 text-sky-400 hover:border-sky-400 hover:bg-sky-50"
                                    }`}
                                >
                                  <FileText className="h-3.5 w-3.5" strokeWidth={emitida ? 3 : 2.5} />
                                </Button>
                              );
                            })()}

                          {/* Menu (⋮) */}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 rounded-md hover:bg-slate-100 text-slate-400"
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                              {/* Editar */}
                              {podeEscrever && (
                                <DropdownMenuItem onClick={() => openEdit(a)}>
                                  <Pencil className="h-4 w-4 mr-2" /> Editar
                                </DropdownMenuItem>
                              )}

                              {/* Reagendar */}
                              {podeEscrever && (
                                <DropdownMenuItem
                                  onClick={() => iniciarReagendamento(a)}
                                  disabled={a.status === "realizado"}
                                >
                                  <CalendarDays className="h-4 w-4 mr-2" /> Reagendar
                                </DropdownMenuItem>
                              )}

                              <DropdownMenuSeparator />

                              {/* Imprimir GR */}
                              <DropdownMenuItem onClick={() => imprimirGR(a)} disabled={!pagosSet.has(a.id)}>
                                <Printer className="h-4 w-4 mr-2" /> Imprimir GR
                                {!pagosSet.has(a.id) && (
                                  <span className="ml-2 text-xs text-muted-foreground">(pagar)</span>
                                )}
                              </DropdownMenuItem>

                              {/* Comprovante */}
                              <DropdownMenuItem onClick={() => imprimirComprovante(a)}>
                                <Printer className="h-4 w-4 mr-2" /> Comprovante
                              </DropdownMenuItem>

                              {/* Desmarcar paciente */}
                              {podeEscrever && !ehLivre && a.status !== "realizado" && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={() => remove(a)} className="text-amber-600">
                                    <UserMinus className="h-4 w-4 mr-2" /> Desmarcar paciente
                                  </DropdownMenuItem>
                                </>
                              )}

                              {/* Mudar status */}
                              {podeEscrever && !ehLivre && (
                                <>
                                  <DropdownMenuSeparator />
                                  {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
                                    <DropdownMenuItem key={s} onClick={() => mudarStatus(a, s)}>
                                      <Flag className="h-4 w-4 mr-2" /> {STATUS_LABEL[s]}
                                    </DropdownMenuItem>
                                  ))}
                                </>
                              )}

                              {/* Auditoria */}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => abrirAuditoria(a)}>
                                <ShieldCheck className="h-4 w-4 mr-2" /> Histórico
                              </DropdownMenuItem>

                              {/* Reabrir (apenas realizado) */}
                              {podeEscrever && a.status === "realizado" && (
                                <DropdownMenuItem onClick={() => reabrirAtendimento(a)}>
                                  <Undo2 className="h-4 w-4 mr-2" /> Reabrir atendimento
                                </DropdownMenuItem>
                              )}

                              {/* Excluir */}
                              {podeEscrever && isManager && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() => remove(a)}
                                    className="text-destructive"
                                    disabled={pagosSet.has(a.id)}
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    {ehLivre ? "Excluir slot" : "Liberar horário"}
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
        <div className="flex justify-center">
          <Paginacao page={page} totalPages={totalPages} onChange={setPage} />
        </div>
        <div className="rounded-lg border bg-muted/30 p-4">
          <h3 className="text-center font-semibold mb-3">Legenda</h3>
          <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { cor: "#cfe3fb", borda: "#9fc3f3", label: "Confirmado pelo cliente" },
              { cor: "#a8c8ed", borda: "#7aa9d8", label: "Presente na clínica" },
              { cor: "#7fbfc2", borda: "#5a9ea1", label: "Em atendimento" },
              { cor: "#d1f0d6", borda: "#8fd49a", label: "Atendido com sucesso" },
              { cor: "#fde2c4", borda: "#f5c890", label: "Agenda de telemedicina" },
              { cor: "#f8d2d6", borda: "#eea1a8", label: "Cancelado pelo cliente" },
              { cor: "#fef3b6", borda: "#f0dc7a", label: "Atrasado para consulta" },
              { cor: "#e0cdf0", borda: "#bea4d8", label: "Agendamento on-line" },
              { cor: "#f7b6c0", borda: "#e88594", label: "Não comparecimento" },
              { cor: "#fee2e2", borda: "#dc2626", label: "Estorno solicitado" },
            ].map((s) => (
              <div key={s.label} className="flex items-center gap-2 text-sm">
                <span
                  className="inline-block h-6 w-10 rounded border"
                  style={{ background: s.cor, borderColor: s.borda }}
                />
                <span>{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {viewMode === "medico" && (
        <AgendaPorMedicoGrid
          medicoId={filtroMedico === "todos" ? "" : filtroMedico}
          dias={(() => {
            if (!dataFim) return 1;
            const a = new Date(`${dataRef}T12:00:00`).getTime();
            const b = new Date(`${dataFim}T12:00:00`).getTime();
            return Math.min(31, Math.max(1, Math.round((b - a) / 86400000) + 1));
          })()}
          dataRef={dataRef}
          items={items.filter((a) => filtroMedico === "todos" || a.medico_id === filtroMedico)}
          onSlotClick={(a) => openSlot(a)}
          onAgClick={(a) => openEdit(a)}
          fmtHora={fmtHora}
          estornoPendAgs={estornoPendAgs}
          ocultarPacienteMedico={isMedicoOnly}
          ehLaboratorio={medicoEhLaboratorioFormulario}
        />
      )}

      <Dialog open={pacInfoOpen} onOpenChange={setPacInfoOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Informações do cliente</DialogTitle>
          </DialogHeader>
          {pacInfoLoading ? (
            <p className="text-sm text-muted-foreground py-4">Carregando…</p>
          ) : pacInfo ? (
            <div className="rounded-lg border p-4 space-y-2 text-sm">
              <div className="flex items-center gap-3">
                {pacInfo.foto_url ? (
                  <img
                    src={pacInfo.foto_url}
                    alt={pacInfo.nome}
                    className="h-14 w-14 rounded-full object-cover border"
                  />
                ) : null}
                <div>
                  <div className="font-semibold uppercase">{pacInfo.nome}</div>
                  {pacInfo.numero_pasta && (
                    <div className="text-xs text-muted-foreground">Serviço nº {pacInfo.numero_pasta}</div>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-2 border-t">
                <div>
                  <span className="text-muted-foreground">CPF: </span>
                  {pacInfo.cpf || "—"}
                </div>
                <div>
                  <span className="text-muted-foreground">Nasc.: </span>
                  {pacInfo.data_nascimento
                    ? new Date(pacInfo.data_nascimento + "T00:00:00").toLocaleDateString("pt-BR")
                    : "—"}
                </div>
                <div>
                  <span className="text-muted-foreground">Telefone: </span>
                  {pacInfo.telefone || "—"}
                </div>
                <div className="truncate">
                  <span className="text-muted-foreground">Email: </span>
                  {pacInfo.email || "—"}
                </div>
                <div className="col-span-2">
                  <span className="text-muted-foreground">Endereço: </span>
                  {[pacInfo.logradouro, pacInfo.numero, pacInfo.bairro, pacInfo.cidade, pacInfo.estado]
                    .filter(Boolean)
                    .join(", ") || "—"}
                </div>
              </div>
              {pacInfo.id && (
                <div className="pt-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      window.location.href = `/app/clientes/${pacInfo.id}/editar`;
                    }}
                  >
                    Editar
                  </Button>
                </div>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
      {dividirCtx && (
        <DividirOrcamentoDialog
          open={dividirOpen}
          onOpenChange={(v) => {
            setDividirOpen(v);
            if (!v) setDividirCtx(null);
          }}
          clinicaId={clinicaAtual?.clinica_id ?? ""}
          orcamento={dividirCtx.orcamento}
          itens={dividirCtx.itens}
          inicioPadrao={dividirCtx.inicioPadrao}
          medicos={[...medicos.map((m) => ({ id: m.id, nome: m.nome, isRecurso: recursoIds.has(m.id) }))]}
          onCreated={() => {
            void load();
          }}
        />
      )}
    </div>
  );
}

function Paginacao({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (p: number) => void;
}) {
  const nums = useMemo(() => {
    const arr: number[] = [];
    const start = Math.max(1, page - 2);
    const end = Math.min(totalPages, start + 4);
    for (let i = start; i <= end; i++) arr.push(i);
    return arr;
  }, [page, totalPages]);
  return (
    <div className="flex items-center gap-1">
      <Button variant="outline" size="sm" disabled={page === 1} onClick={() => onChange(1)}>
        «
      </Button>
      <Button variant="outline" size="sm" disabled={page === 1} onClick={() => onChange(page - 1)}>
        ‹
      </Button>
      {nums.map((n) => (
        <Button key={n} variant={n === page ? "default" : "outline"} size="sm" onClick={() => onChange(n)}>
          {n}
        </Button>
      ))}
      <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => onChange(page + 1)}>
        ›
      </Button>
      <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => onChange(totalPages)}>
        »
      </Button>
    </div>
  );
}

function MedicoFiltroInput({
  medicos,
  value,
  onChange,
  disabled,
  onlyMedicoId,
  compact,
}: {
  medicos: Medico[];
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  onlyMedicoId?: string | null;
  compact?: boolean;
}) {
  const lista = useMemo(() => {
    const arr = medicos.filter((m) => !onlyMedicoId || m.id === onlyMedicoId);
    // Recursos de enfermagem (prefixados com "🩺 ") aparecem primeiro
    const isRec = (n: string) => n.startsWith("🩺");
    return [...arr].sort((a, b) => {
      const ra = isRec(a.nome) ? 0 : 1;
      const rb = isRec(b.nome) ? 0 : 1;
      if (ra !== rb) return ra - rb;
      return a.nome.localeCompare(b.nome, "pt-BR");
    });
  }, [medicos, onlyMedicoId]);
  const selecionadoNome = useMemo(
    () => (value === "todos" ? "" : (medicos.find((m) => m.id === value)?.nome ?? "")),
    [medicos, value],
  );
  const [texto, setTexto] = useState(selecionadoNome);
  const [aberto, setAberto] = useState(false);
  const [highlight, setHighlight] = useState(0);
  useEffect(() => {
    setTexto(selecionadoNome);
  }, [selecionadoNome]);

  const norm = (s: string) => normalizar(s);
  const sugestoes = useMemo(() => {
    const t = norm(texto).trim();
    if (!t) return lista.slice(0, 100);
    return lista.filter((m) => norm(m.nome).includes(t)).slice(0, 100);
  }, [lista, texto]);
  useEffect(() => {
    setHighlight(0);
  }, [texto, aberto]);

  const selecionar = (m: Medico) => {
    onChange(m.id);
    setTexto(m.nome);
    setAberto(false);
  };

  return (
    <div className="relative">
      <div className="flex gap-1">
        <Input
          className={compact ? "h-8 text-xs" : undefined}
          data-agenda-filtro-prof
          disabled={disabled}
          placeholder="TODOS — digite para buscar"
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            setAberto(true);
          }}
          onFocus={() => setAberto(true)}
          onBlur={() => setTimeout(() => setAberto(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setAberto(true);
              setHighlight((h) => Math.min(h + 1, sugestoes.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlight((h) => Math.max(h - 1, 0));
            } else if (e.key === "Enter") {
              if (aberto && sugestoes[highlight]) {
                e.preventDefault();
                selecionar(sugestoes[highlight]);
              }
            } else if (e.key === "Escape") {
              setAberto(false);
            }
          }}
        />
        {value !== "todos" && !disabled && (
          <Button
            type="button"
            variant="outline"
            size="icon"
            title="Limpar"
            onClick={() => {
              onChange("todos");
              setTexto("");
            }}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
      {aberto && !disabled && sugestoes.length > 0 && (
        <div className="absolute z-50 mt-1 w-full max-h-64 overflow-auto rounded-md border bg-popover shadow-md">
          {sugestoes.map((m, idx) => (
            <button
              key={m.id}
              type="button"
              className={`block w-full text-left px-2 py-1.5 text-sm hover:bg-accent ${idx === highlight ? "bg-accent" : ""}`}
              onMouseEnter={() => setHighlight(idx)}
              onMouseDown={(e) => {
                e.preventDefault();
                selecionar(m);
              }}
            >
              {m.nome}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function AgendaPorMedicoGrid({
  medicoId,
  dias,
  dataRef,
  items,
  onSlotClick,
  onAgClick,
  fmtHora,
  estornoPendAgs,
  ocultarPacienteMedico,
  ehLaboratorio,
}: {
  medicoId: string;
  dias: number;
  dataRef: string;
  items: Agendamento[];
  onSlotClick: (a: Agendamento) => void;
  onAgClick: (a: Agendamento) => void;
  fmtHora: (iso: string) => string;
  estornoPendAgs: Set<string>;
  ocultarPacienteMedico: boolean;
  ehLaboratorio?: (medicoId: string | null | undefined) => boolean;
}) {
  const diasSemana = ["DOMINGO", "SEGUNDA", "TERÇA", "QUARTA", "QUINTA", "SEXTA", "SÁBADO"];

  // Lista de dias no intervalo (yyyy-mm-dd)
  const intervaloDias = useMemo(() => {
    const arr: string[] = [];
    const base = new Date(`${dataRef}T12:00:00`);
    for (let i = 0; i < dias; i++) {
      const d = new Date(base);
      d.setDate(d.getDate() + i);
      arr.push(d.toISOString().slice(0, 10));
    }
    return arr;
  }, [dataRef, dias]);

  // Agrupa agendamentos por dia + horário de início
  const porDia = useMemo(() => {
    const map = new Map<string, Agendamento[]>();
    for (const a of items) {
      const dia = a.inicio.slice(0, 10);
      if (!intervaloDias.includes(dia)) continue;
      if (!map.has(dia)) map.set(dia, []);
      map.get(dia)!.push(a);
    }
    for (const arr of map.values()) arr.sort((x, y) => x.inicio.localeCompare(y.inicio));
    return map;
  }, [items, intervaloDias]);

  // Slots de hora de início: união dos horários existentes em todos os dias
  // do intervalo, ou grade padrão de 30min entre 07:00 e 19:00 se vazio.
  const horasInicio = useMemo(() => {
    const set = new Set<string>();
    for (const arr of porDia.values()) {
      for (const a of arr) {
        const d = new Date(a.inicio);
        set.add(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`);
      }
    }
    if (set.size === 0) {
      for (let h = 7; h < 19; h++) {
        set.add(`${String(h).padStart(2, "0")}:00`);
        set.add(`${String(h).padStart(2, "0")}:30`);
      }
    }
    return Array.from(set).sort();
  }, [porDia]);

  const corStatus = (s: Status) => STATUS_COR[s];

  const fmtCabecalho = (yyyymmdd: string) => {
    const d = new Date(`${yyyymmdd}T12:00:00`);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${dd}/${mm} — ${diasSemana[d.getDay()]}`;
  };

  // Precisa de altura limitada + overflow-auto nos dois eixos abaixo: o
  // scroll horizontal (muitas colunas de dia) já obrigava overflow != visible
  // aqui, o que vira o contexto do sticky — sem uma altura própria, esse div
  // nunca rolava verticalmente por conta própria (quem rolava era o <main>
  // por fora) e o cabeçalho "sticky top-0" não tinha efeito nenhum.
  return (
    <div className="space-y-3">
      {!medicoId ? (
        <div className="rounded-2xl border bg-card p-10 text-center text-sm text-muted-foreground">
          Selecione um profissional no filtro acima para visualizar a agenda por médico.
        </div>
      ) : (
        <div className="rounded-2xl border bg-card overflow-auto max-h-[70vh]">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-muted/40">
                <th
                  className="sticky left-0 top-0 z-20 bg-muted/60 px-3 py-2 text-xs font-semibold text-muted-foreground border-r"
                  style={{ minWidth: 88 }}
                >
                  Hora
                  <br />
                  Início
                </th>
                {intervaloDias.map((dia) => (
                  <FragmentDayHeader key={dia} dia={dia} fmtCabecalho={fmtCabecalho} />
                ))}
              </tr>
            </thead>
            <tbody>
              {horasInicio.map((hi) => (
                <tr key={hi} className="border-t">
                  <td className="sticky left-0 z-10 bg-muted/30 px-3 py-1.5 text-xs font-mono text-muted-foreground border-r">
                    {hi}
                  </td>
                  {intervaloDias.map((dia) => {
                    const ag = (porDia.get(dia) ?? []).find((a) => {
                      const d = new Date(a.inicio);
                      const k = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
                      return k === hi;
                    });
                    return (
                      <FragmentDayCell
                        key={dia + hi}
                        ag={ag}
                        dia={dia}
                        hi={hi}
                        onSlotClick={onSlotClick}
                        onAgClick={onAgClick}
                        fmtHora={fmtHora}
                        corStatus={corStatus}
                        estornoPend={!!(ag && estornoPendAgs.has(ag.id))}
                        ocultarPaciente={!!(ag && estornoPendAgs.has(ag.id) && ocultarPacienteMedico)}
                        procedimentoFallback={
                          ag?.procedimento ?? (ehLaboratorio?.(ag?.medico_id) ? "EXAMES LABORATORIAIS" : "CONSULTA")
                        }
                      />
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FragmentDayHeader({ dia, fmtCabecalho }: { dia: string; fmtCabecalho: (d: string) => string }) {
  return (
    <>
      <th
        className="sticky top-0 z-10 px-2 py-2 text-xs font-semibold text-muted-foreground border-r bg-muted/40"
        style={{ minWidth: 70 }}
      >
        Hora
        <br />
        Fim
      </th>
      <th
        className="sticky top-0 z-10 px-3 py-2 text-xs font-semibold text-foreground border-r bg-muted/40 text-left"
        style={{ minWidth: 180 }}
      >
        {fmtCabecalho(dia)}
      </th>
    </>
  );
}

function FragmentDayCell({
  ag,
  dia,
  hi,
  onSlotClick,
  onAgClick,
  fmtHora,
  corStatus,
  estornoPend,
  ocultarPaciente,
  procedimentoFallback,
}: {
  ag: Agendamento | undefined;
  dia: string;
  hi: string;
  onSlotClick: (a: Agendamento) => void;
  onAgClick: (a: Agendamento) => void;
  fmtHora: (iso: string) => string;
  corStatus: (s: Status) => string;
  estornoPend: boolean;
  ocultarPaciente: boolean;
  procedimentoFallback?: string;
}) {
  const ehLivre = ag && isSlotLivre(ag.paciente_nome);
  return (
    <>
      <td
        className="px-2 py-1 text-xs font-mono text-muted-foreground border-r align-middle text-center"
        style={{ minWidth: 70 }}
      >
        {ag ? fmtHora(ag.fim) : ""}
      </td>
      <td className="px-1 py-1 border-r align-middle" style={{ minWidth: 180 }}>
        {!ag ? (
          <button
            type="button"
            className="w-full h-8 rounded-md text-xs text-muted-foreground/60 hover:bg-emerald-50 hover:text-emerald-700 transition-colors"
            title={`Criar agendamento ${dia} ${hi}`}
          >
            +
          </button>
        ) : (
          <button
            type="button"
            onClick={() => (ehLivre ? onSlotClick(ag) : ocultarPaciente ? undefined : onAgClick(ag))}
            disabled={ocultarPaciente}
            className={`w-full text-left rounded-md px-2 py-1.5 text-xs leading-tight truncate hover:brightness-95 transition ${estornoPend ? "bg-rose-100 text-rose-800 border border-rose-300" : corStatus(ag.status)
              } ${ocultarPaciente ? "cursor-not-allowed opacity-90" : ""}`}
            title={
              estornoPend
                ? "Estorno solicitado — aguardando decisão do financeiro"
                : `${ag.paciente_nome} — ${procedimentoFallback ?? ag.procedimento ?? "CONSULTA"}`
            }
          >
            {ehLivre ? "+ Agendar" : ocultarPaciente ? "— aguardando estorno —" : ag.paciente_nome}
          </button>
        )}
      </td>
    </>
  );
}

function DataRefField({
  dataRef,
  dataFim,
  setDataRef,
  setDataFim,
  compact,
}: {
  dataRef: string;
  dataFim: string | null;
  setDataRef: (v: string) => void;
  setDataFim: (v: string | null) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"single" | "range">(dataFim ? "range" : "single");

  const toIso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const proxDiaUtil = () => {
    const d = new Date();
    while (d.getDay() === 0) d.setDate(d.getDate() + 1);
    return d;
  };

  // 🔥 AGORA SEMPRE MOSTRA O ANO
  const fmt = (s: string) => {
    const d = new Date(`${s}T12:00:00`);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  };

  const label = dataFim ? `${fmt(dataRef)} → ${fmt(dataFim)}` : fmt(dataRef);

  return (
    <div className="flex gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "font-normal transition-all",
              compact
                ? "h-7 text-[13px] px-2 min-w-[130px] w-full justify-center border border-slate-300/60 hover:border-slate-400 hover:bg-slate-50/50"
                : "h-8 text-xs flex-1 justify-start border-slate-200 hover:border-slate-300 hover:bg-slate-50/50"
            )}
          >
            <CalendarDays className={cn("h-3.5 w-3.5", compact ? "mr-1" : "mr-1.5")} />
            {label}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <div className="flex items-center gap-1 p-2 border-b">
            <Button
              size="sm"
              variant={mode === "single" ? "default" : "outline"}
              onClick={() => setMode("single")}
              className={compact ? "h-7 text-xs" : ""}
            >
              Dia
            </Button>
            <Button
              size="sm"
              variant={mode === "range" ? "default" : "outline"}
              onClick={() => setMode("range")}
              className={compact ? "h-7 text-xs" : ""}
            >
              Período
            </Button>
            <span className="flex-1" />
            <Button
              size="sm"
              variant="ghost"
              className={compact ? "h-7 text-xs" : ""}
              onClick={() => {
                setDataRef(toIso(proxDiaUtil()));
                setDataFim(null);
                setMode("single");
                setOpen(false);
              }}
            >
              Hoje
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className={compact ? "h-7 text-xs" : ""}
              onClick={() => {
                setDataRef(toIso(proxDiaUtil()));
                setDataFim(null);
                setMode("single");
              }}
            >
              Limpar
            </Button>
          </div>
          {mode === "single" ? (
            <Calendar
              mode="single"
              selected={new Date(`${dataRef}T12:00:00`)}
              onSelect={(d) => {
                if (!d) return;
                setDataRef(toIso(d));
                setDataFim(null);
                setOpen(false);
              }}
              className={cn("pointer-events-auto", compact ? "p-2" : "p-3")}
            />
          ) : (
            <Calendar
              mode="range"
              selected={{
                from: new Date(`${dataRef}T12:00:00`),
                to: dataFim ? new Date(`${dataFim}T12:00:00`) : undefined,
              }}
              onSelect={(r) => {
                if (!r?.from) return;
                setDataRef(toIso(r.from));
                setDataFim(r.to ? toIso(r.to) : null);
              }}
              numberOfMonths={compact ? 1 : 2}
              className={cn("pointer-events-auto", compact ? "p-2" : "p-3")}
            />
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}