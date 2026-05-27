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
        .select("paciente_id, paciente_nome, pacientes:paciente_id(cpf)")
        .eq("contrato_id", contratoId)
        .eq("ativo", true),
    ]);

  const convenioNome = convenio?.nome ?? planoFallback?.nome ?? "—";
  const dependentes = (dependentesRows ?? []).map((d: any) => ({
    nome: d.paciente_nome as string,
    cpf: (d.pacientes?.cpf as string | null) ?? null,
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

  const fichas = (parcelas ?? []).map((p) => {
    const total = (parcelas ?? []).length;
    return `
      <div class="ficha">
        <div class="ficha-header">
          <div class="ficha-titulo">
            <div class="ficha-clinica">${esc(clinica?.nome ?? "Clínica")}</div>
            <div class="ficha-doc">CARNÊ DE PAGAMENTO — Contrato #${esc(contrato.numero)}</div>
          </div>
          <div class="ficha-parcela">
            <div class="lab">Parcela</div>
            <div class="val">${p.numero_parcela}/${total}</div>
          </div>
        </div>
        <div class="ficha-grid">
          <div><span class="lab">Titular</span><span class="val">${esc(contrato.paciente_nome)}</span></div>
          <div><span class="lab">CPF</span><span class="val">${esc(paciente?.cpf ?? "—")}</span></div>
          <div><span class="lab">Convênio</span><span class="val">${esc(convenioNome)}</span></div>
          <div><span class="lab">Pessoas no convênio</span><span class="val">${pessoasConvenio}</span></div>
          <div><span class="lab">Mês de referência</span><span class="val">${fmtMesAno(p.vencimento)}</span></div>
          <div><span class="lab">Vencimento</span><span class="val destaque">${fmtD(p.vencimento)}</span></div>
          <div><span class="lab">Valor</span><span class="val destaque">${BRL(Number(p.valor))}</span></div>
          <div>
            <span class="lab">Data de pagamento</span>
            ${p.status === "pago"
              ? `<span class="val">${fmtD(p.pago_em)}</span>`
              : `<span class="linha" style="display:block;border-bottom:1px solid #111;height:16px;"></span>`}
          </div>
        </div>
        <div class="ficha-rodape">
          <div class="campo-manual assinatura">
            <span class="linha-assin"></span>
            <span class="lab" style="text-align:center;display:block;margin-top:2px;">Assinatura / Carimbo do recebedor</span>
          </div>
        </div>
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
    border: 1px dashed #111; padding: 10px 12px; margin-bottom: 8px; border-radius: 6px;
    height: 85mm; display: flex; flex-direction: column; gap: 8px;
    page-break-inside: avoid;
  }
  .capa h1 { font-size: 18px; margin: 0 0 4px; }
  .capa-clinica { font-size: 16px; font-weight: 800; color: #111; margin-bottom: 6px; }
  .capa-clinica .cnpj { font-size: 11px; font-weight: 500; color: #555; margin-left: 6px; }
  .capa-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px 16px; font-size: 12px; align-items: start; }
  .capa-grid .cell { display: flex; flex-direction: column; gap: 2px; }
  .capa-grid .lab { font-size: 10px; color: #666; text-transform: uppercase; letter-spacing: .04em; }
  .capa-grid .val { font-weight: 600; }

  .ficha {
    border: 1px dashed #111;
    border-radius: 6px;
    padding: 10px 12px;
    margin-bottom: 8px;
    page-break-inside: avoid;
    height: 85mm;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .ficha-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid #ddd; padding-bottom: 6px; }
  .ficha-clinica { font-weight: 700; font-size: 13px; }
  .ficha-doc { font-size: 10px; color: #555; letter-spacing: .04em; text-transform: uppercase; }
  .ficha-parcela { text-align: right; }
  .ficha-parcela .lab { font-size: 9px; text-transform: uppercase; color: #666; }
  .ficha-parcela .val { font-size: 18px; font-weight: 800; }
  .ficha-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px 14px; font-size: 11px; }
  .ficha-grid .lab { display:block; font-size: 9px; color: #666; text-transform: uppercase; letter-spacing: .04em; }
  .ficha-grid .val { font-weight: 600; }
  .ficha-grid .val.destaque { font-size: 14px; }
  .ficha-rodape { margin-top: auto; display: grid; grid-template-columns: 1fr; gap: 8px; align-items: end; }
  .campo-manual .lab { display:block; font-size: 9px; color: #666; text-transform: uppercase; letter-spacing: .04em; }
  .campo-manual .linha { display:block; border-bottom: 1px solid #111; height: 16px; }
  .campo-manual.assinatura .linha-assin { display:block; border-bottom: 1px solid #111; height: 28px; }

  .footer-imprime { text-align: center; margin: 8px 0 0; }
  .footer-imprime button { padding: 8px 14px; font-size: 14px; cursor: pointer; }
  @media print { .footer-imprime { display: none; } }
</style>
</head>
<body>
  <div class="capa">
    <h1>Carnê de pagamento — Contrato #${esc(contrato.numero)}</h1>
    <div class="capa-clinica">${esc(clinica?.nome ?? "")}${clinica?.cnpj ? `<span class="cnpj">CNPJ ${esc(clinica.cnpj)}</span>` : ""}</div>
    <div class="capa-grid">
      <div class="cell"><span class="lab">Titular</span>${titularNomes}</div>
      <div class="cell"><span class="lab">CPF</span>${titularCpfs}</div>
      <div class="cell">
        <span class="lab">Convênio</span><span class="val">${esc(convenioNome)}</span>
        <span class="lab" style="margin-top:6px;">Pessoas no convênio</span><span class="val">${pessoasConvenio}</span>
      </div>
      <div class="cell"><span class="lab">Início</span><span class="val">${fmtD(contrato.data_inicio)}</span></div>
      <div class="cell">
        <span class="lab">Dia de vencimento</span><span class="val">${esc(contrato.dia_vencimento ?? "—")}</span>
      </div>
      <div class="cell">
        <span class="lab">Parcelas</span><span class="val">${(parcelas ?? []).length}</span>
        <span class="lab" style="margin-top:6px;">Valor mensal</span><span class="val">${BRL(Number(contrato.valor_mensal))}</span>
        <span class="lab" style="margin-top:6px;">Total do contrato</span><span class="val">${BRL((parcelas ?? []).reduce((s, p) => s + Number(p.valor), 0))}</span>
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
