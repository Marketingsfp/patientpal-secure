import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { FileSignature, Plus, Printer, Search, Trash2, Link2, Check, ChevronRight, CreditCard, Camera, ArrowLeft, Ban, XCircle } from "lucide-react";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { LancamentoDialog } from "@/components/financeiro/lancamento-dialog";
import DOMPurify from "dompurify";
import { ChevronsUpDown } from "lucide-react";
import { printContrato } from "@/lib/print-contrato";
import { fmtDataExtenso } from "@/lib/print-contrato";
import { printCartoes } from "@/lib/print-cartao";
import { FaceCaptureDialog } from "@/components/face/FaceCaptureDialog";
import type { PatientOption } from "@/components/patient-search-input";

export const Route = createFileRoute("/_authenticated/app/contratos")({
  component: ContratosPage,
  head: () => ({ meta: [{ title: "Contratos — ClinicaOS" }] }),
});

const BRL = (v: number) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtD = (s?: string | null) => (s ? new Date(s + (s.length === 10 ? "T00:00:00" : "")).toLocaleDateString("pt-BR") : "—");
const TAXA_BOLETO = 3.5;

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
type Contrato = { id: string; numero: number; paciente_nome: string; convenio_id: string | null; plano_id: string | null; valor_mensal: number; status: string; data_inicio: string; data_fim: string | null; assinado_em: string | null; token_publico: string; forma_pagamento: string | null; dia_vencimento?: number | null; taxa_adesao?: number | null; num_parcelas?: number | null; paciente_id?: string | null; clinica_id?: string | null; observacoes?: string | null; cancelado_em?: string | null; cancelamento_motivo?: string | null };
type Mens = { id: string; numero_parcela: number; vencimento: string; valor: number; status: string; pago_em: string | null; forma_pagamento: string | null };
type Dep = {
  id: string;
  paciente_id: string;
  paciente_nome: string;
  parentesco: string | null;
  tipo: string;
  cpf?: string | null;
  incluido_em: string | null;
  excluido_em: string | null;
  ativo: boolean;
};

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
        <Button onClick={() => setView("new")} disabled={convenios.length === 0}><Plus className="h-4 w-4 mr-2"/>Vendas</Button>
      </div>
      {convenios.length === 0 && !loading ? (
        <div className="rounded-md border bg-muted/40 p-3 text-sm">Cadastre um convênio antes em <strong>Cartão de Benefícios → Convênios</strong>.</div>
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
  const [clientes, setClientes] = useState<Paciente[]>([]);
  const [titularOpen, setTitularOpen] = useState(false);
  const [depOpen, setDepOpen] = useState(false);
  const [valor, setValor] = useState(0);
  const [taxa, setTaxa] = useState(0);
  const [faixaId, setFaixaId] = useState<string>("");
  const [diaVenc, setDiaVenc] = useState(10);
  const [dataInicio, setDataInicio] = useState(new Date().toISOString().slice(0, 10));
  const [forma, setForma] = useState("dinheiro");
  const [obs, setObs] = useState("");
  const [deps, setDeps] = useState<Array<Paciente & { parentesco: string; tipo: string }>>([]);
  const [saving, setSaving] = useState(false);
  const [faceOpen, setFaceOpen] = useState<null | "titular" | number>(null);

  useEffect(() => {
    if (convenio) { setValor(Number(convenio.valor_mensal)); setTaxa(Number(convenio.taxa_adesao)); }
  }, [convenioId]);

  // Carrega todos os clientes (pacientes) ativos da clínica
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("pacientes")
        .select("id, nome, cpf, telefone, email, face_descriptor")
        .eq("clinica_id", clinicaId).eq("ativo", true).order("nome");
      setClientes((data ?? []) as Paciente[]);
    })();
  }, [clinicaId]);

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

  // Quando faixas mudam (troca de convênio), pré-seleciona a faixa que cobre titular+deps atuais
  useEffect(() => {
    if (!convenio) return;
    if (faixas.length === 0) {
      setFaixaId("");
      setValor(Number(convenio.valor_mensal));
      return;
    }
    const vidasAtuais = (titular ? 1 : 0) + deps.length;
    const inicial =
      faixas.find((f) => vidasAtuais >= f.vidas_de && (f.vidas_ate == null || vidasAtuais <= f.vidas_ate)) ??
      faixas[0];
    setFaixaId(inicial.id);
    setValor(Number(inicial.valor_mensal));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [faixas]);

  // Quando o usuário muda a faixa manualmente, atualiza o valor mensal
  useEffect(() => {
    if (!faixaId) return;
    const f = faixas.find((x) => x.id === faixaId);
    if (f) setValor(Number(f.valor_mensal));
  }, [faixaId, faixas]);

  const labelFaixa = (f: Faixa) => {
    const range =
      f.vidas_ate == null
        ? `${f.vidas_de}+ pessoas`
        : f.vidas_ate === f.vidas_de
          ? `${f.vidas_de} ${f.vidas_de === 1 ? "pessoa" : "pessoas"}`
          : `${f.vidas_de} a ${f.vidas_ate} pessoas`;
    return `${range} — ${BRL(Number(f.valor_mensal))}`;
  };

  const addDep = (p: Paciente) => {
    if (!convenio) return;
    const max = Number(convenio.max_dependentes ?? 0) || 0;
    if (deps.length >= max) {
      return toast.error(max === 0
        ? "Este convênio não permite dependentes."
        : `Limite de ${max} dependentes atingido.`);
    }
    if (deps.find((d) => d.id === p.id) || titular?.id === p.id) return;
    setDeps([...deps, { ...p, parentesco: "", tipo: "dependente" }]);
    setDepOpen(false);
  };

  const salvar = async () => {
    if (!titular || !convenio) return toast.error("Selecione paciente e convênio");
    const maxDep = Number(convenio.max_dependentes ?? 0) || 0;
    if (deps.length > maxDep) {
      return toast.error(maxDep === 0
        ? "Este convênio não permite dependentes."
        : `Limite de ${maxDep} dependentes excedido.`);
    }
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
    const valorParcela = valor + (forma === "boleto" ? TAXA_BOLETO : 0);
    const parcelas = Array.from({ length: convenio.num_parcelas }, (_, i) => {
      const venc = new Date(base.getFullYear(), base.getMonth() + i, diaVenc);
      return {
        contrato_id: contrato.id, clinica_id: clinicaId,
        numero_parcela: i + 1, vencimento: venc.toISOString().slice(0, 10),
        valor: valorParcela, status: "pendente",
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
          </div>
          {faixas.length > 0 ? (
            <div className="col-span-2">
              <Label>Nº de pessoas no contrato</Label>
              <Select value={faixaId} onValueChange={setFaixaId}>
                <SelectTrigger><SelectValue placeholder="Selecione a faixa…"/></SelectTrigger>
                <SelectContent>
                  {faixas.map((f) => (
                    <SelectItem key={f.id} value={f.id}>{labelFaixa(f)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                O valor mensal é definido pela faixa selecionada (cadastrada no convênio).
              </p>
            </div>
          ) : null}
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
              <Popover open={titularOpen} onOpenChange={setTitularOpen}>
                <PopoverTrigger asChild>
                  <Button type="button" variant="outline" role="combobox" className="w-full justify-between font-normal">
                    <span className="text-muted-foreground">Selecionar cliente…</span>
                    <ChevronsUpDown className="h-4 w-4 opacity-50"/>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
                  <Command>
                    <CommandInput placeholder="Buscar cliente por nome ou CPF…"/>
                    <CommandList>
                      <CommandEmpty>Nenhum cliente encontrado.</CommandEmpty>
                      <CommandGroup>
                        {clientes.map((p) => (
                          <CommandItem key={p.id} value={`${p.nome} ${p.cpf ?? ""}`} onSelect={() => { setTitular(p); setTitularOpen(false); }}>
                            {p.nome} {p.cpf ? `— ${p.cpf}` : ""}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            )}
          </div>
          <div><Label>Data início</Label><Input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)}/></div>
          <div><Label>Dia de vencimento</Label><Input type="number" min={1} max={28} value={diaVenc} onChange={(e) => setDiaVenc(Number(e.target.value))}/></div>
          <div>
            <Label>Valor mensal</Label>
            <div className="h-10 rounded-md border bg-muted/30 px-3 flex items-center font-semibold">{BRL(valor)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {faixas.length > 0
                ? "Definido pela faixa de pessoas selecionada acima."
                : "Definido pelo convênio."}
              {forma === "boleto" ? (
                <span className="block text-amber-600 font-medium">
                  + {BRL(TAXA_BOLETO)} de taxa de boleto por parcela — total da parcela: {BRL(valor + TAXA_BOLETO)}
                </span>
              ) : null}
            </p>
          </div>
          <div>
            <Label>Taxa de adesão</Label>
            <div className="h-10 rounded-md border bg-muted/30 px-3 flex items-center font-semibold">{BRL(taxa)}</div>
            <p className="text-xs text-muted-foreground mt-1">Cobrança única, definida pelo convênio.</p>
          </div>
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
            <Label>
              Dependentes {convenio ? `(${deps.length}/${convenio.max_dependentes ?? 0})` : ""}
            </Label>
            <Popover open={depOpen} onOpenChange={setDepOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  className="w-full justify-between font-normal mt-1"
                  disabled={!convenio || deps.length >= (Number(convenio?.max_dependentes ?? 0) || 0)}
                >
                  <span className="text-muted-foreground">
                    {convenio && deps.length >= (Number(convenio.max_dependentes ?? 0) || 0)
                      ? (convenio.max_dependentes ?? 0) === 0
                        ? "Convênio sem dependentes"
                        : `Limite atingido (${deps.length}/${convenio.max_dependentes})`
                      : "Adicionar cliente como dependente…"}
                  </span>
                  <ChevronsUpDown className="h-4 w-4 opacity-50"/>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
                <Command>
                  <CommandInput placeholder="Buscar cliente por nome ou CPF…"/>
                  <CommandList>
                    <CommandEmpty>Nenhum cliente encontrado.</CommandEmpty>
                    <CommandGroup>
                      {clientes
                        .filter((p) => p.id !== titular?.id && !deps.find((d) => d.id === p.id))
                        .map((p) => (
                          <CommandItem key={p.id} value={`${p.nome} ${p.cpf ?? ""}`} onSelect={() => addDep(p)}>
                            + {p.nome} {p.cpf ? `— ${p.cpf}` : ""}
                          </CommandItem>
                        ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {deps.length > 0 ? (
              <div className="mt-2 space-y-1">
                {deps.map((d, i) => (
                  <div key={d.id} className="grid grid-cols-12 gap-2 items-center">
                    <span className="col-span-3 text-sm truncate flex items-center gap-1">
                      {d.nome}
                      {d.face_descriptor && d.face_descriptor.length > 0 ? <Check className="h-3 w-3 text-green-600"/> : null}
                    </span>
                    <Select value={d.parentesco} onValueChange={(v) => setDeps(deps.map((x, j) => j === i ? { ...x, parentesco: v } : x))}>
                      <SelectTrigger className="col-span-3 h-8"><SelectValue placeholder="Parentesco"/></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Filho(a)">Filho(a)</SelectItem>
                        <SelectItem value="Cônjuge">Cônjuge</SelectItem>
                        <SelectItem value="Pai">Pai</SelectItem>
                        <SelectItem value="Mãe">Mãe</SelectItem>
                        <SelectItem value="Irmão(ã)">Irmão(ã)</SelectItem>
                        <SelectItem value="Outro">Outro</SelectItem>
                      </SelectContent>
                    </Select>
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
        {faceOpen !== null ? (
          <FaceCaptureDialog
            open={faceOpen !== null}
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
  const DadosField = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="space-y-1">
      <div className="text-sm font-medium">{label}</div>
      <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">{value || "—"}</div>
    </div>
  );
  const [mens, setMens] = useState<Mens[]>([]);
  const [deps, setDeps] = useState<Dep[]>([]);
  const [convenio, setConvenio] = useState<any>(null);
  const [clinica, setClinica] = useState<any>(null);
  const [pacienteFull, setPacienteFull] = useState<any>(null);
  const [faixas, setFaixas] = useState<Faixa[]>([]);
  const [loading, setLoading] = useState(true);

  // Inclusão/exclusão de dependentes pós-venda
  const [incOpen, setIncOpen] = useState(false);
  const [incPaciente, setIncPaciente] = useState<PatientOption | null>(null);
  const [incParentesco, setIncParentesco] = useState<string>("");
  const [incTipo, setIncTipo] = useState<string>("dependente");
  const [incSaving, setIncSaving] = useState(false);
  const [incPacientes, setIncPacientes] = useState<PatientOption[]>([]);
  const [incLoadingPac, setIncLoadingPac] = useState(false);
  const [excAlvo, setExcAlvo] = useState<Dep | null>(null);
  const [termoOpen, setTermoOpen] = useState(false);
  const [termoMovimento, setTermoMovimento] = useState<"Inclusão" | "Exclusão">("Inclusão");
  const [termoDep, setTermoDep] = useState<Dep | null>(null);

  // Cancelamento do contrato
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelMotivo, setCancelMotivo] = useState("");
  const [cancelSaving, setCancelSaving] = useState(false);
  const [canceladoEm, setCanceladoEm] = useState<string | null>(contrato.cancelado_em ?? null);
  const [cancelMotivoAtual, setCancelMotivoAtual] = useState<string | null>(contrato.cancelamento_motivo ?? null);
  const cancelado = !!canceladoEm;

  const confirmarCancelamento = async () => {
    const motivo = cancelMotivo.trim();
    if (!motivo) { toast.error("Informe o motivo do cancelamento"); return; }
    setCancelSaving(true);
    const agora = new Date().toISOString();
    const { error } = await supabase
      .from("contratos_assinatura")
      .update({
        status: "cancelado",
        cancelado_em: agora,
        cancelamento_motivo: motivo,
      } as any)
      .eq("id", contrato.id);
    setCancelSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Contrato cancelado");
    setCanceladoEm(agora);
    setCancelMotivoAtual(motivo);
    setCancelOpen(false);
    setCancelMotivo("");
  };

  // Diálogo de forma de pagamento (espelha o da agenda)
  const [pagMens, setPagMens] = useState<Mens | null>(null);
  const [formaPagOpen, setFormaPagOpen] = useState(false);
  const [lancOpen, setLancOpen] = useState(false);

  const formaOpcoes: Array<{ forma: string; label: string }> = [
    { forma: "dinheiro", label: "Dinheiro" },
    { forma: "pix", label: "Pix" },
    { forma: "debito", label: "Cartão de Débito" },
    { forma: "credito", label: "Cartão de Crédito" },
    { forma: "boleto", label: "Boleto" },
  ];

  const load = async () => {
    setLoading(true);
    const [m, d, cv, cl, pa, fx] = await Promise.all([
      supabase.from("contrato_mensalidades").select("*").eq("contrato_id", contrato.id).order("numero_parcela"),
      supabase
        .from("contrato_dependentes")
        .select("id, paciente_id, paciente_nome, parentesco, tipo, incluido_em, excluido_em, ativo")
        .eq("contrato_id", contrato.id),
      contrato.convenio_id
        ? supabase
            .from("cb_convenios")
            .select("nome, modelo_contrato, termo_inclusao_html, vigencia_meses, fidelidade_meses, max_dependentes")
            .eq("id", contrato.convenio_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from("clinicas").select("nome, cnpj, endereco, cidade, estado, telefone").eq("id", (contrato as any).clinica_id ?? "").maybeSingle(),
      supabase.from("pacientes").select("cpf, data_nascimento, telefone, email, logradouro, numero, bairro, cidade, estado, cep").eq("id", (contrato as any).paciente_id ?? "").maybeSingle(),
      contrato.convenio_id
        ? supabase.from("cb_convenio_faixas").select("*").eq("convenio_id", contrato.convenio_id).order("vidas_de")
        : Promise.resolve({ data: [] }),
    ]);
    setMens((m.data ?? []) as Mens[]);
    const rows = (d.data ?? []) as any[];
    const pids = Array.from(new Set(rows.map((r) => r.paciente_id).filter(Boolean)));
    let cpfMap: Record<string, string | null> = {};
    if (pids.length) {
      const { data: pacs } = await supabase
        .from("pacientes")
        .select("id, cpf")
        .in("id", pids);
      cpfMap = Object.fromEntries((pacs ?? []).map((p: any) => [p.id, p.cpf]));
    }
    const depsRows = rows.map((r) => ({
      id: r.id,
      paciente_id: r.paciente_id,
      paciente_nome: r.paciente_nome,
      parentesco: r.parentesco,
      tipo: r.tipo,
      cpf: cpfMap[r.paciente_id] ?? null,
      incluido_em: r.incluido_em ?? null,
      excluido_em: r.excluido_em ?? null,
      ativo: !!r.ativo,
    })) as Dep[];
    // Ativos primeiro (por inclusão asc), depois excluídos (por exclusão desc)
    depsRows.sort((a, b) => {
      if (a.ativo !== b.ativo) return a.ativo ? -1 : 1;
      if (a.ativo) return (a.incluido_em ?? "").localeCompare(b.incluido_em ?? "");
      return (b.excluido_em ?? "").localeCompare(a.excluido_em ?? "");
    });
    setDeps(depsRows);
    setConvenio(cv.data ?? null);
    setClinica(cl.data ?? null);
    setPacienteFull(pa.data ?? null);
    setFaixas(((fx as any).data ?? []) as Faixa[]);
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [contrato.id]);

  // Carrega lista de pacientes da clínica do contrato ao abrir o diálogo
  useEffect(() => {
    if (!incOpen) return;
    let cancelled = false;
    (async () => {
      setIncLoadingPac(true);
      const { data } = await supabase
        .from("pacientes")
        .select("id, nome, cpf, telefone, data_nascimento, clinica_id")
        .eq("clinica_id", (contrato as any).clinica_id)
        .order("nome");
      if (cancelled) return;
      setIncPacientes((data ?? []) as PatientOption[]);
      setIncLoadingPac(false);
    })();
    return () => { cancelled = true; };
  }, [incOpen, contrato]);

  const marcarPago = async (id: string, paga: boolean, forma?: string | null) => {
    const patch = paga
      ? {
          status: "pago",
          pago_em: new Date().toISOString().slice(0, 10),
          ...(forma !== undefined ? { forma_pagamento: forma } : {}),
        }
      : { status: "pendente", pago_em: null, forma_pagamento: null };
    const { error } = await supabase.from("contrato_mensalidades").update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };

  const abrirFormaPag = (m: Mens) => {
    setPagMens(m);
    setFormaPagOpen(true);
  };
  const escolherForma = async (forma: string) => {
    if (!pagMens) return;
    setFormaPagOpen(false);
    await marcarPago(pagMens.id, true, forma);
    setPagMens(null);
  };
  const escolherMisto = () => {
    setFormaPagOpen(false);
    setLancOpen(true);
  };

  // Atalhos 1–6 dentro do diálogo de forma de pagamento
  useEffect(() => {
    if (!formaPagOpen) return;
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (!Number.isFinite(n)) return;
      if (n >= 1 && n <= formaOpcoes.length) {
        e.preventDefault();
        void escolherForma(formaOpcoes[n - 1].forma);
      } else if (n === formaOpcoes.length + 1) {
        e.preventDefault();
        escolherMisto();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [formaPagOpen, pagMens?.id]);

  const copiarLink = async () => {
    const url = `${window.location.origin}/p/contrato/${contrato.token_publico}`;
    await navigator.clipboard.writeText(url);
    toast.success("Link de assinatura copiado");
  };

  const pagas = mens.filter((m) => m.status === "pago").length;
  const totalPago = mens.filter((m) => m.status === "pago").reduce((s, m) => s + Number(m.valor), 0);
  const aReceber = mens.filter((m) => m.status !== "pago").reduce((s, m) => s + Number(m.valor), 0);

  // ---- Dados da venda (aba "Dados") ----
  const faixaAtual = faixas.find((f) => Number(f.valor_mensal) === Number(contrato.valor_mensal)) ?? null;
  const faixaLabel = faixaAtual
    ? (faixaAtual.vidas_ate == null
        ? `${faixaAtual.vidas_de}+ pessoas`
        : faixaAtual.vidas_ate === faixaAtual.vidas_de
          ? `${faixaAtual.vidas_de} ${faixaAtual.vidas_de === 1 ? "pessoa" : "pessoas"}`
          : `${faixaAtual.vidas_de} a ${faixaAtual.vidas_ate} pessoas`) + ` — ${BRL(Number(faixaAtual.valor_mensal))}`
    : "—";
  const formaLabelMap: Record<string, string> = {
    dinheiro: "Dinheiro", pix: "Pix", debito: "Cartão de Débito",
    credito: "Cartão de Crédito", boleto: "Boleto",
  };
  const formaLabel = formaLabelMap[contrato.forma_pagamento ?? ""] ?? (contrato.forma_pagamento ?? "—");
  const maxDep = Number(convenio?.max_dependentes ?? 0) || 0;
  const depsAtivos = deps.filter((d) => d.ativo);

  const renderTermo = (dep: Dep, movimento: "Inclusão" | "Exclusão"): string => {
    const tpl = convenio?.termo_inclusao_html ?? "";
    if (!tpl) return "";
    const _cl = clinica ?? {};
    const _pa = pacienteFull ?? {};
    const enderecoPaciente = [_pa.logradouro, _pa.numero, _pa.bairro, _pa.cidade && _pa.estado ? `${_pa.cidade}-${_pa.estado}` : _pa.cidade].filter(Boolean).join(", ");
    const dataMov = movimento === "Inclusão" ? dep.incluido_em : dep.excluido_em;
    const vars: Record<string, string> = {
      CLINICA_NOME: _cl.nome ?? "",
      CLINICA_CNPJ: _cl.cnpj ?? "",
      CLINICA_ENDERECO: [_cl.endereco, _cl.cidade, _cl.estado].filter(Boolean).join(", "),
      CIDADE: _cl.cidade ?? "",
      CONTRATO_NUMERO: String(contrato.numero),
      PACIENTE_NOME: contrato.paciente_nome ?? "",
      PACIENTE_CPF: _pa.cpf ?? "",
      PACIENTE_NASCIMENTO: fmtD(_pa.data_nascimento),
      PACIENTE_ENDERECO: enderecoPaciente,
      PACIENTE_TELEFONE: _pa.telefone ?? "",
      PACIENTE_EMAIL: _pa.email ?? "",
      VALOR_MENSAL: BRL(Number(contrato.valor_mensal)),
      TAXA_ADESAO: BRL(Number((contrato as any).taxa_adesao ?? 0)),
      DATA_HOJE: fmtDataExtenso(new Date().toISOString()),
      DEPENDENTE_NOME: dep.paciente_nome,
      DEPENDENTE_PARENTESCO: dep.parentesco ?? "",
      DEPENDENTE_CPF: dep.cpf ?? "",
      DEPENDENTE_TIPO: dep.tipo,
      TIPO_MOVIMENTO: movimento,
      DATA_MOVIMENTO: fmtDataExtenso(dataMov ?? new Date().toISOString().slice(0, 10)),
    };
    return tpl.replace(/\{\{(\w+)\}\}/g, (_m: string, k: string) => vars[k] ?? "");
  };

  const printTermoInclusao = () => {
    if (!termoDep) return;
    const html = renderTermo(termoDep, termoMovimento);
    const safe = DOMPurify.sanitize(html);
    const titulo = `Termo de ${termoMovimento} — Contrato #${contrato.numero}`;
    const doc = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/>
<title>${titulo}</title>
<style>
@page { size: A4; margin: 18mm; }
body { font-family: Arial, Helvetica, sans-serif; font-size: 11pt; color:#000; line-height: 1.45; }
h1, h2, h3 { margin: 0 0 6mm; }
.head { text-align:center; margin-bottom: 6mm; font-size: 10pt; }
.sig { margin-top: 14mm; display:flex; justify-content: space-around; gap:10mm; text-align:center; font-size: 10pt; }
.sig div { width:45%; }
</style></head><body>
<div class="head"><strong>${clinica?.nome ?? ""}</strong><br/>${[clinica?.endereco, clinica?.cidade, clinica?.estado].filter(Boolean).join(" — ")}<br/>CNPJ: ${clinica?.cnpj ?? ""}</div>
<div>${safe}</div>
<div class="sig">
  <div>____________________________<br/>${clinica?.nome ?? ""}</div>
  <div>____________________________<br/>${contrato.paciente_nome}</div>
</div>
<script>window.onload=()=>{setTimeout(()=>{window.print();},300);};</script>
</body></html>`;
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) { toast.error("Bloqueador de pop-up impediu a impressão"); return; }
    w.document.open(); w.document.write(doc); w.document.close();
  };

  const abrirTermoSeAssinado = (dep: Dep, movimento: "Inclusão" | "Exclusão") => {
    if (!contrato.assinado_em) return;
    if (!convenio?.termo_inclusao_html) {
      toast.message("Contrato assinado, mas o convênio não possui Termo de Inclusão cadastrado.");
      return;
    }
    setTermoDep(dep);
    setTermoMovimento(movimento);
    setTermoOpen(true);
  };

  const confirmarIncluir = async () => {
    if (!incPaciente) { toast.error("Selecione um paciente"); return; }
    if (depsAtivos.length >= maxDep) {
      toast.error(maxDep === 0 ? "Este convênio não permite dependentes." : `Limite de ${maxDep} dependentes atingido.`);
      return;
    }
    if (depsAtivos.find((d) => d.paciente_id === incPaciente.id)) {
      toast.error("Esse paciente já é dependente ativo deste contrato");
      return;
    }
    if (incPaciente.id === (contrato as any).paciente_id) {
      toast.error("O titular não pode ser dependente");
      return;
    }
    setIncSaving(true);
    const hoje = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from("contrato_dependentes")
      .insert({
        contrato_id: contrato.id,
        paciente_id: incPaciente.id,
        paciente_nome: incPaciente.nome,
        parentesco: incParentesco || null,
        tipo: incTipo,
        incluido_em: hoje,
        ativo: true,
      })
      .select("id, paciente_id, paciente_nome, parentesco, tipo, incluido_em, excluido_em, ativo")
      .maybeSingle();
    setIncSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Dependente incluído");
    setIncOpen(false);
    const novoDep: Dep = {
      id: data!.id,
      paciente_id: data!.paciente_id,
      paciente_nome: data!.paciente_nome,
      parentesco: data!.parentesco,
      tipo: data!.tipo,
      cpf: incPaciente.cpf,
      incluido_em: data!.incluido_em,
      excluido_em: data!.excluido_em,
      ativo: !!data!.ativo,
    };
    setIncPaciente(null); setIncParentesco(""); setIncTipo("dependente");
    await load();
    abrirTermoSeAssinado(novoDep, "Inclusão");
  };

  const confirmarExcluir = async () => {
    if (!excAlvo) return;
    const hoje = new Date().toISOString().slice(0, 10);
    const { error } = await supabase
      .from("contrato_dependentes")
      .update({ ativo: false, excluido_em: hoje })
      .eq("id", excAlvo.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Dependente excluído");
    const alvo = { ...excAlvo, ativo: false, excluido_em: hoje };
    setExcAlvo(null);
    await load();
    abrirTermoSeAssinado(alvo, "Exclusão");
  };

  const contratoTexto = useMemo(() => {
    const tpl = convenio?.modelo_contrato ?? "";
    if (!tpl) return "";
    const _cl = clinica ?? {};
    const _pa = pacienteFull ?? {};
    const dependentesTxt = deps.length
      ? deps.map((d, i) => `${i + 1}. ${d.paciente_nome} — ${d.parentesco ?? "—"} (${d.tipo})`).join("\n")
      : "(nenhum)";
    const enderecoPaciente = [_pa.logradouro, _pa.numero, _pa.bairro, _pa.cidade && _pa.estado ? `${_pa.cidade}-${_pa.estado}` : _pa.cidade].filter(Boolean).join(", ");
    const maxSlots = Math.max(Number(convenio?.max_dependentes ?? 0) || 0, deps.length);
    const depSlotVars: Record<string, string> = {};
    for (let i = 0; i < maxSlots; i++) {
      const d = deps[i];
      const idx = i + 1;
      depSlotVars[`DEPENDENTE_${idx}`] = d?.paciente_nome ?? "";
      depSlotVars[`DEPENDENTE_${idx}_PARENTESCO`] = d?.parentesco ?? "";
      depSlotVars[`DEPENDENTE_${idx}_CPF`] = d?.cpf ?? "";
    }
    const vars: Record<string, string> = {
      CLINICA_NOME: _cl.nome ?? "",
      CLINICA_CNPJ: _cl.cnpj ?? "",
      CLINICA_ENDERECO: [_cl.endereco, _cl.cidade, _cl.estado].filter(Boolean).join(", "),
      CIDADE: _cl.cidade ?? "",
      PACIENTE_NOME: contrato.paciente_nome ?? "",
      PACIENTE_CPF: _pa.cpf ?? "",
      PACIENTE_NASCIMENTO: fmtD(_pa.data_nascimento),
      PACIENTE_ENDERECO: enderecoPaciente,
      PACIENTE_TELEFONE: _pa.telefone ?? "",
      PACIENTE_EMAIL: _pa.email ?? "",
      VALOR_MENSAL: BRL(Number(contrato.valor_mensal)),
      TAXA_ADESAO: BRL(Number((contrato as any).taxa_adesao ?? 0)),
      NUM_PARCELAS: String((contrato as any).num_parcelas ?? mens.length),
      VIGENCIA_MESES: String(convenio?.vigencia_meses ?? 12),
      FIDELIDADE_MESES: String(convenio?.fidelidade_meses ?? 0),
      DATA_HOJE: fmtDataExtenso(new Date().toISOString()),
      DEPENDENTES: dependentesTxt,
      ...depSlotVars,
    };
    return tpl.replace(/\{\{(\w+)\}\}/g, (_m: string, k: string) => vars[k] ?? "");
  }, [convenio, clinica, pacienteFull, deps, mens.length, contrato]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
        </Button>
        <h1 className="text-2xl font-bold">Contrato #{contrato.numero} — {contrato.paciente_nome}</h1>
        <div>
          {!cancelado ? (
            <Button size="sm" variant="destructive" onClick={() => setCancelOpen(true)}>
              <Ban className="h-4 w-4 mr-1" /> Cancelar contrato
            </Button>
          ) : (
            <div className="w-[160px]" />
          )}
        </div>
      </div>
      <Card>
        <CardContent className="p-6 space-y-4">
        <Tabs defaultValue="resumo">
          <TabsList>
            <TabsTrigger value="resumo">Resumo</TabsTrigger>
            <TabsTrigger value="dados">Dados</TabsTrigger>
            <TabsTrigger value="contrato">Contrato</TabsTrigger>
          </TabsList>
          <TabsContent value="resumo" className="space-y-4 mt-4">
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
                        : <Button size="sm" onClick={() => abrirFormaPag(m)}><Check className="h-3 w-3 mr-1"/>Pagar</Button>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
          </TabsContent>
          <TabsContent value="dados" className="mt-4 space-y-4">
            <DadosField label="Convênio" value={convenio?.nome ?? "—"} />
            <DadosField label="Nº de pessoas no contrato" value={faixaLabel} />
            <DadosField
              label="Paciente titular"
              value={`${contrato.paciente_nome}${pacienteFull?.cpf ? ` — CPF ${pacienteFull.cpf}` : ""}`}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <DadosField label="Data início" value={fmtD(contrato.data_inicio)} />
              <DadosField label="Dia de vencimento" value={contrato.dia_vencimento ?? "—"} />
              <DadosField label="Valor mensal" value={BRL(Number(contrato.valor_mensal))} />
              <DadosField label="Taxa de adesão" value={BRL(Number(contrato.taxa_adesao ?? 0))} />
            </div>
            <DadosField label="Forma de pagamento" value={formaLabel} />
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">Dependentes ({depsAtivos.length}/{maxDep})</div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setIncOpen(true)}
                  disabled={maxDep === 0 || depsAtivos.length >= maxDep}
                >
                  <Plus className="h-4 w-4 mr-1" /> Incluir dependente
                </Button>
              </div>
              <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                {deps.length === 0 ? "Nenhum dependente" : (
                  <ul className="space-y-1">
                    {deps.map((d) => (
                      <li key={d.id} className="flex items-center justify-between gap-2">
                        <div className={d.ativo ? "" : "text-muted-foreground line-through"}>
                          • {d.paciente_nome}
                          <span className="text-muted-foreground no-underline"> — {d.parentesco ?? "—"} ({d.tipo}){d.cpf ? ` — CPF ${d.cpf}` : ""}</span>
                          <span className="text-muted-foreground no-underline"> — Incluído: {fmtD(d.incluido_em)}</span>
                          {d.excluido_em ? (
                            <span className="text-destructive no-underline"> — Excluído: {fmtD(d.excluido_em)}</span>
                          ) : null}
                        </div>
                        {d.ativo ? (
                          <Button size="sm" variant="ghost" onClick={() => setExcAlvo(d)}>
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            {contrato.observacoes ? (
              <DadosField label="Observações" value={contrato.observacoes} />
            ) : null}
          </TabsContent>
          <TabsContent value="contrato" className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-muted-foreground">
                {convenio?.nome ? `Modelo do convênio: ${convenio.nome}` : "Modelo do contrato"}
              </div>
              <Button size="sm" onClick={() => printContrato(contrato.id)}>
                <Printer className="h-4 w-4 mr-1"/>Imprimir A4
              </Button>
            </div>
            {contratoTexto ? (
              /<[a-z][\s\S]*>/i.test(contratoTexto) ? (
                <div
                  className="prose prose-sm max-w-none p-4 rounded-md border bg-card"
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(contratoTexto) }}
                />
              ) : (
                <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed p-4 rounded-md border bg-card">{contratoTexto}</pre>
              )
            ) : (
              <div className="rounded-md border bg-muted/40 p-4 text-sm text-muted-foreground">
                Nenhum modelo cadastrado neste convênio. Configure em <strong>Cartão de Benefícios → Convênios</strong>.
              </div>
            )}
          </TabsContent>
        </Tabs>
        </CardContent>
      </Card>

      <Dialog open={formaPagOpen} onOpenChange={setFormaPagOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Forma de pagamento</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground -mt-2">
            {contrato.paciente_nome} — Contrato #{contrato.numero}
            {pagMens ? ` · Parcela ${pagMens.numero_parcela}/${mens.length}` : ""}
            <span className="block text-xs mt-1 opacity-70">Dica: use as teclas 1–{formaOpcoes.length + 1} para escolher rapidamente.</span>
          </p>
          <div className="grid gap-2 mt-2">
            {formaOpcoes.map((op, idx) => (
              <Button
                key={op.forma}
                variant="outline"
                className="justify-between h-12"
                onClick={() => escolherForma(op.forma)}
              >
                <span className="flex items-center gap-2">
                  <kbd className="inline-flex h-6 w-6 items-center justify-center rounded border bg-muted text-xs font-mono">{idx + 1}</kbd>
                  {op.label}
                </span>
                <span className="font-semibold">{BRL(Number(pagMens?.valor ?? 0))}</span>
              </Button>
            ))}
            <Button
              variant="default"
              className="justify-center h-12 mt-1 bg-primary"
              onClick={escolherMisto}
            >
              <kbd className="inline-flex h-6 w-6 items-center justify-center rounded border border-primary-foreground/40 bg-primary-foreground/10 text-xs font-mono mr-2">{formaOpcoes.length + 1}</kbd>
              💰 Mais de uma forma de pagamento
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <LancamentoDialog
        open={lancOpen}
        onOpenChange={(v) => { setLancOpen(v); if (!v) setPagMens(null); }}
        tipo="receita"
        initialDescricao={pagMens ? `Mensalidade ${pagMens.numero_parcela}/${mens.length} — Contrato #${contrato.numero} — ${contrato.paciente_nome}` : ""}
        initialValor={pagMens ? String(pagMens.valor) : ""}
        onSavedWithData={async (dados) => {
          if (!pagMens) return;
          await marcarPago(pagMens.id, true, dados.forma_pagamento ?? "misto");
          setPagMens(null);
        }}
      />

      <Dialog open={incOpen} onOpenChange={setIncOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Incluir dependente</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Paciente</Label>
              <Select
                value={incPaciente?.id ?? ""}
                onValueChange={(id) => {
                  const p = incPacientes.find((x) => x.id === id) ?? null;
                  setIncPaciente(p);
                }}
                disabled={incLoadingPac}
              >
                <SelectTrigger>
                  <SelectValue placeholder={incLoadingPac ? "Carregando pacientes…" : "Selecione o paciente"} />
                </SelectTrigger>
                <SelectContent>
                  {(() => {
                    const titularId = (contrato as any).paciente_id as string | undefined;
                    const jaDep = new Set(depsAtivos.map((d) => d.paciente_id));
                    const list = incPacientes.filter((p) => p.id !== titularId && !jaDep.has(p.id));
                    if (list.length === 0) {
                      return (
                        <div className="px-3 py-2 text-sm text-muted-foreground">
                          Nenhum paciente disponível
                        </div>
                      );
                    }
                    return list.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.nome}{p.cpf ? ` — ${p.cpf}` : ""}
                      </SelectItem>
                    ));
                  })()}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>Parentesco</Label>
                <Select value={incParentesco} onValueChange={setIncParentesco}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Filho(a)">Filho(a)</SelectItem>
                    <SelectItem value="Cônjuge">Cônjuge</SelectItem>
                    <SelectItem value="Pai">Pai</SelectItem>
                    <SelectItem value="Mãe">Mãe</SelectItem>
                    <SelectItem value="Irmão(ã)">Irmão(ã)</SelectItem>
                    <SelectItem value="Outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Tipo</Label>
                <Select value={incTipo} onValueChange={setIncTipo}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dependente">Dependente</SelectItem>
                    <SelectItem value="agregado">Agregado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {contrato.assinado_em && convenio?.termo_inclusao_html ? (
              <p className="text-xs text-muted-foreground">
                Após incluir, será gerado o <strong>Termo de Inclusão</strong> para impressão/assinatura.
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIncOpen(false)}>Cancelar</Button>
            <Button onClick={confirmarIncluir} disabled={incSaving || !incPaciente}>
              {incSaving ? "Incluindo…" : "Incluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!excAlvo} onOpenChange={(v) => { if (!v) setExcAlvo(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Excluir dependente</DialogTitle>
          </DialogHeader>
          <p className="text-sm">
            Excluir <strong>{excAlvo?.paciente_nome}</strong> do contrato?
          </p>
          {contrato.assinado_em && convenio?.termo_inclusao_html ? (
            <p className="text-xs text-muted-foreground">
              Após excluir, será gerado o <strong>Termo de Exclusão</strong> para impressão/assinatura.
            </p>
          ) : null}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setExcAlvo(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={confirmarExcluir}>Excluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={termoOpen} onOpenChange={setTermoOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Termo de {termoMovimento} — {termoDep?.paciente_nome}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-auto rounded-md border bg-card p-4">
            {termoDep ? (
              <div
                className="prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(renderTermo(termoDep, termoMovimento)) }}
              />
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTermoOpen(false)}>Fechar</Button>
            <Button onClick={printTermoInclusao}><Printer className="h-4 w-4 mr-1" />Imprimir A4</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}