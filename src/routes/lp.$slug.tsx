import { createFileRoute, notFound } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import DOMPurify from "isomorphic-dompurify";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/lp/$slug")({
  component: LandingPageView,
  loader: async ({ params }) => {
    const { data, error } = await supabase
      .from("mkt_landing_pages")
      .select("id, clinica_id, slug, titulo, subtitulo, hero_imagem_url, cor_primaria, cta_label, campos, conteudo_html, status")
      .eq("slug", params.slug)
      .eq("status", "publicada")
      .maybeSingle();
    if (error || !data) throw notFound();
    return { page: data };
  },
  head: ({ params, loaderData }) => {
    if (!loaderData) {
      return { meta: [{ title: "Página não encontrada" }] };
    }
    const url = `https://patientpal-secure.lovable.app/lp/${params.slug}`;
    const desc = loaderData.page.subtitulo ?? loaderData.page.titulo;
    const meta: Array<Record<string, string>> = [
      { title: loaderData.page.titulo },
      { name: "description", content: desc },
      { property: "og:title", content: loaderData.page.titulo },
      { property: "og:description", content: desc },
      { property: "og:url", content: url },
      { property: "og:type", content: "website" },
    ];
    if (loaderData.page.hero_imagem_url) {
      meta.push({ property: "og:image", content: loaderData.page.hero_imagem_url });
      meta.push({ name: "twitter:image", content: loaderData.page.hero_imagem_url });
    }
    return {
      meta,
      links: [{ rel: "canonical", href: url }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Organization",
            name: loaderData.page.titulo,
            description: desc,
            url,
            ...(loaderData.page.hero_imagem_url ? { image: loaderData.page.hero_imagem_url } : {}),
          }),
        },
      ],
    };
  },
  notFoundComponent: () => (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-semibold">Página não encontrada</h1>
        <p className="text-muted-foreground text-sm">Esta landing page não está publicada.</p>
      </div>
    </div>
  ),
});

function LandingPageView() {
  const { page } = Route.useLoaderData();
  const [form, setForm] = useState({ nome: "", telefone: "", email: "", mensagem: "" });
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const cor = page.cor_primaria || "#0f172a";
  const campos = Array.isArray(page.campos) ? (page.campos as string[]) : ["nome", "telefone"];

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    const { error } = await supabase.from("mkt_leads").insert({
      clinica_id: page.clinica_id,
      landing_page_id: page.id,
      nome: form.nome.trim(),
      telefone: form.telefone || null,
      email: form.email || null,
      mensagem: form.mensagem || null,
      origem: "landing_page",
      status: "novo",
    });
    setEnviando(false);
    if (error) setErro("Não foi possível enviar. Tente novamente.");
    else setEnviado(true);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-6 py-16 grid md:grid-cols-2 gap-12 items-center">
        <div className="space-y-6">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight" style={{ color: cor }}>{page.titulo}</h1>
          {page.subtitulo && <p className="text-lg text-muted-foreground">{page.subtitulo}</p>}
          {page.hero_imagem_url && (
            <img src={page.hero_imagem_url} alt={page.titulo} className="w-full rounded-2xl shadow-lg" />
          )}
          {page.conteudo_html && (
            // eslint-disable-next-line react/no-danger
            <div
              className="prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(page.conteudo_html, {
                  FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form"],
                  FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "onfocus", "onblur"],
                }),
              }}
            />
          )}
        </div>
        <div className="bg-card border rounded-2xl p-6 shadow-xl">
          {enviado ? (
            <div className="text-center space-y-3 py-8">
              <CheckCircle2 className="h-12 w-12 mx-auto" style={{ color: cor }} />
              <h2 className="text-xl font-semibold">Recebemos seu contato!</h2>
              <p className="text-sm text-muted-foreground">Em breve nossa equipe entrará em contato.</p>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <h2 className="text-xl font-semibold">Preencha e fale conosco</h2>
              {campos.includes("nome") && (
                <div className="space-y-1"><Label>Nome *</Label><Input required value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} /></div>
              )}
              {campos.includes("telefone") && (
                <div className="space-y-1"><Label>Telefone</Label><Input value={form.telefone} onChange={e => setForm({ ...form, telefone: e.target.value })} /></div>
              )}
              {campos.includes("email") && (
                <div className="space-y-1"><Label>E-mail</Label><Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
              )}
              {campos.includes("mensagem") && (
                <div className="space-y-1"><Label>Mensagem</Label><Textarea rows={3} value={form.mensagem} onChange={e => setForm({ ...form, mensagem: e.target.value })} /></div>
              )}
              {erro && <p className="text-sm text-rose-600">{erro}</p>}
              <Button type="submit" disabled={enviando} className="w-full text-white" style={{ backgroundColor: cor }}>
                {enviando ? "Enviando..." : (page.cta_label || "Enviar")}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}