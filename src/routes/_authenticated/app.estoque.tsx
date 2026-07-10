import { createFileRoute } from "@tanstack/react-router";
import { Package } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { SimpleCrud } from "@/components/simple-crud/SimpleCrud";

export const Route = createFileRoute("/_authenticated/app/estoque")({
  component: EstoquePage,
  head: () => ({ meta: [{ title: "Estoque — ClinicaOS" }] }),
});

interface Row { id: string; nome: string; codigo: string | null; unidade: string; estoque_atual: number; estoque_minimo: number; custo_unitario: number; observacoes: string | null; ativo: boolean; }
interface Form { nome: string; codigo: string; unidade: string; estoque_atual: string; estoque_minimo: string; custo_unitario: string; observacoes: string; ativo: boolean; }

function EstoquePage() {
  return (
    <SimpleCrud<Row, Form>
      table="estoque_produtos"
      selectColumns="id, nome, codigo, unidade, estoque_atual, estoque_minimo, custo_unitario, observacoes, ativo"
      title="Estoque"
      subtitle="Cadastre insumos e controle entradas/saídas."
      icon={<Package className="h-6 w-6 text-primary" />}
      orderBy={{ column: "nome", ascending: true }}
      searchFields={["nome", "codigo"]}
      columns={[
        { key: "nome", header: "Produto", render: r => <span className="font-medium">{r.nome}</span> },
        { key: "cod", header: "Código", className: "w-28", render: r => r.codigo ?? "—" },
        { key: "un", header: "Un.", className: "w-20", render: r => r.unidade },
        { key: "atual", header: "Estoque", className: "w-24 text-right", render: r => <span className={Number(r.estoque_atual) <= Number(r.estoque_minimo) ? "text-destructive font-medium" : ""}>{Number(r.estoque_atual)}</span> },
        { key: "min", header: "Mínimo", className: "w-24 text-right", render: r => Number(r.estoque_minimo) },
      ]}
      emptyForm={{ nome: "", codigo: "", unidade: "un", estoque_atual: "0", estoque_minimo: "0", custo_unitario: "0", observacoes: "", ativo: true }}
      toForm={r => ({ nome: r.nome, codigo: r.codigo ?? "", unidade: r.unidade, estoque_atual: String(r.estoque_atual), estoque_minimo: String(r.estoque_minimo), custo_unitario: String(r.custo_unitario), observacoes: r.observacoes ?? "", ativo: r.ativo })}
      toPayload={f => ({ nome: f.nome.trim(), codigo: f.codigo || null, unidade: f.unidade, estoque_atual: Number(f.estoque_atual) || 0, estoque_minimo: Number(f.estoque_minimo) || 0, custo_unitario: Number(f.custo_unitario) || 0, observacoes: f.observacoes || null, ativo: f.ativo })}
      renderForm={(f, set) => (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1 sm:col-span-2"><Label>Nome *</Label><Input required value={f.nome} onChange={e => set({ ...f, nome: e.target.value })} /></div>
            <div className="space-y-1"><Label>Código</Label><Input value={f.codigo} onChange={e => set({ ...f, codigo: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="space-y-1"><Label>Unidade</Label><Input value={f.unidade} onChange={e => set({ ...f, unidade: e.target.value })} /></div>
            <div className="space-y-1"><Label>Estoque atual</Label><Input type="number" value={f.estoque_atual} onChange={e => set({ ...f, estoque_atual: e.target.value })} /></div>
            <div className="space-y-1"><Label>Mínimo</Label><Input type="number" value={f.estoque_minimo} onChange={e => set({ ...f, estoque_minimo: e.target.value })} /></div>
            <div className="space-y-1"><Label>Custo (R$)</Label><CurrencyInput value={f.custo_unitario} onChange={(v) => set({ ...f, custo_unitario: v })} /></div>
          </div>
          <div className="space-y-1"><Label>Observações</Label><Textarea rows={2} value={f.observacoes} onChange={e => set({ ...f, observacoes: e.target.value })} /></div>
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={f.ativo} onCheckedChange={v => set({ ...f, ativo: !!v })} /> Ativo</label>
        </div>
      )}
    />
  );
}