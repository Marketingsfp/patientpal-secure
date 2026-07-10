import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";

interface Ref {
  id: string;
  nome: string;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  clinicaId: string;
  editingContratoId?: string | null;
  onSaved?: () => void;
}

const emptyForm = (clinicaId: string) => ({
  clinica_id: clinicaId,
  funcionario_nome: "",
  cpf: "",
  cargo_id: "",
  setor_id: "",
  regime: "clt",
  carga_horaria_semanal: "44",
  salario: "0",
  data_admissao: new Date().toISOString().slice(0, 10),
  data_demissao: "",
  status: "ativo",
  sexo: "nao_informar",
});

export function FuncionarioDadosDialog({
  open,
  onOpenChange,
  clinicaId,
  editingContratoId,
  onSaved,
}: Props) {
  const [cargos, setCargos] = useState<Ref[]>([]);
  const [setores, setSetores] = useState<Ref[]>([]);
  const [form, setForm] = useState(() => emptyForm(clinicaId));
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !clinicaId) return;
    void (async () => {
      const [cg, st] = await Promise.all([
        supabase
          .from("cargos")
          .select("id,nome")
          .eq("clinica_id", clinicaId)
          .eq("ativo", true)
          .order("nome"),
        supabase
          .from("setores")
          .select("id,nome")
          .eq("clinica_id", clinicaId)
          .eq("ativo", true)
          .order("nome"),
      ]);
      setCargos((cg.data ?? []) as Ref[]);
      setSetores((st.data ?? []) as Ref[]);
    })();
  }, [open, clinicaId]);

  useEffect(() => {
    if (!open) return;
    if (!editingContratoId) {
      setForm(emptyForm(clinicaId));
      return;
    }
    void (async () => {
      setLoading(true);
      const { data: contrato } = await supabase
        .from("hr_contratos")
        .select("*")
        .eq("id", editingContratoId)
        .maybeSingle();
      if (contrato) {
        setForm({
          clinica_id: clinicaId,
          funcionario_nome: (contrato.funcionario_nome as string) ?? "",
          cpf: (contrato.cpf as string) ?? "",
          cargo_id: (contrato.cargo_id as string) ?? "",
          setor_id: (contrato.setor_id as string) ?? "",
          regime: (contrato.regime as string) ?? "clt",
          carga_horaria_semanal: String(contrato.carga_horaria_semanal ?? "44"),
          salario: String(contrato.salario ?? "0"),
          data_admissao:
            (contrato.data_admissao as string) ?? new Date().toISOString().slice(0, 10),
          data_demissao: (contrato.data_demissao as string) ?? "",
          status: (contrato.status as string) ?? "ativo",
          sexo: (contrato.sexo as string) ?? "nao_informar",
        });
      }
      setLoading(false);
    })();
  }, [open, editingContratoId, clinicaId]);

  async function salvar() {
    if (!form.clinica_id) {
      toast.error("Clínica não definida");
      return;
    }
    if (!form.funcionario_nome.trim()) {
      toast.error("Informe o nome");
      return;
    }
    setSaving(true);
    const payload = {
      clinica_id: form.clinica_id,
      funcionario_nome: form.funcionario_nome.trim(),
      cpf: form.cpf.trim() || null,
      cargo_id: form.cargo_id || null,
      setor_id: form.setor_id || null,
      regime: form.regime,
      carga_horaria_semanal: Number(form.carga_horaria_semanal),
      salario: Number(form.salario),
      data_admissao: form.data_admissao,
      data_demissao: form.data_demissao || null,
      status: form.status,
      sexo: form.sexo,
    };
    const { error } = editingContratoId
      ? await supabase.from("hr_contratos").update(payload).eq("id", editingContratoId)
      : await supabase.from("hr_contratos").insert(payload);
    setSaving(false);
    if (error) {
      mostrarErro(error);
      return;
    }
    toast.success(editingContratoId ? "Funcionário atualizado" : "Funcionário cadastrado");
    onOpenChange(false);
    onSaved?.();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editingContratoId ? "Editar funcionário" : "Novo funcionário"}</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Carregando…</div>
        ) : (
          <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Nome do funcionário *</Label>
                <Input
                  value={form.funcionario_nome}
                  onChange={(e) => setForm({ ...form, funcionario_nome: e.target.value })}
                />
              </div>
              <div>
                <Label>CPF</Label>
                <Input
                  value={form.cpf}
                  onChange={(e) => setForm({ ...form, cpf: e.target.value })}
                />
              </div>
              <div>
                <Label>Sexo</Label>
                <Select value={form.sexo} onValueChange={(v) => setForm({ ...form, sexo: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="masculino">Masculino</SelectItem>
                    <SelectItem value="feminino">Feminino</SelectItem>
                    <SelectItem value="outro">Outro</SelectItem>
                    <SelectItem value="nao_informar">Prefiro não informar</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Regime</Label>
                <Select value={form.regime} onValueChange={(v) => setForm({ ...form, regime: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="clt">CLT</SelectItem>
                    <SelectItem value="pj">PJ</SelectItem>
                    <SelectItem value="autonomo">Autônomo</SelectItem>
                    <SelectItem value="estagio">Estágio</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Cargo</Label>
                <Select
                  value={form.cargo_id}
                  onValueChange={(v) => setForm({ ...form, cargo_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    {cargos.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Setor</Label>
                <Select
                  value={form.setor_id}
                  onValueChange={(v) => setForm({ ...form, setor_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    {setores.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Carga semanal (h)</Label>
                <Input
                  type="number"
                  step="0.5"
                  value={form.carga_horaria_semanal}
                  onChange={(e) => setForm({ ...form, carga_horaria_semanal: e.target.value })}
                />
              </div>
              <div>
                <Label>Salário (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.salario}
                  onChange={(e) => setForm({ ...form, salario: e.target.value })}
                />
              </div>
              <div>
                <Label>Admissão</Label>
                <Input
                  type="date"
                  value={form.data_admissao}
                  onChange={(e) => setForm({ ...form, data_admissao: e.target.value })}
                />
              </div>
              <div>
                <Label>Demissão</Label>
                <Input
                  type="date"
                  value={form.data_demissao}
                  onChange={(e) => setForm({ ...form, data_demissao: e.target.value })}
                />
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ativo">Ativo</SelectItem>
                    <SelectItem value="afastado">Afastado</SelectItem>
                    <SelectItem value="ferias">Em férias</SelectItem>
                    <SelectItem value="desligado">Desligado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={saving || loading}>
            {saving ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
