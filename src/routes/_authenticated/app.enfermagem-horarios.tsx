import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, CalendarRange, ArrowLeft, Pencil, HeartPulse } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/app/enfermagem-horarios")({
  component: Page,
  head: () => ({ meta: [{ title: "Horários — Enfermagem — ClinicaOS" }] }),
});

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const FERIADOS_FIXOS = new Set<string>([
  "01-01","04-21","05-01","09-07","10-12","11-02","11-15","11-20","12-25",
]);
function isFeriadoOuDomingo(d: Date): boolean {
  if (d.getDay() === 0) return true;
  const mmdd = `${String(d.getMonth() + 1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  return FERIADOS_FIXOS.has(mmdd);
}

type Recurso = { id: string; nome: string; duracao_padrao_min: number };
type Disp = {
  id: string; recurso_id: string; dia_semana: number;
  hora_inicio: string; hora_fim: string; limite_pacientes: number | null;
};

function Page() {
  const { clinicaAtual } = useClinica();
  const [recursos, setRecursos] = useState<Recurso[]>([]);
  const [disps, setDisps] = useState<Disp[]>([]);
  const [filtro, setFiltro] = useState("");
  const [editandoRecurso, setEditandoRecurso] = useState<string | null>(null);
  const [dispEditando, setDispEditando] = useState<string | null>(null);
  const [novo, setNovo] = useState({
    recurso_id: "", dia_semana: "1", hora_inicio: "08:00", hora_fim: "12:00", limite_pacientes: "",
  });
  const hojeIso = new Date().toISOString().slice(0, 10);
  const em30Iso = (() => { const d = new Date(); d.setDate(d.getDate() + 29); return d.toISOString().slice(0,10); })();
  const [gerar, setGerar] = useState({ recurso_id: "all", data_inicio: hojeIso, data_fim: em30Iso, limite_fichas: "" });
  const [gerando, setGerando] = useState(false);

  const load = async () => {
    if (!clinicaAtual) return;
    const [r, d] = await Promise.all([
      supabase.from("enfermagem_recursos")
        .select("id, nome, duracao_padrao_min")
        .eq("clinica_id", clinicaAtual.clinica_id).eq("ativo", true).order("nome"),
      supabase.from("enfermagem_recurso_disponibilidades")
        .select("id, recurso_id, dia_semana, hora_inicio, hora_fim, limite_pacientes")
        .eq("clinica_id", clinicaAtual.clinica_id).eq("ativo", true)
        .order("dia_semana").order("hora_inicio"),
    ]);
    setRecursos((r.data as Recurso[]) ?? []);
    setDisps((d.data as Disp[]) ?? []);
  };
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [clinicaAtual?.clinica_id]);

  const adicionar = async () => {
    if (!clinicaAtual || !novo.recurso_id) { toast.error("Selecione um recurso"); return; }
    const payload = {
      clinica_id: clinicaAtual.clinica_id,
      recurso_id: novo.recurso_id,
      dia_semana: parseInt(novo.dia_semana),
      hora_inicio: novo.hora_inicio,
      hora_fim: novo.hora_fim,
      limite_pacientes: novo.limite_pacientes ? parseInt(novo.limite_pacientes) : null,
    };
    if (dispEditando) {
      const { error } = await supabase.from("enfermagem_recurso_disponibilidades")
        .update(payload).eq("id", dispEditando);
      if (error) { toast.error(error.message); return; }
      toast.success("Horário atualizado"); setDispEditando(null);
    } else {
      const { error } = await supabase.from("enfermagem_recurso_disponibilidades").insert(payload);
      if (error) { toast.error(error.message); return; }
      toast.success("Horário adicionado");
    }
    void load();
  };

  const remover = async (id: string) => {
    const { error } = await supabase.from("enfermagem_recurso_disponibilidades").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    setDisps((xs) => xs.filter((x) => x.id !== id));
  };

  const slotsPreview = useMemo(() => {
    if (!gerar.data_inicio || !gerar.data_fim) return [] as { data:string; recurso_id:string; recurso:string; inicio:string; fim:string }[];
    const ini = new Date(`${gerar.data_inicio}T00:00:00`);
    const fimD = new Date(`${gerar.data_fim}T00:00:00`);
    if (fimD < ini) return [];
    const dias = Math.floor((fimD.getTime() - ini.getTime()) / 86400000) + 1;
    const alvo = gerar.recurso_id === "all" ? recursos : recursos.filter((r) => r.id === gerar.recurso_id);
    const out: { data:string; recurso_id:string; recurso:string; inicio:string; fim:string }[] = [];
    for (let i = 0; i < dias; i++) {
      const d = new Date(ini); d.setDate(d.getDate() + i);
      if (isFeriadoOuDomingo(d)) continue;
      const dow = d.getDay();
      for (const r of alvo) {
        const dur = r.duracao_padrao_min && r.duracao_padrao_min > 0 ? r.duracao_padrao_min : 30;
        const ds = disps.filter((x) => x.recurso_id === r.id && x.dia_semana === dow);
        const override = gerar.limite_fichas ? parseInt(gerar.limite_fichas) : 0;
        let limiteDia: number;
        if (override > 0) limiteDia = override;
        else {
          const ls = ds.map((x) => x.limite_pacientes).filter((n): n is number => typeof n === "number" && n > 0);
          limiteDia = ls.length > 0 ? ls.reduce((a,b)=>a+b,0) : Infinity;
        }
        let criados = 0;
        for (const disp of ds) {
          const [hi, mi] = disp.hora_inicio.split(":").map(Number);
          const [hf, mf] = disp.hora_fim.split(":").map(Number);
          let cur = hi*60 + mi; const end = hf*60 + mf;
          while (cur + dur <= end && criados < limiteDia) {
            const hh = (n:number)=>String(Math.floor(n/60)).padStart(2,"0")+":"+String(n%60).padStart(2,"0");
            out.push({ data: d.toISOString().slice(0,10), recurso_id: r.id, recurso: r.nome, inicio: hh(cur), fim: hh(cur+dur) });
            cur += dur; criados += 1;
          }
        }
      }
    }
    return out;
  }, [gerar, recursos, disps]);

  const gerarAgenda = async () => {
    if (!clinicaAtual) return;
    if (slotsPreview.length === 0) { toast.error("Sem horários para gerar"); return; }
    if (!confirm(`Confirmar criação de ${slotsPreview.length} horários disponíveis?`)) return;
    setGerando(true);
    try {
      const rows = slotsPreview.map((s) => ({
        clinica_id: clinicaAtual.clinica_id,
        enfermagem_recurso_id: s.recurso_id,
        paciente_nome: "DISPONÍVEL",
        inicio: new Date(`${s.data}T${s.inicio}:00`).toISOString(),
        fim: new Date(`${s.data}T${s.fim}:00`).toISOString(),
        status: "agendado" as const,
        observacoes: "Slot gerado automaticamente",
      }));
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await supabase.from("agendamentos").insert(rows.slice(i, i + 500) as never);
        if (error) throw error;
      }
      toast.success(`${rows.length} horários criados`);
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao gerar agenda");
    } finally { setGerando(false); }
  };

  if (!clinicaAtual) return <p className="text-muted-foreground">Selecione uma clínica.</p>;

  const recursosFiltrados = recursos
    .filter((r) => !filtro || r.nome.toLowerCase().includes(filtro.toLowerCase()))
    .slice().sort((a,b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <HeartPulse className="h-6 w-6" /> Horários — Enfermagem
        </h1>
        <p className="text-sm text-muted-foreground">
          Disponibilidade semanal por sala/recurso de enfermagem — {clinicaAtual.clinica.nome}
        </p>
      </div>

      <Tabs defaultValue="agendas" className="w-full">
        <TabsList>
          <TabsTrigger value="agendas">Gerar agenda</TabsTrigger>
          <TabsTrigger value="recursos">Recursos</TabsTrigger>
        </TabsList>

        <TabsContent value="agendas" className="space-y-6">
          <Card className="border-primary/30">
            <CardContent className="py-4 space-y-3">
              <div className="flex items-center gap-2">
                <CalendarRange className="h-5 w-5 text-primary" />
                <h2 className="font-semibold">Gerar agenda</h2>
              </div>
              <p className="text-xs text-muted-foreground">
                Cria automaticamente os slots disponíveis na agenda dos recursos de enfermagem.
              </p>
              <div className="flex flex-wrap gap-2 items-end">
                <div className="flex-1 min-w-48">
                  <label className="text-xs text-muted-foreground">Recurso</label>
                  <Select value={gerar.recurso_id} onValueChange={(v) => setGerar({ ...gerar, recurso_id: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os recursos</SelectItem>
                      {recursos.map((r) => <SelectItem key={r.id} value={r.id}>{r.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">De</label>
                  <Input type="date" className="w-40" value={gerar.data_inicio}
                    onChange={(e) => setGerar({ ...gerar, data_inicio: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Até</label>
                  <Input type="date" className="w-40" value={gerar.data_fim}
                    onChange={(e) => setGerar({ ...gerar, data_fim: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Nº de fichas</label>
                  <Input type="number" min={1} placeholder="padrão" className="w-32"
                    value={gerar.limite_fichas}
                    onChange={(e) => setGerar({ ...gerar, limite_fichas: e.target.value })} />
                </div>
                <Button onClick={gerarAgenda} disabled={gerando || slotsPreview.length === 0}>
                  <CalendarRange className="h-4 w-4 mr-1" />
                  {gerando ? "Gerando..." : `Gerar ${slotsPreview.length} slots`}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="recursos" className="space-y-6">
          {editandoRecurso === null ? (
            <>
              <Input placeholder="Filtrar..." value={filtro}
                onChange={(e) => setFiltro(e.target.value)} className="max-w-sm" />
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Recurso</TableHead>
                        <TableHead className="w-32 text-center">Horários</TableHead>
                        <TableHead className="w-24 text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recursosFiltrados.map((r) => {
                        const ds = disps.filter((d) => d.recurso_id === r.id);
                        return (
                          <TableRow key={r.id}>
                            <TableCell className="font-medium">{r.nome}</TableCell>
                            <TableCell className="text-center text-sm text-muted-foreground">{ds.length}</TableCell>
                            <TableCell className="text-right">
                              <Button size="sm" variant="ghost"
                                onClick={() => { setEditandoRecurso(r.id); setNovo({ ...novo, recurso_id: r.id }); }}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {recursosFiltrados.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center text-sm text-muted-foreground py-6">
                            Nenhum recurso encontrado. Cadastre em "Enfermagem — Recursos".
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          ) : (() => {
            const r = recursos.find((x) => x.id === editandoRecurso);
            if (!r) { setEditandoRecurso(null); return null; }
            const ds = disps.filter((d) => d.recurso_id === r.id);
            return (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Button variant="ghost" size="sm" onClick={() => { setEditandoRecurso(null); setDispEditando(null); }}>
                    <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
                  </Button>
                  <h2 className="text-lg font-semibold">{r.nome}</h2>
                  <span className="text-xs text-muted-foreground">· {ds.length} horário(s)</span>
                </div>
                <Card>
                  <CardContent className="py-4 flex flex-wrap gap-2 items-end">
                    <div>
                      <label className="text-xs text-muted-foreground">Dia</label>
                      <Select value={novo.dia_semana} onValueChange={(v) => setNovo({ ...novo, dia_semana: v })}>
                        <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                        <SelectContent>{DIAS.map((d,i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Início</label>
                      <Input type="time" className="w-28" value={novo.hora_inicio}
                        onChange={(e) => setNovo({ ...novo, hora_inicio: e.target.value })} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Fim</label>
                      <Input type="time" className="w-28" value={novo.hora_fim}
                        onChange={(e) => setNovo({ ...novo, hora_fim: e.target.value })} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Pacientes/dia</label>
                      <Input type="number" min={1} placeholder="sem limite" className="w-32"
                        value={novo.limite_pacientes}
                        onChange={(e) => setNovo({ ...novo, limite_pacientes: e.target.value })} />
                    </div>
                    <Button onClick={() => { setNovo({ ...novo, recurso_id: r.id }); void adicionar(); }}>
                      {dispEditando ? (<><Pencil className="h-4 w-4 mr-1" /> Salvar</>) : (<><Plus className="h-4 w-4 mr-1" /> Adicionar</>)}
                    </Button>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Dia</TableHead>
                          <TableHead>Início</TableHead>
                          <TableHead>Fim</TableHead>
                          <TableHead>Pacientes/dia</TableHead>
                          <TableHead className="w-24 text-right">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {ds.length === 0 ? (
                          <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">Nenhum horário cadastrado.</TableCell></TableRow>
                        ) : ds.map((d) => (
                          <TableRow key={d.id}>
                            <TableCell>{DIAS[d.dia_semana]}</TableCell>
                            <TableCell>{d.hora_inicio.slice(0,5)}</TableCell>
                            <TableCell>{d.hora_fim.slice(0,5)}</TableCell>
                            <TableCell>{d.limite_pacientes ?? "—"}</TableCell>
                            <TableCell className="text-right space-x-1">
                              <Button size="icon" variant="ghost" onClick={() => {
                                setDispEditando(d.id);
                                setNovo({
                                  recurso_id: r.id,
                                  dia_semana: String(d.dia_semana),
                                  hora_inicio: d.hora_inicio.slice(0,5),
                                  hora_fim: d.hora_fim.slice(0,5),
                                  limite_pacientes: d.limite_pacientes ? String(d.limite_pacientes) : "",
                                });
                              }}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button size="icon" variant="ghost" onClick={() => void remover(d.id)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
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