import { createFileRoute } from "@tanstack/react-router";
import { SectionTabs, MARKETING_TABS, MARKETING_META } from "@/components/section-tabs";
import { Sparkles, ExternalLink } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SimpleCrud } from "@/components/simple-crud/SimpleCrud";

export const Route = createFileRoute("/_authenticated/app/mkt-landing")({
  component: LandingPagesAdminWithTabs,
  head: () => ({ meta: [{ title: "Landing Pages — ClinicaOS" }] }),
});

interface Row {
  id: string; slug: string; titulo: string; subtitulo: string | null;
  cor_primaria: string | null; cta_label: string | null;
  status: string; conteudo_html: string | null; hero_imagem_url: string | null;
}
interface Form {
  slug: string; titulo: string; subtitulo: string;
  cor_primaria: string; cta_label: string;
  status: string; conteudo_html: string; hero_imagem_url: string;
}

function LandingPagesAdmin() {
  return (
    <SimpleCrud<Row, Form>
      table="mkt_landing_pages"
      selectColumns="id, slug, titulo, subtitulo, cor_primaria, cta_label, status, conteudo_html, hero_imagem_url"
      title="Landing Pages"
      subtitle="Páginas públicas de captura de leads."
      icon={<Sparkles className="h-6 w-6 text-primary" />}
      searchFields={["titulo", "slug"]}
      columns={[
        { key: "titulo", header: "Título", render: r => <span className="font-medium">{r.titulo}</span> },
        { key: "slug", header: "URL", render: r => (
          <a href={`/lp/${r.slug}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline text-sm">
            /lp/{r.slug} <ExternalLink className="h-3 w-3" />
          </a>
        ) },
        { key: "status", header: "Status", className: "w-28", render: r => (
          <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${r.status === "publicada" ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"}`}>{r.status}</span>
        ) },
      ]}
      emptyForm={{ slug: "", titulo: "", subtitulo: "", cor_primaria: "#0f172a", cta_label: "Quero saber mais", status: "rascunho", conteudo_html: "", hero_imagem_url: "" }}
      toForm={r => ({
        slug: r.slug, titulo: r.titulo, subtitulo: r.subtitulo ?? "",
        cor_primaria: r.cor_primaria ?? "#0f172a", cta_label: r.cta_label ?? "Quero saber mais",
        status: r.status, conteudo_html: r.conteudo_html ?? "", hero_imagem_url: r.hero_imagem_url ?? "",
      })}
      toPayload={f => ({
        slug: f.slug.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-"),
        titulo: f.titulo.trim(),
        subtitulo: f.subtitulo || null,
        cor_primaria: f.cor_primaria,
        cta_label: f.cta_label,
        status: f.status,
        conteudo_html: f.conteudo_html || null,
        hero_imagem_url: f.hero_imagem_url || null,
      })}
      renderForm={(f, set) => (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Título *</Label><Input required value={f.titulo} onChange={e => set({ ...f, titulo: e.target.value })} /></div>
            <div className="space-y-1"><Label>Slug (URL) *</Label><Input required value={f.slug} onChange={e => set({ ...f, slug: e.target.value })} placeholder="ofertas-julho" /></div>
          </div>
          <div className="space-y-1"><Label>Subtítulo</Label><Input value={f.subtitulo} onChange={e => set({ ...f, subtitulo: e.target.value })} /></div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1"><Label>Cor primária</Label><Input type="color" value={f.cor_primaria} onChange={e => set({ ...f, cor_primaria: e.target.value })} /></div>
            <div className="space-y-1 sm:col-span-2"><Label>Texto do botão</Label><Input value={f.cta_label} onChange={e => set({ ...f, cta_label: e.target.value })} /></div>
          </div>
          <div className="space-y-1"><Label>Imagem hero (URL)</Label><Input value={f.hero_imagem_url} onChange={e => set({ ...f, hero_imagem_url: e.target.value })} placeholder="https://..." /></div>
          <div className="space-y-1"><Label>Conteúdo HTML (opcional)</Label><Textarea rows={5} value={f.conteudo_html} onChange={e => set({ ...f, conteudo_html: e.target.value })} placeholder="<p>Descreva sua oferta...</p>" /></div>
          <div className="space-y-1"><Label>Status</Label>
            <Select value={f.status} onValueChange={v => set({ ...f, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="rascunho">Rascunho</SelectItem>
                <SelectItem value="publicada">Publicada</SelectItem>
                <SelectItem value="arquivada">Arquivada</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
    />
  );
}
function LandingPagesAdminWithTabs() {
  return (
    <>
      <SectionTabs title={MARKETING_META.title} icon={MARKETING_META.icon} tabs={MARKETING_TABS} />
      <LandingPagesAdmin />
    </>
  );
}
