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
    .select("*")
    .eq("id", contratoId)
    .maybeSingle();
  if (error || !c) throw new Error(error?.message ?? "Contrato não encontrado");

  const [{ data: pl }, { data: cl }, { data: pa }] = await Promise.all([
    (c as any).plano_id
      ? supabase.from("planos_assinatura").select("*").eq("id", (c as any).plano_id).maybeSingle()
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
    .select("*")
    .eq("contrato_id", contratoId)
    .eq("ativo", true);

  const _cl: any = cl ?? {};
  const _pl: any = pl ?? {};
  const _pa: any = pa ?? {};
  const dependentes = (deps ?? []).map((d: any, i: number) =>
    `${i + 1}. ${d.paciente_nome} — ${d.parentesco ?? "—"} (${d.tipo})`
  ).join("\n");

  const enderecoPaciente = [_pa.logradouro, _pa.numero, _pa.bairro, _pa.cidade && _pa.estado ? `${_pa.cidade}-${_pa.estado}` : _pa.cidade].filter(Boolean).join(", ");

  const corpo = applyTemplate(_pl.template_contrato || "", {
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
    VIGENCIA_MESES: String(_pl.vigencia_meses ?? 12),
    FIDELIDADE_MESES: String(_pl.fidelidade_meses ?? 6),
    DATA_HOJE: fmtData(new Date().toISOString()),
    DEPENDENTES: dependentes || "(nenhum)",
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
<pre class="body">${esc(corpo)}</pre>
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