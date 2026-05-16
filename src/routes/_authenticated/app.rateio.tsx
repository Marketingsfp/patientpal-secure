import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Plus, Wallet } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/app/rateio")({
  component: RateioPage,
  head: () => ({ meta: [{ title: "Regras de rateio — ClinicaOS" }] }),
});

const FORMAS = [
  { v: "dinheiro", l: "Dinheiro" }, { v: "pix", l: "Pix" },
  { v: "cartao_credito", l: "Cartão crédito" }, { v: "cartao_debito", l: "Cartão débito" },
  { v: "convenio", l: "Convênio" }, { v: "cartao_proprio", l: "Cartão próprio" },
  { v: "boleto", l: "Boleto" }, { v: "transferencia", l: "Transferência" },
];

interface Regra {
  id: string; nome: string; percentual_medico: number; percentual_clinica: number;
  prioridade: number; ativo: boolean; forma_pagamento: string | null; procedimento: string | null;
  medico: { nome: string } | null;
  especialidade: { nome: string } | null;
}

function RateioPage() {
  const { clinicaAtual } = useClinica();
  const [regras, setRegras] = useState<Regra[]>([]);
  const [medicos, setMedicos] = useState<{ id: string; nome: string }[]>([]);
  const [esps, setEsps] = useState<{ id: string; nome: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    nome: "", medico_id: "", especialidade_id: "", forma_pagamento: "",
    procedimento: "", percentual_medico: "70", percentual_clinica: "30", prioridade: "0",
  });

  const load = async () => {
    if (!clinicaAtual) return;
    const { data } = await supabase
      .from("regras_rateio")
      .select("*, medico:medicos(nome), especialidade:especialidades(nome)")
      .eq("clinica_id", clinicaAtual.clinica_id)
      .order("prioridade", { ascending: false });
    setRegras((data as unknown as Regra[]) ?? []);
  };

  useEffect(() => {
    void load();
    if (clinicaAtual) {
      supabase.from("medicos").select("id, nome").eq("clinica_id", clinicaAtual.clinica_id).then(({ data }) => setMedicos(data ?? []));
    }
    supabase.from("especialidades").select("id, nome").then(({ data }) => setEsps(data ?? []));
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [clinicaAtual?.clinica_id]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!clinicaAtual) return;
    const pm = parseFloat(form.percentual_medico);
    const pc = parseFloat(form.percentual_clinica);
    if (pm + pc > 100) { toast.error("Soma dos percentuais não pode exceder 100%"); return; }
    setLoading(true);
    const { error } = await supabase.from("regras_rateio").insert({
      clinica_id: clinicaAtual.clinica_id,
      nome: form.nome,
      medico_id: form.medico_id || null,
      especialidade_id: form.especialidade_id || null,
      forma_pagamento: (form.forma_pagamento || null) as never,
      procedimento: form.procedimento || null,
      percentual_medico: pm,
      percentual_clinica: pc,
      prioridade: parseInt(form.prioridade, 10) || 0,
    });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Regra criada!");
    setOpen(false);
    setForm({ nome: "", medico_id: "", especialidade_id: "", forma_pagamento: "", procedimento: "", percentual_medico: "70", percentual_clinica: "30", prioridade: "0" });
    void load();
  };

  if (!clinicaAtual) return <p className="text-muted-foreground">Selecione uma clínica primeiro.</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Regras de rateio</h1>
          <p className="text-sm text-muted-foreground">
            Configure o repasse de receita por médico, especialidade e forma de pagamento.
            A regra com maior prioridade é aplicada.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" /> Nova regra</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Nova regra de rateio</DialogTitle>
              <DialogDescription>Deixe filtros vazios para "qualquer".</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Nome da regra *</Label>
                <Input required placeholder="Ex: Cardiologia / Convênio" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Médico</Label>
                  <Select value={form.medico_id} onValueChange={(v) => setForm({ ...form, medico_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Qualquer" /></SelectTrigger>
                    <SelectContent>
                      {medicos.map((m) => <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Especialidade</Label>
                  <Select value={form.especialidade_id} onValueChange={(v) => setForm({ ...form, especialidade_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Qualquer" /></SelectTrigger>
                    <SelectContent>
                      {esps.map((e) => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Forma de pagamento</Label>
                  <Select value={form.forma_pagamento} onValueChange={(v) => setForm({ ...form, forma_pagamento: v })}>
                    <SelectTrigger><SelectValue placeholder="Qualquer" /></SelectTrigger>
                    <SelectContent>
                      {FORMAS.map((f) => <SelectItem key={f.v} value={f.v}>{f.l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Procedimento</Label>
                  <Input placeholder="Qualquer" value={form.procedimento} onChange={(e) => setForm({ ...form, procedimento: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label>% Médico</Label>
                  <Input type="number" min={0} max={100} step={0.01} value={form.percentual_medico} onChange={(e) => setForm({ ...form, percentual_medico: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>% Clínica</Label>
                  <Input type="number" min={0} max={100} step={0.01} value={form.percentual_clinica} onChange={(e) => setForm({ ...form, percentual_clinica: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Prioridade</Label>
                  <Input type="number" min={0} value={form.prioridade} onChange={(e) => setForm({ ...form, prioridade: e.target.value })} />
                </div>
              </div>
              <DialogFooter><Button type="submit" disabled={loading}>{loading ? "Salvando..." : "Salvar"}</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {regras.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <Wallet className="h-8 w-8 mx-auto mb-2 opacity-50" />
          Nenhuma regra de rateio. Crie a primeira para começar a calcular repasses.
        </CardContent></Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Regra</TableHead>
                <TableHead>Filtros</TableHead>
                <TableHead className="text-right">Médico</TableHead>
                <TableHead className="text-right">Clínica</TableHead>
                <TableHead className="text-right">Prioridade</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {regras.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.nome}</TableCell>
                  <TableCell className="space-x-1">
                    {r.medico && <Badge variant="outline">{r.medico.nome}</Badge>}
                    {r.especialidade && <Badge variant="outline">{r.especialidade.nome}</Badge>}
                    {r.forma_pagamento && <Badge variant="outline">{r.forma_pagamento}</Badge>}
                    {r.procedimento && <Badge variant="outline">{r.procedimento}</Badge>}
                    {!r.medico && !r.especialidade && !r.forma_pagamento && !r.procedimento && <span className="text-muted-foreground text-xs">Geral</span>}
                  </TableCell>
                  <TableCell className="text-right text-success font-medium">{r.percentual_medico}%</TableCell>
                  <TableCell className="text-right text-primary font-medium">{r.percentual_clinica}%</TableCell>
                  <TableCell className="text-right">{r.prioridade}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}