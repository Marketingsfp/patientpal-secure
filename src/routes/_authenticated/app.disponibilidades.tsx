import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Trash2, Plus, CalendarRange, Pencil, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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

interface Disp { id: string; medico_id: string; dia_semana: number; hora_inicio: string; hora_fim: string; observacoes: string | null; limite_pacientes: number | null }
interface Medico { id: string; nome: string }

function Page() {
  const { clinicaAtual } = useClinica();
  const [medicos, setMedicos] = useState<Medico[]>([]);
  const [disps, setDisps] = useState<Disp[]>([]);
  const [filtro, setFiltro] = useState("");
  const [novo, setNovo] = useState({ medico_id: "", dia_semana: "1", hora_inicio: "08:00", hora_fim: "12:00", limite_pacientes: "" });
  const hojeIso = new Date().toISOString().slice(0, 10);
  const em30Iso = (() => { const d = new Date(); d.setDate(d.getDate() + 29); return d.toISOString().slice(0, 10); })();
  const [gerar, setGerar] = useState({ medico_id: "all", duracao: "5", dias: "30", data_inicio: hojeIso, data_fim: em30Iso, limite_fichas: "" });
  const [gerando, setGerando] = useState(false);
  const [medicoEditando, setMedicoEditando] = useState<string | null>(null);

  const load = async () => {
    if (!clinicaAtual) return;
    const [m, d] = await Promise.all([
      supabase.from("medicos").select("id, nome").eq("clinica_id", clinicaAtual.clinica_id).eq("ativo", true).order("nome"),
      supabase.from("medico_disponibilidades").select("id, medico_id, dia_semana, hora_inicio, hora_fim, observacoes, limite_pacientes" as never).eq("clinica_id", clinicaAtual.clinica_id).eq("ativo", true).order("dia_semana").order("hora_inicio"),
    ]);
    setMedicos(m.data ?? []);
    setDisps(((d.data as unknown) as Disp[]) ?? []);
  };

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [clinicaAtual?.clinica_id]);

  const adicionar = async () => {
    if (!clinicaAtual || !novo.medico_id) { toast.error("Selecione um médico"); return; }
    const { error } = await supabase.from("medico_disponibilidades").insert({
      clinica_id: clinicaAtual.clinica_id,
      medico_id: novo.medico_id,
      dia_semana: parseInt(novo.dia_semana),
      hora_inicio: novo.hora_inicio,
      hora_fim: novo.hora_fim,
      limite_pacientes: novo.limite_pacientes ? parseInt(novo.limite_pacientes) : null,
    } as never);
    if (error) { toast.error(error.message); return; }
    toast.success("Horário adicionado");
    void load();
  };

  const remover = async (id: string) => {
    const { error } = await supabase.from("medico_disponibilidades").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    setDisps((xs) => xs.filter((x) => x.id !== id));
  };

  // Pré-visualização dos slots gerados
  const slotsPreview = useMemo(() => {
    const dur = parseInt(gerar.duracao);
    if (!dur || !gerar.data_inicio || !gerar.data_fim) return [] as { data: string; medico: string; inicio: string; fim: string }[];
    const ini = new Date(`${gerar.data_inicio}T00:00:00`);
    const fimD = new Date(`${gerar.data_fim}T00:00:00`);
    if (fimD < ini) return [];
    const dias = Math.floor((fimD.getTime() - ini.getTime()) / 86400000) + 1;
    const alvo = gerar.medico_id === "all" ? medicos : medicos.filter((m) => m.id === gerar.medico_id);
    const out: { data: string; medico: string; inicio: string; fim: string }[] = [];
    for (let i = 0; i < dias; i++) {
      const d = new Date(ini); d.setDate(d.getDate() + i);
      if (isFeriadoOuDomingo(d)) continue;
      const dow = d.getDay();
      for (const m of alvo) {
        const ds = disps.filter((x) => x.medico_id === m.id && x.dia_semana === dow);
        // Limite diário: override manual do formulário; senão soma das janelas cadastradas
        const overrideLimite = gerar.limite_fichas ? parseInt(gerar.limite_fichas) : 0;
        let limiteDia: number;
        if (overrideLimite > 0) {
          limiteDia = overrideLimite;
        } else {
          const limitesDoDia = ds.map((x) => x.limite_pacientes).filter((n): n is number => typeof n === "number" && n > 0);
          limiteDia = limitesDoDia.length > 0 ? limitesDoDia.reduce((a, b) => a + b, 0) : Infinity;
        }
        let criadosNoDia = 0;
        for (const disp of ds) {
          const [hi, mi] = disp.hora_inicio.split(":").map(Number);
          const [hf, mf] = disp.hora_fim.split(":").map(Number);
          let cur = hi * 60 + mi;
          const end = hf * 60 + mf;
          while (cur + dur <= end && criadosNoDia < limiteDia) {
            const inicio = `${String(Math.floor(cur / 60)).padStart(2, "0")}:${String(cur % 60).padStart(2, "0")}`;
            const fimMin = cur + dur;
            const fim = `${String(Math.floor(fimMin / 60)).padStart(2, "0")}:${String(fimMin % 60).padStart(2, "0")}`;
            out.push({ data: d.toISOString().slice(0, 10), medico: m.nome, inicio, fim });
            cur += dur;
            criadosNoDia += 1;
          }
        }
      }
    }
    return out;
  }, [gerar, medicos, disps]);

  if (!clinicaAtual) return <p className="text-muted-foreground">Selecione uma clínica.</p>;

  const medicosFiltrados = medicos
    .filter((m) => !filtro || m.nome.toLowerCase().includes(filtro.toLowerCase()))
    .slice()
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }));

  const gerarAgenda = async () => {
    if (!clinicaAtual) return;
    if (slotsPreview.length === 0) { toast.error("Sem horários para gerar"); return; }
    if (!confirm(`Confirmar criação de ${slotsPreview.length} horários disponíveis?`)) return;
    setGerando(true);
    try {
      const medicoIdByNome = new Map(medicos.map((m) => [m.nome, m.id]));
      const rows = slotsPreview.map((s) => {
        const inicio = new Date(`${s.data}T${s.inicio}:00`);
        const fim = new Date(`${s.data}T${s.fim}:00`);
        return {
          clinica_id: clinicaAtual.clinica_id,
          medico_id: medicoIdByNome.get(s.medico)!,
          paciente_nome: "DISPONÍVEL",
          inicio: inicio.toISOString(),
          fim: fim.toISOString(),
          status: "agendado" as const,
          observacoes: "Slot gerado automaticamente",
        };
      });
      // Inserir em lotes de 500
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await supabase.from("agendamentos").insert(rows.slice(i, i + 500));
        if (error) throw error;
      }
      toast.success(`${rows.length} horários criados`);
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao gerar agenda");
    } finally {
      setGerando(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Horários médicos</h1>
        <p className="text-sm text-muted-foreground">Disponibilidade semanal por médico — {clinicaAtual.clinica.nome}</p>
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
                <h2 className="font-semibold">Gerar agenda</h2>
              </div>
              <p className="text-xs text-muted-foreground">
                Cria automaticamente slots de horários disponíveis com base na disponibilidade semanal dos médicos.
              </p>
              <div className="flex flex-wrap gap-2 items-end">
                <div className="flex-1 min-w-48">
                  <label className="text-xs text-muted-foreground">Médico</label>
                  <Select value={gerar.medico_id} onValueChange={(v) => setGerar({ ...gerar, medico_id: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os médicos</SelectItem>
                      {medicos.map((m) => <SelectItem key={m.id} value={m.id} className="uppercase">{m.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Duração (min)</label>
                  <Select value={gerar.duracao} onValueChange={(v) => setGerar({ ...gerar, duracao: v })}>
                    <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["5", "10", "15", "20", "30", "40", "45", "60"].map((v) => <SelectItem key={v} value={v}>{v} min</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">De</label>
                  <Input type="date" className="w-40" value={gerar.data_inicio} onChange={(e) => setGerar({ ...gerar, data_inicio: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Até</label>
                  <Input type="date" className="w-40" value={gerar.data_fim} onChange={(e) => setGerar({ ...gerar, data_fim: e.target.value })} />
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
                <Button onClick={gerarAgenda} disabled={gerando || slotsPreview.length === 0}>
                  <CalendarRange className="h-4 w-4 mr-1" />
                  {gerando ? "Gerando..." : `Gerar ${slotsPreview.length} slots`}
                </Button>
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
              <Input placeholder="Filtrar médicos..." value={filtro} onChange={(e) => setFiltro(e.target.value)} className="max-w-sm" />
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Médico</TableHead>
                        <TableHead className="w-32 text-center">Horários</TableHead>
                        <TableHead className="w-24 text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {medicosFiltrados.map((m) => {
                        const ds = disps.filter((d) => d.medico_id === m.id);
                        return (
                          <TableRow key={m.id}>
                            <TableCell className="font-medium uppercase">{m.nome}</TableCell>
                            <TableCell className="text-center text-sm text-muted-foreground">{ds.length}</TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => { setMedicoEditando(m.id); setNovo({ ...novo, medico_id: m.id }); }}
                                aria-label="Editar horários"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {medicosFiltrados.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center text-sm text-muted-foreground py-6">
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
            const ds = disps.filter((d) => d.medico_id === m.id);
            return (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Button variant="ghost" size="sm" onClick={() => setMedicoEditando(null)}>
                    <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
                  </Button>
                  <h2 className="text-lg font-semibold uppercase">{m.nome}</h2>
                  <span className="text-xs text-muted-foreground">· {ds.length} horário(s)</span>
                </div>

                <Card>
                  <CardContent className="py-4 flex flex-wrap gap-2 items-end">
                    <div>
                      <label className="text-xs text-muted-foreground">Dia</label>
                      <Select value={novo.dia_semana} onValueChange={(v) => setNovo({ ...novo, dia_semana: v })}>
                        <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                        <SelectContent>{DIAS.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}</SelectContent>
                      </Select>
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
                    <Button onClick={() => { setNovo({ ...novo, medico_id: m.id }); void adicionar(); }}>
                      <Plus className="h-4 w-4 mr-1" /> Adicionar
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="py-3">
                    {ds.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Sem horários cadastrados.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {ds.map((d) => (
                          <div key={d.id} className="flex items-center gap-2 border rounded-md px-2 py-1 text-sm bg-muted/40">
                            <span className="font-medium">{DIAS[d.dia_semana]}</span>
                            <span>{d.hora_inicio.slice(0, 5)}–{d.hora_fim.slice(0, 5)}</span>
                            {d.limite_pacientes ? (
                              <span className="text-xs text-primary font-medium">· {d.limite_pacientes} pac/dia</span>
                            ) : null}
                            <button onClick={() => remover(d.id)} className="text-destructive hover:opacity-70" aria-label="Remover">
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            );
          })()}
        </TabsContent>
      </Tabs>
    </div>
  );
}
