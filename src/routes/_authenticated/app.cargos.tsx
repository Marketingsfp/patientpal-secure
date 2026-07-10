import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Briefcase, Plus, Pencil, Search } from "lucide-react";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";

export const Route = createFileRoute("/_authenticated/app/cargos")({
  component: CargosPage,
  head: () => ({ meta: [{ title: "Cargos — ClinicaOS" }] }),
});

interface Cargo {
  id: string;
  nome: string;
  descricao: string | null;
  cbo: string | null;
  salario_base: number | null;
  ativo: boolean;
}

function CargosPage() {
  const { clinicaAtual } = useClinica();
  const [rows, setRows] = useState<Cargo[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Cargo | null>(null);
  const [form, setForm] = useState({
    nome: "",
    descricao: "",
    cbo: "",
    salario_base: "",
    ativo: true,
  });
  const [saving, setSaving] = useState(false);

  async function load() {
    if (!clinicaAtual) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("cargos")
      .select("id,nome,descricao,cbo,salario_base,ativo")
      .eq("clinica_id", clinicaAtual.clinica_id)
      .order("nome");
    if (error) mostrarErro(error);
    else setRows((data ?? []) as Cargo[]);
    setLoading(false);
  }
  useEffect(() => {
    void load();
  }, [clinicaAtual?.clinica_id]);

  function openNew() {
    setEditing(null);
    setForm({ nome: "", descricao: "", cbo: "", salario_base: "", ativo: true });
    setOpen(true);
  }
  function openEdit(c: Cargo) {
    setEditing(c);
    setForm({
      nome: c.nome,
      descricao: c.descricao ?? "",
      cbo: c.cbo ?? "",
      salario_base: c.salario_base?.toString() ?? "",
      ativo: c.ativo,
    });
    setOpen(true);
  }

  async function salvar() {
    if (!clinicaAtual) {
      toast.error("Selecione uma clínica");
      return;
    }
    if (!form.nome.trim()) {
      toast.error("Informe o nome");
      return;
    }
    setSaving(true);
    const payload = {
      clinica_id: clinicaAtual.clinica_id,
      nome: form.nome.trim(),
      descricao: form.descricao.trim() || null,
      cbo: form.cbo.trim() || null,
      salario_base: form.salario_base ? Number(form.salario_base) : null,
      ativo: form.ativo,
    };
    const { error } = editing
      ? await supabase.from("cargos").update(payload).eq("id", editing.id)
      : await supabase.from("cargos").insert(payload);
    setSaving(false);
    if (error) {
      mostrarErro(error);
      return;
    }
    toast.success(editing ? "Cargo atualizado" : "Cargo criado");
    setOpen(false);
    void load();
  }

  const filtered = rows.filter((r) => r.nome.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Briefcase className="h-6 w-6 text-primary" />
        <div className="flex-1">
          <h1 className="text-xl font-bold">Cargos</h1>
          <p className="text-sm text-muted-foreground">Cargos e funções da clínica.</p>
        </div>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4 mr-1" /> Novo
        </Button>
      </div>

      <Card className="p-3">
        <div className="relative">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead className="w-24">CBO</TableHead>
              <TableHead className="w-32 text-right">Salário base</TableHead>
              <TableHead className="w-24">Situação</TableHead>
              <TableHead className="w-20 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                  Carregando…
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                  Nenhum cargo cadastrado.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.nome}</TableCell>
                  <TableCell>{r.cbo ?? "-"}</TableCell>
                  <TableCell className="text-right">
                    {r.salario_base
                      ? r.salario_base.toLocaleString("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                        })
                      : "-"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={r.ativo ? "default" : "secondary"}>
                      {r.ativo ? "Ativo" : "Inativo"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(r)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar cargo" : "Novo cargo"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome *</Label>
              <Input
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
              />
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea
                value={form.descricao}
                onChange={(e) => setForm({ ...form, descricao: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>CBO</Label>
                <Input
                  value={form.cbo}
                  onChange={(e) => setForm({ ...form, cbo: e.target.value })}
                  placeholder="Ex.: 2231-05"
                />
              </div>
              <div>
                <Label>Salário base (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.salario_base}
                  onChange={(e) => setForm({ ...form, salario_base: e.target.value })}
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.ativo}
                onChange={(e) => setForm({ ...form, ativo: e.target.checked })}
              />
              Ativo
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={salvar} disabled={saving}>
              {saving ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
