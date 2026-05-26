import { createFileRoute } from "@tanstack/react-router";
import { SectionTabs, MARKETING_TABS, MARKETING_META } from "@/components/section-tabs";
import { Filter } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SimpleCrud } from "@/components/simple-crud/SimpleCrud";

export const Route = createFileRoute("/_authenticated/app/mkt-segmentos")({
  component: SegmentosPageWithTabs,
  head: () => ({ meta: [{ title: "Segmentos — ClinicaOS" }] }),
});

interface Row { id: string; nome: string; descricao: string | null; filtros: Record<string, unknown> }
interface Form { nome: string; descricao: string; filtros: string; }

function SegmentosPage() {
  return (
    <SimpleCrud<Row, Form>
      table="mkt_segmentos"
      selectColumns="id, nome, descricao, filtros"
      title="Segmentos"
      subtitle="Públicos salvos para campanhas — defina filtros em JSON."
      icon={<Filter className="h-6 w-6 text-primary" />}
      searchFields={["nome"]}
      columns={[
        { key: "nome", header: "Nome", render: r => <span className="font-medium">{r.nome}</span> },
        { key: "desc", header: "Descrição", render: r => <span className="text-sm text-muted-foreground">{r.descricao ?? "—"}</span> },
        { key: "filt", header: "Filtros", render: r => (
          <code className="text-[11px] text-muted-foreground line-clamp-1">{JSON.stringify(r.filtros)}</code>
        ) },
      ]}
      emptyForm={{ nome: "", descricao: "", filtros: "{}" }}
      toForm={r => ({ nome: r.nome, descricao: r.descricao ?? "", filtros: JSON.stringify(r.filtros ?? {}, null, 2) })}
      toPayload={f => {
        let filtros: Record<string, unknown> = {};
        try { filtros = JSON.parse(f.filtros || "{}"); } catch { filtros = {}; }
        return {
          nome: f.nome.trim(),
          descricao: f.descricao || null,
          filtros,
        };
      }}
      renderForm={(f, set) => (
        <div className="space-y-3">
          <div className="space-y-1"><Label>Nome *</Label><Input required value={f.nome} onChange={e => set({ ...f, nome: e.target.value })} /></div>
          <div className="space-y-1"><Label>Descrição</Label><Input value={f.descricao} onChange={e => set({ ...f, descricao: e.target.value })} /></div>
          <div className="space-y-1">
            <Label>Filtros (JSON)</Label>
            <Textarea rows={6} className="font-mono text-xs" value={f.filtros} onChange={e => set({ ...f, filtros: e.target.value })} placeholder='{"convenio":"unimed","cidade":"São Paulo"}' />
          </div>
        </div>
      )}
    />
  );
}
function SegmentosPageWithTabs() {
  return (
    <>
      <SectionTabs title={MARKETING_META.title} icon={MARKETING_META.icon} tabs={MARKETING_TABS} />
      <SegmentosPage />
    </>
  );
}
