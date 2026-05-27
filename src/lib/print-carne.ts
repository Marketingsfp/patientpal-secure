import { supabase } from "@/integrations/supabase/client";

/**
 * Gera um carnê interno em HTML/A4 a partir das parcelas de um contrato
 * de convênio. Abre uma nova aba com window.print() para salvar como PDF
 * ou imprimir direto.
 *
 * Layout: 3 fichas por página A4, cada ficha com nº da parcela,
 * vencimento, valor, dados do titular/convênio e linha picotada para
 * recorte/preenchimento manual.
 */

const BRL = (v: number) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtD = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const s = iso.length === 10 ? `${iso}T00:00:00` : iso;
  const d = new Date(s);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};

const fmtMesAno = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const s = iso.length === 10 ? `${iso}T00:00:00` : iso;
  const d = new Date(s);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};

const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

export async function gerarCarnePDF(contratoId: string): Promise<void> {
  const { data: contrato, error } = await supabase
    .from("contratos_assinatura")
    .select(
      "id, numero, paciente_nome, paciente_id, convenio_id, plano_id, valor_mensal, data_inicio, dia_vencimento, clinica_id, observacoes",
    )
    .eq("id", contratoId)
    .single();
  if (error || !contrato) throw new Error(error?.message ?? "Contrato não encontrado");

  const [
    { data: parcelas },
    { data: paciente },
    { data: clinica },
    { data: convenio },
    { data: planoFallback },
    { data: dependentesRows },
  ] = await Promise.all([
      supabase
        .from("contrato_mensalidades")
        .select("id, numero_parcela, vencimento, valor, status, pago_em, forma_pagamento")
        .eq("contrato_id", contratoId)
        .order("numero_parcela"),
      supabase
        .from("pacientes")
        .select("nome, cpf, telefone")
        .eq("id", contrato.paciente_id as string)
        .maybeSingle(),
      supabase
        .from("clinicas")
        .select("nome, cnpj, telefone, endereco, cidade, estado")
        .eq("id", contrato.clinica_id as string)
        .maybeSingle(),
      contrato.convenio_id
        ? supabase.from("cb_convenios").select("nome").eq("id", contrato.convenio_id as string).maybeSingle()
        : Promise.resolve({ data: null as { nome: string | null } | null }),
      contrato.plano_id
        ? supabase.from("planos_assinatura").select("nome").eq("id", contrato.plano_id as string).maybeSingle()
        : Promise.resolve({ data: null as { nome: string | null } | null }),
      supabase
        .from("contrato_dependentes")
        .select("paciente_id, paciente_nome")
        .eq("contrato_id", contratoId)
        .eq("ativo", true),
    ]);

  const convenioNome = convenio?.nome ?? planoFallback?.nome ?? "—";
  const depPacienteIds = (dependentesRows ?? [])
    .map((d: any) => d.paciente_id as string | null)
    .filter((id): id is string => !!id);
  const { data: depPacientes } = depPacienteIds.length
    ? await supabase.from("pacientes").select("id, cpf").in("id", depPacienteIds)
    : { data: [] as { id: string; cpf: string | null }[] };
  const cpfMap = new Map((depPacientes ?? []).map((p: any) => [p.id, p.cpf as string | null]));
  const dependentes = (dependentesRows ?? []).map((d: any) => ({
    nome: d.paciente_nome as string,
    cpf: d.paciente_id ? cpfMap.get(d.paciente_id) ?? null : null,
  }));
  const pessoasConvenio = 1 + dependentes.length;

  const titularNomes = `<span class="val">${esc(contrato.paciente_nome)}</span>` +
    (dependentes.length
      ? `<span class="lab" style="margin-top:6px;">Dependentes</span>` +
        dependentes.map((d) => `<span class="val">${esc(d.nome)}</span>`).join("")
      : "");
  const titularCpfs = `<span class="val">${esc(paciente?.cpf ?? "—")}</span>` +
    (dependentes.length
      ? `<span class="lab" style="margin-top:6px;">&nbsp;</span>` +
        dependentes.map((d) => `<span class="val">${esc(d.cpf ?? "—")}</span>`).join("")
      : "");

  const parcelasAbertas = (parcelas ?? []).filter((p) => p.status !== "pago");
  if (parcelasAbertas.length === 0) {
    throw new Error("Nenhuma mensalidade em aberto para gerar carnê.");
  }
  const fichas = parcelasAbertas.map((p) => {
    const total = (parcelas ?? []).length;
    const buildFicha = (viaLabel: string) => `
      <div class="ficha">
        <div class="via-label">${viaLabel}</div>
        <div class="ficha-header">
          <div class="ficha-titulo">
            <div class="ficha-clinica">${esc(clinica?.nome ?? "Clínica")}</div>
            <div class="ficha-doc">CARNÊ DE PAGAMENTO — Contrato #${esc(contrato.numero)}</div>
          </div>
          <div style="display:flex;gap:18px;align-items:flex-start;">
            <div class="ficha-parcela">
              <div class="lab">Parcela</div>
              <div class="val">${p.numero_parcela}/${total}</div>
            </div>
            <div class="ficha-parcela">
              <div class="lab">Mês Ref.</div>
              <div class="val">${fmtMesAno(p.vencimento)}</div>
            </div>
            <div class="ficha-parcela">
              <div class="lab">Vencimento</div>
              <div class="val">${fmtD(p.vencimento)}</div>
            </div>
          </div>
        </div>
        <div class="ficha-grid">
          <div><span class="lab">Titular</span><span class="val">${esc(contrato.paciente_nome)}</span></div>
          <div><span class="lab">CPF</span><span class="val">${esc(paciente?.cpf ?? "—")}</span></div>
          <div>
            <span class="lab">Convênio</span><span class="val">${esc(convenioNome)}</span>
            <span class="lab" style="margin-top:10px;">Pessoas no convênio</span><span class="val">${pessoasConvenio}</span>
          </div>
          <div>
            <span class="lab">Observação</span>
            <span class="val" style="font-weight:500;font-size:10px;line-height:1.45;">Após o vencimento será cobrado 10% de multa e juros de 0,33% ao dia.</span>
          </div>
          <div></div>
          <div>
            <span class="lab">Valor</span><span class="val destaque">${BRL(Number(p.valor))}</span>
          </div>
        </div>
        <div class="ficha-rodape">
          <div class="campo-manual">
            ${p.status === "pago"
              ? `<span class="val" style="font-weight:600;font-size:11px;">${fmtD(p.pago_em)}</span>`
              : `<span class="linha-assin"></span>`}
            <span class="lab" style="text-align:center;display:block;margin-top:2px;">Data de pagamento</span>
          </div>
          <div class="campo-manual assinatura">
            <span class="linha-assin"></span>
            <span class="lab" style="text-align:center;display:block;margin-top:2px;">Assinatura / Carimbo do recebedor</span>
          </div>
        </div>
      </div>
    `;
    return `
      <div class="ficha-par">
        <div class="ficha-via">${buildFicha("Via do cliente")}</div>
        <div class="ficha-via">${buildFicha("Via da clínica")}</div>
      </div>
    `;
  });

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>Carnê — Contrato #${esc(contrato.numero)} — ${esc(contrato.paciente_nome)}</title>
<style>
  @page { size: A4 portrait; margin: 10mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #111; margin: 0; }
  .capa {
    border: 1px dashed #111; padding: 10px 12px; margin-bottom: -1px; border-radius: 6px;
    height: 88mm; display: flex; flex-direction: column; gap: 8px;
    page-break-inside: avoid;
  }
  .capa h1 { font-size: 18px; margin: 0 0 4px; }
  .capa-clinica { font-size: 16px; font-weight: 800; color: #111; margin-bottom: 16px; }
  .capa-clinica .cnpj { font-size: 11px; font-weight: 500; color: #555; margin-left: 6px; }
  .capa-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px 16px; font-size: 12px; align-items: stretch; }
  .capa-grid .cell { display: flex; flex-direction: column; gap: 2px; }
  .capa-grid .lab { font-size: 10px; color: #666; text-transform: uppercase; letter-spacing: .04em; }
  .capa-grid .val { font-weight: 600; }

  .ficha {
    border: 1px dashed #111;
    border-radius: 6px;
    padding: 8px 10px;
    page-break-inside: avoid;
    height: 89mm;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .ficha-par {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0;
    margin-bottom: -1px;
    page-break-inside: avoid;
  }
  .ficha-via { display: flex; flex-direction: column; gap: 3px; }
  .ficha-via:first-child .ficha { border-right: none; border-top-right-radius: 0; border-bottom-right-radius: 0; }
  .ficha-via:last-child .ficha { border-top-left-radius: 0; border-bottom-left-radius: 0; }
  .via-label {
    font-size: 9px; font-weight: 700; text-transform: uppercase;
    letter-spacing: .08em; color: #111;
    margin-bottom: 2px;
  }
  .ficha-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid #ddd; padding-bottom: 6px; }
  .ficha-clinica { font-weight: 700; font-size: 11px; }
  .ficha-doc { font-size: 8px; color: #555; letter-spacing: .04em; text-transform: uppercase; }
  .ficha-parcela { text-align: right; }
  .ficha-parcela .lab { font-size: 8px; text-transform: uppercase; color: #666; }
  .ficha-parcela .val { font-size: 12px; font-weight: 800; }
  .ficha-header > div:last-child { gap: 8px !important; }
  .ficha-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px 12px; font-size: 10px; }
  .ficha-grid > div { display: flex; flex-direction: column; gap: 4px; }
  .ficha-grid .lab { display:block; font-size: 8px; color: #666; text-transform: uppercase; letter-spacing: .04em; }
  .ficha-grid .val { font-weight: 600; }
  .ficha-grid .val.destaque { font-size: 13px; }
  .ficha-rodape { margin-top: auto; display: grid; grid-template-columns: 1fr 1fr; gap: 14px; align-items: end; }
  .ficha-rodape .campo-manual { display: flex; flex-direction: column; justify-content: flex-end; }
  .ficha-rodape .campo-manual .lab { min-height: 20px; }
  .campo-manual .lab { display:block; font-size: 8px; color: #666; text-transform: uppercase; letter-spacing: .04em; }
  .campo-manual .linha { display:block; border-bottom: 1px solid #111; height: 16px; }
  .campo-manual .linha-assin { display:block; border-bottom: 1px solid #111; height: 20px; }

  .footer-imprime { text-align: center; margin: 8px 0 0; }
  .footer-imprime button { padding: 8px 14px; font-size: 14px; cursor: pointer; }
  @media print { .footer-imprime { display: none; } }
</style>
</head>
<body>
  <div class="capa">
    <h1>Carnê de pagamento — Contrato #${esc(contrato.numero)}</h1>
    <div class="capa-clinica">POLICARDMED - CNPJ: 27.045.917/0001-69 ${esc(clinica?.nome ?? "")}${clinica?.cnpj ? `<span class="cnpj">CNPJ ${esc(clinica.cnpj)}</span>` : ""}</div>
    <div class="capa-grid">
      <div class="cell"><span class="lab">Titular</span>${titularNomes}</div>
      <div class="cell"><span class="lab">CPF</span>${titularCpfs}</div>
      <div class="cell">
        <span class="lab">Convênio</span><span class="val">${esc(convenioNome)}</span>
        <span class="lab" style="margin-top:6px;">Pessoas no convênio</span><span class="val">${pessoasConvenio}</span>
      </div>
      <div class="cell" style="display:flex;flex-direction:column;justify-content:flex-end;"><span class="lab">Vigência</span><span class="val">${(() => {
        const ini = contrato.data_inicio ? new Date(contrato.data_inicio) : null;
        if (!ini || isNaN(ini.getTime())) return "—";
        const fim = new Date(ini);
        fim.setMonth(fim.getMonth() + ((parcelas ?? []).length || 12));
        const f = (d: Date) => `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;
        return `${f(ini)} à ${f(fim)}`;
      })()}</span></div>
      <div class="cell" style="display:flex;flex-direction:column;justify-content:flex-end;">
        <span class="lab">Dia de vencimento</span><span class="val">${esc(contrato.dia_vencimento ?? "—")}</span>
      </div>
      <div class="cell">
        <span class="lab">Parcelas</span><span class="val">${(parcelas ?? []).length}</span>
        <span class="lab" style="margin-top:6px;">Valor mensal</span><span class="val">${BRL(Number(contrato.valor_mensal))}</span>
      </div>
    </div>
  </div>

  ${fichas.join("\n")}

  <div class="footer-imprime">
    <button onclick="window.print()">Imprimir / Salvar PDF</button>
  </div>

  <script>window.addEventListener('load', () => setTimeout(() => window.print(), 400));</script>
</body>
</html>`;

  const w = window.open("", "_blank", "width=900,height=1000");
  if (!w) throw new Error("Bloqueio de pop-up impediu a abertura do carnê.");
  w.document.open();
  w.document.write(html);
  w.document.close();
}
