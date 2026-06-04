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
import { EnfermagemGerarAgendaCard, EnfermagemRecursosHorariosEditor } from "@/components/enfermagem-horarios-parts";

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

interface Disp { id: string; medico_id: string; dia_semana: number; hora_inicio: string; hora_fim: string; observacoes: string | null; limite_pacientes: number | null; intervalo_min: number | null }
interface Medico { id: string; nome: string; duracao_consulta_min: number | null; procedimento_padrao_id: string | null; procedimento_padrao_nome: string | null; especialidade_nome: string | null }

function Page() {
  const { clinicaAtual } = useClinica();
  const [medicos, setMedicos] = useState<Medico[]>([]);
  const [disps, setDisps] = useState<Disp[]>([]);
  const [filtro, setFiltro] = useState("");
  const [novo, setNovo] = useState({ medico_id: "", dia_semana: "1", hora_inicio: "08:00", hora_fim: "12:00", limite_pacientes: "", intervalo_min: "" });
  const hojeIso = new Date().toISOString().slice(0, 10);
  const em30Iso = (() => { const d = new Date(); d.setDate(d.getDate() + 29); return d.toISOString().slice(0, 10); })();
  const [gerar, setGerar] = useState({ medico_id: "all", dias: "30", data_inicio: hojeIso, data_fim: em30Iso, limite_fichas: "" });
  const [gerando, setGerando] = useState(false);
  const [medicoEditando, setMedicoEditando] = useState<string | null>(null);
  const [dispEditando, setDispEditando] = useState<string | null>(null);

  const load = async () => {
    if (!clinicaAtual) return;
    const [m, d] = await Promise.all([
      supabase.from("medicos").select("id, nome, duracao_consulta_min, procedimento_padrao_id, procedimento:procedimentos!medicos_procedimento_padrao_id_fkey(nome), especialidade:especialidades!medicos_especialidade_id_fkey(nome)" as never).eq("clinica_id", clinicaAtual.clinica_id).eq("ativo", true).order("nome"),
      supabase.from("medico_disponibilidades").select("id, medico_id, dia_semana, hora_inicio, hora_fim, observacoes, limite_pacientes, intervalo_min" as never).eq("clinica_id", clinicaAtual.clinica_id).eq("ativo", true).order("dia_semana").order("hora_inicio"),
    ]);
    type RawMedico = { id: string; nome: string; duracao_consulta_min: number | null; procedimento_padrao_id: string | null; procedimento?: { nome: string | null } | null; especialidade?: { nome: string | null } | null };
    const rawList = ((m.data as unknown) as RawMedico[]) ?? [];
    setMedicos(rawList.map((r) => ({
      id: r.id,
      nome: r.nome,
      duracao_consulta_min: r.duracao_consulta_min,
      procedimento_padrao_id: r.procedimento_padrao_id,
      procedimento_padrao_nome: r.procedimento?.nome ?? null,
      especialidade_nome: r.especialidade?.nome ?? null,
    })));
    setDisps(((d.data as unknown) as Disp[]) ?? []);
  };

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [clinicaAtual?.clinica_id]);

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

  const adicionar = async () => {
    if (!clinicaAtual || !novo.medico_id) { toast.error("Selecione um médico"); return; }
    const payload = {
      clinica_id: clinicaAtual.clinica_id,
      medico_id: novo.medico_id,
      dia_semana: parseInt(novo.dia_semana),
      hora_inicio: novo.hora_inicio,
      hora_fim: novo.hora_fim,
      limite_pacientes: novo.limite_pacientes ? parseInt(novo.limite_pacientes) : null,
      intervalo_min: novo.intervalo_min ? parseInt(novo.intervalo_min) : null,
    };
    if (dispEditando) {
      const { error } = await supabase.from("medico_disponibilidades").update(payload as never).eq("id", dispEditando);
      if (error) { toast.error(error.message); return; }
      toast.success("Horário atualizado");
      setDispEditando(null);
    } else {
      const { error } = await supabase.from("medico_disponibilidades").insert(payload as never);
      if (error) { toast.error(error.message); return; }
      toast.success("Horário adicionado");
    }
    void load();
  };

  const remover = async (id: string) => {
    const { error } = await supabase.from("medico_disponibilidades").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    setDisps((xs) => xs.filter((x) => x.id !== id));
  };

  // Pré-visualização dos slots gerados
  const slotsPreview = useMemo(() => {
    if (!gerar.data_inicio || !gerar.data_fim) return [] as { data: string; medico: string; inicio: string; fim: string }[];
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
        const fallbackDur = m.duracao_consulta_min && m.duracao_consulta_min > 0 ? m.duracao_consulta_min : 15;
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
          const dur = disp.intervalo_min && disp.intervalo_min > 0 ? disp.intervalo_min : fallbackDur;
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
      const medicoByNome = new Map(medicos.map((m) => [m.nome, m]));
      const rows = slotsPreview.map((s) => {
        const inicio = new Date(`${s.data}T${s.inicio}:00`);
        const fim = new Date(`${s.data}T${s.fim}:00`);
        const med = medicoByNome.get(s.medico)!;
        const procedimento = med.procedimento_padrao_nome || med.especialidade_nome || null;
        return {
          clinica_id: clinicaAtual.clinica_id,
          medico_id: med.id,
          paciente_nome: "DISPONÍVEL",
          inicio: inicio.toISOString(),
          fim: fim.toISOString(),
          status: "agendado" as const,
          observacoes: "Slot gerado automaticamente",
          ...(procedimento ? { procedimento } : {}),
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

          <EnfermagemGerarAgendaCard />
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
                    <div>
                      <label className="text-xs text-muted-foreground">Intervalo (min)</label>
                      <Input type="number" min={1} max={480} placeholder="padrão do médico" className="w-36" value={novo.intervalo_min} onChange={(e) => setNovo({ ...novo, intervalo_min: e.target.value })} />
                    </div>
                    <Button onClick={() => { setNovo({ ...novo, medico_id: m.id }); void adicionar(); }}>
                      {dispEditando ? (<><Pencil className="h-4 w-4 mr-1" /> Salvar</>) : (<><Plus className="h-4 w-4 mr-1" /> Adicionar</>)}
                    </Button>
                    {dispEditando ? (
                      <Button variant="ghost" onClick={() => { setDispEditando(null); setNovo({ ...novo, dia_semana: "1", hora_inicio: "08:00", hora_fim: "12:00", limite_pacientes: "", intervalo_min: "" }); }}>
                        Cancelar
                      </Button>
                    ) : null}
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
                            <TableHead>Dia</TableHead>
                            <TableHead>Início</TableHead>
                            <TableHead>Fim</TableHead>
                            <TableHead>Pacientes/dia</TableHead>
                            <TableHead>Intervalo</TableHead>
                            <TableHead className="w-28 text-right">Ações</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {ds.map((d) => (
                            <TableRow key={d.id} className={dispEditando === d.id ? "bg-muted/40" : ""}>
                              <TableCell className="font-medium">{DIAS[d.dia_semana]}</TableCell>
                              <TableCell>{d.hora_inicio.slice(0, 5)}</TableCell>
                              <TableCell>{d.hora_fim.slice(0, 5)}</TableCell>
                              <TableCell>{d.limite_pacientes ?? <span className="text-muted-foreground">—</span>}</TableCell>
                              <TableCell>{d.intervalo_min ? `${d.intervalo_min} min` : <span className="text-muted-foreground">—</span>}</TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-2">
                                  <button
                                    onClick={() => {
                                      setDispEditando(d.id);
                                      setNovo({
                                        medico_id: d.medico_id,
                                        dia_semana: String(d.dia_semana),
                                        hora_inicio: d.hora_inicio.slice(0, 5),
                                        hora_fim: d.hora_fim.slice(0, 5),
                                        limite_pacientes: d.limite_pacientes ? String(d.limite_pacientes) : "",
                                        intervalo_min: d.intervalo_min ? String(d.intervalo_min) : "",
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
                                </div>
                              </TableCell>
                            </TableRow>
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

        <TabsContent value="enfermagem" className="space-y-6">
          <EnfermagemRecursosHorariosEditor />
        </TabsContent>
      </Tabs>
    </div>
  );
}
