import { supabase } from "@/integrations/supabase/client";

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v || 0));

const fmtData = (iso?: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};

const esc = (s: string | null | undefined) =>
  (s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);

function applyTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => esc(vars[k] ?? ""));
}

export async function printContrato(contratoId: string) {
  const { data: c, error } = await supabase
    .from("contratos_assinatura")
    .select(`*, plano:planos_assinatura(*), clinica:clinicas(nome, cnpj, endereco, cidade, estado, telefone), paciente:pacientes(cpf, data_nascimento, telefone, email, logradouro, numero, bairro, cidade, estado, cep)`)
    .eq("id", contratoId)
    .maybeSingle();
  if (error || !c) throw new Error(error?.message ?? "Contrato não encontrado");

  const { data: deps } = await supabase
    .from("contrato_dependentes")
    .select("*")
    .eq("contrato_id", contratoId)
    .eq("ativo", true);

  const cl = (c as any).clinica ?? {};
  const pl = (c as any).plano ?? {};
  const pa = (c as any).paciente ?? {};
  const dependentes = (deps ?? []).map((d: any, i: number) =>
    `${i + 1}. ${d.paciente_nome} — ${d.parentesco ?? "—"} (${d.tipo})`
  ).join("\n");

  const enderecoPaciente = [pa.logradouro, pa.numero, pa.bairro, pa.cidade && pa.estado ? `${pa.cidade}-${pa.estado}` : pa.cidade].filter(Boolean).join(", ");

  const corpo = applyTemplate(pl.template_contrato || "", {
    CLINICA_NOME: cl.nome ?? "",
    CLINICA_CNPJ: cl.cnpj ?? "",
    CLINICA_ENDERECO: [cl.endereco, cl.cidade, cl.estado].filter(Boolean).join(", "),
    CIDADE: cl.cidade ?? "",
    PACIENTE_NOME: c.paciente_nome ?? "",
    PACIENTE_CPF: pa.cpf ?? "",
    PACIENTE_NASCIMENTO: fmtData(pa.data_nascimento),
    PACIENTE_ENDERECO: enderecoPaciente,
    PACIENTE_TELEFONE: pa.telefone ?? "",
    PACIENTE_EMAIL: pa.email ?? "",
    VALOR_MENSAL: fmtBRL(Number(c.valor_mensal)),
    TAXA_ADESAO: fmtBRL(Number(c.taxa_adesao)),
    NUM_PARCELAS: String(c.num_parcelas),
    VIGENCIA_MESES: String(pl.vigencia_meses ?? 12),
    FIDELIDADE_MESES: String(pl.fidelidade_meses ?? 6),
    DATA_HOJE: fmtData(new Date().toISOString()),
    DEPENDENTES: dependentes || "(nenhum)",
  });

  const assinatura = (c as any).assinatura_svg
    ? `<img src="${(c as any).assinatura_svg}" style="height:80px;max-width:300px"/>`
    : `<div style="height:80px;border-bottom:1px solid #000;width:300px"></div>`;

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/>
<title>Contrato #${c.numero} - ${esc(c.paciente_nome)}</title>
<style>
@page { size: A4; margin: 18mm; }
body { font-family: Arial, Helvetica, sans-serif; font-size: 11pt; color:#000; line-height: 1.45; }
h1 { font-size: 14pt; text-align:center; margin: 0 0 4mm; }
.head { text-align:center; margin-bottom: 6mm; font-size: 10pt; }
pre.body { white-space: pre-wrap; font-family: inherit; font-size: 11pt; margin: 0; }
.sig { margin-top: 14mm; display:flex; justify-content: space-around; gap:10mm; text-align:center; font-size: 10pt; }
.sig div { width:45%; }
.meta { margin-top: 6mm; font-size:9pt; color:#444; text-align:center; }
.numero { float:right; font-size:10pt; }
</style></head><body>
<div class="head">
  <strong>${esc(cl.nome)}</strong><br/>
  ${esc([cl.endereco, cl.cidade, cl.estado].filter(Boolean).join(" — "))}<br/>
  CNPJ: ${esc(cl.cnpj ?? "")} — Tel.: ${esc(cl.telefone ?? "")}
  <span class="numero">Contrato Nº ${c.numero}</span>
</div>
<pre class="body">${esc(corpo)}</pre>
<div class="sig">
  <div>____________________________<br/>${esc(cl.nome)}</div>
  <div>${assinatura}<br/>${esc(c.paciente_nome)}</div>
</div>
${(c as any).assinado_em ? `<div class="meta">Assinado digitalmente em ${fmtData((c as any).assinado_em)} — IP: ${esc((c as any).assinatura_ip ?? "—")}</div>` : ""}
<script>window.onload=()=>{setTimeout(()=>{window.print();},300);};</script>
</body></html>`;

  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) throw new Error("Bloqueador de pop-up impediu a impressão");
  w.document.open(); w.document.write(html); w.document.close();
}