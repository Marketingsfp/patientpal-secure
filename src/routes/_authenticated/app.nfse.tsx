import { createFileRoute } from "@tanstack/react-router";
import { Receipt } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SimpleCrud } from "@/components/simple-crud/SimpleCrud";

export const Route = createFileRoute("/_authenticated/app/nfse")({
  component: NfsePage,
  head: () => ({ meta: [{ title: "Notas Fiscais — ClinicaOS" }] }),
});

interface Row { id: string; numero: string | null; serie: string | null; data_emissao: string; valor_servicos: number; valor_iss: number; descricao_servicos: string | null; status: string; }
interface Form { numero: string; serie: string; data_emissao: string; valor_servicos: string; valor_iss: string; descricao_servicos: string; status: string; }
const STATUS = ["rascunho","emitida","cancelada","erro"];

function NfsePage() {
  return (
    <SimpleCrud<Row, Form>
      table="nfse"
      selectColumns="id, numero, serie, data_emissao, valor_servicos, valor_iss, descricao_servicos, status"
      title="Notas Fiscais (NFS-e)"
      subtitle="Emissão e controle de notas fiscais de serviço."
      icon={<Receipt className="h-6 w-6 text-primary" />}
      orderBy={{ column: "data_emissao", ascending: false }}
      columns={[
        { key: "num", header: "Número", render: r => r.numero ?? "—" },
        { key: "data", header: "Emissão", className: "w-32", render: r => new Date(r.data_emissao).toLocaleDateString("pt-BR") },
        { key: "val", header: "Valor", className: "w-32 text-right", render: r => Number(r.valor_servicos).toLocaleString("pt-BR",{style:"currency",currency:"BRL"}) },
        { key: "st", header: "Status", className: "w-28", render: r => <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary capitalize">{r.status}</span> },
      ]}
      emptyForm={{ numero: "", serie: "", data_emissao: new Date().toISOString().slice(0,10), valor_servicos: "0", valor_iss: "0", descricao_servicos: "", status: "rascunho" }}
      toForm={r => ({ numero: r.numero ?? "", serie: r.serie ?? "", data_emissao: r.data_emissao, valor_servicos: String(r.valor_servicos), valor_iss: String(r.valor_iss), descricao_servicos: r.descricao_servicos ?? "", status: r.status })}
      toPayload={f => ({ numero: f.numero || null, serie: f.serie || null, data_emissao: f.data_emissao, valor_servicos: Number(f.valor_servicos)||0, valor_iss: Number(f.valor_iss)||0, descricao_servicos: f.descricao_servicos || null, status: f.status })}
      renderForm={(f, set) => (
        <div className="space-y-3">
          <div className="grid grid-cols-4 gap-3">
            <div className="space-y-1"><Label>Número</Label><Input value={f.numero} onChange={e => set({ ...f, numero: e.target.value })} /></div>
            <div className="space-y-1"><Label>Série</Label><Input value={f.serie} onChange={e => set({ ...f, serie: e.target.value })} /></div>
            <div className="space-y-1"><Label>Emissão</Label><Input type="date" value={f.data_emissao} onChange={e => set({ ...f, data_emissao: e.target.value })} /></div>
            <div className="space-y-1"><Label>Status</Label>
              <Select value={f.status} onValueChange={v => set({ ...f, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STATUS.map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Valor serviços (R$)</Label><CurrencyInput value={f.valor_servicos} onChange={(v) => set({ ...f, valor_servicos: v })} /></div>
            <div className="space-y-1"><Label>ISS (R$)</Label><CurrencyInput value={f.valor_iss} onChange={(v) => set({ ...f, valor_iss: v })} /></div>
          </div>
          <div className="space-y-1"><Label>Descrição dos serviços</Label><Textarea rows={3} value={f.descricao_servicos} onChange={e => set({ ...f, descricao_servicos: e.target.value })} /></div>
        </div>
      )}
    />
  );
}