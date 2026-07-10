import { createFileRoute } from "@tanstack/react-router";
import { Target } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SimpleCrud } from "@/components/simple-crud/SimpleCrud";

export const Route = createFileRoute("/_authenticated/app/crm")({
  component: CrmPage,
  head: () => ({ meta: [{ title: "CRM — ClinicaOS" }] }),
});

type Status = "aberta" | "ganha" | "perdida";
interface Row {
  id: string;
  nome_lead: string;
  telefone: string | null;
  email: string | null;
  valor_estimado: number;
  status: Status;
  origem: string | null;
  observacoes: string | null;
}
interface Form {
  nome_lead: string;
  telefone: string;
  email: string;
  valor_estimado: string;
  status: Status;
  origem: string;
  observacoes: string;
}

function CrmPage() {
  return (
    <SimpleCrud<Row, Form>
      table="crm_oportunidades"
      selectColumns="id, nome_lead, telefone, email, valor_estimado, status, origem, observacoes"
      title="CRM"
      subtitle="Funil de vendas e oportunidades."
      icon={<Target className="h-6 w-6 text-primary" />}
      newLabel="Nova oportunidade"
      editLabel="Editar oportunidade"
      searchFields={["nome_lead", "telefone", "email"]}
      columns={[
        {
          key: "nome",
          header: "Lead",
          render: (r) => <span className="font-medium">{r.nome_lead}</span>,
        },
        {
          key: "tel",
          header: "Contato",
          render: (r) => (
            <span className="text-sm text-muted-foreground">{r.telefone ?? r.email ?? "—"}</span>
          ),
        },
        {
          key: "val",
          header: "Valor",
          className: "w-32 text-right",
          render: (r) =>
            Number(r.valor_estimado).toLocaleString("pt-BR", {
              style: "currency",
              currency: "BRL",
            }),
        },
        {
          key: "st",
          header: "Status",
          className: "w-28",
          render: (r) => (
            <span
              className={`text-xs px-2 py-0.5 rounded-full capitalize ${r.status === "ganha" ? "bg-emerald-100 text-emerald-700" : r.status === "perdida" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}
            >
              {r.status}
            </span>
          ),
        },
      ]}
      emptyForm={{
        nome_lead: "",
        telefone: "",
        email: "",
        valor_estimado: "0",
        status: "aberta",
        origem: "",
        observacoes: "",
      }}
      toForm={(r) => ({
        nome_lead: r.nome_lead,
        telefone: r.telefone ?? "",
        email: r.email ?? "",
        valor_estimado: String(r.valor_estimado),
        status: r.status,
        origem: r.origem ?? "",
        observacoes: r.observacoes ?? "",
      })}
      toPayload={(f) => {
        const telDigits = f.telefone.replace(/\D/g, "");
        return {
          nome_lead: f.nome_lead.trim(),
          telefone: telDigits || null,
          email: f.email.trim() || null,
          valor_estimado: Number(f.valor_estimado) || 0,
          status: f.status,
          origem: f.origem.trim() || null,
          observacoes: f.observacoes.trim() || null,
        };
      }}
      validate={(f) => {
        const nome = f.nome_lead.trim();
        if (nome.length < 2) return "Informe o nome do lead (mínimo 2 caracteres).";
        if (nome.length > 120) return "Nome do lead muito longo (máx. 120 caracteres).";
        const email = f.email.trim();
        if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return "E-mail inválido.";
        const telDigits = f.telefone.replace(/\D/g, "");
        if (telDigits && (telDigits.length < 10 || telDigits.length > 11))
          return "Telefone deve ter 10 ou 11 dígitos (DDD + número).";
        if (f.observacoes.length > 2000) return "Observações muito longas (máx. 2000 caracteres).";
        return null;
      }}
      renderForm={(f, set) => (
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Nome do lead *</Label>
            <Input
              required
              maxLength={120}
              value={f.nome_lead}
              onChange={(e) => set({ ...f, nome_lead: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Telefone</Label>
              <Input
                inputMode="tel"
                maxLength={20}
                placeholder="(11) 99999-9999"
                value={f.telefone}
                onChange={(e) =>
                  set({ ...f, telefone: e.target.value.replace(/[^\d()\-\s+]/g, "") })
                }
              />
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input
                type="email"
                maxLength={255}
                value={f.email}
                onChange={(e) => set({ ...f, email: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>Valor (R$)</Label>
              <CurrencyInput
                value={f.valor_estimado}
                onChange={(v) => set({ ...f, valor_estimado: v })}
              />
              <p className="text-[11px] text-muted-foreground">
                Digite os centavos: ex. 150000 = R$ 1.500,00
              </p>
            </div>
            <div className="space-y-1">
              <Label>Origem</Label>
              <Input
                maxLength={60}
                value={f.origem}
                onChange={(e) => set({ ...f, origem: e.target.value })}
                placeholder="Ex: Instagram"
              />
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={f.status} onValueChange={(v) => set({ ...f, status: v as Status })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="aberta">Aberta</SelectItem>
                  <SelectItem value="ganha">Ganha</SelectItem>
                  <SelectItem value="perdida">Perdida</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label>Observações</Label>
            <Textarea
              rows={3}
              maxLength={2000}
              value={f.observacoes}
              onChange={(e) => set({ ...f, observacoes: e.target.value })}
            />
          </div>
        </div>
      )}
    />
  );
}
