import { createFileRoute } from "@tanstack/react-router";
import { Barcode } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SimpleCrud } from "@/components/simple-crud/SimpleCrud";
import { usePodeEscrever } from "@/hooks/use-permissoes";

import { DateInputBR } from "@/components/ui/date-input-br";
export const Route = createFileRoute("/_authenticated/app/boletos")({
  component: BoletosPage,
  head: () => ({ meta: [{ title: "Boletos — ClinicaOS" }] }),
});

interface Row { id: string; valor: number; vencimento: string; nosso_numero: string | null; linha_digitavel: string | null; status: string; observacoes: string | null; }
interface Form { valor: string; vencimento: string; nosso_numero: string; linha_digitavel: string; status: string; observacoes: string; }
const STATUS = ["pendente","pago","vencido","cancelado"];

function BoletosPage() {
  const podeEscrever = usePodeEscrever("boletos");
  return (
    <SimpleCrud<Row, Form>
      table="boletos"
      selectColumns="id, valor, vencimento, nosso_numero, linha_digitavel, status, observacoes"
      title="Boletos"
      subtitle="Emita e acompanhe boletos integrados."
      icon={<Barcode className="h-6 w-6 text-primary" />}
      orderBy={{ column: "vencimento", ascending: false }}
      readOnly={!podeEscrever}
      columns={[
        { key: "nn", header: "Nosso número", render: r => r.nosso_numero ?? "—" },
        { key: "venc", header: "Vencimento", className: "w-32", render: r => new Date(r.vencimento).toLocaleDateString("pt-BR") },
        { key: "val", header: "Valor", className: "w-32 text-right", render: r => Number(r.valor).toLocaleString("pt-BR",{style:"currency",currency:"BRL"}) },
        { key: "st", header: "Status", className: "w-28", render: r => <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary capitalize">{r.status}</span> },
      ]}
      emptyForm={{ valor: "0", vencimento: new Date().toISOString().slice(0,10), nosso_numero: "", linha_digitavel: "", status: "pendente", observacoes: "" }}
      toForm={r => ({ valor: String(r.valor), vencimento: r.vencimento, nosso_numero: r.nosso_numero ?? "", linha_digitavel: r.linha_digitavel ?? "", status: r.status, observacoes: r.observacoes ?? "" })}
      toPayload={f => ({ valor: Number(f.valor) || 0, vencimento: f.vencimento, nosso_numero: f.nosso_numero || null, linha_digitavel: f.linha_digitavel || null, status: f.status, observacoes: f.observacoes || null })}
      renderForm={(f, set) => (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1"><Label>Valor *</Label><CurrencyInput value={f.valor} onChange={(v) => set({ ...f, valor: v })} /></div>
            <div className="space-y-1"><Label>Vencimento *</Label><DateInputBR required value={f.vencimento} onChange={e => set({ ...f, vencimento: e.target.value })} /></div>
            <div className="space-y-1"><Label>Status</Label>
              <Select value={f.status} onValueChange={v => set({ ...f, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STATUS.map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1"><Label>Nosso número</Label><Input value={f.nosso_numero} onChange={e => set({ ...f, nosso_numero: e.target.value })} /></div>
          <div className="space-y-1"><Label>Linha digitável</Label><Input value={f.linha_digitavel} onChange={e => set({ ...f, linha_digitavel: e.target.value })} /></div>
          <div className="space-y-1"><Label>Observações</Label><Textarea rows={2} value={f.observacoes} onChange={e => set({ ...f, observacoes: e.target.value })} /></div>
        </div>
      )}
    />
  );
}