import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Search, Stethoscope, ClipboardList, Clock, BookOpen, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useClinica } from "@/hooks/use-clinica";
import { getContextoClinica } from "@/lib/nina.functions";

export const Route = createFileRoute("/_authenticated/app/consulta-rapida")({
  component: ConsultaRapidaPage,
  head: () => ({ meta: [{ title: "Informações rápidas — ClinicaOS" }] }),
});

type Medico = {
  id: string;
  nome: string;
  crm: string;
  crm_uf: string;
  telefone: string | null;
  email: string | null;
  horarios: Array<{ dia: string; inicio: string; fim: string; obs: string | null }>;
};
type Procedimento = {
  id: string;
  nome: string;
  grupo: string | null;
  tipo: string;
  valor_dinheiro_pix: number;
  valor_cartao: number;
  duracao_minutos: number;
  preparo: string | null;
};

type ProcTipo = "consulta" | "exame" | "procedimento";
const EMPTY_PROC = {
  id: "" as string,
  nome: "",
  grupo: "",
  tipo: "exame" as ProcTipo,
  valor_dinheiro: "0",
  valor_pix_cartao: "0",
  duracao_minutos: "30",
  preparo: "",
};
const EMPTY_MED = {
  id: "" as string,
  nome: "",
  crm: "",
  crm_uf: "PE",
  telefone: "",
  email: "",
};

const fmtMoney = (n: number) =>
  Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function ConsultaRapidaPage() {
  const { clinicaAtual } = useClinica();
  const getCtx = useServerFn(getContextoClinica);
  const [medicos, setMedicos] = useState<Medico[]>([]);
  const [procs, setProcs] = useState<Procedimento[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);

  // Edit / create state
  const [procOpen, setProcOpen] = useState(false);
  const [procForm, setProcForm] = useState(EMPTY_PROC);
  const [savingProc, setSavingProc] = useState(false);
  const [medOpen, setMedOpen] = useState(false);
  const [medForm, setMedForm] = useState(EMPTY_MED);
  const [savingMed, setSavingMed] = useState(false);

  const reload = () => {
    if (!clinicaAtual) return;
    setLoading(true);
    getCtx({ data: { clinicaId: clinicaAtual.clinica_id } })
      .then((r) => {
        setMedicos((r.medicos ?? []) as Medico[]);
        setProcs((r.procedimentos ?? []) as Procedimento[]);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinicaAtual?.clinica_id]);

  const openNovoProc = () => { setProcForm(EMPTY_PROC); setProcOpen(true); };
  const openEditProc = (p: Procedimento) => {
    setProcForm({
      id: p.id,
      nome: p.nome,
      grupo: p.grupo ?? "",
      tipo: (p.tipo as ProcTipo) ?? "exame",
      valor_dinheiro: String(p.valor_dinheiro_pix ?? 0),
      valor_pix_cartao: String(p.valor_cartao ?? 0),
      duracao_minutos: String(p.duracao_minutos ?? 30),
      preparo: p.preparo ?? "",
    });
    setProcOpen(true);
  };
  const saveProc = async (e: FormEvent) => {
    e.preventDefault();
    if (!clinicaAtual) return;
    if (!procForm.nome.trim()) { toast.error("Informe o nome."); return; }
    setSavingProc(true);
    const vDin = Number(procForm.valor_dinheiro) || 0;
    const vCar = Number(procForm.valor_pix_cartao) || 0;
    const payload = {
      clinica_id: clinicaAtual.clinica_id,
      nome: procForm.nome.trim(),
      grupo: procForm.grupo.trim() || null,
      tipo: procForm.tipo,
      valor_padrao: vDin,
      valor_dinheiro: vDin,
      valor_dinheiro_pix: vDin,
      valor_pix: vCar,
      valor_cartao: vCar,
      valor_cartao_credito: vCar,
      valor_cartao_debito: vCar,
      duracao_minutos: Math.max(0, Number(procForm.duracao_minutos) || 0),
      preparo: procForm.preparo.trim() || null,
      ativo: true,
    };
    const { error } = procForm.id
      ? await supabase.from("procedimentos").update(payload).eq("id", procForm.id)
      : await supabase.from("procedimentos").insert(payload);
    setSavingProc(false);
    if (error) { mostrarErro(error); return; }
    toast.success(procForm.id ? "Atualizado." : "Cadastrado.");
    setProcOpen(false);
    reload();
  };

  const openNovoMed = () => { setMedForm(EMPTY_MED); setMedOpen(true); };
  const openEditMed = (m: Medico) => {
    setMedForm({
      id: m.id,
      nome: m.nome,
      crm: m.crm ?? "",
      crm_uf: m.crm_uf ?? "PE",
      telefone: m.telefone ?? "",
      email: m.email ?? "",
    });
    setMedOpen(true);
  };
  const saveMed = async (e: FormEvent) => {
    e.preventDefault();
    if (!clinicaAtual) return;
    if (!medForm.nome.trim()) { toast.error("Informe o nome."); return; }
    setSavingMed(true);
    const payload: any = {
      clinica_id: clinicaAtual.clinica_id,
      nome: medForm.nome.trim(),
      crm: medForm.crm.trim() || "—",
      crm_uf: (medForm.crm_uf || "PE").toUpperCase().slice(0, 2),
      telefone: medForm.telefone.trim() || null,
      email: medForm.email.trim() || null,
    };
    const { error } = medForm.id
      ? await supabase.from("medicos").update(payload).eq("id", medForm.id)
      : await supabase.from("medicos").insert(payload);
    setSavingMed(false);
    if (error) { mostrarErro(error); return; }
    toast.success(medForm.id ? "Atualizado." : "Cadastrado.");
    setMedOpen(false);
    reload();
  };

  const medicosFiltrados = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return medicos;
    return medicos.filter(
      (m) =>
        m.nome.toLowerCase().includes(t) ||
        m.crm?.toLowerCase().includes(t) ||
        m.horarios.some((h) => h.dia.toLowerCase().includes(t)),
    );
  }, [medicos, q]);

  const procsFiltrados = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return procs;
    return procs.filter(
      (p) =>
        p.nome.toLowerCase().includes(t) ||
        p.grupo?.toLowerCase().includes(t),
    );
  }, [procs, q]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-primary" /> Informações rápidas
          </h1>
          <p className="text-sm text-muted-foreground">
            Lembretes para a equipe: médicos, horários e valores de exames sempre à mão.
          </p>
        </div>
        <Badge variant="outline" className="text-xs">
          {medicos.length} médicos · {procs.length} serviços
        </Badge>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por médico, exame, dia da semana…"
              className="pl-9 h-11"
              autoFocus
            />
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="medicos">
        <TabsList>
          <TabsTrigger value="medicos" className="gap-2">
            <Stethoscope className="h-4 w-4" /> Médicos & horários
            <Badge variant="secondary" className="ml-1">{medicosFiltrados.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="procs" className="gap-2">
            <ClipboardList className="h-4 w-4" /> Serviços & valores
            <Badge variant="secondary" className="ml-1">{procsFiltrados.length}</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="medicos" className="mt-4">
          <div className="mb-3 flex justify-end">
            <Button size="sm" onClick={openNovoMed} className="gap-1">
              <Plus className="h-4 w-4" /> Novo médico
            </Button>
          </div>
          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : medicosFiltrados.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum médico encontrado.</p>
          ) : (
            <div className="grid md:grid-cols-2 gap-3">
              {medicosFiltrados.map((m) => (
                <Card key={m.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Stethoscope className="h-4 w-4 text-primary" />
                          {m.nome}
                        </CardTitle>
                        <CardDescription>
                          CRM {m.crm}/{m.crm_uf}
                        </CardDescription>
                      </div>
                      <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => openEditMed(m)} title="Editar">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {m.horarios.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">
                        Sem horários cadastrados.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {m.horarios.map((h, i) => (
                          <Badge
                            key={i}
                            variant="outline"
                            className="text-xs gap-1"
                            title={h.obs ?? ""}
                          >
                            <Clock className="h-3 w-3" />
                            {h.dia} {h.inicio}-{h.fim}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="procs" className="mt-4">
          <div className="mb-3 flex justify-end">
            <Button size="sm" onClick={openNovoProc} className="gap-1">
              <Plus className="h-4 w-4" /> Novo serviço
            </Button>
          </div>
          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : procsFiltrados.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum exame encontrado.</p>
          ) : (
            <Card>
              <div className="divide-y">
                {procsFiltrados.map((p) => (
                  <div key={p.id} className="px-4 py-3 hover:bg-muted/30">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{p.nome}</div>
                        <div className="text-xs text-muted-foreground">
                          {p.grupo ?? "—"} · {p.duracao_minutos} min
                        </div>
                      </div>
                      <div className="flex gap-4 text-sm shrink-0">
                        <div className="text-right">
                          <div className="text-[10px] text-muted-foreground uppercase">
                            Dinheiro
                          </div>
                          <div className="font-semibold text-emerald-600">
                            {fmtMoney(p.valor_dinheiro_pix)}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] text-muted-foreground uppercase">
                            PIX / Cartão
                          </div>
                          <div className="font-semibold">{fmtMoney(p.valor_cartao)}</div>
                        </div>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEditProc(p)} title="Editar">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    {p.preparo && (
                      <div className="mt-2 rounded-md border border-amber-300/60 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs">
                        <span className="font-semibold text-amber-800 dark:text-amber-200">Preparo: </span>
                        <span className="text-amber-900 dark:text-amber-100 whitespace-pre-wrap">{p.preparo}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Dialog: Procedimento */}
      <Dialog open={procOpen} onOpenChange={setProcOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{procForm.id ? "Editar serviço" : "Novo serviço"}</DialogTitle>
            <DialogDescription>Nome, grupo, valores e duração.</DialogDescription>
          </DialogHeader>
          <form onSubmit={saveProc} className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nome *</Label>
              <Input value={procForm.nome} onChange={(e) => setProcForm({ ...procForm, nome: e.target.value })} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Grupo</Label>
                <Input value={procForm.grupo} onChange={(e) => setProcForm({ ...procForm, grupo: e.target.value })} placeholder="Ex.: Ginecologia" />
              </div>
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={procForm.tipo} onValueChange={(v) => setProcForm({ ...procForm, tipo: v as ProcTipo })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="consulta">Consulta</SelectItem>
                    <SelectItem value="exame">Exame</SelectItem>
                    <SelectItem value="procedimento">Serviço</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Dinheiro (R$)</Label>
                <CurrencyInput value={procForm.valor_dinheiro} onChange={(v) => setProcForm({ ...procForm, valor_dinheiro: v })} />
              </div>
              <div className="space-y-1.5">
                <Label>PIX / Cartão (R$)</Label>
                <CurrencyInput value={procForm.valor_pix_cartao} onChange={(v) => setProcForm({ ...procForm, valor_pix_cartao: v })} />
              </div>
              <div className="space-y-1.5">
                <Label>Duração (min)</Label>
                <Input type="number" value={procForm.duracao_minutos} onChange={(e) => setProcForm({ ...procForm, duracao_minutos: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Preparo</Label>
              <Textarea rows={3} value={procForm.preparo} onChange={(e) => setProcForm({ ...procForm, preparo: e.target.value })} placeholder="Instruções de preparo (opcional)" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setProcOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={savingProc}>{savingProc ? "Salvando…" : "Salvar"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog: Médico */}
      <Dialog open={medOpen} onOpenChange={setMedOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{medForm.id ? "Editar médico" : "Novo médico"}</DialogTitle>
            <DialogDescription>Para editar horários, abra a página Médicos.</DialogDescription>
          </DialogHeader>
          <form onSubmit={saveMed} className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nome *</Label>
              <Input value={medForm.nome} onChange={(e) => setMedForm({ ...medForm, nome: e.target.value })} required />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>CRM</Label>
                <Input value={medForm.crm} onChange={(e) => setMedForm({ ...medForm, crm: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>UF</Label>
                <Input value={medForm.crm_uf} onChange={(e) => setMedForm({ ...medForm, crm_uf: e.target.value })} maxLength={2} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Telefone</Label>
                <Input value={medForm.telefone} onChange={(e) => setMedForm({ ...medForm, telefone: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>E-mail</Label>
                <Input type="email" value={medForm.email} onChange={(e) => setMedForm({ ...medForm, email: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setMedOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={savingMed}>{savingMed ? "Salvando…" : "Salvar"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}