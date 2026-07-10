import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Trash2, Plus, CalendarRange, Pencil, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  EnfermagemGerarAgendaCard,
  EnfermagemRecursosHorariosEditor,
} from "@/components/enfermagem-horarios-parts";

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

interface Disp {
  id: string;
  medico_id: string;
  dia_semana: number;
  hora_inicio: string;
  hora_fim: string;
  observacoes: string | null;
  limite_pacientes: number | null;
  intervalo_min: number | null;
}
type DispExt = Disp & { vigencia_inicio: string | null; vigencia_fim: string | null };
interface Medico {
  id: string;
  nome: string;
  duracao_consulta_min: number | null;
  procedimento_padrao_id: string | null;
  procedimento_padrao_nome: string | null;
  especialidade_nome: string | null;
  cidade: string | null;
  estado: string | null;
  bairro: string | null;
}
interface Agenda {
  id: string;
  medico_id: string;
  nome: string;
  ativo: boolean;
  ordem: number;
}
interface DispRow extends DispExt {
  agenda_id: string;
}

function Page() {
  const { clinicaAtual } = useClinica();
  const [medicos, setMedicos] = useState<Medico[]>([]);
  const [disps, setDisps] = useState<DispRow[]>([]);
  const [agendas, setAgendas] = useState<Agenda[]>([]);
  const [agendaSel, setAgendaSel] = useState<string>("");
  const [filtro, setFiltro] = useState("");
  const [filtroCidade, setFiltroCidade] = useState<string>("all");
  const [novo, setNovo] = useState({
    medico_id: "",
    dia_semana: "1",
    hora_inicio: "08:00",
    hora_fim: "12:00",
    limite_pacientes: "",
    intervalo_min: "",
    vigencia_inicio: "",
    vigencia_fim: "",
  });
  const [diasSel, setDiasSel] = useState<number[]>([1]);
  const hojeIso = new Date().toISOString().slice(0, 10);
  const em30Iso = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 29);
    return d.toISOString().slice(0, 10);
  })();
  const [gerar, setGerar] = useState({
    medico_id: "all",
    dias: "30",
    data_inicio: hojeIso,
    data_fim: em30Iso,
    limite_fichas: "",
    hora_inicio: "",
    hora_fim: "",
    intervalo_min: "",
  });
  const [gerarDias, setGerarDias] = useState<number[]>([1, 2, 3, 4, 5, 6]);
  const [gerando, setGerando] = useState(false);
  const [medicoEditando, setMedicoEditando] = useState<string | null>(null);
  const [dispEditando, setDispEditando] = useState<string | null>(null);
  const [editRow, setEditRow] = useState<{
    dia_semana: string;
    hora_inicio: string;
    hora_fim: string;
    limite_pacientes: string;
    intervalo_min: string;
    vigencia_inicio: string;
    vigencia_fim: string;
  } | null>(null);

  const load = async () => {
    if (!clinicaAtual) return;
<<<<<<< HEAD
    const [m, d, a] = await Promise.all([
      supabase
        .from("medicos")
        .select(
          "id, nome, duracao_consulta_min, procedimento_padrao_id, cidade, estado, bairro, procedimento:procedimentos!medicos_procedimento_padrao_id_fkey(nome), especialidade:especialidades!medicos_especialidade_id_fkey(nome)" as never,
        )
        .eq("clinica_id", clinicaAtual.clinica_id)
        .eq("ativo", true)
        .order("nome"),
      supabase
        .from("medico_disponibilidades")
        .select(
          "id, medico_id, agenda_id, dia_semana, hora_inicio, hora_fim, observacoes, limite_pacientes, intervalo_min, vigencia_inicio, vigencia_fim" as never,
        )
        .eq("clinica_id", clinicaAtual.clinica_id)
        .eq("ativo", true)
        .order("dia_semana")
        .order("hora_inicio"),
      supabase
        .from("medico_agendas" as never)
        .select("id, medico_id, nome, ativo, ordem")
        .eq("clinica_id", clinicaAtual.clinica_id)
        .order("ordem")
        .order("nome"),
    ]);
    type RawMedico = {
      id: string;
      nome: string;
      duracao_consulta_min: number | null;
      procedimento_padrao_id: string | null;
      cidade: string | null;
      estado: string | null;
      bairro: string | null;
      procedimento?: { nome: string | null } | null;
      especialidade?: { nome: string | null } | null;
    };
    const rawList = (m.data as unknown as RawMedico[]) ?? [];
    setMedicos(
      rawList.map((r) => ({
=======
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
>>>>>>> 18eb686dbc25b258ff35f41366dbb0c3660f374b
        id: r.id,
        nome: r.nome,
        duracao_consulta_min: r.duracao_consulta_min,
        procedimento_padrao_id: r.procedimento_padrao_id,
        procedimento_padrao_nome: r.procedimento?.nome ?? null,
        especialidade_nome: r.especialidade?.nome ?? null,
        cidade: r.cidade,
        estado: r.estado,
        bairro: r.bairro,
<<<<<<< HEAD
      })),
    );
    setDisps((d.data as unknown as DispRow[]) ?? []);
    setAgendas((a.data as unknown as Agenda[]) ?? []);
=======
      })));
      setDisps(((d.data as unknown) as DispRow[]) ?? []);
      setAgendas(((a.data as unknown) as Agenda[]) ?? []);
    } catch (error) {
      console.error("Erro no load:", error);
      toast.error("Erro ao carregar dados");
    }
>>>>>>> 18eb686dbc25b258ff35f41366dbb0c3660f374b
  };

  useEffect(() => {
    void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [clinicaAtual?.clinica_id]);

  // Recarrega ao voltar para a aba/janela e quando o foco retorna,
  // garantindo que médicos recém cadastrados em outra tela apareçam aqui.
  useEffect(() => {
    const onFocus = () => {
      void load();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") void load();
    };
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
        {
          event: "*",
          schema: "public",
          table: "medicos",
          filter: `clinica_id=eq.${clinicaAtual.clinica_id}`,
        },
        () => {
          void load();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [clinicaAtual?.clinica_id]);

  const adicionar = async () => {
    if (!clinicaAtual || !novo.medico_id) {
      toast.error("Selecione um médico");
      return;
    }
    if (!agendaSel) {
      toast.error("Selecione uma agenda");
      return;
    }
    if (diasSel.length === 0) {
      toast.error("Selecione ao menos um dia");
      return;
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
    if (error) {
      mostrarErro(error);
      return;
    }
    toast.success(
      diasSel.length > 1 ? `${diasSel.length} horários adicionados` : "Horário adicionado",
    );
    void load();
  };

  const salvarEdicao = async () => {
    if (!dispEditando || !editRow) return;
    const payload = {
      dia_semana: parseInt(editRow.dia_semana),
      hora_inicio: editRow.hora_inicio,
      hora_fim: editRow.hora_fim,
      limite_pacientes: editRow.limite_pacientes ? parseInt(editRow.limite_pacientes) : null,
      intervalo_min: editRow.intervalo_min ? parseInt(editRow.intervalo_min) : null,
      vigencia_inicio: editRow.vigencia_inicio || null,
      vigencia_fim: editRow.vigencia_fim || null,
    };
    const { error } = await supabase
      .from("medico_disponibilidades")
      .update(payload as never)
      .eq("id", dispEditando);
    if (error) {
      mostrarErro(error);
      return;
    }
    toast.success("Horário atualizado");
    setDispEditando(null);
    setEditRow(null);
    void load();
  };

  const remover = async (id: string) => {
    const { error } = await supabase.from("medico_disponibilidades").delete().eq("id", id);
    if (error) {
      mostrarErro(error);
      return;
    }
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
    const alvo =
      gerar.medico_id === "all" ? medicos : medicos.filter((m) => m.id === gerar.medico_id);
    const out: Slot[] = [];
    for (let i = 0; i < dias; i++) {
      const d = new Date(ini);
      d.setDate(d.getDate() + i);
      if (isFeriadoOuDomingo(d)) continue;
      const dow = d.getDay();
      if (!gerarDias.includes(dow)) continue;
      for (const m of alvo) {
        const agendasDoMedico = agendas.filter((a) => a.medico_id === m.id && a.ativo);
        // Fallback: se o médico não possui agenda cadastrada, gera sem vínculo de agenda
        const agendasAlvo: Array<{ id: string | null }> =
          agendasDoMedico.length > 0 ? agendasDoMedico : [{ id: null }];
        for (const ag of agendasAlvo) {
          const diaIso = d.toISOString().slice(0, 10);
          const ds = disps.filter(
            (x) =>
              x.medico_id === m.id &&
              (ag.id === null || x.agenda_id === ag.id) &&
              x.dia_semana === dow &&
              (!x.vigencia_inicio || x.vigencia_inicio <= diaIso) &&
              (!x.vigencia_fim || x.vigencia_fim >= diaIso),
          );
          const fallbackDur =
            m.duracao_consulta_min && m.duracao_consulta_min > 0 ? m.duracao_consulta_min : 15;
          // Fallback: se o médico não tem disponibilidade semanal cadastrada para o dia,
          // gera um bloco padrão 08:00–17:00 para que o usuário consiga criar a agenda
          // mesmo sem configurar a disponibilidade semanal antes.
          const overrideIni = gerar.hora_inicio || "";
          const overrideFim = gerar.hora_fim || "";
          const baseDs =
            ds.length > 0
              ? ds
              : [
                  {
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
                  } as DispRow,
                ];
          // Aplica filtros/overrides de horário e intervalo do formulário
          const dsEfetivo = baseDs
            .map((x) => ({
              ...x,
              hora_inicio: overrideIni
                ? overrideIni > x.hora_inicio
                  ? overrideIni
                  : x.hora_inicio
                : x.hora_inicio,
              hora_fim: overrideFim
                ? overrideFim < x.hora_fim
                  ? overrideFim
                  : x.hora_fim
                : x.hora_fim,
            }))
            .filter((x) => x.hora_inicio < x.hora_fim);
          const overrideLimite = gerar.limite_fichas ? parseInt(gerar.limite_fichas) : 0;
          const overrideIntervalo = gerar.intervalo_min ? parseInt(gerar.intervalo_min) : 0;
          let limiteDia: number;
          if (overrideLimite > 0) {
            limiteDia = overrideLimite;
          } else {
            const limitesDoDia = dsEfetivo
              .map((x) => x.limite_pacientes)
              .filter((n): n is number => typeof n === "number" && n > 0);
            limiteDia =
              limitesDoDia.length > 0 ? limitesDoDia.reduce((a, b) => a + b, 0) : Infinity;
          }
          let criadosNoDia = 0;
          for (const disp of dsEfetivo) {
            const dur =
              overrideIntervalo > 0
                ? overrideIntervalo
                : disp.intervalo_min && disp.intervalo_min > 0
                  ? disp.intervalo_min
                  : fallbackDur;
            const [hi, mi] = disp.hora_inicio.split(":").map(Number);
            const [hf, mf] = disp.hora_fim.split(":").map(Number);
            let cur = hi * 60 + mi;
            const end = hf * 60 + mf;
            while (cur + dur <= end && criadosNoDia < limiteDia) {
              const inicio = `${String(Math.floor(cur / 60)).padStart(2, "0")}:${String(cur % 60).padStart(2, "0")}`;
              const fimMin = cur + dur;
              const fim = `${String(Math.floor(fimMin / 60)).padStart(2, "0")}:${String(fimMin % 60).padStart(2, "0")}`;
              out.push({
                data: d.toISOString().slice(0, 10),
                medico_id: m.id,
                agenda_id: ag.id ?? "",
                inicio,
                fim,
              });
              cur += dur;
              criadosNoDia += 1;
            }
          }
        }
      }
    }
    return out;
  }, [gerar, gerarDias, medicos, disps, agendas]);

  if (!clinicaAtual) return <p className="text-muted-foreground">Selecione uma clínica.</p>;

  const cidadesDisponiveis = Array.from(
    new Set(medicos.map((m) => (m.cidade ?? "").trim()).filter((c) => c.length > 0)),
  ).sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));
  
  const medicosFiltrados = medicos
    .filter((m) => !filtro || m.nome.toLowerCase().includes(filtro.toLowerCase()))
    .filter(
      (m) =>
        filtroCidade === "all" ||
        (m.cidade ?? "").trim().toLowerCase() === filtroCidade.toLowerCase(),
    )
    .slice()
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }));

  const gerarAgenda = async () => {
    if (!clinicaAtual) return;
    if (slotsPreview.length === 0) {
      toast.error("Sem horários para gerar");
      return;
    }
    if (!confirm(`Confirmar criação de ${slotsPreview.length} horários disponíveis?`)) return;
    setGerando(true);
    try {
      const medicoById = new Map(medicos.map((m) => [m.id, m]));
      // A-2: limpar slots "DISPONÍVEL" pré-existentes no intervalo/médico/agenda antes de regerar,
      // evitando duplicatas ao clicar em "Gerar" mais de uma vez.
      const iniIso = new Date(`${gerar.data_inicio}T00:00:00`).toISOString();
      const fimIso = new Date(`${gerar.data_fim}T23:59:59`).toISOString();
      const medicoIdsSet = new Set(slotsPreview.map((s) => s.medico_id));
      if (medicoIdsSet.size > 0) {
        // Limpa TODOS os slots livres (sem paciente) no intervalo/médicos —
        // o unique index uq_agend_slot_vazio bate em (clinica, medico, agenda, inicio)
        // WHERE paciente_id IS NULL AND status='agendado', então filtrar apenas
        // por paciente_nome='DISPONÍVEL' deixa slots antigos com outro rótulo
        // (ex.: "BLOQUEIO", vazio, etc.) causando colisão ao regerar.
        const { error: delErr } = await supabase
          .from("agendamentos")
          .delete()
          .eq("clinica_id", clinicaAtual.clinica_id)
          .is("paciente_id", null)
          .eq("status", "agendado")
          .in("medico_id", Array.from(medicoIdsSet))
          .gte("inicio", iniIso)
          .lte("inicio", fimIso);
        if (delErr) throw delErr;
      }
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
      // Inserir em lotes de 500
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await supabase.from("agendamentos").insert(rows.slice(i, i + 500));
        if (error) throw error;
      }
      toast.success(`${rows.length} horários criados`);
    } catch (e: any) {
      mostrarErro(e);
    } finally {
      setGerando(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Horários médicos</h1>
<<<<<<< HEAD
        <p className="text-sm text-muted-foreground">
          Disponibilidade semanal por médico — {clinicaAtual.clinica.nome}
=======
        <p className="text-sm text-muted-foreground">Disponibilidade semanal por médico — {clinicaAtual.clinica.nome}</p>
        <p className="text-xs text-muted-foreground mt-1">
          Total de médicos: <strong>{medicos.length}</strong> · 
          Total de agendas: <strong>{agendas.length}</strong> · 
          Total de disponibilidades: <strong>{disps.length}</strong>
>>>>>>> 18eb686dbc25b258ff35f41366dbb0c3660f374b
        </p>
      </div>

      <Tabs defaultValue="agendas" className="w-full">
        <TabsList>
          <TabsTrigger value="agendas">Agendas</TabsTrigger>
          <TabsTrigger value="medicos">Médicos</TabsTrigger>
          <TabsTrigger value="enfermagem">Enfermagem</TabsTrigger>
        </TabsList>

        <TabsContent value="agendas" className="space-y-6">
          <Card className="border-primary/30">
            <CardContent className="py-4 space-y-3">
              <div className="flex items-center gap-2">
                <CalendarRange className="h-5 w-5 text-primary" />
                <h2 className="font-semibold">Gerar agenda - Médicos</h2>
              </div>
              <p className="text-xs text-muted-foreground">
                Cria automaticamente slots de horários disponíveis com base na disponibilidade
                semanal dos médicos.
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
                  <Input
                    type="date"
                    className="w-40"
                    value={gerar.data_inicio}
                    onChange={(e) => setGerar({ ...gerar, data_inicio: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Até</label>
                  <Input
                    type="date"
                    className="w-40"
                    value={gerar.data_fim}
                    onChange={(e) => setGerar({ ...gerar, data_fim: e.target.value })}
                  />
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
                  <Input
                    type="time"
                    className="w-28"
                    value={gerar.hora_inicio}
                    onChange={(e) => setGerar({ ...gerar, hora_inicio: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Hora fim</label>
                  <Input
                    type="time"
                    className="w-28"
                    value={gerar.hora_fim}
                    onChange={(e) => setGerar({ ...gerar, hora_fim: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Intervalo (min)</label>
                  <Input
                    type="number"
                    min={1}
                    placeholder="padrão"
                    className="w-28"
                    value={gerar.intervalo_min}
                    onChange={(e) => setGerar({ ...gerar, intervalo_min: e.target.value })}
                  />
                </div>
                <Button onClick={gerarAgenda} disabled={gerando || slotsPreview.length === 0}>
                  <CalendarRange className="h-4 w-4 mr-1" />
                  {gerando ? "Gerando..." : `Gerar ${slotsPreview.length} slots`}
                </Button>
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
                        onClick={() =>
                          setGerarDias((xs) =>
                            xs.includes(i)
                              ? xs.filter((x) => x !== i)
                              : [...xs, i].sort((a, b) => a - b),
                          )
                        }
                        className={`h-8 px-3 rounded-md border text-xs font-medium transition flex items-center gap-1.5 ${ativo ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"}`}
                        aria-pressed={ativo}
                      >
                        <span
                          className={`inline-block h-3 w-3 rounded-sm border ${ativo ? "bg-primary-foreground border-primary-foreground" : "border-muted-foreground/50"}`}
                        />
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
                  Serão criados <strong>{slotsPreview.length}</strong> horários disponíveis na
                  agenda
                  {gerar.medico_id === "all" ? ` (${medicos.length} médicos)` : ""}.
                </p>
              )}
            </CardContent>
          </Card>

          <EnfermagemGerarAgendaCard />
        </TabsContent>

        <TabsContent value="medicos" className="space-y-6">
          {medicoEditando === null ? (
            <>
              <div className="flex flex-wrap gap-2 items-center">
                <Input
                  placeholder="Filtrar médicos..."
                  value={filtro}
                  onChange={(e) => setFiltro(e.target.value)}
                  className="max-w-sm"
                />
                <Select value={filtroCidade} onValueChange={setFiltroCidade}>
                  <SelectTrigger className="w-56">
                    <SelectValue placeholder="Localização" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as localizações</SelectItem>
                    {cidadesDisponiveis.map((c) => (
                      <SelectItem key={c} value={c} className="uppercase">
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {filtroCidade !== "all" && (
                  <Button variant="ghost" size="sm" onClick={() => setFiltroCidade("all")}>
                    Limpar
                  </Button>
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
<<<<<<< HEAD
=======
                            <TableCell className="text-center text-sm">
                              {agendasDoMedico.length > 0 ? (
                                <span className="font-medium">{agendasDoMedico.length}</span>
                              ) : (
                                <span className="text-muted-foreground">0</span>
                              )}
                            </TableCell>
>>>>>>> 18eb686dbc25b258ff35f41366dbb0c3660f374b
                            <TableCell className="text-center text-sm text-muted-foreground">
                              {ds.length}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                variant={!temAgenda ? "default" : "ghost"}
                                onClick={() => {
                                  setMedicoEditando(m.id);
                                  setNovo({ ...novo, medico_id: m.id });
                                  const primeira =
                                    agendas.find((a) => a.medico_id === m.id && a.ativo) ??
                                    agendas.find((a) => a.medico_id === m.id);
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
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {medicosFiltrados.length === 0 && (
                        <TableRow>
<<<<<<< HEAD
                          <TableCell
                            colSpan={4}
                            className="text-center text-sm text-muted-foreground py-6"
                          >
=======
                          <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">
>>>>>>> 18eb686dbc25b258ff35f41366dbb0c3660f374b
                            Nenhum médico encontrado.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
<<<<<<< HEAD
          ) : (
            (() => {
              const m = medicos.find((x) => x.id === medicoEditando);
              if (!m) {
                setMedicoEditando(null);
                return null;
              }
              const agendasMed = agendas
                .filter((a) => a.medico_id === m.id)
                .sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, "pt-BR"));
              const ds = disps
                .filter((d) => d.medico_id === m.id)
                .slice()
                .sort((a, b) => {
                  const an = agendasMed.find((x) => x.id === a.agenda_id)?.nome ?? "";
                  const bn = agendasMed.find((x) => x.id === b.agenda_id)?.nome ?? "";
                  return (
                    an.localeCompare(bn, "pt-BR") ||
                    a.dia_semana - b.dia_semana ||
                    a.hora_inicio.localeCompare(b.hora_inicio)
                  );
                });
              return (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <Button variant="ghost" size="sm" onClick={() => setMedicoEditando(null)}>
                      <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
=======
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
                      <Input type="date" className="w-40" value={novo.vigencia_inicio} onChange={(e) => setNovo({ ...novo, vigencia_inicio: e.target.value })} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">até</label>
                      <Input type="date" className="w-40" value={novo.vigencia_fim} onChange={(e) => setNovo({ ...novo, vigencia_fim: e.target.value })} />
                    </div>
                    <Button 
                      onClick={() => { setNovo({ ...novo, medico_id: m.id }); void adicionar(); }}
                      disabled={agendasMed.length === 0}
                    >
                      <Plus className="h-4 w-4 mr-1" /> Adicionar
>>>>>>> 18eb686dbc25b258ff35f41366dbb0c3660f374b
                    </Button>
                    <h2 className="text-lg font-semibold uppercase">{m.nome}</h2>
                    <span className="text-xs text-muted-foreground">· {ds.length} horário(s)</span>
                  </div>

                  <Card>
                    <CardContent className="py-4 flex flex-wrap gap-2 items-end">
                      <div>
                        <label className="text-xs text-muted-foreground">Agenda</label>
                        <Select value={agendaSel} onValueChange={setAgendaSel}>
                          <SelectTrigger className="w-48">
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                          <SelectContent>
                            {agendasMed.map((a) => (
                              <SelectItem key={a.id} value={a.id} className="uppercase">
                                {a.nome}
                                {!a.ativo ? " (inativa)" : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
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
                                onClick={() =>
                                  setDiasSel((xs) =>
                                    xs.includes(i)
                                      ? xs.filter((x) => x !== i)
                                      : [...xs, i].sort((a, b) => a - b),
                                  )
                                }
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
                        <Input
                          type="time"
                          className="w-28"
                          value={novo.hora_inicio}
                          onChange={(e) => setNovo({ ...novo, hora_inicio: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Fim</label>
                        <Input
                          type="time"
                          className="w-28"
                          value={novo.hora_fim}
                          onChange={(e) => setNovo({ ...novo, hora_fim: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Pacientes/dia</label>
                        <Input
                          type="number"
                          min={1}
                          placeholder="sem limite"
                          className="w-32"
                          value={novo.limite_pacientes}
                          onChange={(e) => setNovo({ ...novo, limite_pacientes: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Intervalo (min)</label>
                        <Input
                          type="number"
                          min={1}
                          max={480}
                          placeholder="padrão do médico"
                          className="w-36"
                          value={novo.intervalo_min}
                          onChange={(e) => setNovo({ ...novo, intervalo_min: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Vigência de</label>
                        <Input
                          type="date"
                          className="w-40"
                          value={novo.vigencia_inicio}
                          onChange={(e) => setNovo({ ...novo, vigencia_inicio: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">até</label>
                        <Input
                          type="date"
                          className="w-40"
                          value={novo.vigencia_fim}
                          onChange={(e) => setNovo({ ...novo, vigencia_fim: e.target.value })}
                        />
                      </div>
                      <Button
                        onClick={() => {
                          setNovo({ ...novo, medico_id: m.id });
                          void adicionar();
                        }}
                      >
                        <Plus className="h-4 w-4 mr-1" /> Adicionar
                      </Button>
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
                            {ds.map((d) =>
                              dispEditando === d.id && editRow ? (
                                <TableRow key={d.id} className="bg-muted/40">
                                  <TableCell className="uppercase text-sm text-muted-foreground">
                                    {agendasMed.find((a) => a.id === d.agenda_id)?.nome ?? "—"}
                                  </TableCell>
                                  <TableCell>
                                    <Select
                                      value={editRow.dia_semana}
                                      onValueChange={(v) =>
                                        setEditRow({ ...editRow, dia_semana: v })
                                      }
                                    >
                                      <SelectTrigger className="w-24">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {DIAS.map((dn, i) => (
                                          <SelectItem key={i} value={String(i)}>
                                            {dn}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </TableCell>
                                  <TableCell>
                                    <Input
                                      type="time"
                                      className="w-28"
                                      value={editRow.hora_inicio}
                                      onChange={(e) =>
                                        setEditRow({ ...editRow, hora_inicio: e.target.value })
                                      }
                                    />
                                  </TableCell>
                                  <TableCell>
                                    <Input
                                      type="time"
                                      className="w-28"
                                      value={editRow.hora_fim}
                                      onChange={(e) =>
                                        setEditRow({ ...editRow, hora_fim: e.target.value })
                                      }
                                    />
                                  </TableCell>
                                  <TableCell>
                                    <Input
                                      type="number"
                                      min={1}
                                      placeholder="sem limite"
                                      className="w-28"
                                      value={editRow.limite_pacientes}
                                      onChange={(e) =>
                                        setEditRow({ ...editRow, limite_pacientes: e.target.value })
                                      }
                                    />
                                  </TableCell>
                                  <TableCell>
                                    <Input
                                      type="number"
                                      min={1}
                                      max={480}
                                      placeholder="padrão"
                                      className="w-28"
                                      value={editRow.intervalo_min}
                                      onChange={(e) =>
                                        setEditRow({ ...editRow, intervalo_min: e.target.value })
                                      }
                                    />
                                  </TableCell>
                                  <TableCell>
                                    <div className="flex gap-1">
                                      <Input
                                        type="date"
                                        className="w-36"
                                        value={editRow.vigencia_inicio}
                                        onChange={(e) =>
                                          setEditRow({
                                            ...editRow,
                                            vigencia_inicio: e.target.value,
                                          })
                                        }
                                      />
                                      <Input
                                        type="date"
                                        className="w-36"
                                        value={editRow.vigencia_fim}
                                        onChange={(e) =>
                                          setEditRow({ ...editRow, vigencia_fim: e.target.value })
                                        }
                                      />
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <div className="flex justify-end gap-2">
                                      <Button size="sm" onClick={() => void salvarEdicao()}>
                                        Salvar
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => {
                                          setDispEditando(null);
                                          setEditRow(null);
                                        }}
                                      >
                                        Cancelar
                                      </Button>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              ) : (
                                <TableRow key={d.id}>
                                  <TableCell className="uppercase text-sm">
                                    {agendasMed.find((a) => a.id === d.agenda_id)?.nome ?? "—"}
                                  </TableCell>
                                  <TableCell className="font-medium">
                                    {DIAS[d.dia_semana]}
                                  </TableCell>
                                  <TableCell>{d.hora_inicio.slice(0, 5)}</TableCell>
                                  <TableCell>{d.hora_fim.slice(0, 5)}</TableCell>
                                  <TableCell>
                                    {d.limite_pacientes ?? (
                                      <span className="text-muted-foreground">—</span>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    {d.intervalo_min ? (
                                      `${d.intervalo_min} min`
                                    ) : (
                                      <span className="text-muted-foreground">—</span>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-xs text-muted-foreground">
                                    {d.vigencia_inicio || d.vigencia_fim ? (
                                      `${d.vigencia_inicio ? d.vigencia_inicio.split("-").reverse().join("/") : "—"} a ${d.vigencia_fim ? d.vigencia_fim.split("-").reverse().join("/") : "—"}`
                                    ) : (
                                      <span className="text-muted-foreground">sempre</span>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <div className="flex justify-end gap-2">
                                      <button
                                        onClick={() => {
                                          setDispEditando(d.id);
                                          setEditRow({
                                            dia_semana: String(d.dia_semana),
                                            hora_inicio: d.hora_inicio.slice(0, 5),
                                            hora_fim: d.hora_fim.slice(0, 5),
                                            limite_pacientes: d.limite_pacientes
                                              ? String(d.limite_pacientes)
                                              : "",
                                            intervalo_min: d.intervalo_min
                                              ? String(d.intervalo_min)
                                              : "",
                                            vigencia_inicio: d.vigencia_inicio ?? "",
                                            vigencia_fim: d.vigencia_fim ?? "",
                                          });
                                        }}
                                        className="text-primary hover:opacity-70"
                                        aria-label="Editar"
                                      >
                                        <Pencil className="h-4 w-4" />
                                      </button>
                                      <button
                                        onClick={() => remover(d.id)}
                                        className="text-destructive hover:opacity-70"
                                        aria-label="Remover"
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </button>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              ),
                            )}
                          </TableBody>
                        </Table>
                      )}
                    </CardContent>
                  </Card>
                </div>
              );
            })()
          )}
        </TabsContent>

        <TabsContent value="enfermagem" className="space-y-6">
          <EnfermagemRecursosHorariosEditor />
        </TabsContent>
      </Tabs>
    </div>
  );
}