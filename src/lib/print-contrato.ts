import { supabase } from "@/integrations/supabase/client";

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v || 0));

const fmtData = (iso?: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};

const MESES_PT = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

export const fmtDataExtenso = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${d.getDate()} de ${MESES_PT[d.getMonth()]} de ${d.getFullYear()}`;
};

const esc = (s: string | null | undefined) =>
  (s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);

function applyTemplate(tpl: string, vars: Record<string, string>): string {
  // Blocos condicionais: {{#KEY}}...{{/KEY}} (renderiza apenas se vars[KEY] tiver valor)
  // e {{^KEY}}...{{/KEY}} (renderiza apenas se vars[KEY] estiver vazio)
  let out = tpl.replace(/\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, key, body) =>
    vars[key] && String(vars[key]).trim() ? body : ""
  );
  out = out.replace(/\{\{\^(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, key, body) =>
    vars[key] && String(vars[key]).trim() ? "" : body
  );
  return out.replace(/\{\{(\w+)\}\}/g, (_, k) => esc(vars[k] ?? ""));
}

export async function printContrato(contratoId: string) {
  const { data: c, error } = await supabase
    .from("contratos_assinatura")
    .select("*")
    .eq("id", contratoId)
    .maybeSingle();
  if (error || !c) throw new Error(error?.message ?? "Contrato não encontrado");

  const [{ data: pl }, { data: conv }, { data: cl }, { data: pa }] = await Promise.all([
    (c as any).plano_id
      ? supabase.from("planos_assinatura").select("*").eq("id", (c as any).plano_id).maybeSingle()
      : Promise.resolve({ data: null as any }),
    (c as any).convenio_id
      ? supabase.from("cb_convenios").select("*").eq("id", (c as any).convenio_id).maybeSingle()
      : Promise.resolve({ data: null as any }),
    (c as any).clinica_id
      ? supabase.from("clinicas").select("nome, cnpj, endereco, cidade, estado, telefone").eq("id", (c as any).clinica_id).maybeSingle()
      : Promise.resolve({ data: null as any }),
    (c as any).paciente_id
      ? supabase.from("pacientes").select("cpf, data_nascimento, telefone, email, logradouro, numero, bairro, cidade, estado, cep").eq("id", (c as any).paciente_id).maybeSingle()
      : Promise.resolve({ data: null as any }),
  ]);

  const { data: deps } = await supabase
    .from("contrato_dependentes")
    .select("*, pacientes:paciente_id(cpf, data_nascimento, telefone)")
    .eq("contrato_id", contratoId)
    .eq("ativo", true);

  const _cl: any = cl ?? {};
  const _pl: any = pl ?? {};
  const _conv: any = conv ?? {};
  const _pa: any = pa ?? {};
  const dependentes = (deps ?? []).map((d: any, i: number) =>
    `${i + 1}. ${d.paciente_nome} — ${d.parentesco ?? "—"} (${d.tipo})`
  ).join("\n");

  const enderecoPaciente = [_pa.logradouro, _pa.numero, _pa.bairro, _pa.cidade && _pa.estado ? `${_pa.cidade}-${_pa.estado}` : _pa.cidade].filter(Boolean).join(", ");

  const maxSlots = (deps ?? []).length;
  const depSlotVars: Record<string, string> = {};
  for (let i = 0; i < maxSlots; i++) {
    const d: any = (deps ?? [])[i];
    const idx = i + 1;
    depSlotVars[`DEPENDENTE_${idx}`] = d?.paciente_nome ?? "";
    depSlotVars[`DEPENDENTE_${idx}_PARENTESCO`] = d?.parentesco ?? "";
    depSlotVars[`DEPENDENTE_${idx}_CPF`] = d?.pacientes?.cpf ?? "";
    depSlotVars[`DEPENDENTE_${idx}_NASCIMENTO`] = fmtData(d?.pacientes?.data_nascimento) === "—" ? "" : fmtData(d?.pacientes?.data_nascimento);
    depSlotVars[`DEPENDENTE_${idx}_TELEFONE`] = d?.pacientes?.telefone ?? d?.telefone ?? "";
  }

  const templateSrc: string = _pl.template_contrato || _conv.modelo_contrato || "";
  const isHtml = /<[a-z][\s\S]*>/i.test(templateSrc);
  const corpo = applyTemplate(templateSrc, {
    CLINICA_NOME: _cl.nome ?? "",
    CLINICA_CNPJ: _cl.cnpj ?? "",
    CLINICA_ENDERECO: [_cl.endereco, _cl.cidade, _cl.estado].filter(Boolean).join(", "),
    CIDADE: _cl.cidade ?? "",
    PACIENTE_NOME: c.paciente_nome ?? "",
    PACIENTE_CPF: _pa.cpf ?? "",
    PACIENTE_NASCIMENTO: fmtData(_pa.data_nascimento),
    PACIENTE_ENDERECO: enderecoPaciente,
    PACIENTE_TELEFONE: _pa.telefone ?? "",
    PACIENTE_EMAIL: _pa.email ?? "",
    VALOR_MENSAL: fmtBRL(Number(c.valor_mensal)),
    TAXA_ADESAO: fmtBRL(Number(c.taxa_adesao)),
    NUM_PARCELAS: String(c.num_parcelas),
    VIGENCIA_MESES: String(_pl.vigencia_meses ?? _conv.vigencia_meses ?? 12),
    FIDELIDADE_MESES: String(_pl.fidelidade_meses ?? _conv.fidelidade_meses ?? 6),
    DATA_HOJE: fmtDataExtenso(new Date().toISOString()),
    DEPENDENTES: dependentes || "(nenhum)",
    ...depSlotVars,
  });

  const rawSig = (c as any).assinatura_svg as string | null | undefined;
  // Apenas aceitamos data URLs de imagem PNG/JPEG (base64). Qualquer outra coisa é descartada
  // para evitar XSS no preview de impressão (origem compartilhada com o app).
  const sigOk = typeof rawSig === "string"
    && /^data:image\/(png|jpe?g);base64,[A-Za-z0-9+/=]+$/.test(rawSig)
    && rawSig.length < 2_000_000;
  const assinatura = sigOk
    ? `<img src="${esc(rawSig!)}" style="height:80px;max-width:300px" alt="assinatura"/>`
    : `<div style="height:80px;border-bottom:1px solid #000;width:300px"></div>`;

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/>
<title>Contrato #${c.numero} - ${esc(c.paciente_nome)}</title>
<style>
@page { size: A4; margin: 18mm; }
body { font-family: Arial, Helvetica, sans-serif; font-size: 11pt; color:#000; line-height: 1.45; }
h1 { font-size: 14pt; text-align:center; margin: 0 0 4mm; }
.head { text-align:center; margin-bottom: 6mm; font-size: 10pt; }
pre.body { white-space: pre-wrap; font-family: inherit; font-size: 11pt; margin: 0; }
div.body { font-size: 11pt; line-height: 1.45; }
div.body p { margin: 0 0 6pt; }
div.body table { border-collapse: collapse; }
div.body img { max-width: 100%; }
.sig { margin-top: 14mm; display:flex; justify-content: space-around; gap:10mm; text-align:center; font-size: 10pt; }
.sig div { width:45%; }
.meta { margin-top: 6mm; font-size:9pt; color:#444; text-align:center; }
.numero { float:right; font-size:10pt; }
</style></head><body>
<div class="head">
<strong>${esc(_cl.nome)}</strong><br/>
  ${esc([_cl.endereco, _cl.cidade, _cl.estado].filter(Boolean).join(" — "))}<br/>
  CNPJ: ${esc(_cl.cnpj ?? "")} — Tel.: ${esc(_cl.telefone ?? "")}
  <span class="numero">Contrato Nº ${c.numero}</span>
</div>
${isHtml ? `<div class="body">${corpo}</div>` : `<pre class="body">${esc(corpo)}</pre>`}
<div class="sig">
  <div>____________________________<br/>${esc(_cl.nome)}</div>
  <div>${assinatura}<br/>${esc(c.paciente_nome)}</div>
</div>
${(c as any).assinado_em ? `<div class="meta">Assinado digitalmente em ${fmtData((c as any).assinado_em)} — IP: ${esc((c as any).assinatura_ip ?? "—")}</div>` : ""}
<script>window.onload=()=>{setTimeout(()=>{window.print();},300);};</script>
</body></html>`;

  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) throw new Error("Bloqueador de pop-up impediu a impressão");
  w.document.open(); w.document.write(html); w.document.close();
}