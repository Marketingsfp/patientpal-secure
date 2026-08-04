import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Activity, CalendarPlus, Clock, Loader2, CheckCircle2, User } from "lucide-react";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import { ptBR } from "date-fns/locale";

export const Route = createFileRoute("/paciente/agendar")({
  component: AgendarOnlinePage,
  head: () => ({
    meta: [
      { title: "Agendar consulta online — ClinicaOS" },
      { name: "description", content: "Escolha a clínica, a data e o horário e marque sua consulta ou exame online, sem precisar de login." },
      { property: "og:title", content: "Agendar consulta online — ClinicaOS" },
      { property: "og:description", content: "Marque consultas e exames futuros direto pelo portal, sem cadastro prévio." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

interface Slot {
  medico_id: string; medico_nome: string | null;
  especialidade_id: string | null; especialidade_nome: string | null;
  agenda_id: string | null; agenda_nome: string | null;
  inicio: string; fim: string; ocupados: number; capacidade: number;
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function AgendarOnlinePage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [clinicas, setClinicas] = useState<{ id: string; nome: string }[]>([]);
  const [clinicaId, setClinicaId] = useState<string>("");
  const [especialidades, setEspecialidades] = useState<{ id: string; nome: string }[]>([]);
  const [especialidadeId, setEspecialidadeId] = useState<string>("todas");
  const [data, setData] = useState<Date>(() => new Date());
  const [slots, setSlots] = useState<Slot[]>([]);
  const [carregandoSlots, setCarregandoSlots] = useState(false);
  const [selecionado, setSelecionado] = useState<Slot | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [cpf, setCpf] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    (async () => {
      const { data: cl, error } = await (supabase as any).rpc("clinicas_publicas");
      if (error) mostrarErro(error);
      const lista = (cl ?? []) as { id: string; nome: string }[];
      setClinicas(lista);
      if (lista[0]) setClinicaId(lista[0].id);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!clinicaId) return;
    (async () => {
      const { data: esp } = await (supabase as any).rpc("especialidades_publicas", { _clinica_id: clinicaId });
      setEspecialidades((esp ?? []) as { id: string; nome: string }[]);
      setEspecialidadeId("todas");
    })();
  }, [clinicaId]);

  useEffect(() => {
    if (!clinicaId) return;
    let cancelado = false;
    (async () => {
      setCarregandoSlots(true);
      setSelecionado(null);
      const { data: hs, error } = await (supabase as any).rpc("horarios_disponiveis_publico", {
        _clinica_id: clinicaId,
        _especialidade_id: especialidadeId === "todas" ? null : especialidadeId,
        _medico_id: null,
        _de: iso(data),
        _dias: 1,
        _limite: 200,
      } as any);
      if (cancelado) return;
      if (error) mostrarErro(error);
      setSlots(((hs ?? []) as Slot[]).filter((s) => iso(new Date(s.inicio)) === iso(data)));
      setCarregandoSlots(false);
    })();
    return () => { cancelado = true; };
  }, [clinicaId, especialidadeId, data]);

  const maxDate = useMemo(() => { const d = new Date(); d.setDate(d.getDate() + 60); return d; }, []);
  const hoje = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);

  const podeConfirmar = !!selecionado && nome.trim().length > 2 && (telefone.trim() !== "" || cpf.trim() !== "");

  async function confirmar() {
    if (!selecionado || !clinicaId) return;
    if (!podeConfirmar) {
      toast.error("Informe seu nome e um contato (telefone ou CPF).");
      return;
    }
    setSalvando(true);
    const { error } = await (supabase as any).rpc("agendar_publico", {
      _clinica_id: clinicaId,
      _medico_id: selecionado.medico_id,
      _inicio: selecionado.inicio,
      _fim: selecionado.fim,
      _nome: nome.trim(),
      _telefone: telefone.trim() || null,
      _cpf: cpf.trim() || null,
      _email: email.trim() || null,
      _agenda_id: selecionado.agenda_id,
      _especialidade_id: selecionado.especialidade_id,
      _procedimento: selecionado.especialidade_nome ?? null,
      _observacoes: "Agendamento realizado pelo portal online",
    } as any);
    setSalvando(false);
    if (error) { mostrarErro(error); return; }
    toast.success("Agendamento confirmado! Você receberá a confirmação da clínica.");
    navigate({ to: "/online" });
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-border bg-card sticky top-0 z-10">
        <div className="mx-auto max-w-3xl px-4 py-3 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Activity className="h-4 w-4" />
          </div>
          <span className="font-bold text-primary">ClinicaOS</span>
          <Link to="/online" className="ml-auto text-sm text-muted-foreground hover:text-foreground">Portal</Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-5 space-y-4">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <CalendarPlus className="h-5 w-5 text-primary" /> Agendar consulta ou exame
          </h1>
          <p className="text-sm text-muted-foreground">Escolha uma data futura (até 60 dias) e o horário disponível. Não é preciso login.</p>
        </div>

        {loading ? (
          <Card className="p-6 text-sm text-muted-foreground">Carregando…</Card>
        ) : clinicas.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">Nenhuma clínica disponível para agendamento online.</Card>
        ) : (
          <>
            <Card className="p-4 bg-white shadow-sm space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Clínica</Label>
                  <Select value={clinicaId} onValueChange={setClinicaId}>
                    <SelectTrigger className="h-10"><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {clinicas.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Especialidade / serviço</Label>
                  <Select value={especialidadeId} onValueChange={setEspecialidadeId}>
                    <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todas">Todas</SelectItem>
                      {especialidades.map((e) => (
                        <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </Card>

            <div className="grid gap-4 md:grid-cols-2">
              <Card className="p-3 bg-white shadow-sm flex justify-center">
                <Calendar
                  mode="single"
                  locale={ptBR}
                  selected={data}
                  onSelect={(d) => d && setData(d)}
                  disabled={{ before: hoje, after: maxDate }}
                  className="p-2 pointer-events-auto"
                />
              </Card>

              <Card className="p-4 bg-white shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="h-4 w-4 text-primary" />
                  <h2 className="text-sm font-semibold">
                    Horários em {data.toLocaleDateString("pt-BR", { day: "2-digit", month: "long" })}
                  </h2>
                </div>
                {carregandoSlots ? (
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Buscando horários…
                  </p>
                ) : slots.length === 0 ? (
                  <div className="rounded-lg bg-slate-50 border border-slate-200 p-6 text-center text-sm text-muted-foreground">
                    Nenhum horário disponível nesta data. Tente outro dia.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2 max-h-[320px] overflow-y-auto pr-1">
                    {slots.map((s) => {
                      const key = `${s.inicio}-${s.medico_id}-${s.agenda_id ?? ""}`;
                      const ativo = selecionado
                        ? `${selecionado.inicio}-${selecionado.medico_id}-${selecionado.agenda_id ?? ""}` === key
                        : false;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setSelecionado(s)}
                          className={`rounded-lg border px-3 py-2 text-left transition ${
                            ativo ? "border-primary bg-primary text-primary-foreground" : "border-slate-200 bg-white hover:bg-slate-50"
                          }`}
                        >
                          <p className="font-semibold text-sm">
                            {new Date(s.inicio).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                          </p>
                          <p className={`text-[10px] font-medium truncate ${ativo ? "text-primary-foreground/80" : "text-slate-500"}`}>
                            {s.especialidade_nome || s.medico_nome || s.agenda_nome || "Atendimento"}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                )}
              </Card>
            </div>

            <Card className="p-4 bg-white shadow-sm space-y-3">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold">Seus dados</h2>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">Nome completo *</Label>
                  <Input className="h-10" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Seu nome" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Telefone / WhatsApp</Label>
                  <Input className="h-10" value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(00) 00000-0000" inputMode="tel" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">CPF</Label>
                  <Input className="h-10" value={cpf} onChange={(e) => setCpf(e.target.value)} placeholder="000.000.000-00" inputMode="numeric" />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">E-mail (opcional)</Label>
                  <Input className="h-10" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@email.com" />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">* Informe telefone ou CPF para a clínica localizar seu cadastro.</p>
            </Card>

            <Card className="p-4 bg-white shadow-sm flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-[200px] text-sm">
                {selecionado ? (
                  <span className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <strong>
                      {new Date(selecionado.inicio).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </strong>
                    <span className="text-muted-foreground truncate">
                      {selecionado.medico_nome ? `Dr(a). ${selecionado.medico_nome}` : selecionado.especialidade_nome ?? ""}
                    </span>
                  </span>
                ) : (
                  <span className="text-muted-foreground">Selecione um horário para continuar.</span>
                )}
              </div>
              <Button onClick={confirmar} disabled={!podeConfirmar || salvando} className="h-10">
                {salvando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CalendarPlus className="h-4 w-4 mr-2" />}
                Confirmar agendamento
              </Button>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
