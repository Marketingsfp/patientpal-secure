import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Trash2, Plus, CalendarRange, Pencil, ArrowLeft, Ban, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { usePodeEscrever } from "@/hooks/use-permissoes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";

import { DateInputBR } from "@/components/ui/date-input-br";
export const Route = createFileRoute("/_authenticated/app/disponibilidades")({
  component: Page,
  head: () => ({ meta: [{ title: "Horários médicos — ClinicaOS" }] }),
});

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

// Feriados nacionais fixos (MM-DD). Domingos são bloqueados separadamente.
const FERIADOS_FIXOS = new Set<string>([
  "01-01", // Confraternização Universal
  "04-21", // Tiradentes
  "05-01", // Dia do Trabalho
  "09-07", // Independência
  "10-12", // Nossa Senhora Aparecida
  "11-02", // Finados
  "11-15", // Proclamação da República
  "11-20", // Consciência Negra
  "12-25", // Natal
]);

function isFeriadoOuDomingo(d: Date): boolean {
  if (d.getDay() === 0) return true;
  const mmdd = `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return FERIADOS_FIXOS.has(mmdd);
}

// Formatadores em horário local de Brasília — usados para calcular o "piso"
// (último horário já criado numa data) em coerência com o que o usuário vê
// na Agenda. Evita bug de fuso horário ao usar `.toISOString().slice(0,10)`
// em datas próximas da meia-noite.
const TZ_LOCAL = "America/Sao_Paulo";
const fmtDateLocal = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ_LOCAL, year: "numeric", month: "2-digit", day: "2-digit",
});
const fmtTimeLocal = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ_LOCAL, hour: "2-digit", minute: "2-digit", hour12: false,
});
const toLocalDate = (v: Date | string) => fmtDateLocal.format(new Date(v));
const toLocalTime = (v: Date | string) => fmtTimeLocal.format(new Date(v));

interface Disp { id: string; medico_id: string; dia_semana: number; hora_inicio: string; hora_fim: string; observacoes: string | null; limite_pacientes: number | null; intervalo_min: number | null }
type DispExt = Disp & { vigencia_inicio: string | null; vigencia_fim: string | null };
interface Medico { id: string; nome: string; duracao_consulta_min: number | null; procedimento_padrao_id: string | null; procedimento_padrao_nome: string | null; especialidade_nome: string | null; cidade: string | null; estado: string | null; bairro: string | null }
interface Agenda { id: string; medico_id: string; nome: string; ativo: boolean; ordem: number }
interface DispRow extends DispExt { agenda_id: string }

function Page() {
  const { clinicaAtual } = useClinica();
  const podeEscrever = usePodeEscrever("disponibilidades");
  const [medicos, setMedicos] = useState<Medico[]>([]);
  const [disps, setDisps] = useState<DispRow[]>([]);
  const [agendas, setAgendas] = useState<Agenda[]>([]);
  const [agendaSel, setAgendaSel] = useState<string>("");
  const [filtro, setFiltro] = useState("");
  const [filtroCidade, setFiltroCidade] = useState<string>("all");
  const [novo, setNovo] = useState({ medico_id: "", dia_semana: "1", hora_inicio: "08:00", hora_fim: "12:00", limite_pacientes: "", intervalo_min: "", vigencia_inicio: "", vigencia_fim: "" });
  const [diasSel, setDiasSel] = useState<number[]>([1]);
  const hojeIso = new Date().toISOString().slice(0, 10);
  const em30Iso = (() => { const d = new Date(); d.setDate(d.getDate() + 29); return d.toISOString().slice(0, 10); })();
  const [gerar, setGerar] = useState({ medico_id: "all", dias: "30", data_inicio: hojeIso, data_fim: em30Iso, limite_fichas: "", hora_inicio: "", hora_fim: "", intervalo_min: "" });
  const [gerarDias, setGerarDias] = useState<number[]>([1, 2, 3, 4, 5, 6]);
  const [gerando, setGerando] = useState(false);
  // Piso por (medico|agenda|data-local) → maior `fim` (HH:MM local) já
  // existente naquela data. Usado para acrescentar novos slots ABAIXO dos
  // já criados, preservando a numeração de fichas.
  const [pisos, setPisos] = useState<Map<string, string>>(new Map());
  const [pisoTick, setPisoTick] = useState(0);
  const [medicoEditando, setMedicoEditando] = useState<string | null>(null);
  const [dispEditando, setDispEditando] = useState<string | null>(null);
  const [editRow, setEditRow] = useState<{ dia_semana: string; hora_inicio: string; hora_fim: string; limite_pacientes: string; intervalo_min: string; vigencia_inicio: string; vigencia_fim: string } | null>(null);

  // MED-07: bloqueio pontual — antes a única forma de tirar um médico de
  // parte da agenda (ex.: reunião, imprevisto num dia específico) era
  // editar a disponibilidade RECORRENTE (afeta a semana inteira) ou apagar
  // os horários já gerados na mão, direto no calendário, sem nenhum
  // registro de "isso foi bloqueado de propósito" — fácil esquecer de
  // desfazer depois.
  const [bloqueioMedico, setBloqueioMedico] = useState<Medico | null>(null);
  const [bloqueioForm, setBloqueioForm] = useState({ data_inicio: hojeIso, data_fim: hojeIso, hora_inicio: "", hora_fim: "", motivo: "" });
  const [bloqueando, setBloqueando] = useState(false);
  const [bloqueiosAtivos, setBloqueiosAtivos] = useState<Array<{ id: string; inicio: string; fim: string; observacoes: string | null }>>([]);
  const [carregandoBloqueios, setCarregandoBloqueios] = useState(false);
  const [desfazendoId, setDesfazendoId] = useState<string | null>(null);

  const load = async () => {
    if (!clinicaAtual) return;
    try {
      const [m, d, a] = await Promise.all([
        supabase.from("medicos").select("id, nome, duracao_consulta_min, procedimento_padrao_id, cidade, estado, bairro, procedimento:procedimentos!medicos_procedimento_padrao_id_fkey(nome), especialidade:especialidades!medicos_especialidade_id_fkey(nome)" as never).eq("clinica_id", clinicaAtual.clinica_id).eq("ativo", true).order("nome"),
        supabase.from("medico_disponibilidades").select("id, medico_id, agenda_id, dia_semana, hora_inicio, hora_fim, observacoes, limite_pacientes, intervalo_min, vigencia_inicio, vigencia_fim" as never).eq("clinica_id", clinicaAtual.clinica_id).eq("ativo", true).order("dia_semana").order("hora_inicio"),
        supabase.from("medico_agendas" as never).select("id, medico_id, nome, ativo, ordem").eq("clinica_id", clinicaAtual.clinica_id).order("ordem").order("nome"),
      ]);

      if (m.error) {
        console.error("Erro ao carregar médicos:", m.error);
        toast.error("Erro ao carregar médicos");
        return;
      }

      if (d.error) {
        console.error("Erro ao carregar disponibilidades:", d.error);
      }

      if (a.error) {
        console.error("Erro ao carregar agendas:", a.error);
      }

      type RawMedico = { id: string; nome: string; duracao_consulta_min: number | null; procedimento_padrao_id: string | null; cidade: string | null; estado: string | null; bairro: string | null; procedimento?: { nome: string | null } | null; especialidade?: { nome: string | null } | null };
      const rawList = ((m.data as unknown) as RawMedico[]) ?? [];
      
      console.log(`✅ Médicos carregados: ${rawList.length}`);
      console.log("📋 Nomes:", rawList.map(r => r.nome).join(", "));
      
      setMedicos(rawList.map((r) => ({
        id: r.id,
        nome: r.nome,
        duracao_consulta_min: r.duracao_consulta_min,
        procedimento_padrao_id: r.procedimento_padrao_id,
        procedimento_padrao_nome: r.procedimento?.nome ?? null,
        especialidade_nome: r.especialidade?.nome ?? null,
        cidade: r.cidade,
        estado: r.estado,
        bairro: r.bairro,
      })));
      setDisps(((d.data as unknown) as DispRow[]) ?? []);
      setAgendas(((a.data as unknown) as Agenda[]) ?? []);
    } catch (error) {
      console.error("Erro no load:", error);
      toast.error("Erro ao carregar dados");
    }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [clinicaAtual?.clinica_id]);

  // Piso por (medico|agenda|dataLocal): consulta os agendamentos já criados
  // no intervalo do formulário para os médicos-alvo e guarda o maior `fim`
  // (HH:MM local) de cada dia. A geração de novos slots vai começar depois
  // desse piso, garantindo que fichas novas fiquem ABAIXO das existentes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!clinicaAtual || !gerar.data_inicio || !gerar.data_fim) {
        setPisos(new Map()); return;
      }
      const alvoIds = gerar.medico_id === "all"
        ? medicos.map((m) => m.id)
        : (gerar.medico_id ? [gerar.medico_id] : []);
      if (alvoIds.length === 0) { setPisos(new Map()); return; }
      const iniIso = new Date(`${gerar.data_inicio}T00:00:00`).toISOString();
      const fimIso = new Date(`${gerar.data_fim}T23:59:59`).toISOString();
      const { data, error } = await supabase
        .from("agendamentos")
        .select("medico_id, agenda_id, inicio, fim")
        .eq("clinica_id", clinicaAtual.clinica_id)
        .in("medico_id", alvoIds)
        .gte("inicio", iniIso)
        .lte("inicio", fimIso)
        .limit(20000);
      if (error || cancelled) return;
      const map = new Map<string, string>();
      for (const r of (data ?? []) as Array<{ medico_id: string; agenda_id: string | null; inicio: string; fim: string }>) {
        const dLocal = toLocalDate(r.inicio);
        const tFim = toLocalTime(r.fim);
        const key = `${r.medico_id}|${r.agenda_id ?? ""}|${dLocal}`;
        const prev = map.get(key);
        if (!prev || tFim > prev) map.set(key, tFim);
      }
      if (!cancelled) setPisos(map);
    })();
    return () => { cancelled = true; };
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [clinicaAtual?.clinica_id, gerar.data_inicio, gerar.data_fim, gerar.medico_id, medicos, pisoTick]);

  // Recarrega ao voltar para a aba/janela e quando o foco retorna,
  // garantindo que médicos recém cadastrados em outra tela apareçam aqui.
  useEffect(() => {
    const onFocus = () => { void load(); };
    const onVisibility = () => { if (document.visibilityState === "visible") void load(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [clinicaAtual?.clinica_id]);

  // Realtime: atualiza a lista quando um médico é inserido/alterado/removido.
  useEffect(() => {
    if (!clinicaAtual) return;
    const ch = supabase
      .channel(`disp-medicos-${clinicaAtual.clinica_id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "medicos", filter: `clinica_id=eq.${clinicaAtual.clinica_id}` },
        () => { void load(); },
      )
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [clinicaAtual?.clinica_id]);

  // MED-08: nada impedia cadastrar regras de horário semanal que se
  // contradizem (ex.: Seg 08:00–12:00 e Seg 10:00–14:00 pro mesmo médico,
  // ou hora fim antes da hora início) — a agenda gerada a partir daí saía
  // com horários duplicados/sobrepostos, sem nenhum aviso na hora do
  // cadastro.
  const vigenciasSeSobrepoem = (aIni: string | null, aFim: string | null, bIni: string | null, bFim: string | null) => {
    const aI = aIni ?? "0000-01-01", aF = aFim ?? "9999-12-31";
    const bI = bIni ?? "0000-01-01", bF = bFim ?? "9999-12-31";
    return aI <= bF && bI <= aF;
  };
  const horariosSeSobrepoem = (aIni: string, aFim: string, bIni: string, bFim: string) => aIni < bFim && bIni < aFim;
  const encontrarConflito = (
    candidato: { medico_id: string; dia_semana: number; hora_inicio: string; hora_fim: string; vigencia_inicio: string | null; vigencia_fim: string | null },
    ignorarId?: string,
  ): DispRow | null =>
    disps.find((d) =>
      d.id !== ignorarId
      && d.medico_id === candidato.medico_id
      && d.dia_semana === candidato.dia_semana
      && horariosSeSobrepoem(d.hora_inicio, d.hora_fim, candidato.hora_inicio, candidato.hora_fim)
      && vigenciasSeSobrepoem(d.vigencia_inicio, d.vigencia_fim, candidato.vigencia_inicio, candidato.vigencia_fim),
    ) ?? null;

  const adicionar = async () => {
    if (!podeEscrever) { toast.error("Você não tem permissão de edição neste módulo."); return; }
    if (!clinicaAtual || !novo.medico_id) { toast.error("Selecione um médico"); return; }
    if (!agendaSel) { toast.error("Selecione uma agenda"); return; }
    if (diasSel.length === 0) { toast.error("Selecione ao menos um dia"); return; }
    if (novo.hora_fim <= novo.hora_inicio) {
      toast.error("A hora de término precisa ser depois da hora de início.");
      return;
    }
    if (novo.vigencia_inicio && novo.vigencia_fim && novo.vigencia_fim < novo.vigencia_inicio) {
      toast.error("A vigência final não pode ser antes da vigência inicial.");
      return;
    }
    for (const dia of diasSel) {
      const conflito = encontrarConflito({
        medico_id: novo.medico_id,
        dia_semana: dia,
        hora_inicio: novo.hora_inicio,
        hora_fim: novo.hora_fim,
        vigencia_inicio: novo.vigencia_inicio || null,
        vigencia_fim: novo.vigencia_fim || null,
      });
      if (conflito) {
        toast.error(
          `Já existe uma regra para ${DIAS[dia]} (${conflito.hora_inicio}–${conflito.hora_fim}) que se sobrepõe a esse horário. Ajuste o horário ou remova a regra antiga primeiro.`,
        );
        return;
      }
    }
    const payload = diasSel.map((dia) => ({
      clinica_id: clinicaAtual.clinica_id,
      medico_id: novo.medico_id,
      agenda_id: agendaSel,
      dia_semana: dia,
      hora_inicio: novo.hora_inicio,
      hora_fim: novo.hora_fim,
      limite_pacientes: novo.limite_pacientes ? parseInt(novo.limite_pacientes) : null,
      intervalo_min: novo.intervalo_min ? parseInt(novo.intervalo_min) : null,
      vigencia_inicio: novo.vigencia_inicio || null,
      vigencia_fim: novo.vigencia_fim || null,
    }));
    const { error } = await supabase.from("medico_disponibilidades").insert(payload as never);
    if (error) { mostrarErro(error); return; }
    toast.success(diasSel.length > 1 ? `${diasSel.length} horários adicionados` : "Horário adicionado");
    void load();
  };

  const salvarEdicao = async () => {
    if (!podeEscrever) { toast.error("Você não tem permissão de edição neste módulo."); return; }
    if (!dispEditando || !editRow) return;
    if (editRow.hora_fim <= editRow.hora_inicio) {
      toast.error("A hora de término precisa ser depois da hora de início.");
      return;
    }
    if (editRow.vigencia_inicio && editRow.vigencia_fim && editRow.vigencia_fim < editRow.vigencia_inicio) {
      toast.error("A vigência final não pode ser antes da vigência inicial.");
      return;
    }
    const diaNum = parseInt(editRow.dia_semana);
    const atual = disps.find((d) => d.id === dispEditando);
    if (atual) {
      const conflito = encontrarConflito({
        medico_id: atual.medico_id,
        dia_semana: diaNum,
        hora_inicio: editRow.hora_inicio,
        hora_fim: editRow.hora_fim,
        vigencia_inicio: editRow.vigencia_inicio || null,
        vigencia_fim: editRow.vigencia_fim || null,
      }, dispEditando);
      if (conflito) {
        toast.error(
          `Já existe uma regra para ${DIAS[diaNum]} (${conflito.hora_inicio}–${conflito.hora_fim}) que se sobrepõe a esse horário.`,
        );
        return;
      }
    }
    const payload = {
      dia_semana: diaNum,
      hora_inicio: editRow.hora_inicio,
      hora_fim: editRow.hora_fim,
      limite_pacientes: editRow.limite_pacientes ? parseInt(editRow.limite_pacientes) : null,
      intervalo_min: editRow.intervalo_min ? parseInt(editRow.intervalo_min) : null,
      vigencia_inicio: editRow.vigencia_inicio || null,
      vigencia_fim: editRow.vigencia_fim || null,
    };
    const { error } = await supabase.from("medico_disponibilidades").update(payload as never).eq("id", dispEditando);
    if (error) { mostrarErro(error); return; }
    toast.success("Horário atualizado");
    setDispEditando(null);
    setEditRow(null);
    void load();
  };

  const remover = async (id: string) => {
    if (!podeEscrever) { toast.error("Você não tem permissão de edição neste módulo."); return; }
    const { error } = await supabase.from("medico_disponibilidades").delete().eq("id", id);
    if (error) { mostrarErro(error); return; }
    setDisps((xs) => xs.filter((x) => x.id !== id));
  };

  // Pré-visualização dos slots gerados
  const slotsPreview = useMemo(() => {
    type Slot = { data: string; medico_id: string; agenda_id: string; inicio: string; fim: string };
    if (!gerar.data_inicio || !gerar.data_fim) return [] as Slot[];
    const ini = new Date(`${gerar.data_inicio}T00:00:00`);
    const fimD = new Date(`${gerar.data_fim}T00:00:00`);
    if (fimD < ini) return [] as Slot[];
    const dias = Math.floor((fimD.getTime() - ini.getTime()) / 86400000) + 1;
    const alvo = gerar.medico_id === "all" ? medicos : medicos.filter((m) => m.id === gerar.medico_id);
    const out: Slot[] = [];
    for (let i = 0; i < dias; i++) {
      const d = new Date(ini); d.setDate(d.getDate() + i);
      if (isFeriadoOuDomingo(d)) continue;
      const dow = d.getDay();
      if (!gerarDias.includes(dow)) continue;
      for (const m of alvo) {
        const agendasDoMedico = agendas.filter((a) => a.medico_id === m.id && a.ativo);
        // Fallback: se o médico não possui agenda cadastrada, gera sem vínculo de agenda
        const agendasAlvo: Array<{ id: string | null }> = agendasDoMedico.length > 0
          ? agendasDoMedico
          : [{ id: null }];
        for (const ag of agendasAlvo) {
          const diaIso = fmtDateLocal.format(d);
          const pisoKey = `${m.id}|${ag.id ?? ""}|${diaIso}`;
          const piso = pisos.get(pisoKey) ?? "";
          const ds = disps.filter((x) =>
            x.medico_id === m.id && (ag.id === null || x.agenda_id === ag.id) && x.dia_semana === dow
            && (!x.vigencia_inicio || x.vigencia_inicio <= diaIso)
            && (!x.vigencia_fim || x.vigencia_fim >= diaIso),
          );
          const fallbackDur = m.duracao_consulta_min && m.duracao_consulta_min > 0 ? m.duracao_consulta_min : 15;
          // Fallback: se o médico não tem disponibilidade semanal cadastrada para o dia,
          // gera um bloco padrão 08:00–17:00 para que o usuário consiga criar a agenda
          // mesmo sem configurar a disponibilidade semanal antes.
          const overrideIni = gerar.hora_inicio || "";
          const overrideFim = gerar.hora_fim || "";
          const baseDs = ds.length > 0
            ? ds
            : [{
                id: `__default_${m.id}_${dow}`,
                medico_id: m.id,
                agenda_id: ag.id ?? "",
                dia_semana: dow,
                hora_inicio: "08:00",
                hora_fim: "17:00",
                observacoes: null,
                limite_pacientes: null,
                intervalo_min: null,
                vigencia_inicio: null,
                vigencia_fim: null,
              } as DispRow];
          // Aplica filtros/overrides de horário e intervalo do formulário
          const dsEfetivo = baseDs.map((x) => {
            const hiOverride = overrideIni ? (overrideIni > x.hora_inicio ? overrideIni : x.hora_inicio) : x.hora_inicio;
            // Se já existem slots criados nessa data para esse médico/agenda,
            // a nova geração começa DEPOIS do último `fim` existente.
            const hiComPiso = piso && piso > hiOverride ? piso : hiOverride;
            const hf = overrideFim ? (overrideFim < x.hora_fim ? overrideFim : x.hora_fim) : x.hora_fim;
            return { ...x, hora_inicio: hiComPiso, hora_fim: hf };
          }).filter((x) => x.hora_inicio < x.hora_fim);
          const overrideLimite = gerar.limite_fichas ? parseInt(gerar.limite_fichas) : 0;
          const overrideIntervalo = gerar.intervalo_min ? parseInt(gerar.intervalo_min) : 0;
          let limiteDia: number;
          if (overrideLimite > 0) {
            limiteDia = overrideLimite;
          } else {
            const limitesDoDia = dsEfetivo.map((x) => x.limite_pacientes).filter((n): n is number => typeof n === "number" && n > 0);
            limiteDia = limitesDoDia.length > 0 ? limitesDoDia.reduce((a, b) => a + b, 0) : Infinity;
          }
          let criadosNoDia = 0;
          for (const disp of dsEfetivo) {
            const dur = overrideIntervalo > 0
              ? overrideIntervalo
              : (disp.intervalo_min && disp.intervalo_min > 0 ? disp.intervalo_min : fallbackDur);
            const [hi, mi] = disp.hora_inicio.split(":").map(Number);
            const [hf, mf] = disp.hora_fim.split(":").map(Number);
            let cur = hi * 60 + mi;
            const end = hf * 60 + mf;
            while (cur + dur <= end && criadosNoDia < limiteDia) {
              const inicio = `${String(Math.floor(cur / 60)).padStart(2, "0")}:${String(cur % 60).padStart(2, "0")}`;
              const fimMin = cur + dur;
              const fim = `${String(Math.floor(fimMin / 60)).padStart(2, "0")}:${String(fimMin % 60).padStart(2, "0")}`;
              out.push({ data: fmtDateLocal.format(d), medico_id: m.id, agenda_id: ag.id ?? "", inicio, fim });
              cur += dur;
              criadosNoDia += 1;
            }
          }
        }
      }
    }
    return out;
  }, [gerar, gerarDias, medicos, disps, agendas, pisos]);

  if (!clinicaAtual) return <p className="text-muted-foreground">Selecione uma clínica.</p>;

  const cidadesDisponiveis = Array.from(
    new Set(medicos.map((m) => (m.cidade ?? "").trim()).filter((c) => c.length > 0)),
  ).sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));
  
  const medicosFiltrados = medicos
    .filter((m) => !filtro || m.nome.toLowerCase().includes(filtro.toLowerCase()))
    .filter((m) => filtroCidade === "all" || (m.cidade ?? "").trim().toLowerCase() === filtroCidade.toLowerCase())
    .slice()
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }));

  const gerarAgenda = async () => {
    if (!podeEscrever) { toast.error("Você não tem permissão de edição neste módulo."); return; }
    if (!clinicaAtual) return;
    if (slotsPreview.length === 0) { toast.error("Sem horários para gerar"); return; }
    if (!confirm(`Confirmar criação de ${slotsPreview.length} horários disponíveis?`)) return;
    setGerando(true);
    try {
      const medicoById = new Map(medicos.map((m) => [m.id, m]));
      // Regra: novos slots são ACRESCENTADOS abaixo dos já existentes na
      // data. Não apagamos mais os slots livres do intervalo — o `piso`
      // (computado no useEffect acima) já garante que a geração começa
      // depois do último `fim` existente por (médico, agenda, data). Se
      // ainda houver colisão pontual com o unique index uq_agend_slot_vazio,
      // tratamos por lote/linha abaixo.
      const rowsRaw = slotsPreview.map((s) => {
        const inicio = new Date(`${s.data}T${s.inicio}:00`);
        const fim = new Date(`${s.data}T${s.fim}:00`);
        const med = medicoById.get(s.medico_id)!;
        const procedimento = med.procedimento_padrao_nome || med.especialidade_nome || null;
        return {
          clinica_id: clinicaAtual.clinica_id,
          medico_id: med.id,
          agenda_id: s.agenda_id || null,
          paciente_nome: "DISPONÍVEL",
          inicio: inicio.toISOString(),
          fim: fim.toISOString(),
          status: "agendado" as const,
          observacoes: "Slot gerado automaticamente",
          ...(procedimento ? { procedimento } : {}),
        };
      });
      // Dedup dentro do próprio lote (mesmo médico/agenda/inicio) para não
      // colidir com o unique index ao inserir múltiplas disponibilidades
      // sobrepostas.
      const rowsMap = new Map<string, typeof rowsRaw[number]>();
      for (const r of rowsRaw) {
        rowsMap.set(`${r.medico_id}|${r.agenda_id ?? ""}|${r.inicio}`, r);
      }
      const rows = Array.from(rowsMap.values());
      // Inserir em lotes de 500 tolerando colisões pontuais com o unique
      // index (23505): se o lote falhar, tenta linha a linha e apenas
      // contabiliza as ignoradas — não interrompe a geração.
      let inseridos = 0;
      let ignorados = 0;
      for (let i = 0; i < rows.length; i += 500) {
        const lote = rows.slice(i, i + 500);
        const { error } = await supabase.from("agendamentos").insert(lote);
        if (!error) { inseridos += lote.length; continue; }
        // fallback linha a linha
        for (const r of lote) {
          const { error: e2 } = await supabase.from("agendamentos").insert(r);
          if (!e2) inseridos += 1;
          else if ((e2 as any).code === "23505") ignorados += 1;
          else throw e2;
        }
      }
      if (ignorados > 0) toast.success(`${inseridos} horários criados (${ignorados} já existiam e foram ignorados)`);
      else toast.success(`${inseridos} horários criados`);
      // Recarrega o piso para refletir os novos slots imediatamente na preview.
      setPisoTick((t) => t + 1);
    } catch (e: any) {
      mostrarErro(e);
    } finally {
      setGerando(false);
    }
  };

  const isSlotLivreLocal = (nome: string | null | undefined) => {
    const n = (nome ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    return n === "disponivel";
  };
  const isBloqueioLocal = (nome: string | null | undefined) => {
    const n = (nome ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    return n === "bloqueio";
  };

  const carregarBloqueios = async (medicoId: string) => {
    if (!clinicaAtual) return;
    setCarregandoBloqueios(true);
    try {
      const agora = new Date().toISOString();
      const { data, error } = await supabase
        .from("agendamentos")
        .select("id, paciente_nome, inicio, fim, observacoes")
        .eq("clinica_id", clinicaAtual.clinica_id)
        .eq("medico_id", medicoId)
        .is("paciente_id", null)
        .eq("status", "agendado")
        .gte("inicio", agora)
        .order("inicio")
        .limit(1000);
      if (error) throw error;
      const bloqueios = ((data ?? []) as Array<{ id: string; paciente_nome: string; inicio: string; fim: string; observacoes: string | null }>)
        .filter((s) => isBloqueioLocal(s.paciente_nome));
      setBloqueiosAtivos(bloqueios);
    } catch (e) {
      mostrarErro(e);
    } finally {
      setCarregandoBloqueios(false);
    }
  };

  const abrirBloqueio = (m: Medico) => {
    setBloqueioMedico(m);
    setBloqueioForm({ data_inicio: hojeIso, data_fim: hojeIso, hora_inicio: "", hora_fim: "", motivo: "" });
    void carregarBloqueios(m.id);
  };

  const aplicarBloqueio = async () => {
    if (!podeEscrever) { toast.error("Você não tem permissão de edição neste módulo."); return; }
    if (!clinicaAtual || !bloqueioMedico) return;
    if (!bloqueioForm.data_inicio || !bloqueioForm.data_fim) {
      toast.error("Informe o período a bloquear.");
      return;
    }
    if (bloqueioForm.data_fim < bloqueioForm.data_inicio) {
      toast.error("Data final não pode ser antes da data inicial.");
      return;
    }
    setBloqueando(true);
    try {
      const horaIni = bloqueioForm.hora_inicio || "00:00";
      const horaFim = bloqueioForm.hora_fim || "23:59";
      const iniIso = new Date(`${bloqueioForm.data_inicio}T${horaIni}:00`).toISOString();
      const fimIso = new Date(`${bloqueioForm.data_fim}T${horaFim}:59`).toISOString();
      const { data: slots, error: eSel } = await supabase
        .from("agendamentos")
        .select("id, paciente_nome")
        .eq("clinica_id", clinicaAtual.clinica_id)
        .eq("medico_id", bloqueioMedico.id)
        .is("paciente_id", null)
        .eq("status", "agendado")
        .gte("inicio", iniIso)
        .lte("inicio", fimIso);
      if (eSel) throw eSel;
      const candidatos = (slots ?? []) as Array<{ id: string; paciente_nome: string }>;
      // Só bloqueia o que está livre — nunca sobrescreve um horário que já
      // tenha algum outro rótulo (ex.: já bloqueado antes).
      const livres = candidatos.filter((s) => isSlotLivreLocal(s.paciente_nome));
      if (livres.length === 0) {
        toast.info("Nenhum horário livre encontrado nesse período para bloquear. Gere a agenda desse período antes, se ainda não existir.");
        return;
      }
      const motivo = bloqueioForm.motivo.trim();
      const { error: eUpd } = await supabase
        .from("agendamentos")
        .update({
          paciente_nome: "BLOQUEIO",
          observacoes: motivo ? `Bloqueado: ${motivo}` : "Bloqueado pela recepção",
        } as never)
        .in("id", livres.map((s) => s.id));
      if (eUpd) throw eUpd;
      const jaOcupados = candidatos.length - livres.length;
      toast.success(
        `${livres.length} horário(s) bloqueado(s).`
        + (jaOcupados > 0 ? ` ${jaOcupados} já tinham paciente e não foram tocados.` : ""),
      );
      setBloqueioForm((f) => ({ ...f, motivo: "" }));
      await carregarBloqueios(bloqueioMedico.id);
    } catch (e) {
      mostrarErro(e);
    } finally {
      setBloqueando(false);
    }
  };

  const desfazerBloqueio = async (id: string) => {
    if (!podeEscrever || !bloqueioMedico) return;
    setDesfazendoId(id);
    try {
      const { error } = await supabase
        .from("agendamentos")
        .update({ paciente_nome: "DISPONÍVEL", observacoes: null } as never)
        .eq("id", id);
      if (error) throw error;
      toast.success("Bloqueio desfeito — horário voltou a ficar disponível.");
      await carregarBloqueios(bloqueioMedico.id);
    } catch (e) {
      mostrarErro(e);
    } finally {
      setDesfazendoId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Horários médicos</h1>
        <p className="text-sm text-muted-foreground">Disponibilidade semanal por médico — {clinicaAtual.clinica.nome}</p>
        <p className="text-xs text-muted-foreground mt-1">
          Total de médicos: <strong>{medicos.length}</strong> · 
          Total de agendas: <strong>{agendas.length}</strong> · 
          Total de disponibilidades: <strong>{disps.length}</strong>
        </p>
      </div>

      <Tabs defaultValue="agendas" className="w-full">
        <TabsList>
          <TabsTrigger value="agendas">Agendas</TabsTrigger>
          <TabsTrigger value="medicos">Médicos</TabsTrigger>
        </TabsList>

        <TabsContent value="agendas" className="space-y-6">
          <Card className="border-primary/30">
            <CardContent className="py-4 space-y-3">
              <div className="flex items-center gap-2">
                <CalendarRange className="h-5 w-5 text-primary" />
                <h2 className="font-semibold">Gerar agenda - Médicos</h2>
              </div>
              <p className="text-xs text-muted-foreground">
                Cria automaticamente slots de horários disponíveis com base na disponibilidade semanal dos médicos.
              </p>
              <div className="flex flex-wrap gap-2 items-end">
                <div className="flex-1 min-w-48">
                  <label className="text-xs text-muted-foreground">Médico</label>
                  <SearchableSelect
                    value={gerar.medico_id}
                    onChange={(v) => setGerar({ ...gerar, medico_id: v })}
                    placeholder="Selecione"
                    searchPlaceholder="Buscar médico..."
                    options={[
                      { value: "all", label: "Todos os médicos" },
                      ...medicos.map((m) => ({ value: m.id, label: m.nome.toUpperCase() })),
                    ]}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">De</label>
                  <DateInputBR className="w-40" value={gerar.data_inicio} onChange={(e) => setGerar({ ...gerar, data_inicio: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Até</label>
                  <DateInputBR className="w-40" value={gerar.data_fim} onChange={(e) => setGerar({ ...gerar, data_fim: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Nº de fichas</label>
                  <Input
                    type="number"
                    min={1}
                    placeholder="padrão do médico"
                    className="w-36"
                    value={gerar.limite_fichas}
                    onChange={(e) => setGerar({ ...gerar, limite_fichas: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Hora início</label>
                  <Input type="time" className="w-28" value={gerar.hora_inicio}
                    onChange={(e) => setGerar({ ...gerar, hora_inicio: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Hora fim</label>
                  <Input type="time" className="w-28" value={gerar.hora_fim}
                    onChange={(e) => setGerar({ ...gerar, hora_fim: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Intervalo (min)</label>
                  <Input type="number" min={1} placeholder="padrão" className="w-28"
                    value={gerar.intervalo_min}
                    onChange={(e) => setGerar({ ...gerar, intervalo_min: e.target.value })} />
                </div>
                {podeEscrever && (
                  <Button onClick={gerarAgenda} disabled={gerando || slotsPreview.length === 0}>
                    <CalendarRange className="h-4 w-4 mr-1" />
                    {gerando ? "Gerando..." : `Gerar ${slotsPreview.length} slots`}
                  </Button>
                )}
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Dias da semana</label>
                <div className="flex flex-wrap gap-1 mt-1">
                  {DIAS.map((d, i) => {
                    const ativo = gerarDias.includes(i);
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setGerarDias((xs) => xs.includes(i) ? xs.filter((x) => x !== i) : [...xs, i].sort((a, b) => a - b))}
                        className={`h-8 px-3 rounded-md border text-xs font-medium transition flex items-center gap-1.5 ${ativo ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"}`}
                        aria-pressed={ativo}
                      >
                        <span className={`inline-block h-3 w-3 rounded-sm border ${ativo ? "bg-primary-foreground border-primary-foreground" : "border-muted-foreground/50"}`} />
                        {d}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setGerarDias([1, 2, 3, 4, 5, 6])}
                    className="h-8 px-2 rounded-md border text-xs text-muted-foreground hover:bg-muted ml-1"
                  >
                    Seg–Sáb
                  </button>
                  <button
                    type="button"
                    onClick={() => setGerarDias([0, 1, 2, 3, 4, 5, 6])}
                    className="h-8 px-2 rounded-md border text-xs text-muted-foreground hover:bg-muted"
                  >
                    Todos
                  </button>
                </div>
              </div>
              {slotsPreview.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Serão criados <strong>{slotsPreview.length}</strong> horários disponíveis na agenda
                  {gerar.medico_id === "all" ? ` (${medicos.length} médicos)` : ""}.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="medicos" className="space-y-6">
          {medicoEditando === null ? (
            <>
              <div className="flex flex-wrap gap-2 items-center">
                <Input placeholder="Filtrar médicos..." value={filtro} onChange={(e) => setFiltro(e.target.value)} className="max-w-sm" />
                <Select value={filtroCidade} onValueChange={setFiltroCidade}>
                  <SelectTrigger className="w-56"><SelectValue placeholder="Localização" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as localizações</SelectItem>
                    {cidadesDisponiveis.map((c) => (
                      <SelectItem key={c} value={c} className="uppercase">{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {filtroCidade !== "all" && (
                  <Button variant="ghost" size="sm" onClick={() => setFiltroCidade("all")}>Limpar</Button>
                )}
                <span className="text-xs text-muted-foreground ml-auto">
                  {medicosFiltrados.length} de {medicos.length} médicos
                </span>
              </div>
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Médico</TableHead>
                        <TableHead>Especialidade</TableHead>
                        <TableHead>Localização</TableHead>
                        <TableHead className="w-32 text-center">Agendas</TableHead>
                        <TableHead className="w-32 text-center">Horários</TableHead>
                        <TableHead className="w-24 text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {medicosFiltrados.map((m) => {
                        const ds = disps.filter((d) => d.medico_id === m.id);
                        const agendasDoMedico = agendas.filter((a) => a.medico_id === m.id);
                        const temAgenda = agendasDoMedico.some((a) => a.ativo);
                        const agendaAtiva = agendasDoMedico.find((a) => a.ativo);
                        
                        return (
                          <TableRow key={m.id} className={!temAgenda ? "bg-yellow-50/50" : ""}>
                            <TableCell className="font-medium uppercase">
                              <div className="flex items-center gap-2">
                                {m.nome}
                                {!temAgenda && (
                                  <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full font-normal">
                                    Sem agenda
                                  </span>
                                )}
                                {temAgenda && !agendaAtiva && (
                                  <span className="text-xs bg-orange-100 text-orange-800 px-2 py-0.5 rounded-full font-normal">
                                    Inativa
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {m.especialidade_nome || "—"}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground uppercase">
                              {[m.cidade, m.estado].filter(Boolean).join(" / ") || "—"}
                            </TableCell>
                            <TableCell className="text-center text-sm">
                              {agendasDoMedico.length > 0 ? (
                                <span className="font-medium">{agendasDoMedico.length}</span>
                              ) : (
                                <span className="text-muted-foreground">0</span>
                              )}
                            </TableCell>
                            <TableCell className="text-center text-sm text-muted-foreground">
                              {ds.length}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                {temAgenda && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => abrirBloqueio(m)}
                                    aria-label="Bloquear período"
                                    title="Bloquear um período pontual sem mexer na semana inteira"
                                  >
                                    <Ban className="h-4 w-4" />
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  variant={!temAgenda ? "default" : "ghost"}
                                  onClick={() => {
                                    setMedicoEditando(m.id);
                                    setNovo({ ...novo, medico_id: m.id });
                                    const primeira = agendas.find((a) => a.medico_id === m.id && a.ativo) ?? agendas.find((a) => a.medico_id === m.id);
                                    setAgendaSel(primeira?.id ?? "");
                                    if (!primeira) {
                                      toast.warning("Este médico não possui agenda ativa. Crie uma agenda primeiro.");
                                    }
                                  }}
                                  aria-label="Editar horários"
                                >
                                  <Pencil className="h-4 w-4" />
                                  {!temAgenda && <span className="ml-1 text-xs">Criar</span>}
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {medicosFiltrados.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">
                            Nenhum médico encontrado.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          ) : (() => {
            const m = medicos.find((x) => x.id === medicoEditando);
            if (!m) { setMedicoEditando(null); return null; }
            const agendasMed = agendas.filter((a) => a.medico_id === m.id).sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, "pt-BR"));
            const ds = disps
              .filter((d) => d.medico_id === m.id)
              .slice()
              .sort((a, b) => {
                const an = agendasMed.find((x) => x.id === a.agenda_id)?.nome ?? "";
                const bn = agendasMed.find((x) => x.id === b.agenda_id)?.nome ?? "";
                return an.localeCompare(bn, "pt-BR") || a.dia_semana - b.dia_semana || a.hora_inicio.localeCompare(b.hora_inicio);
              });
            return (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Button variant="ghost" size="sm" onClick={() => setMedicoEditando(null)}>
                    <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
                  </Button>
                  <h2 className="text-lg font-semibold uppercase">{m.nome}</h2>
                  <span className="text-xs text-muted-foreground">· {ds.length} horário(s)</span>
                  {agendasMed.length === 0 && (
                    <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full">
                      Sem agendas cadastradas
                    </span>
                  )}
                </div>

                <Card>
                  <CardContent className="py-4 flex flex-wrap gap-2 items-end">
                    <div>
                      <label className="text-xs text-muted-foreground">Agenda</label>
                      <Select value={agendaSel} onValueChange={setAgendaSel}>
                        <SelectTrigger className="w-48"><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          {agendasMed.length > 0 ? (
                            agendasMed.map((a) => (
                              <SelectItem key={a.id} value={a.id} className="uppercase">{a.nome}{!a.ativo ? " (inativa)" : ""}</SelectItem>
                            ))
                          ) : (
                            <SelectItem value="" disabled>Nenhuma agenda cadastrada</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                      {agendasMed.length === 0 && (
                        <p className="text-xs text-muted-foreground mt-1">
                          ⚠️ Crie uma agenda para este médico antes de adicionar horários
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Dia</label>
                      <div className="flex flex-wrap gap-1">
                        {DIAS.map((d, i) => {
                          const ativo = diasSel.includes(i);
                          return (
                            <button
                              key={i}
                              type="button"
                              onClick={() => setDiasSel((xs) => xs.includes(i) ? xs.filter((x) => x !== i) : [...xs, i].sort((a, b) => a - b))}
                              className={`h-9 px-2.5 rounded-md border text-xs font-medium transition ${ativo ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"}`}
                              aria-pressed={ativo}
                            >
                              {d}
                            </button>
                          );
                        })}
                        <button
                          type="button"
                          onClick={() => setDiasSel([1, 2, 3, 4, 5, 6])}
                          className="h-9 px-2 rounded-md border text-xs text-muted-foreground hover:bg-muted ml-1"
                          title="Segunda a sábado"
                        >
                          Seg–Sáb
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Início</label>
                      <Input type="time" className="w-28" value={novo.hora_inicio} onChange={(e) => setNovo({ ...novo, hora_inicio: e.target.value })} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Fim</label>
                      <Input type="time" className="w-28" value={novo.hora_fim} onChange={(e) => setNovo({ ...novo, hora_fim: e.target.value })} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Pacientes/dia</label>
                      <Input type="number" min={1} placeholder="sem limite" className="w-32" value={novo.limite_pacientes} onChange={(e) => setNovo({ ...novo, limite_pacientes: e.target.value })} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Intervalo (min)</label>
                      <Input type="number" min={1} max={480} placeholder="padrão do médico" className="w-36" value={novo.intervalo_min} onChange={(e) => setNovo({ ...novo, intervalo_min: e.target.value })} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Vigência de</label>
                      <DateInputBR className="w-40" value={novo.vigencia_inicio} onChange={(e) => setNovo({ ...novo, vigencia_inicio: e.target.value })} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">até</label>
                      <DateInputBR className="w-40" value={novo.vigencia_fim} onChange={(e) => setNovo({ ...novo, vigencia_fim: e.target.value })} />
                    </div>
                    {podeEscrever && (
                      <Button
                        onClick={() => { setNovo({ ...novo, medico_id: m.id }); void adicionar(); }}
                        disabled={agendasMed.length === 0}
                      >
                        <Plus className="h-4 w-4 mr-1" /> Adicionar
                      </Button>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="py-3">
                    {ds.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Sem horários cadastrados.</p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Agenda</TableHead>
                            <TableHead>Dia</TableHead>
                            <TableHead>Início</TableHead>
                            <TableHead>Fim</TableHead>
                            <TableHead>Pacientes/dia</TableHead>
                            <TableHead>Intervalo</TableHead>
                            <TableHead>Vigência</TableHead>
                            <TableHead className="w-28 text-right">Ações</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {ds.map((d) => (
                            dispEditando === d.id && editRow ? (
                              <TableRow key={d.id} className="bg-muted/40">
                                <TableCell className="uppercase text-sm text-muted-foreground">
                                  {agendasMed.find((a) => a.id === d.agenda_id)?.nome ?? "—"}
                                </TableCell>
                                <TableCell>
                                  <Select value={editRow.dia_semana} onValueChange={(v) => setEditRow({ ...editRow, dia_semana: v })}>
                                    <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                                    <SelectContent>{DIAS.map((dn, i) => <SelectItem key={i} value={String(i)}>{dn}</SelectItem>)}</SelectContent>
                                  </Select>
                                </TableCell>
                                <TableCell>
                                  <Input type="time" className="w-28" value={editRow.hora_inicio} onChange={(e) => setEditRow({ ...editRow, hora_inicio: e.target.value })} />
                                </TableCell>
                                <TableCell>
                                  <Input type="time" className="w-28" value={editRow.hora_fim} onChange={(e) => setEditRow({ ...editRow, hora_fim: e.target.value })} />
                                </TableCell>
                                <TableCell>
                                  <Input type="number" min={1} placeholder="sem limite" className="w-28" value={editRow.limite_pacientes} onChange={(e) => setEditRow({ ...editRow, limite_pacientes: e.target.value })} />
                                </TableCell>
                                <TableCell>
                                  <Input type="number" min={1} max={480} placeholder="padrão" className="w-28" value={editRow.intervalo_min} onChange={(e) => setEditRow({ ...editRow, intervalo_min: e.target.value })} />
                                </TableCell>
                                <TableCell>
                                  <div className="flex gap-1">
                                    <DateInputBR className="w-36" value={editRow.vigencia_inicio} onChange={(e) => setEditRow({ ...editRow, vigencia_inicio: e.target.value })} />
                                    <DateInputBR className="w-36" value={editRow.vigencia_fim} onChange={(e) => setEditRow({ ...editRow, vigencia_fim: e.target.value })} />
                                  </div>
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex justify-end gap-2">
                                    <Button size="sm" onClick={() => void salvarEdicao()}>Salvar</Button>
                                    <Button size="sm" variant="ghost" onClick={() => { setDispEditando(null); setEditRow(null); }}>Cancelar</Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ) : (
                              <TableRow key={d.id}>
                                <TableCell className="uppercase text-sm">
                                  {agendasMed.find((a) => a.id === d.agenda_id)?.nome ?? "—"}
                                </TableCell>
                                <TableCell className="font-medium">{DIAS[d.dia_semana]}</TableCell>
                                <TableCell>{d.hora_inicio.slice(0, 5)}</TableCell>
                                <TableCell>{d.hora_fim.slice(0, 5)}</TableCell>
                                <TableCell>{d.limite_pacientes ?? <span className="text-muted-foreground">—</span>}</TableCell>
                                <TableCell>{d.intervalo_min ? `${d.intervalo_min} min` : <span className="text-muted-foreground">—</span>}</TableCell>
                                <TableCell className="text-xs text-muted-foreground">
                                  {d.vigencia_inicio || d.vigencia_fim
                                    ? `${d.vigencia_inicio ? d.vigencia_inicio.split("-").reverse().join("/") : "—"} a ${d.vigencia_fim ? d.vigencia_fim.split("-").reverse().join("/") : "—"}`
                                    : <span className="text-muted-foreground">sempre</span>}
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex justify-end gap-2">
                                    {podeEscrever && (
                                      <>
                                        <button
                                          onClick={() => {
                                            setDispEditando(d.id);
                                            setEditRow({
                                              dia_semana: String(d.dia_semana),
                                              hora_inicio: d.hora_inicio.slice(0, 5),
                                              hora_fim: d.hora_fim.slice(0, 5),
                                              limite_pacientes: d.limite_pacientes ? String(d.limite_pacientes) : "",
                                              intervalo_min: d.intervalo_min ? String(d.intervalo_min) : "",
                                              vigencia_inicio: d.vigencia_inicio ?? "",
                                              vigencia_fim: d.vigencia_fim ?? "",
                                            });
                                          }}
                                          className="text-primary hover:opacity-70"
                                          aria-label="Editar"
                                        >
                                          <Pencil className="h-4 w-4" />
                                        </button>
                                        <button onClick={() => remover(d.id)} className="text-destructive hover:opacity-70" aria-label="Remover">
                                          <Trash2 className="h-4 w-4" />
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                            )
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              </div>
            );
          })()}
        </TabsContent>
      </Tabs>

      <Dialog open={!!bloqueioMedico} onOpenChange={(v) => { if (!v) setBloqueioMedico(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ban className="h-4 w-4" /> Bloquear período — {bloqueioMedico?.nome}
            </DialogTitle>
            <DialogDescription>
              Bloqueia horários já livres nesse período sem mexer na disponibilidade recorrente da semana.
              Horários que já têm paciente marcado não são alterados.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="bloq-data-ini">Data início</Label>
                <DateInputBR
                  id="bloq-data-ini"
                  value={bloqueioForm.data_inicio}
                  onChange={(e) => setBloqueioForm((f) => ({ ...f, data_inicio: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="bloq-data-fim">Data fim</Label>
                <DateInputBR
                  id="bloq-data-fim"
                  value={bloqueioForm.data_fim}
                  onChange={(e) => setBloqueioForm((f) => ({ ...f, data_fim: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="bloq-hora-ini">Hora início (opcional)</Label>
                <Input
                  id="bloq-hora-ini" type="time"
                  value={bloqueioForm.hora_inicio}
                  onChange={(e) => setBloqueioForm((f) => ({ ...f, hora_inicio: e.target.value }))}
                  placeholder="Dia inteiro"
                />
              </div>
              <div>
                <Label htmlFor="bloq-hora-fim">Hora fim (opcional)</Label>
                <Input
                  id="bloq-hora-fim" type="time"
                  value={bloqueioForm.hora_fim}
                  onChange={(e) => setBloqueioForm((f) => ({ ...f, hora_fim: e.target.value }))}
                  placeholder="Dia inteiro"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="bloq-motivo">Motivo (opcional)</Label>
              <Textarea
                id="bloq-motivo" rows={2}
                value={bloqueioForm.motivo}
                onChange={(e) => setBloqueioForm((f) => ({ ...f, motivo: e.target.value }))}
                placeholder="Ex.: reunião, imprevisto, licença..."
              />
            </div>
            <Button onClick={aplicarBloqueio} disabled={bloqueando} className="w-full">
              <Ban className="h-4 w-4 mr-1" /> {bloqueando ? "Bloqueando..." : "Bloquear período"}
            </Button>

            <div className="pt-2 border-t">
              <div className="text-sm font-medium mb-2">Bloqueios ativos (futuros)</div>
              {carregandoBloqueios ? (
                <p className="text-xs text-muted-foreground">Carregando...</p>
              ) : bloqueiosAtivos.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhum bloqueio ativo para este médico.</p>
              ) : (
                <ul className="space-y-1 max-h-48 overflow-y-auto">
                  {bloqueiosAtivos.map((b) => (
                    <li key={b.id} className="flex items-center justify-between text-xs bg-muted/40 rounded px-2 py-1.5 gap-2">
                      <span>
                        {new Date(b.inicio).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                        {b.observacoes ? ` — ${b.observacoes}` : ""}
                      </span>
                      <Button
                        size="sm" variant="ghost" className="h-6 px-2 shrink-0"
                        disabled={desfazendoId === b.id}
                        onClick={() => desfazerBloqueio(b.id)}
                      >
                        <Undo2 className="h-3 w-3 mr-1" /> Desfazer
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBloqueioMedico(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}