import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Trash2, Users, Calendar, Stethoscope, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { criarAtendimentoMultiplo } from "@/lib/atendimento-multiplo/criar.functions";

export const Route = createFileRoute("/_authenticated/app/atendimento-multiplo")({
  component: AtendimentoMultiploPage,
  head: () => ({
    meta: [
      { title: "Atendimento Múltiplo — ClinicaOS" },
      {
        name: "description",
        content:
          "Marque em uma única ficha vários serviços diferentes (consulta, exames de laboratório, RX, ultrassom) para o mesmo paciente.",
      },
    ],
  }),
});

type Paciente = { id: string; nome: string; telefone: string | null; data_nascimento: string | null };
type Medico = { id: string; nome: string };
type Recurso = { id: string; nome: string };
type Procedimento = {
  id: string;
  nome: string;
  valor: number | null;
  duracao_minutos: number | null;
  tipo_procedimento: string | null;
};

type Item = {
  key: string;
  procedimento_id: string | null;
  procedimento_nome: string;
  tipo_procedimento: string | null;
  valor: number;
  duracao: number;
  executor_kind: "medico" | "recurso";
  medico_id: string | null;
  recurso_id: string | null;
  inicio: string; // yyyy-mm-ddThh:mm
  tipo_atendimento: "particular" | "convenio";
};

function novoItem(dataBase: string): Item {
  return {
    key: crypto.randomUUID(),
    procedimento_id: null,
    procedimento_nome: "",
    tipo_procedimento: null,
    valor: 0,
    duracao: 30,
    executor_kind: "medico",
    medico_id: null,
    recurso_id: null,
    inicio: dataBase,
    tipo_atendimento: "particular",
  };
}

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function toIso(local: string) {
  // input datetime-local => ISO
  if (!local) return "";
  const d = new Date(local);
  return d.toISOString();
}

function addMinutes(local: string, minutes: number) {
  if (!local) return "";
  const d = new Date(local);
  d.setMinutes(d.getMinutes() + minutes);
  return d.toISOString();
}

function categoriaLabel(t: string | null | undefined): string {
  const v = (t ?? "").toLowerCase();
  if (v === "laboratorio") return "Laboratório";
  if (v === "imagem" || v === "exame") return "Imagem";
  if (v === "consulta") return "Consulta";
  if (v === "procedimento") return "Procedimento";
  if (v === "cirurgia") return "Cirurgia";
  return "Outro";
}

function AtendimentoMultiploPage() {
  const { clinicaAtual } = useClinica();
  const navigate = useNavigate();
  const criarMultiplo = useServerFn(criarAtendimentoMultiplo);

  const dataInicial = useMemo(() => {
    const d = new Date();
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + 1);
    // Format for datetime-local
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  }, []);

  const [buscaPaciente, setBuscaPaciente] = useState("");
  const [pacientes, setPacientes] = useState<Paciente[]>([]);
  const [paciente, setPaciente] = useState<Paciente | null>(null);
  const [medicos, setMedicos] = useState<Medico[]>([]);
  const [recursos, setRecursos] = useState<Recurso[]>([]);
  const [procedimentos, setProcedimentos] = useState<Procedimento[]>([]);
  const [buscaProc, setBuscaProc] = useState<Record<string, string>>({});
  const [itens, setItens] = useState<Item[]>([novoItem(dataInicial)]);
  const [observacoes, setObservacoes] = useState("");
  const [salvando, setSalvando] = useState(false);

  const clinicaId = clinicaAtual?.clinica_id ?? null;

  // Carrega médicos, recursos e procedimentos da clínica
  useEffect(() => {
    if (!clinicaId) return;
    let cancel = false;
    void (async () => {
      const [med, rec, proc] = await Promise.all([
        supabase.from("medicos").select("id, nome").eq("clinica_id", clinicaId).order("nome"),
        supabase.from("enfermagem_recursos").select("id, nome").eq("clinica_id", clinicaId).order("nome"),
        supabase
          .from("procedimentos")
          .select("id, nome, valor, duracao_minutos, tipo_procedimento")
          .eq("clinica_id", clinicaId)
          .eq("ativo", true)
          .order("nome"),
      ]);
      if (cancel) return;
      setMedicos((med.data ?? []) as Medico[]);
      setRecursos((rec.data ?? []) as Recurso[]);
      setProcedimentos((proc.data ?? []) as Procedimento[]);
    })();
    return () => { cancel = true; };
  }, [clinicaId]);

  // Busca paciente (debounced simples)
  useEffect(() => {
    if (!clinicaId) return;
    const q = buscaPaciente.trim();
    if (q.length < 2) { setPacientes([]); return; }
    let cancel = false;
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("pacientes")
        .select("id, nome, telefone, data_nascimento")
        .eq("clinica_id", clinicaId)
        .ilike("nome", `%${q}%`)
        .order("nome")
        .limit(10);
      if (!cancel) setPacientes((data ?? []) as Paciente[]);
    }, 200);
    return () => { cancel = true; clearTimeout(t); };
  }, [buscaPaciente, clinicaId]);

  const total = useMemo(() => itens.reduce((s, i) => s + (Number(i.valor) || 0), 0), [itens]);
  const pacienteIncompleto = paciente && (!paciente.telefone || !paciente.data_nascimento);

  function atualizarItem(key: string, patch: Partial<Item>) {
    setItens((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  }
  function removerItem(key: string) {
    setItens((prev) => (prev.length <= 1 ? prev : prev.filter((it) => it.key !== key)));
  }
  function adicionarItem() {
    const ultimo = itens[itens.length - 1];
    const proximoInicio = ultimo
      ? (() => {
          const d = new Date(ultimo.inicio);
          d.setMinutes(d.getMinutes() + (ultimo.duracao || 30));
          const p = (n: number) => String(n).padStart(2, "0");
          return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
        })()
      : dataInicial;
    setItens((prev) => [...prev, novoItem(proximoInicio)]);
  }

  function aplicarProcedimento(itemKey: string, proc: Procedimento) {
    atualizarItem(itemKey, {
      procedimento_id: proc.id,
      procedimento_nome: proc.nome,
      tipo_procedimento: proc.tipo_procedimento,
      valor: Number(proc.valor) || 0,
      duracao: proc.duracao_minutos ?? 30,
    });
    setBuscaProc((prev) => ({ ...prev, [itemKey]: "" }));
  }

  async function confirmar() {
    if (!clinicaId || !paciente) {
      toast.error("Escolha um paciente antes de confirmar.");
      return;
    }
    if (pacienteIncompleto) {
      toast.error("Complete o cadastro do paciente (telefone e data de nascimento) antes de agendar.");
      return;
    }
    for (const it of itens) {
      if (!it.procedimento_nome) { toast.error("Preencha o serviço em todas as linhas."); return; }
      if (!it.inicio) { toast.error(`Preencha a data/hora de "${it.procedimento_nome}".`); return; }
      if (it.executor_kind === "medico" && !it.medico_id) {
        toast.error(`Escolha o médico para "${it.procedimento_nome}".`); return;
      }
      if (it.executor_kind === "recurso" && !it.recurso_id) {
        toast.error(`Escolha o recurso para "${it.procedimento_nome}".`); return;
      }
    }

    setSalvando(true);
    try {
      const res = await criarMultiplo({
        data: {
          clinica_id: clinicaId,
          paciente_id: paciente.id,
          paciente_nome: paciente.nome,
          observacoes_gerais: observacoes.trim() || null,
          itens: itens.map((it) => ({
            procedimento: it.procedimento_nome,
            medico_id: it.executor_kind === "medico" ? it.medico_id : null,
            enfermagem_recurso_id: it.executor_kind === "recurso" ? it.recurso_id : null,
            inicio: toIso(it.inicio),
            fim: addMinutes(it.inicio, it.duracao || 30),
            tipo_atendimento: it.tipo_atendimento,
          })),
        },
      });
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      toast.success(`Atendimento múltiplo criado — ${res.agendamento_ids.length} serviço(s) agendado(s).`);
      navigate({ to: "/app/agenda" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao criar atendimento múltiplo.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="p-3 sm:p-4 lg:p-6 max-w-6xl mx-auto space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Atendimento Múltiplo</h1>
          <p className="text-sm text-muted-foreground">
            Marque em uma única ficha vários serviços diferentes para o mesmo paciente
            — consulta, exame de laboratório, RX, ultrassom, tomografia, ressonância.
            Cada serviço vai para a agenda do profissional/recurso correto e mantém
            sua própria guia e valor no financeiro.
          </p>
        </div>
      </header>

      {/* Paciente */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Users className="h-4 w-4" /> Paciente
        </div>
        {paciente ? (
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[240px]">
              <div className="font-medium">{paciente.nome}</div>
              <div className="text-xs text-muted-foreground">
                {paciente.telefone ?? "sem telefone"} · {paciente.data_nascimento ?? "sem nascimento"}
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => { setPaciente(null); setBuscaPaciente(""); }}>
              Trocar paciente
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <Input
              placeholder="Buscar por nome…"
              value={buscaPaciente}
              onChange={(e) => setBuscaPaciente(e.target.value)}
            />
            {pacientes.length > 0 && (
              <div className="border rounded-md divide-y max-h-56 overflow-auto">
                {pacientes.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="w-full text-left px-3 py-2 hover:bg-accent flex items-center justify-between"
                    onClick={() => setPaciente(p)}
                  >
                    <span>{p.nome}</span>
                    <span className="text-xs text-muted-foreground">
                      {p.telefone ?? "sem tel"} · {p.data_nascimento ?? "sem nasc"}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {pacienteIncompleto && (
          <div className="text-xs text-amber-600">
            ⚠ Este paciente está sem telefone ou data de nascimento — complete o cadastro antes de confirmar.
          </div>
        )}
      </Card>

      {/* Itens */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Stethoscope className="h-4 w-4" /> Serviços deste atendimento
          </div>
          <Button variant="outline" size="sm" onClick={adicionarItem}>
            <Plus className="h-4 w-4 mr-1" /> Adicionar serviço
          </Button>
        </div>

        <div className="space-y-3">
          {itens.map((it, idx) => {
            const buscaAtual = buscaProc[it.key] ?? "";
            const filtrados = buscaAtual.trim().length >= 2
              ? procedimentos
                  .filter((p) => p.nome.toLowerCase().includes(buscaAtual.toLowerCase()))
                  .slice(0, 8)
              : [];
            return (
              <div key={it.key} className="border rounded-lg p-3 space-y-3 bg-card">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-muted-foreground">Serviço #{idx + 1}</div>
                  {itens.length > 1 && (
                    <Button variant="ghost" size="icon" onClick={() => removerItem(it.key)} aria-label="Remover">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                  {/* Procedimento */}
                  <div className="md:col-span-5 space-y-1">
                    <Label>Serviço / procedimento</Label>
                    {it.procedimento_nome ? (
                      <div className="border rounded-md px-3 py-2 flex items-center justify-between bg-muted/40">
                        <div>
                          <div className="font-medium text-sm">{it.procedimento_nome}</div>
                          <div className="text-xs text-muted-foreground">
                            {categoriaLabel(it.tipo_procedimento)} · {it.duracao} min · {fmtBRL(it.valor)}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            atualizarItem(it.key, {
                              procedimento_id: null,
                              procedimento_nome: "",
                              tipo_procedimento: null,
                              valor: 0,
                            })
                          }
                        >
                          Trocar
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Input
                          placeholder="Digite para buscar (consulta, laboratório, RX…)"
                          value={buscaAtual}
                          onChange={(e) =>
                            setBuscaProc((prev) => ({ ...prev, [it.key]: e.target.value }))
                          }
                        />
                        {filtrados.length > 0 && (
                          <div className="border rounded-md divide-y max-h-48 overflow-auto">
                            {filtrados.map((p) => (
                              <button
                                key={p.id}
                                type="button"
                                className="w-full text-left px-3 py-2 hover:bg-accent flex items-center justify-between"
                                onClick={() => aplicarProcedimento(it.key, p)}
                              >
                                <span className="text-sm">{p.nome}</span>
                                <span className="text-xs text-muted-foreground">
                                  {categoriaLabel(p.tipo_procedimento)} · {fmtBRL(Number(p.valor) || 0)}
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Executor */}
                  <div className="md:col-span-4 space-y-1">
                    <Label>Profissional / Recurso</Label>
                    <div className="flex gap-2">
                      <Select
                        value={it.executor_kind}
                        onValueChange={(v: "medico" | "recurso") =>
                          atualizarItem(it.key, { executor_kind: v, medico_id: null, recurso_id: null })
                        }
                      >
                        <SelectTrigger className="w-[130px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="medico">Médico</SelectItem>
                          <SelectItem value="recurso">Recurso</SelectItem>
                        </SelectContent>
                      </Select>
                      {it.executor_kind === "medico" ? (
                        <Select
                          value={it.medico_id ?? ""}
                          onValueChange={(v) => atualizarItem(it.key, { medico_id: v })}
                        >
                          <SelectTrigger className="flex-1">
                            <SelectValue placeholder="Escolha o médico" />
                          </SelectTrigger>
                          <SelectContent>
                            {medicos.map((m) => (
                              <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Select
                          value={it.recurso_id ?? ""}
                          onValueChange={(v) => atualizarItem(it.key, { recurso_id: v })}
                        >
                          <SelectTrigger className="flex-1">
                            <SelectValue placeholder="Escolha o recurso" />
                          </SelectTrigger>
                          <SelectContent>
                            {recursos.map((r) => (
                              <SelectItem key={r.id} value={r.id}>{r.nome}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  </div>

                  {/* Horário */}
                  <div className="md:col-span-3 space-y-1">
                    <Label>Data e hora</Label>
                    <Input
                      type="datetime-local"
                      value={it.inicio}
                      onChange={(e) => atualizarItem(it.key, { inicio: e.target.value })}
                    />
                  </div>

                  {/* Duração e tipo atendimento */}
                  <div className="md:col-span-3 space-y-1">
                    <Label>Duração (min)</Label>
                    <Input
                      type="number"
                      min={5}
                      step={5}
                      value={it.duracao}
                      onChange={(e) =>
                        atualizarItem(it.key, { duracao: Math.max(5, Number(e.target.value) || 30) })
                      }
                    />
                  </div>
                  <div className="md:col-span-3 space-y-1">
                    <Label>Tipo de atendimento</Label>
                    <Select
                      value={it.tipo_atendimento}
                      onValueChange={(v: "particular" | "convenio") =>
                        atualizarItem(it.key, { tipo_atendimento: v })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="particular">Particular</SelectItem>
                        <SelectItem value="convenio">Convênio</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="md:col-span-3 space-y-1">
                    <Label>Valor</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={it.valor}
                      onChange={(e) => atualizarItem(it.key, { valor: Number(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="md:col-span-3 flex items-end text-xs text-muted-foreground">
                    Cada serviço vira uma guia própria no financeiro.
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <Button variant="outline" className="w-full" onClick={adicionarItem}>
          <Plus className="h-4 w-4 mr-1" /> Adicionar mais um serviço
        </Button>
      </Card>

      {/* Observações + resumo */}
      <Card className="p-4 space-y-3">
        <Label>Observações gerais (opcional)</Label>
        <Textarea
          rows={3}
          value={observacoes}
          onChange={(e) => setObservacoes(e.target.value)}
          placeholder="Alguma orientação para a recepção sobre este atendimento?"
        />
      </Card>

      <div className="sticky bottom-0 -mx-3 sm:-mx-4 lg:-mx-6 border-t bg-background/95 backdrop-blur px-4 py-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-4 text-sm">
          <span className="flex items-center gap-1"><Calendar className="h-4 w-4" /> {itens.length} serviço(s)</span>
          <span className="font-semibold">Total: {fmtBRL(total)}</span>
        </div>
        <div className="flex-1" />
        <Button variant="ghost" onClick={() => navigate({ to: "/app/agenda" })}>Cancelar</Button>
        <Button onClick={confirmar} disabled={salvando || !paciente}>
          <Save className="h-4 w-4 mr-1" />
          {salvando ? "Salvando…" : "Confirmar atendimento"}
        </Button>
      </div>
    </div>
  );
}