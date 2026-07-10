import { createFileRoute } from "@tanstack/react-router";
import { SectionTabs, MARKETING_TABS, MARKETING_META } from "@/components/section-tabs";
import { Users } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SimpleCrud } from "@/components/simple-crud/SimpleCrud";

export const Route = createFileRoute("/_authenticated/app/mkt-leads")({
  component: LeadsPageWithTabs,
  head: () => ({ meta: [{ title: "Leads — ClinicaOS" }] }),
});

interface Row {
  id: string;
  nome: string;
  telefone: string | null;
  email: string | null;
  origem: string | null;
  status: string;
  mensagem: string | null;
  created_at: string;
}
interface Form {
  nome: string;
  telefone: string;
  email: string;
  mensagem: string;
  origem: string;
  status: string;
}

const statusCor: Record<string, string> = {
  novo: "bg-blue-100 text-blue-700",
  contatado: "bg-amber-100 text-amber-700",
  qualificado: "bg-emerald-100 text-emerald-700",
  perdido: "bg-rose-100 text-rose-700",
  convertido: "bg-violet-100 text-violet-700",
};

function LeadsPage() {
  return (
    <SimpleCrud<Row, Form>
      table="mkt_leads"
      selectColumns="id, nome, telefone, email, origem, status, mensagem, created_at"
      title="Leads"
      subtitle="Contatos capturados pelas landing pages e formulários."
      icon={<Users className="h-6 w-6 text-primary" />}
      searchFields={["nome", "telefone", "email"]}
      columns={[
        {
          key: "nome",
          header: "Nome",
          render: (r) => <span className="font-medium">{r.nome}</span>,
        },
        {
          key: "contato",
          header: "Contato",
          render: (r) => (
            <div className="text-sm">
              {r.telefone && <div>{r.telefone}</div>}
              {r.email && <div className="text-muted-foreground text-xs">{r.email}</div>}
            </div>
          ),
        },
        {
          key: "origem",
          header: "Origem",
          className: "w-32",
          render: (r) => <span className="text-xs capitalize">{r.origem ?? "—"}</span>,
        },
        {
          key: "status",
          header: "Status",
          className: "w-28",
          render: (r) => (
            <span
              className={`text-xs px-2 py-0.5 rounded-full capitalize ${statusCor[r.status] ?? "bg-muted text-muted-foreground"}`}
            >
              {r.status}
            </span>
          ),
        },
        {
          key: "data",
          header: "Capturado em",
          className: "w-40",
          render: (r) => (
            <span className="text-xs text-muted-foreground">
              {new Date(r.created_at).toLocaleString("pt-BR")}
            </span>
          ),
        },
      ]}
      emptyForm={{
        nome: "",
        telefone: "",
        email: "",
        mensagem: "",
        origem: "manual",
        status: "novo",
      }}
      toForm={(r) => ({
        nome: r.nome,
        telefone: r.telefone ?? "",
        email: r.email ?? "",
        mensagem: r.mensagem ?? "",
        origem: r.origem ?? "manual",
        status: r.status,
      })}
      toPayload={(f) => ({
        nome: f.nome.trim(),
        telefone: f.telefone || null,
        email: f.email || null,
        mensagem: f.mensagem || null,
        origem: f.origem,
        status: f.status,
      })}
      renderForm={(f, set) => (
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Nome *</Label>
            <Input required value={f.nome} onChange={(e) => set({ ...f, nome: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Telefone</Label>
              <Input value={f.telefone} onChange={(e) => set({ ...f, telefone: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>E-mail</Label>
              <Input
                type="email"
                value={f.email}
                onChange={(e) => set({ ...f, email: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Origem</Label>
              <Select value={f.origem} onValueChange={(v) => set({ ...f, origem: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="landing_page">Landing Page</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="indicacao">Indicação</SelectItem>
                  <SelectItem value="instagram">Instagram</SelectItem>
                  <SelectItem value="google">Google</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={f.status} onValueChange={(v) => set({ ...f, status: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="novo">Novo</SelectItem>
                  <SelectItem value="contatado">Contatado</SelectItem>
                  <SelectItem value="qualificado">Qualificado</SelectItem>
                  <SelectItem value="convertido">Convertido</SelectItem>
                  <SelectItem value="perdido">Perdido</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label>Mensagem</Label>
            <Textarea
              rows={3}
              value={f.mensagem}
              onChange={(e) => set({ ...f, mensagem: e.target.value })}
            />
          </div>
        </div>
      )}
    />
  );
}
function LeadsPageWithTabs() {
  return (
    <>
      <SectionTabs title={MARKETING_META.title} icon={MARKETING_META.icon} tabs={MARKETING_TABS} />
      <LeadsPage />
    </>
  );
}
