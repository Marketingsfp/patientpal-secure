import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { FileSignature, Plus, Printer, Search, Trash2, Link2, Check, ChevronRight, CreditCard, Camera, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { printContrato } from "@/lib/print-contrato";
import { printCartoes } from "@/lib/print-cartao";
import { FaceCaptureDialog } from "@/components/face/FaceCaptureDialog";

export const Route = createFileRoute("/_authenticated/app/contratos")({
  component: ContratosPage,
  head: () => ({ meta: [{ title: "Contratos — ClinicaOS" }] }),
});

const BRL = (v: number) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtD = (s?: string | null) => (s ? new Date(s + (s.length === 10 ? "T00:00:00" : "")).toLocaleDateString("pt-BR") : "—");

type Convenio = {
  id: string;
  nome: string;
  descricao: string | null;
  valor_mensal: number;
  taxa_adesao: number;
  num_parcelas: number;
  max_dependentes: number;
  vigencia_meses: number;
  beneficios: string | null;
};
type Faixa = { id: string; convenio_id: string; vidas_de: number; vidas_ate: number | null; valor_mensal: number };
type Beneficio = {
  id: string;
  convenio_id: string;
  nome: string;
  descricao: string | null;
  escopo: string;
  tipo_desconto: string;
  valor_desconto: number | null;
  inicio_a_partir: number;
  limite_uso: string;
  periodicidade: string;
  pessoa: string;
};
type Paciente = { id: string; nome: string; cpf: string | null; telefone: string | null; email: string | null; face_descriptor?: number[] | null };
type Contrato = { id: string; numero: number; paciente_nome: string; convenio_id: string | null; plano_id: string | null; valor_mensal: number; status: string; data_inicio: string; data_fim: string | null; assinado_em: string | null; token_publico: string; forma_pagamento: string | null };
type Mens = { id: string; numero_parcela: number; vencimento: string; valor: number; status: string; pago_em: string | null; forma_pagamento: string | null };
type Dep = { id: string; paciente_nome: string; parentesco: string | null; tipo: string };

export function ContratosPage() {
  const { clinicaAtual } = useClinica();
  const { user } = useAuth();
  const [list, setList] = useState<Contrato[]>([]);
  const [convenios, setConvenios] = useState<Convenio[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [view, setView] = useState<"list" | "new">("list");
  const [detail, setDetail] = useState<Contrato | null>(null);

  const load = async () => {
    if (!clinicaAtual) return;
    setLoading(true);
    const [cs, cv] = await Promise.all([
      supabase.from("contratos_assinatura").select("*").eq("clinica_id", clinicaAtual.clinica_id).order("created_at", { ascending: false }).limit(500),
      supabase.from("cb_convenios").select("*").eq("clinica_id", clinicaAtual.clinica_id).eq("ativo", true).order("nome"),
    ]);
    if (cs.error) toast.error(cs.error.message);
    setList((cs.data ?? []) as Contrato[]);
    setConvenios((cv.data ?? []) as Convenio[]);
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [clinicaAtual?.clinica_id]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return list;
    return list.filter((c) => `${c.numero} ${c.paciente_nome}`.toLowerCase().includes(s));
  }, [list, q]);

  if (view === "new") {
    return (
      <NovoContratoForm
        onBack={() => setView("list")}
        convenios={convenios}
        clinicaId={clinicaAtual!.clinica_id}
        userId={user?.id ?? null}
        onCreated={() => { setView("list"); load(); }}
      />
    );
  }

  if (detail) {
    return <DetalheContrato contrato={detail} onBack={() => { setDetail(null); load(); }} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2"><FileSignature className="h-6 w-6 text-primary"/>Contratos</h1>
        <Button onClick={() => setView("new")} disabled={convenios.length === 0}><Plus className="h-4 w-4 mr-2"/>Nova venda</Button>
      </div>
      {convenios.length === 0 && !loading ? (
        <div className="rounded-md border bg-muted/40 p-3 text-sm">Cadastre um convênio antes em <strong>Cartão de Benefícios → Convênio</strong>.</div>
      ) : null}
      <div className="relative max-w-md">
        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground"/>
        <Input className="pl-8" placeholder="Buscar por número ou paciente…" value={q} onChange={(e) => setQ(e.target.value)}/>
      </div>
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nº</TableHead><TableHead>Paciente</TableHead><TableHead>Início</TableHead>
              <TableHead>Mensal</TableHead><TableHead>Pagamento</TableHead><TableHead>Status</TableHead>
              <TableHead>Assinado</TableHead><TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">Carregando…</TableCell></TableRow> : null}
            {!loading && filtered.length === 0 ? <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">Nenhum contrato.</TableCell></TableRow> : null}
            {filtered.map((c) => (
              <TableRow key={c.id} className="cursor-pointer" onClick={() => setDetail(c)}>
                <TableCell className="font-semibold">{c.numero}</TableCell>
                <TableCell>{c.paciente_nome}</TableCell>
                <TableCell>{fmtD(c.data_inicio)}</TableCell>
                <TableCell>{BRL(c.valor_mensal)}</TableCell>
                <TableCell>{c.forma_pagamento ?? "—"}</TableCell>
                <TableCell><Badge variant={c.status === "ativo" ? "default" : "secondary"}>{c.status}</Badge></TableCell>
                <TableCell>{c.assinado_em ? <Badge variant="default"><Check className="h-3 w-3 mr-1"/>Sim</Badge> : <Badge variant="outline">Pendente</Badge>}</TableCell>
                <TableCell><ChevronRight className="h-4 w-4 text-muted-foreground"/></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function NovoContratoForm({ onBack, convenios, clinicaId, userId, onCreated }: { onBack: () => void; convenios: Convenio[]; clinicaId: string; userId: string | null; onCreated: () => void }) {
  const [convenioId, setConvenioId] = useState(convenios[0]?.id ?? "");
  const convenio = convenios.find((c) => c.id === convenioId);
  const [faixas, setFaixas] = useState<Faixa[]>([]);
  const [beneficios, setBeneficios] = useState<Beneficio[]>([]);
  const [titular, setTitular] = useState<Paciente | null>(null);
  const [pacBusca, setPacBusca] = useState("");
  const [pacResults, setPacResults] = useState<Paciente[]>([]);
  const [valor, setValor] = useState(0);
  const [taxa, setTaxa] = useState(0);
  const [diaVenc, setDiaVenc] = useState(10);
  const [dataInicio, setDataInicio] = useState(new Date().toISOString().slice(0, 10));
  const [forma, setForma] = useState("dinheiro");
  const [obs, setObs] = useState("");
  const [depBusca, setDepBusca] = useState("");
  const [depResults, setDepResults] = useState<Paciente[]>([]);
  const [deps, setDeps] = useState<Array<Paciente & { parentesco: string; tipo: string }>>([]);
  const [saving, setSaving] = useState(false);
  const [faceOpen, setFaceOpen] = useState<null | "titular" | number>(null);

  useEffect(() => {
    if (convenio) { setValor(Number(convenio.valor_mensal)); setTaxa(Number(convenio.taxa_adesao)); }
  }, [convenioId]);

  // Carrega faixas (por vidas) e benefícios do convênio selecionado
  useEffect(() => {
    (async () => {
      if (!convenioId) { setFaixas([]); setBeneficios([]); return; }
      const [fx, bn] = await Promise.all([
        supabase.from("cb_convenio_faixas").select("*").eq("convenio_id", convenioId).order("vidas_de"),
        supabase.from("cb_beneficios").select("*").eq("convenio_id", convenioId).eq("ativo", true).order("nome"),
      ]);
      setFaixas((fx.data ?? []) as Faixa[]);
      setBeneficios((bn.data ?? []) as Beneficio[]);
    })();
  }, [convenioId]);

  // Recalcula valor mensal conforme a faixa de vidas (titular + dependentes)
  const vidas = (titular ? 1 : 0) + deps.length;
  useEffect(() => {
    if (!convenio) return;
    if (faixas.length === 0) { setValor(Number(convenio.valor_mensal)); return; }
    const faixa = faixas.find((f) => vidas >= f.vidas_de && (f.vidas_ate == null || vidas <= f.vidas_ate));
    if (faixa) setValor(Number(faixa.valor_mensal));
  }, [vidas, faixas, convenioId]);

  const buscarPac = async (term: string, setRes: (r: Paciente[]) => void) => {
    if (term.trim().length < 2) return setRes([]);
    const { data } = await supabase.from("pacientes")
      .select("id, nome, cpf, telefone, email, face_descriptor").eq("clinica_id", clinicaId).eq("ativo", true)
      .ilike("nome", `%${term}%`).limit(8);
    setRes((data ?? []) as Paciente[]);
  };

  const addDep = (p: Paciente) => {
    if (!convenio) return;
    const max = convenio.max_dependentes;
    if (max > 0 && deps.length >= max) return toast.error(`Limite de ${max} dependentes`);
    if (deps.find((d) => d.id === p.id) || titular?.id === p.id) return;
    setDeps([...deps, { ...p, parentesco: "", tipo: "dependente" }]);
    setDepBusca(""); setDepResults([]);
  };

  const salvar = async () => {
    if (!titular || !convenio) return toast.error("Selecione paciente e convênio");
    if (!titular.email) return toast.error("Titular precisa ter e-mail para acessar o app. Cadastre o e-mail no paciente antes de gerar o contrato.");
    if (!titular.face_descriptor || titular.face_descriptor.length === 0) return toast.error("Capture a foto do titular antes de gerar o contrato.");
    const semEmailDeps = deps.filter((d) => !d.email);
    if (semEmailDeps.length > 0 && !confirm(`${semEmailDeps.length} dependente(s) sem e-mail não conseguirão acessar o app. Continuar mesmo assim?`)) return;
    const semFotoDeps = deps.filter((d) => !d.face_descriptor || d.face_descriptor.length === 0);
    if (semFotoDeps.length > 0 && !confirm(`${semFotoDeps.length} dependente(s) sem foto facial. Continuar mesmo assim?`)) return;
    setSaving(true);
    const { data: contrato, error } = await supabase.from("contratos_assinatura").insert({
      clinica_id: clinicaId, convenio_id: convenio.id, paciente_id: titular.id, paciente_nome: titular.nome,
      data_inicio: dataInicio, dia_vencimento: diaVenc, valor_mensal: valor, taxa_adesao: taxa,
      num_parcelas: convenio.num_parcelas, forma_pagamento: forma, observacoes: obs, criado_por: userId,
    }).select("*").single();
    if (error || !contrato) { setSaving(false); return toast.error(error?.message ?? "Erro"); }

    if (deps.length > 0) {
      await supabase.from("contrato_dependentes").insert(deps.map((d) => ({
        contrato_id: contrato.id, paciente_id: d.id, paciente_nome: d.nome,
        parentesco: d.parentesco || null, tipo: d.tipo,
      })));
    }

    // Gerar 12 parcelas
    const base = new Date(dataInicio + "T00:00:00");
    const parcelas = Array.from({ length: convenio.num_parcelas }, (_, i) => {
      const venc = new Date(base.getFullYear(), base.getMonth() + i, diaVenc);
      return {
        contrato_id: contrato.id, clinica_id: clinicaId,
        numero_parcela: i + 1, vencimento: venc.toISOString().slice(0, 10),
        valor, status: "pendente",
      };
    });
    await supabase.from("contrato_mensalidades").insert(parcelas);

    setSaving(false);
    toast.success(`Contrato #${contrato.numero} criado com ${convenio.num_parcelas} mensalidades`);
    onCreated();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
        </Button>
        <h1 className="text-2xl font-bold flex items-center gap-2"><FileSignature className="h-6 w-6 text-primary"/>Novo contrato</h1>
        <div />
      </div>
      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><Label>Convênio</Label>
            <Select value={convenioId} onValueChange={setConvenioId}>
              <SelectTrigger><SelectValue/></SelectTrigger>
              <SelectContent>{convenios.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
            </Select>
            {convenio && (beneficios.length > 0 || convenio.beneficios) ? (
              <div className="mt-2 rounded-md border bg-muted/30 p-3 text-xs space-y-1">
                <div className="font-semibold text-foreground">Benefícios deste convênio</div>
                {beneficios.map((b) => (
                  <div key={b.id}>
                    • <span className="font-medium">{b.nome}</span>
                    {b.valor_desconto != null ? ` — ${b.tipo_desconto === "percentual" ? `${b.valor_desconto}% de desconto` : `R$ ${Number(b.valor_desconto).toFixed(2)}`}` : ""}
                    {` · ${b.pessoa} · ${b.limite_uso === "ilimitado" ? "uso ilimitado" : `${b.limite_uso}x por ${b.periodicidade}`} · libera a partir do mês ${b.inicio_a_partir}`}
                  </div>
                ))}
                {convenio.beneficios ? <div className="text-muted-foreground whitespace-pre-wrap pt-1 border-t mt-1">{convenio.beneficios}</div> : null}
              </div>
            ) : null}
            {faixas.length > 0 ? (
              <div className="mt-2 text-xs text-muted-foreground">
                Valor calculado pela faixa de vidas: <span className="font-semibold text-foreground">{vidas} vida(s)</span>
              </div>
            ) : null}
          </div>
          <div className="col-span-2"><Label>Paciente titular</Label>
            {titular ? (
              <div className="flex items-center justify-between rounded-md border p-2 bg-muted/30">
                <span className="font-medium flex items-center gap-2">
                  {titular.nome} {titular.cpf ? `— ${titular.cpf}` : ""}
                  {titular.face_descriptor && titular.face_descriptor.length > 0
                    ? <Badge variant="default" className="gap-1"><Check className="h-3 w-3"/>Foto</Badge>
                    : <Badge variant="outline" className="gap-1 text-amber-600 border-amber-400">Sem foto</Badge>}
                </span>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" onClick={() => setFaceOpen("titular")}>
                    <Camera className="h-3 w-3 mr-1"/>{titular.face_descriptor?.length ? "Refazer foto" : "Tirar foto"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setTitular(null)}>Trocar</Button>
                </div>
              </div>
            ) : (
              <>
                <Input placeholder="Buscar paciente…" value={pacBusca} onChange={(e) => { setPacBusca(e.target.value); buscarPac(e.target.value, setPacResults); }}/>
                {pacResults.length > 0 ? (
                  <div className="rounded-md border mt-1 max-h-40 overflow-auto">
                    {pacResults.map((p) => (
                      <button type="button" key={p.id} className="block w-full text-left px-3 py-2 hover:bg-muted text-sm" onClick={() => { setTitular(p); setPacBusca(""); setPacResults([]); }}>
                        {p.nome} {p.cpf ? `— ${p.cpf}` : ""}
                      </button>
                    ))}
                  </div>
                ) : null}
              </>
            )}
          </div>
          <div><Label>Data início</Label><Input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)}/></div>
          <div><Label>Dia de vencimento</Label><Input type="number" min={1} max={28} value={diaVenc} onChange={(e) => setDiaVenc(Number(e.target.value))}/></div>
          <div><Label>Valor mensal (R$)</Label><CurrencyInput value={String(valor ?? "")} onChange={(v) => setValor(Number(v) || 0)}/></div>
          <div><Label>Taxa de adesão (R$)</Label><CurrencyInput value={String(taxa ?? "")} onChange={(v) => setTaxa(Number(v) || 0)}/></div>
          <div className="col-span-2"><Label>Forma de pagamento</Label>
            <Select value={forma} onValueChange={setForma}>
              <SelectTrigger><SelectValue/></SelectTrigger>
              <SelectContent>
                <SelectItem value="dinheiro">Dinheiro</SelectItem>
                <SelectItem value="carne">Carnê</SelectItem>
                <SelectItem value="boleto">Boleto</SelectItem>
                <SelectItem value="pix">PIX</SelectItem>
                <SelectItem value="cartao_credito">Cartão de Crédito</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 border-t pt-3">
            <Label>Dependentes {convenio && convenio.max_dependentes > 0 ? `(máx ${convenio.max_dependentes})` : ""}</Label>
            <Input className="mt-1" placeholder="Buscar paciente para incluir…" value={depBusca} onChange={(e) => { setDepBusca(e.target.value); buscarPac(e.target.value, setDepResults); }}/>
            {depResults.length > 0 ? (
              <div className="rounded-md border mt-1 max-h-32 overflow-auto">
                {depResults.map((p) => (
                  <button type="button" key={p.id} className="block w-full text-left px-3 py-2 hover:bg-muted text-sm" onClick={() => addDep(p)}>
                    + {p.nome}
                  </button>
                ))}
              </div>
            ) : null}
            {deps.length > 0 ? (
              <div className="mt-2 space-y-1">
                {deps.map((d, i) => (
                  <div key={d.id} className="grid grid-cols-12 gap-2 items-center">
                    <span className="col-span-3 text-sm truncate flex items-center gap-1">
                      {d.nome}
                      {d.face_descriptor && d.face_descriptor.length > 0 ? <Check className="h-3 w-3 text-green-600"/> : null}
                    </span>
                    <Input className="col-span-3 h-8" placeholder="Parentesco" value={d.parentesco} onChange={(e) => setDeps(deps.map((x, j) => j === i ? { ...x, parentesco: e.target.value } : x))}/>
                    <div className="col-span-2 text-xs text-muted-foreground self-center">Dependente</div>
                    <Button size="sm" variant="outline" className="col-span-3 h-8" onClick={() => setFaceOpen(i)}>
                      <Camera className="h-3 w-3 mr-1"/>{d.face_descriptor?.length ? "Refazer" : "Foto"}
                    </Button>
                    <Button size="sm" variant="ghost" className="col-span-1" onClick={() => setDeps(deps.filter((_, j) => j !== i))}><Trash2 className="h-3 w-3 text-destructive"/></Button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
          <div className="col-span-2"><Label>Observações</Label><Textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)}/></div>
          </div>
          <div className="flex justify-end gap-2 border-t pt-4">
          <Button variant="ghost" onClick={onBack}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving || !titular || !convenio}>Gerar contrato + {convenio?.num_parcelas ?? 12} parcelas</Button>
          </div>
        {faceOpen ? (
          <FaceCaptureDialog
            open={!!faceOpen}
            onClose={() => setFaceOpen(null)}
            titulo={faceOpen === "titular" ? `Foto — ${titular?.nome ?? "Titular"}` : `Foto — ${deps[faceOpen as number]?.nome ?? "Dependente"}`}
            onCaptured={async (descriptor) => {
              const isTitular = faceOpen === "titular";
              const idx = typeof faceOpen === "number" ? faceOpen : -1;
              const alvoId = isTitular ? titular!.id : deps[idx].id;
              const { error } = await supabase.from("pacientes").update({ face_descriptor: descriptor }).eq("id", alvoId);
              if (error) throw error;
              if (isTitular) setTitular({ ...titular!, face_descriptor: descriptor });
              else setDeps(deps.map((x, j) => j === idx ? { ...x, face_descriptor: descriptor } : x));
              toast.success("Foto registrada");
            }}
          />
        ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function DetalheContrato({ contrato, onBack }: { contrato: Contrato; onBack: () => void }) {
  const [mens, setMens] = useState<Mens[]>([]);
  const [deps, setDeps] = useState<Dep[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [m, d] = await Promise.all([
      supabase.from("contrato_mensalidades").select("*").eq("contrato_id", contrato.id).order("numero_parcela"),
      supabase.from("contrato_dependentes").select("id, paciente_nome, parentesco, tipo").eq("contrato_id", contrato.id).eq("ativo", true),
    ]);
    setMens((m.data ?? []) as Mens[]);
    setDeps((d.data ?? []) as Dep[]);
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [contrato.id]);

  const marcarPago = async (id: string, paga: boolean) => {
    const patch = paga
      ? { status: "pago", pago_em: new Date().toISOString().slice(0, 10) }
      : { status: "pendente", pago_em: null };
    const { error } = await supabase.from("contrato_mensalidades").update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };

  const copiarLink = async () => {
    const url = `${window.location.origin}/p/contrato/${contrato.token_publico}`;
    await navigator.clipboard.writeText(url);
    toast.success("Link de assinatura copiado");
  };

  const pagas = mens.filter((m) => m.status === "pago").length;
  const totalPago = mens.filter((m) => m.status === "pago").reduce((s, m) => s + Number(m.valor), 0);
  const aReceber = mens.filter((m) => m.status !== "pago").reduce((s, m) => s + Number(m.valor), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
        </Button>
        <h1 className="text-2xl font-bold">Contrato #{contrato.numero} — {contrato.paciente_nome}</h1>
        <div />
      </div>
      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="grid grid-cols-3 gap-3 text-sm">
          <div className="rounded-md border p-3"><div className="text-muted-foreground text-xs">Pagas</div><div className="font-bold text-lg">{pagas}/{mens.length}</div></div>
          <div className="rounded-md border p-3"><div className="text-muted-foreground text-xs">Recebido</div><div className="font-bold text-lg text-green-600">{BRL(totalPago)}</div></div>
          <div className="rounded-md border p-3"><div className="text-muted-foreground text-xs">A receber</div><div className="font-bold text-lg text-orange-600">{BRL(aReceber)}</div></div>
          </div>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" onClick={() => printContrato(contrato.id)}><Printer className="h-4 w-4 mr-1"/>Imprimir A4</Button>
          <Button size="sm" variant="secondary" onClick={() => printCartoes(contrato.id)}><CreditCard className="h-4 w-4 mr-1"/>Imprimir cartão{deps.length > 0 ? `(${deps.length + 1})` : ""}</Button>
          <Button size="sm" variant="outline" onClick={copiarLink}><Link2 className="h-4 w-4 mr-1"/>Link de assinatura</Button>
          {contrato.assinado_em ? <Badge variant="default"><Check className="h-3 w-3 mr-1"/>Assinado em {fmtD(contrato.assinado_em)}</Badge> : <Badge variant="outline">Aguardando assinatura</Badge>}
        </div>

        {deps.length > 0 ? (
          <div>
            <h3 className="font-semibold text-sm mb-1">Dependentes/Agregados</h3>
            <div className="rounded-md border bg-muted/30 p-2 text-sm space-y-1">
              {deps.map((d) => <div key={d.id}>• {d.paciente_nome} <span className="text-muted-foreground">— {d.parentesco ?? "—"} ({d.tipo})</span></div>)}
            </div>
          </div>
        ) : null}

        <div>
          <h3 className="font-semibold text-sm mb-1">Mensalidades</h3>
          <div className="rounded-md border">
            <Table>
              <TableHeader><TableRow><TableHead>#</TableHead><TableHead>Vencimento</TableHead><TableHead>Valor</TableHead><TableHead>Status</TableHead><TableHead>Pago em</TableHead><TableHead></TableHead></TableRow></TableHeader>
              <TableBody>
                {loading ? <TableRow><TableCell colSpan={6} className="text-center py-4 text-muted-foreground">Carregando…</TableCell></TableRow> : null}
                {mens.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>{m.numero_parcela}</TableCell>
                    <TableCell>{fmtD(m.vencimento)}</TableCell>
                    <TableCell>{BRL(m.valor)}</TableCell>
                    <TableCell><Badge variant={m.status === "pago" ? "default" : new Date(m.vencimento) < new Date() ? "destructive" : "outline"}>{m.status === "pago" ? "Pago" : new Date(m.vencimento) < new Date() ? "Atrasado" : "Pendente"}</Badge></TableCell>
                    <TableCell>{fmtD(m.pago_em)}</TableCell>
                    <TableCell>
                      {m.status === "pago"
                        ? <Button size="sm" variant="outline" onClick={() => marcarPago(m.id, false)}>Reverter</Button>
                        : <Button size="sm" onClick={() => marcarPago(m.id, true)}><Check className="h-3 w-3 mr-1"/>Pagar</Button>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
        </CardContent>
      </Card>
    </div>
  );
}