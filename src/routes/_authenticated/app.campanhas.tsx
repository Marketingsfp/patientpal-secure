import { createFileRoute } from "@tanstack/react-router";
import { SectionTabs, MARKETING_TABS, MARKETING_META } from "@/components/section-tabs";
import { Megaphone } from "lucide-react";
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

export const Route = createFileRoute("/_authenticated/app/campanhas")({
  component: CampanhasPageWithTabs,
  head: () => ({ meta: [{ title: "Campanhas — ClinicaOS" }] }),
});

interface Row {
  id: string;
  nome: string;
  tipo: string;
  mensagem: string;
  segmento: string | null;
  status: string;
  agendada_para: string | null;
}
interface Form {
  nome: string;
  tipo: string;
  mensagem: string;
  segmento: string;
  status: string;
  agendada_para: string;
}

function CampanhasPage() {
  return (
    <SimpleCrud<Row, Form>
      table="campanhas_marketing"
      selectColumns="id, nome, tipo, mensagem, segmento, status, agendada_para"
      title="Campanhas de Marketing"
      subtitle="Envios em massa de WhatsApp, e-mail ou SMS."
      icon={<Megaphone className="h-6 w-6 text-primary" />}
      searchFields={["nome"]}
      columns={[
        {
          key: "nome",
          header: "Nome",
          render: (r) => <span className="font-medium">{r.nome}</span>,
        },
        {
          key: "tipo",
          header: "Canal",
          className: "w-28",
          render: (r) => <span className="capitalize text-sm">{r.tipo}</span>,
        },
        { key: "seg", header: "Segmento", render: (r) => r.segmento ?? "—" },
        {
          key: "st",
          header: "Status",
          className: "w-28",
          render: (r) => (
            <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary capitalize">
              {r.status}
            </span>
          ),
        },
      ]}
      emptyForm={{
        nome: "",
        tipo: "whatsapp",
        mensagem: "",
        segmento: "",
        status: "rascunho",
        agendada_para: "",
      }}
      toForm={(r) => ({
        nome: r.nome,
        tipo: r.tipo,
        mensagem: r.mensagem,
        segmento: r.segmento ?? "",
        status: r.status,
        agendada_para: r.agendada_para ? r.agendada_para.slice(0, 16) : "",
      })}
      toPayload={(f) => ({
        nome: f.nome.trim(),
        tipo: f.tipo,
        mensagem: f.mensagem,
        segmento: f.segmento || null,
        status: f.status,
        agendada_para: f.agendada_para ? new Date(f.agendada_para).toISOString() : null,
      })}
      renderForm={(f, set) => (
        <div className="space-y-3">
<<<<<<< HEAD
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1 col-span-2">
              <Label>Nome *</Label>
              <Input
                required
                value={f.nome}
                onChange={(e) => set({ ...f, nome: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Canal</Label>
              <Select value={f.tipo} onValueChange={(v) => set({ ...f, tipo: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
=======
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1 sm:col-span-2"><Label>Nome *</Label><Input required value={f.nome} onChange={e => set({ ...f, nome: e.target.value })} /></div>
            <div className="space-y-1"><Label>Canal</Label>
              <Select value={f.tipo} onValueChange={v => set({ ...f, tipo: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
>>>>>>> 18eb686dbc25b258ff35f41366dbb0c3660f374b
                <SelectContent>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="email">E-mail</SelectItem>
                  <SelectItem value="sms">SMS</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Segmento</Label>
              <Input
                value={f.segmento}
                onChange={(e) => set({ ...f, segmento: e.target.value })}
                placeholder="Ex: Aniversariantes"
              />
            </div>
            <div className="space-y-1">
              <Label>Agendar para</Label>
              <Input
                type="datetime-local"
                value={f.agendada_para}
                onChange={(e) => set({ ...f, agendada_para: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Mensagem *</Label>
            <Textarea
              rows={5}
              required
              value={f.mensagem}
              onChange={(e) => set({ ...f, mensagem: e.target.value })}
              placeholder="Olá {{nome}}, ..."
            />
          </div>
          <div className="space-y-1">
            <Label>Status</Label>
            <Select value={f.status} onValueChange={(v) => set({ ...f, status: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="rascunho">Rascunho</SelectItem>
                <SelectItem value="agendada">Agendada</SelectItem>
                <SelectItem value="enviada">Enviada</SelectItem>
                <SelectItem value="cancelada">Cancelada</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
    />
  );
}
function CampanhasPageWithTabs() {
  return (
    <>
      <SectionTabs title={MARKETING_META.title} icon={MARKETING_META.icon} tabs={MARKETING_TABS} />
      <CampanhasPage />
    </>
  );
}
