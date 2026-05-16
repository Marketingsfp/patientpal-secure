import { createFileRoute } from "@tanstack/react-router";
import { Target } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SimpleCrud } from "@/components/simple-crud/SimpleCrud";

export const Route = createFileRoute("/_authenticated/app/crm")({
  component: CrmPage,
  head: () => ({ meta: [{ title: "CRM — ClinicaOS" }] }),
});

type Status = "aberta" | "ganha" | "perdida";
interface Row { id: string; nome_lead: string; telefone: string | null; email: string | null; valor_estimado: number; status: Status; origem: string | null; observacoes: string | null; }
interface Form { nome_lead: string; telefone: string; email: string; valor_estimado: string; status: Status; origem: string; observacoes: string; }

function CrmPage() {
  return (
    <SimpleCrud<Row, Form>
      table="crm_oportunidades"
      selectColumns="id, nome_lead, telefone, email, valor_estimado, status, origem, observacoes"
      title="CRM"
      subtitle="Funil de vendas e oportunidades."
      icon={<Target className="h-6 w-6 text-primary" />}
      searchFields={["nome_lead", "telefone", "email"]}
      columns={[
        { key: "nome", header: "Lead", render: r => <span className="font-medium">{r.nome_lead}</span> },
        { key: "tel", header: "Contato", render: r => <span className="text-sm text-muted-foreground">{r.telefone ?? r.email ?? "—"}</span> },
        { key: "val", header: "Valor", className: "w-32 text-right", render: r => Number(r.valor_estimado).toLocaleString("pt-BR",{style:"currency",currency:"BRL"}) },
        { key: "st", header: "Status", className: "w-28", render: r => <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${r.status==="ganha"?"bg-emerald-100 text-emerald-700":r.status==="perdida"?"bg-destructive/10 text-destructive":"bg-primary/10 text-primary"}`}>{r.status}</span> },
      ]}
      emptyForm={{ nome_lead: "", telefone: "", email: "", valor_estimado: "0", status: "aberta", origem: "", observacoes: "" }}
      toForm={r => ({ nome_lead: r.nome_lead, telefone: r.telefone ?? "", email: r.email ?? "", valor_estimado: String(r.valor_estimado), status: r.status, origem: r.origem ?? "", observacoes: r.observacoes ?? "" })}
      toPayload={f => ({ nome_lead: f.nome_lead.trim(), telefone: f.telefone || null, email: f.email || null, valor_estimado: Number(f.valor_estimado)||0, status: f.status, origem: f.origem || null, observacoes: f.observacoes || null })}
      renderForm={(f, set) => (
        <div className="space-y-3">
          <div className="space-y-1"><Label>Nome do lead *</Label><Input required value={f.nome_lead} onChange={e => set({ ...f, nome_lead: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Telefone</Label><Input value={f.telefone} onChange={e => set({ ...f, telefone: e.target.value })} /></div>
            <div className="space-y-1"><Label>Email</Label><Input type="email" value={f.email} onChange={e => set({ ...f, email: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1"><Label>Valor (R$)</Label><Input type="number" step="0.01" value={f.valor_estimado} onChange={e => set({ ...f, valor_estimado: e.target.value })} /></div>
            <div className="space-y-1"><Label>Origem</Label><Input value={f.origem} onChange={e => set({ ...f, origem: e.target.value })} placeholder="Ex: Instagram" /></div>
            <div className="space-y-1"><Label>Status</Label>
              <Select value={f.status} onValueChange={v => set({ ...f, status: v as Status })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="aberta">Aberta</SelectItem>
                  <SelectItem value="ganha">Ganha</SelectItem>
                  <SelectItem value="perdida">Perdida</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1"><Label>Observações</Label><Textarea rows={3} value={f.observacoes} onChange={e => set({ ...f, observacoes: e.target.value })} /></div>
        </div>
      )}
    />
  );
}