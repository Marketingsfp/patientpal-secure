import { createFileRoute } from "@tanstack/react-router";
import { SectionTabs, SEGURANCA_TABS, SEGURANCA_META } from "@/components/section-tabs";
import { KeyRound } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { SimpleCrud } from "@/components/simple-crud/SimpleCrud";

export const Route = createFileRoute("/_authenticated/app/integration-secrets")({
  component: SecretsPageWithTabs,
  head: () => ({ meta: [{ title: "Segredos de Integração — ClinicaOS" }] }),
});

interface Row { id: string; chave: string; valor: string; descricao: string | null }
interface Form { chave: string; valor: string; descricao: string }

function SecretsPage() {
  return (
    <SimpleCrud<Row, Form>
      table="integration_secrets"
      selectColumns="id, chave, valor, descricao"
      title="Segredos de Integração"
      subtitle="Chaves de APIs externas usadas por esta clínica (LiveKit, Google, etc.)."
      icon={<KeyRound className="h-6 w-6 text-primary" />}
      searchFields={["chave"]}
      columns={[
        { key: "chave", header: "Chave", render: r => <code className="text-xs font-mono">{r.chave}</code> },
        { key: "valor", header: "Valor", render: r => <span className="text-xs text-muted-foreground">{r.valor.slice(0, 4)}••••{r.valor.slice(-2)}</span> },
        { key: "desc", header: "Descrição", render: r => <span className="text-sm">{r.descricao ?? "—"}</span> },
      ]}
      emptyForm={{ chave: "", valor: "", descricao: "" }}
      toForm={r => ({ chave: r.chave, valor: r.valor, descricao: r.descricao ?? "" })}
      toPayload={f => ({ chave: f.chave.trim(), valor: f.valor.trim(), descricao: f.descricao || null })}
      renderForm={(f, set) => (
        <div className="space-y-3">
          <div className="space-y-1"><Label>Chave *</Label><Input required value={f.chave} onChange={e => set({ ...f, chave: e.target.value })} placeholder="LIVEKIT_API_KEY" /></div>
          <div className="space-y-1"><Label>Valor *</Label><Input required type="password" value={f.valor} onChange={e => set({ ...f, valor: e.target.value })} /></div>
          <div className="space-y-1"><Label>Descrição</Label><Input value={f.descricao} onChange={e => set({ ...f, descricao: e.target.value })} /></div>
        </div>
      )}
    />
  );
}
function SecretsPageWithTabs() {
  return (
    <>
      <SectionTabs title={SEGURANCA_META.title} icon={SEGURANCA_META.icon} tabs={SEGURANCA_TABS} />
      <SecretsPage />
    </>
  );
}
