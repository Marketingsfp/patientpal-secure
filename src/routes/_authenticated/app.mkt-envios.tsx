import { createFileRoute } from "@tanstack/react-router";
import { SectionTabs, MARKETING_TABS, MARKETING_META } from "@/components/section-tabs";
import { Send } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SimpleCrud } from "@/components/simple-crud/SimpleCrud";

export const Route = createFileRoute("/_authenticated/app/mkt-envios")({
  component: EnviosPageWithTabs,
  head: () => ({ meta: [{ title: "Envios — ClinicaOS" }] }),
});

interface Row {
  id: string;
  canal: string;
  destinatario: string;
  status: string;
  erro: string | null;
  enviado_em: string | null;
  created_at: string;
}
interface Form {
  canal: string;
  destinatario: string;
  status: string;
}

const cor: Record<string, string> = {
  enviado: "bg-emerald-100 text-emerald-700",
  pendente: "bg-amber-100 text-amber-700",
  falha: "bg-rose-100 text-rose-700",
};

function EnviosPage() {
  return (
    <SimpleCrud<Row, Form>
      table="mkt_envios"
      selectColumns="id, canal, destinatario, status, erro, enviado_em, created_at"
      title="Envios de Campanhas"
      subtitle="Histórico de mensagens disparadas."
      icon={<Send className="h-6 w-6 text-primary" />}
      searchFields={["destinatario"]}
      columns={[
        {
          key: "dest",
          header: "Destinatário",
          render: (r) => <span className="font-medium">{r.destinatario}</span>,
        },
        {
          key: "canal",
          header: "Canal",
          className: "w-24",
          render: (r) => <span className="capitalize text-sm">{r.canal}</span>,
        },
        {
          key: "status",
          header: "Status",
          className: "w-28",
          render: (r) => (
            <span
              className={`text-xs px-2 py-0.5 rounded-full capitalize ${cor[r.status] ?? "bg-muted text-muted-foreground"}`}
            >
              {r.status}
            </span>
          ),
        },
        {
          key: "erro",
          header: "Erro",
          render: (r) =>
            r.erro ? (
              <span className="text-xs text-rose-600 line-clamp-1">{r.erro}</span>
            ) : (
              <span className="text-xs text-muted-foreground">—</span>
            ),
        },
        {
          key: "quando",
          header: "Data",
          className: "w-40",
          render: (r) => (
            <span className="text-xs text-muted-foreground">
              {new Date(r.enviado_em ?? r.created_at).toLocaleString("pt-BR")}
            </span>
          ),
        },
      ]}
      emptyForm={{ canal: "whatsapp", destinatario: "", status: "pendente" }}
      toForm={(r) => ({ canal: r.canal, destinatario: r.destinatario, status: r.status })}
      toPayload={(f) => ({
        canal: f.canal,
        destinatario: f.destinatario.trim(),
        status: f.status,
      })}
      renderForm={(f, set) => (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Canal</Label>
              <Select value={f.canal} onValueChange={(v) => set({ ...f, canal: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="email">E-mail</SelectItem>
                  <SelectItem value="sms">SMS</SelectItem>
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
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="enviado">Enviado</SelectItem>
                  <SelectItem value="falha">Falha</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label>Destinatário *</Label>
            <Input
              required
              value={f.destinatario}
              onChange={(e) => set({ ...f, destinatario: e.target.value })}
              placeholder="+55 11 99999-9999 ou email@dominio.com"
            />
          </div>
        </div>
      )}
    />
  );
}
function EnviosPageWithTabs() {
  return (
    <>
      <SectionTabs title={MARKETING_META.title} icon={MARKETING_META.icon} tabs={MARKETING_TABS} />
      <EnviosPage />
    </>
  );
}
