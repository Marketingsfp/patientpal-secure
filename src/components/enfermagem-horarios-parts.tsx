import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, CalendarRange, ArrowLeft, Pencil, Check, X } from "lucide-react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const FERIADOS_FIXOS = new Set<string>([
  "01-01",
  "04-21",
  "05-01",
  "09-07",
  "10-12",
  "11-02",
  "11-15",
  "11-20",
  "12-25",
]);
function isFeriadoOuDomingo(d: Date): boolean {
  if (d.getDay() === 0) return true;
  const mmdd = `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return FERIADOS_FIXOS.has(mmdd);
}

export type EnfRecurso = { id: string; nome: string; duracao_padrao_min: number };
export type EnfDisp = {
  id: string;
  recurso_id: string;
  dia_semana: number;
  hora_inicio: string;
  hora_fim: string;
  limite_pacientes: number | null;
  intervalo_min: number | null;
};

export function useEnfermagemHorariosData() {
  const { clinicaAtual } = useClinica();
  const [recursos, setRecursos] = useState<EnfRecurso[]>([]);
  const [disps, setDisps] = useState<EnfDisp[]>([]);

  const load = async () => {
    if (!clinicaAtual) return;
    const [r, d] = await Promise.all([
      supabase
        .from("enfermagem_recursos")
        .select("id, nome, duracao_padrao_min")
        .eq("clinica_id", clinicaAtual.clinica_id)
        .eq("ativo", true)
        .order("nome"),
      supabase
        .from("enfermagem_recurso_disponibilidades")
        .select(
          "id, recurso_id, dia_semana, hora_inicio, hora_fim, limite_pacientes, intervalo_min",
        )
        .eq("clinica_id", clinicaAtual.clinica_id)
        .eq("ativo", true)
        .order("dia_semana")
        .order("hora_inicio"),
    ]);
    setRecursos((r.data as EnfRecurso[]) ?? []);
    setDisps((d.data as EnfDisp[]) ?? []);
  };
  useEffect(() => {
    void load(); /* eslint-disable-next-line */
  }, [clinicaAtual?.clinica_id]);

  return { clinicaAtual, recursos, disps, setDisps, reload: load };
}

export function EnfermagemGerarAgendaCard() {
  const { clinicaAtual, recursos, disps } = useEnfermagemHorariosData();
  const hojeIso = new Date().toISOString().slice(0, 10);
  const em30Iso = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 29);
    return d.toISOString().slice(0, 10);
  })();
  const [gerar, setGerar] = useState({
    recurso_id: "all",
    data_inicio: hojeIso,
    data_fim: em30Iso,
    limite_fichas: "",
    hora_inicio: "",
    hora_fim: "",
    intervalo_min: "",
  });
  const [gerarDias, setGerarDias] = useState<number[]>([1, 2, 3, 4, 5, 6]);
  const [gerando, setGerando] = useState(false);

  const slotsPreview = useMemo(() => {
    if (!gerar.data_inicio || !gerar.data_fim)
      return [] as {
        data: string;
        recurso_id: string;
        recurso: string;
        inicio: string;
        fim: string;
      }[];
    const ini = new Date(`${gerar.data_inicio}T00:00:00`);
    const fimD = new Date(`${gerar.data_fim}T00:00:00`);
    if (fimD < ini) return [];
    const dias = Math.floor((fimD.getTime() - ini.getTime()) / 86400000) + 1;
    const alvo =
      gerar.recurso_id === "all" ? recursos : recursos.filter((r) => r.id === gerar.recurso_id);
    const out: {
      data: string;
      recurso_id: string;
      recurso: string;
      inicio: string;
      fim: string;
    }[] = [];
    for (let i = 0; i < dias; i++) {
      const d = new Date(ini);
      d.setDate(d.getDate() + i);
      if (isFeriadoOuDomingo(d)) continue;
      const dow = d.getDay();
      if (!gerarDias.includes(dow)) continue;
      for (const r of alvo) {
        const baseDs = disps.filter((x) => x.recurso_id === r.id && x.dia_semana === dow);
        const fallbackDur =
          r.duracao_padrao_min && r.duracao_padrao_min > 0 ? r.duracao_padrao_min : 30;
        const overrideIni = gerar.hora_inicio || "";
        const overrideFim = gerar.hora_fim || "";
        const overrideIntervalo = gerar.intervalo_min ? parseInt(gerar.intervalo_min) : 0;
        const ds = baseDs
          .map((x) => ({
            ...x,
            hora_inicio: overrideIni && overrideIni > x.hora_inicio ? overrideIni : x.hora_inicio,
            hora_fim: overrideFim && overrideFim < x.hora_fim ? overrideFim : x.hora_fim,
          }))
          .filter((x) => x.hora_inicio < x.hora_fim);
        const override = gerar.limite_fichas ? parseInt(gerar.limite_fichas) : 0;
        let limiteDia: number;
        if (override > 0) limiteDia = override;
        else {
          const ls = ds
            .map((x) => x.limite_pacientes)
            .filter((n): n is number => typeof n === "number" && n > 0);
          limiteDia = ls.length > 0 ? ls.reduce((a, b) => a + b, 0) : Infinity;
        }
        let criados = 0;
        for (const disp of ds) {
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
          while (cur + dur <= end && criados < limiteDia) {
            const hh = (n: number) =>
              String(Math.floor(n / 60)).padStart(2, "0") + ":" + String(n % 60).padStart(2, "0");
            out.push({
              data: d.toISOString().slice(0, 10),
              recurso_id: r.id,
              recurso: r.nome,
              inicio: hh(cur),
              fim: hh(cur + dur),
            });
            cur += dur;
            criados += 1;
          }
        }
      }
    }
    return out;
  }, [gerar, gerarDias, recursos, disps]);

  const gerarAgenda = async () => {
    if (!clinicaAtual) return;
    if (slotsPreview.length === 0) {
      toast.error("Sem horários para gerar");
      return;
    }
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
        const { error } = await supabase
          .from("agendamentos")
          .insert(rows.slice(i, i + 500) as never);
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
    <Card className="border-primary/30">
      <CardContent className="py-4 space-y-3">
        <div className="flex items-center gap-2">
          <CalendarRange className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">Gerar agenda - Enfermagem</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Cria automaticamente os slots disponíveis na agenda dos recursos de enfermagem.
        </p>
        <div className="flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-48">
            <label className="text-xs text-muted-foreground">Recurso</label>
            <Select
              value={gerar.recurso_id}
              onValueChange={(v) => setGerar({ ...gerar, recurso_id: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os recursos</SelectItem>
                {recursos.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
              placeholder="padrão"
              className="w-32"
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
                      xs.includes(i) ? xs.filter((x) => x !== i) : [...xs, i].sort((a, b) => a - b),
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
      </CardContent>
    </Card>
  );
}

export function EnfermagemRecursosHorariosEditor() {
  const { recursos, disps, setDisps, reload } = useEnfermagemHorariosData();
  const [filtro, setFiltro] = useState("");
  const [editandoRecurso, setEditandoRecurso] = useState<string | null>(null);
  const [dispEditando, setDispEditando] = useState<string | null>(null);
  const [renomeandoId, setRenomeandoId] = useState<string | null>(null);
  const [novoNome, setNovoNome] = useState("");
  const [salvandoNome, setSalvandoNome] = useState(false);
  const [novo, setNovo] = useState({
    recurso_id: "",
    dia_semana: "1",
    hora_inicio: "08:00",
    hora_fim: "12:00",
    limite_pacientes: "",
    intervalo_min: "",
  });

  const iniciarRename = (id: string, nome: string) => {
    setRenomeandoId(id);
    setNovoNome(nome);
  };
  const salvarNome = async () => {
    const nome = novoNome.trim();
    if (!renomeandoId) return;
    if (!nome) {
      toast.error("Informe um nome");
      return;
    }
    setSalvandoNome(true);
    const { error } = await supabase
      .from("enfermagem_recursos")
      .update({ nome })
      .eq("id", renomeandoId);
    setSalvandoNome(false);
    if (error) {
      mostrarErro(error);
      return;
    }
    toast.success("Nome atualizado");
    setRenomeandoId(null);
    void reload();
  };

  const adicionar = async () => {
    if (!novo.recurso_id) {
      toast.error("Selecione um recurso");
      return;
    }
    const payload = {
      recurso_id: novo.recurso_id,
      dia_semana: parseInt(novo.dia_semana),
      hora_inicio: novo.hora_inicio,
      hora_fim: novo.hora_fim,
      limite_pacientes: novo.limite_pacientes ? parseInt(novo.limite_pacientes) : null,
      intervalo_min: novo.intervalo_min ? parseInt(novo.intervalo_min) : null,
    };
    if (dispEditando) {
      const { error } = await supabase
        .from("enfermagem_recurso_disponibilidades")
        .update(payload)
        .eq("id", dispEditando);
      if (error) {
        mostrarErro(error);
        return;
      }
      toast.success("Horário atualizado");
      setDispEditando(null);
    } else {
      // need clinica_id on insert
      const r = recursos.find((x) => x.id === novo.recurso_id);
      if (!r) return;
      const { data: rec } = await supabase
        .from("enfermagem_recursos")
        .select("clinica_id")
        .eq("id", r.id)
        .single();
      if (!rec) {
        toast.error("Recurso não encontrado");
        return;
      }
      const { error } = await supabase
        .from("enfermagem_recurso_disponibilidades")
        .insert({ ...payload, clinica_id: (rec as any).clinica_id });
      if (error) {
        mostrarErro(error);
        return;
      }
      toast.success("Horário adicionado");
    }
    void reload();
  };

  const remover = async (id: string) => {
    const { error } = await supabase
      .from("enfermagem_recurso_disponibilidades")
      .delete()
      .eq("id", id);
    if (error) {
      mostrarErro(error);
      return;
    }
    setDisps((xs) => xs.filter((x) => x.id !== id));
  };

  const recursosFiltrados = recursos
    .filter((r) => !filtro || r.nome.toLowerCase().includes(filtro.toLowerCase()))
    .slice()
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }));

  if (editandoRecurso === null) {
    return (
      <div className="space-y-4">
        <Input
          placeholder="Filtrar..."
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          className="max-w-sm"
        />
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
                      <TableCell className="font-medium">
                        {renomeandoId === r.id ? (
                          <div className="flex items-center gap-1">
                            <Input
                              autoFocus
                              value={novoNome}
                              onChange={(e) => setNovoNome(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") void salvarNome();
                                if (e.key === "Escape") setRenomeandoId(null);
                              }}
                              className="h-8 max-w-sm"
                            />
                            <Button
                              size="icon"
                              variant="ghost"
                              disabled={salvandoNome}
                              onClick={() => void salvarNome()}
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => setRenomeandoId(null)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          r.nome
                        )}
                      </TableCell>
                      <TableCell className="text-center text-sm text-muted-foreground">
                        {ds.length}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          title="Editar nome e horários"
                          onClick={() => {
                            setEditandoRecurso(r.id);
                            setNovo({ ...novo, recurso_id: r.id });
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {recursosFiltrados.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={3}
                      className="text-center text-sm text-muted-foreground py-6"
                    >
                      Nenhum recurso encontrado. Cadastre em "Enfermagem — Recursos".
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    );
  }

  const r = recursos.find((x) => x.id === editandoRecurso);
  if (!r) {
    setEditandoRecurso(null);
    return null;
  }
  const ds = disps.filter((d) => d.recurso_id === r.id);
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setEditandoRecurso(null);
            setDispEditando(null);
            setRenomeandoId(null);
          }}
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
        </Button>
        {renomeandoId === r.id ? (
          <div className="flex items-center gap-1">
            <Input
              autoFocus
              value={novoNome}
              onChange={(e) => setNovoNome(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void salvarNome();
                if (e.key === "Escape") setRenomeandoId(null);
              }}
              className="h-9 w-72"
            />
            <Button
              size="icon"
              variant="ghost"
              disabled={salvandoNome}
              onClick={() => void salvarNome()}
            >
              <Check className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" onClick={() => setRenomeandoId(null)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <>
            <h2 className="text-lg font-semibold">{r.nome}</h2>
            <Button
              size="icon"
              variant="ghost"
              title="Renomear"
              onClick={() => iniciarRename(r.id, r.nome)}
            >
              <Pencil className="h-4 w-4" />
            </Button>
          </>
        )}
        <span className="text-xs text-muted-foreground">· {ds.length} horário(s)</span>
      </div>
      <Card>
        <CardContent className="py-4 flex flex-wrap gap-2 items-end">
          <div>
            <label className="text-xs text-muted-foreground">Dia</label>
            <Select
              value={novo.dia_semana}
              onValueChange={(v) => setNovo({ ...novo, dia_semana: v })}
            >
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DIAS.map((d, i) => (
                  <SelectItem key={i} value={String(i)}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
              placeholder="padrão do recurso"
              className="w-36"
              value={novo.intervalo_min}
              onChange={(e) => setNovo({ ...novo, intervalo_min: e.target.value })}
            />
          </div>
          <Button
            onClick={() => {
              setNovo({ ...novo, recurso_id: r.id });
              void adicionar();
            }}
          >
            {dispEditando ? (
              <>
                <Pencil className="h-4 w-4 mr-1" /> Salvar
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 mr-1" /> Adicionar
              </>
            )}
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
                <TableHead>Intervalo</TableHead>
                <TableHead className="w-24 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ds.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">
                    Nenhum horário cadastrado.
                  </TableCell>
                </TableRow>
              ) : (
                ds.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>{DIAS[d.dia_semana]}</TableCell>
                    <TableCell>{d.hora_inicio.slice(0, 5)}</TableCell>
                    <TableCell>{d.hora_fim.slice(0, 5)}</TableCell>
                    <TableCell>{d.limite_pacientes ?? "—"}</TableCell>
                    <TableCell>{d.intervalo_min ? `${d.intervalo_min} min` : "—"}</TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          setDispEditando(d.id);
                          setNovo({
                            recurso_id: r.id,
                            dia_semana: String(d.dia_semana),
                            hora_inicio: d.hora_inicio.slice(0, 5),
                            hora_fim: d.hora_fim.slice(0, 5),
                            limite_pacientes: d.limite_pacientes ? String(d.limite_pacientes) : "",
                            intervalo_min: d.intervalo_min ? String(d.intervalo_min) : "",
                          });
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => void remover(d.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
