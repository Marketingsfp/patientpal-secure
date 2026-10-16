// Arquivos da Área do Paciente (documentos liberados, recibos e NFS-e).
// Server-only. Toda leitura confere clinica_id + paciente_id da sessão e,
// para documentos, se continuam liberados — no momento de gerar o link E no
// momento de baixar (retirar a liberação esconde na hora).
import { esc } from "@/lib/print-doc-a4";
import { buildReciboLancamentoHtml } from "@/lib/print-recibo-lancamento";
import { admin } from "./portal.server";
import { nomeForma, urlNfsePermitida, type TipoLink } from "./regras-fase2";

type Dono = { clinica_id: string; paciente_id: string };

export type Arquivo =
  | { tipo: "html"; nome: string; html: string }
  | { tipo: "url"; nome: string; url: string; mime: string };

const fmtData = (iso: string | null | undefined) => {
  if (!iso) return "";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return a && m && d ? `${d}/${m}/${a}` : "";
};

/** HTML gravado pela equipe → texto simples escapado (nunca repassa tags). */
function textoSeguro(v: string | null | undefined): string {
  const t = (v ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  return esc(t.trim()).replace(/\n/g, "<br>");
}

function pagina(clinica: string, titulo: string, linhas: string[], corpo: string) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(titulo)}</title>
<style>body{font-family:system-ui,Arial,sans-serif;max-width:760px;margin:24px auto;padding:0 16px;color:#111;line-height:1.5}h1{font-size:20px;margin:4px 0 12px}.c{font-weight:700;text-transform:uppercase;font-size:14px}.m{color:#555;font-size:13px}.b{border-top:1px solid #ddd;margin-top:16px;padding-top:16px}button{margin-top:24px;padding:8px 16px}@media print{button{display:none}}</style></head>
<body><div class="c">${esc(clinica)}</div><h1>${esc(titulo)}</h1>${linhas.map((l) => `<div class="m">${l}</div>`).join("")}<div class="b">${corpo}</div><button onclick="window.print()">Imprimir</button></body></html>`;
}

async function nomeClinica(clinicaId: string) {
  const db = await admin();
  const { data } = await db.from("clinicas").select("nome").eq("id", clinicaId).maybeSingle();
  return data?.nome ?? "";
}

/** null = não existe, não é do paciente, ou não está liberado. */
export async function carregarArquivo(
  s: Dono,
  tipo: TipoLink,
  id: string,
  opcoes: { conteudo: boolean },
): Promise<Arquivo | null> {
  const db = await admin();
  if (tipo === "documento") {
    const { data: d } = await db
      .from("documentos_emitidos")
      .select("id, tipo, titulo, conteudo, created_at, liberado_paciente_em, medico_id")
      .eq("id", id)
      .eq("clinica_id", s.clinica_id)
      .eq("paciente_id", s.paciente_id)
      .not("liberado_paciente_em", "is", null)
      .neq("tipo", "contrato")
      .maybeSingle();
    if (!d) return null;
    const nome = `${d.titulo || "Documento"}.html`;
    if (!opcoes.conteudo) return { tipo: "html", nome, html: "" };
    const { data: m } = d.medico_id
      ? await db
          .from("medicos")
          .select("nome")
          .eq("id", d.medico_id)
          .eq("clinica_id", s.clinica_id)
          .maybeSingle()
      : { data: null };
    const med = m?.nome;
    return {
      tipo: "html",
      nome,
      html: pagina(
        await nomeClinica(s.clinica_id),
        d.titulo || "Documento",
        [`Data: ${fmtData(d.created_at)}`, med ? `Profissional: ${esc(med)}` : ""].filter(Boolean),
        textoSeguro(d.conteudo),
      ),
    };
  }
  if (tipo === "exame") {
    const { data: e } = await db
      .from("exame_resultados")
      .select("id, tipo_exame, resultado_texto, data_coleta, created_at, liberado_paciente_em")
      .eq("id", id)
      .eq("clinica_id", s.clinica_id)
      .eq("paciente_id", s.paciente_id)
      .not("liberado_paciente_em", "is", null)
      .maybeSingle();
    if (!e) return null;
    const nome = `Resultado ${e.tipo_exame}.html`;
    if (!opcoes.conteudo) return { tipo: "html", nome, html: "" };
    // Só o resultado: classificação e textos da IA são de uso interno.
    return {
      tipo: "html",
      nome,
      html: pagina(
        await nomeClinica(s.clinica_id),
        `Resultado de exame — ${e.tipo_exame}`,
        [`Data: ${fmtData(e.data_coleta ?? e.created_at)}`],
        textoSeguro(e.resultado_texto),
      ),
    };
  }
  if (tipo === "recibo") {
    const { data: l } = await db
      .from("fin_lancamentos")
      .select("id, descricao, valor, data, forma_pagamento, status, tipo")
      .eq("id", id)
      .eq("clinica_id", s.clinica_id)
      .eq("paciente_id", s.paciente_id)
      .eq("tipo", "receita")
      .eq("status", "confirmado")
      .maybeSingle();
    if (!l) return null;
    const nome = `Recibo ${fmtData(l.data)}.html`;
    if (!opcoes.conteudo) return { tipo: "html", nome, html: "" };
    const { data: p } = await db
      .from("pacientes")
      .select("nome")
      .eq("id", s.paciente_id)
      .eq("clinica_id", s.clinica_id)
      .maybeSingle();
    return {
      tipo: "html",
      nome,
      html: buildReciboLancamentoHtml({
        tipo: "receita",
        clinicaNome: await nomeClinica(s.clinica_id),
        pacienteNome: p?.nome ?? null,
        descricao: l.descricao,
        valor: Number(l.valor),
        data: l.data,
        formaPagamentoLabel: nomeForma(l.forma_pagamento),
        segundaVia: true,
      }),
    };
  }
  // NFS-e: só emitida, do próprio paciente; nunca mexe em nota presa/pendente.
  const { data: n } = await db
    .from("nfse")
    .select("id, numero, status, url_pdf, url_xml")
    .eq("id", id)
    .eq("clinica_id", s.clinica_id)
    .eq("paciente_id", s.paciente_id)
    .eq("status", "emitida")
    .maybeSingle();
  if (!n) return null;
  const pdf = tipo === "nfse_pdf";
  const url = pdf ? n.url_pdf : n.url_xml;
  if (!urlNfsePermitida(url)) return null;
  return {
    tipo: "url",
    nome: `NFS-e ${n.numero ?? ""}.${pdf ? "pdf" : "xml"}`.replace(/\s+\./, "."),
    url: url as string,
    mime: pdf ? "application/pdf" : "application/xml",
  };
}
