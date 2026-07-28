import { supabase } from "@/integrations/supabase/client";
import { formatNumeroOrcamento } from "@/lib/orcamento-numero";

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

const fmtData = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const esc = (s: string | null | undefined) =>
  (s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));

export async function printOrcamento(
  orcamentoId: string,
  clinicaId: string,
  formato: "cupom" | "a4" = "cupom",
) {
  const [orc, itens, cli] = await Promise.all([
    supabase.from("orcamentos").select("*").eq("id", orcamentoId).maybeSingle(),
    supabase.from("orcamento_itens").select("*").eq("orcamento_id", orcamentoId).order("ordem"),
    supabase.from("clinicas").select("nome, endereco, cidade, estado, telefone, cnpj").eq("id", clinicaId).maybeSingle(),
  ]);

  if (orc.error || !orc.data) throw new Error(orc.error?.message ?? "Orçamento não encontrado");
  const o = orc.data as any;
  const its = (itens.data ?? []) as any[];
  const c = cli.data as any;

  // Busca preparos dos procedimentos para destacar no cupom
  const procIds = Array.from(new Set(its.map((i) => i.procedimento_id).filter(Boolean))) as string[];
  const preparoMap = new Map<string, string>();
  if (procIds.length > 0) {
    const { data: procs } = await supabase
      .from("procedimentos")
      .select("id, preparo")
      .in("id", procIds);
    for (const p of procs ?? []) {
      if (p.preparo && String(p.preparo).trim()) preparoMap.set(p.id, String(p.preparo));
    }
  }
  const preparos = its
    .filter((i) => i.procedimento_id && preparoMap.has(i.procedimento_id))
    .map((i) => ({ nome: i.descricao as string, preparo: preparoMap.get(i.procedimento_id)! }));

  const subtotal = its.reduce((s, i) => s + Number(i.valor_total || 0), 0);
  const desconto = Number(o.desconto || 0);
  const total = Number(o.valor_total || subtotal - desconto);

  // Odonto: quando os itens têm valores_formas com Dinheiro/PIX vs Cartão,
  // apresentar dois totais em vez de um único.
  const splitFormas = (i: any): { din: number; cart: number } | null => {
    const vf = i.valores_formas as Record<string, number> | null | undefined;
    if (!vf) return null;
    const din = Number(vf["Dinheiro"] ?? 0);
    const cart = Math.max(
      Number(vf["PIX"] ?? 0),
      Number(vf["Cartão de Crédito"] ?? 0),
      Number(vf["Cartão de Débito"] ?? 0),
      Number(vf["Cartão"] ?? 0),
    );
    if (!din && !cart) return null;
    if (din === cart) return null;
    return { din, cart };
  };
  const temSplit = its.some((i) => splitFormas(i));

  // Sinal (entrada) + saldo final: usado nos serviços de Odontologia com
  // cobrança em duas etapas. Itens sem sinal seguem impressos como hoje.
  const sinalDoItem = (i: any) => Number(i.sinal_valor ?? 0);
  const totalDoItem = (i: any) =>
    Number(i.valor_total ?? Number(i.quantidade || 1) * Number(i.valor_unitario || 0));
  const itensComSinal = its.filter((i) => sinalDoItem(i) > 0);
  const temSinal = itensComSinal.length > 0;
  const totalSinal = itensComSinal.reduce((s, i) => s + sinalDoItem(i), 0);
  const totalSaldo = itensComSinal.reduce(
    (s, i) => s + Math.max(0, totalDoItem(i) - sinalDoItem(i)),
    0,
  );
  const totalDinheiro = its.reduce((s, i) => {
    const sp = splitFormas(i);
    const v = sp ? sp.din : Number(i.valor_unitario || 0);
    return s + Number(i.quantidade || 0) * v;
  }, 0) - (temSplit ? desconto : 0);
  const totalCartao = its.reduce((s, i) => {
    const sp = splitFormas(i);
    const v = sp ? sp.cart : Number(i.valor_unitario || 0);
    return s + Number(i.quantidade || 0) * v;
  }, 0) - (temSplit ? desconto : 0);

  const formasList: string[] = o.forma_pagamento
    ? String(o.forma_pagamento).split("+").map((s: string) => s.trim()).filter(Boolean)
    : [];
  const abreviar = (f: string) =>
    f === "Cartão de Crédito" ? "CRÉDITO"
    : f === "Cartão de Débito" ? "DÉBITO"
    : f.toUpperCase();

  const validade = new Date(new Date(o.created_at).getTime() + (o.validade_dias || 30) * 86400000);
  const validadeStr = `${String(validade.getDate()).padStart(2, "0")}/${String(validade.getMonth() + 1).padStart(2, "0")}/${validade.getFullYear()}`;

  const endereco = [c?.endereco, c?.cidade && c?.estado ? `${c.cidade} - ${c.estado}` : c?.cidade ?? c?.estado]
    .filter(Boolean).join("<br/>");

  const htmlA4 = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"/>
<title>Orçamento #${esc(formatNumeroOrcamento(o.serie, o.numero))} - ${esc(o.paciente_nome)}</title>
<style>
  @page { size: A4 portrait; margin: 15mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #111; }
  body { font-family: "Segoe UI", Arial, Helvetica, sans-serif; font-size: 11pt; line-height: 1.4; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px;
          border-bottom: 2px solid #111; padding-bottom: 8px; }
  .clin-nome { font-size: 15pt; font-weight: 700; }
  .sm { font-size: 9.5pt; color: #444; }
  .doc-num { font-size: 14pt; font-weight: 700; text-align: right; white-space: nowrap; }
  .box { border: 1px solid #ccc; border-radius: 4px; padding: 8px 10px; margin-top: 12px; }
  .box h3 { margin: 0 0 4px; font-size: 10pt; text-transform: uppercase; letter-spacing: .06em; color: #555; }
  table.itens { width: 100%; border-collapse: collapse; margin-top: 14px; }
  table.itens th { background: #f1f1f1; border: 1px solid #ccc; padding: 6px; font-size: 9.5pt;
                   text-transform: uppercase; letter-spacing: .04em; }
  table.itens td { border: 1px solid #ddd; padding: 6px; font-size: 10.5pt; vertical-align: top; }
  .right { text-align: right; }
  .center { text-align: center; }
  .bold { font-weight: 700; }
  .totais { width: 60%; margin-left: auto; margin-top: 12px; border-collapse: collapse; }
  .totais td { padding: 4px 6px; }
  .totais tr.total td { border-top: 2px solid #111; font-size: 12.5pt; font-weight: 700; }
  .assin { display: flex; justify-content: space-between; gap: 40px; margin-top: 46px; }
  .assin div { flex: 1; border-top: 1px solid #111; padding-top: 4px; text-align: center; font-size: 9.5pt; }
  .footer { margin-top: 18px; text-align: center; font-size: 9.5pt; color: #444; }
  .preparo { margin-top: 14px; border: 1px solid #111; padding: 8px 10px; }
  @media print { .noprint { display: none; } }
</style></head>
<body>
  <div class="head">
    <div>
      <div class="clin-nome">${esc(c?.nome ?? "")}</div>
      <div class="sm">${endereco}</div>
      <div class="sm">${[c?.telefone ? `Fone: ${esc(c.telefone)}` : "", c?.cnpj ? `CNPJ: ${esc(c.cnpj)}` : ""].filter(Boolean).join(" &nbsp;•&nbsp; ")}</div>
    </div>
    <div>
      <div class="doc-num">ORÇAMENTO Nº ${o.serie ? esc(formatNumeroOrcamento(o.serie, o.numero)) : String(o.numero).padStart(5, "0")}</div>
      <div class="sm right">${fmtData(o.created_at)}</div>
      <div class="sm right">Válido até ${validadeStr}</div>
    </div>
  </div>

  <div class="box">
    <h3>Paciente</h3>
    <div class="bold">${esc(o.paciente_nome)}</div>
    <div class="sm">
      ${o.paciente_telefone ? `Fone: ${esc(o.paciente_telefone)}` : ""}
      ${o.medico_nome ? `${o.paciente_telefone ? " &nbsp;•&nbsp; " : ""}Profissional: ${esc(o.medico_nome)}` : ""}
    </div>
  </div>

  <table class="itens">
    <thead>
      <tr>
        <th style="text-align:left">Serviço</th>
        <th style="width:8%">Qtd</th>
        <th style="width:15%">Valor unit.</th>
        ${temSplit ? `<th style="width:15%">Dinheiro</th><th style="width:15%">Cartão/PIX</th>` : `<th style="width:15%">Total</th>`}
        ${temSinal ? `<th style="width:14%">Sinal</th><th style="width:14%">Saldo final</th>` : ""}
      </tr>
    </thead>
    <tbody>
      ${its.map((i) => {
        const qtd = Number(i.quantidade) || 1;
        const sp = splitFormas(i);
        const sinalIt = sinalDoItem(i);
        const saldoIt = sinalIt > 0 ? Math.max(0, totalDoItem(i) - sinalIt) : 0;
        return `
      <tr>
        <td>${esc(i.descricao)}</td>
        <td class="center">${qtd}</td>
        <td class="right">${fmtBRL(Number(i.valor_unitario))}</td>
        ${temSplit
          ? `<td class="right">${fmtBRL(qtd * (sp ? sp.din : Number(i.valor_unitario || 0)))}</td>
             <td class="right">${fmtBRL(qtd * (sp ? sp.cart : Number(i.valor_unitario || 0)))}</td>`
          : `<td class="right bold">${fmtBRL(Number(i.valor_total))}</td>`}
        ${temSinal
          ? `<td class="right">${sinalIt > 0 ? fmtBRL(sinalIt) : "-"}</td>
             <td class="right">${sinalIt > 0 ? fmtBRL(saldoIt) : "-"}</td>`
          : ""}
      </tr>`;
      }).join("")}
    </tbody>
  </table>

  <table class="totais">
    ${temSplit
      ? `${desconto > 0 ? `<tr><td>Desconto</td><td class="right">- ${fmtBRL(desconto)}</td></tr>` : ""}
         <tr class="total"><td>Dinheiro</td><td class="right">${fmtBRL(totalDinheiro)}</td></tr>
         <tr class="total"><td>Cartão/PIX</td><td class="right">${fmtBRL(totalCartao)}</td></tr>`
      : `<tr><td>Subtotal</td><td class="right">${fmtBRL(subtotal)}</td></tr>
         ${desconto > 0 ? `<tr><td>Desconto</td><td class="right">- ${fmtBRL(desconto)}</td></tr>` : ""}
         <tr class="total"><td>Total</td><td class="right">${fmtBRL(total)}</td></tr>`}
    ${temSinal
      ? `<tr><td>Total sinal</td><td class="right">${fmtBRL(totalSinal)}</td></tr>
         <tr><td>Total saldo final</td><td class="right">${fmtBRL(totalSaldo)}</td></tr>`
      : ""}
  </table>

  ${o.forma_pagamento ? `<div class="box"><h3>Pagamento</h3>${
    formasList.length <= 1
      ? `<div class="bold">${esc(o.forma_pagamento)}</div>`
      : `<table class="itens" style="margin-top:4px">
           <tr>${formasList.map((f: string) => `<th>${esc(f)}</th>`).join("")}</tr>
           <tr>${formasList.map((f: string) => `<td class="center bold">${fmtBRL(Number(((o.valores_pagamento ?? {}) as Record<string, number>)[f] ?? 0))}</td>`).join("")}</tr>
         </table>`
  }</div>` : ""}

  ${o.observacoes ? `<div class="box"><h3>Observações</h3><div style="white-space:pre-wrap">${esc(o.observacoes)}</div></div>` : ""}

  ${preparos.length > 0 ? `
  <div class="preparo">
    <div class="bold center">ATENÇÃO: PREPARO</div>
    ${preparos.map((p) => `
      <div style="margin-top:6px">
        <div class="bold">${esc(p.nome)}</div>
        <div class="sm" style="white-space:pre-wrap">${esc(p.preparo)}</div>
      </div>`).join("")}
  </div>` : ""}

  <div class="assin">
    <div>Assinatura do paciente</div>
    <div>Assinatura do profissional</div>
  </div>
  <div class="footer">Orçamento válido até ${validadeStr} — Obrigado pela preferência!</div>

  <script>
    window.addEventListener("load", function () {
      setTimeout(function () { window.print(); }, 150);
    });
  </script>
</body></html>`;

  const htmlCupom = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"/>
<title>Orçamento #${esc(formatNumeroOrcamento(o.serie, o.numero))} - ${esc(o.paciente_nome)}</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #000; }
  body { font-family: "Courier New", "Consolas", monospace; font-size: 11pt; line-height: 1.25; }
  .ticket { width: 76mm; padding: 3mm 2mm 6mm; }
  .center { text-align: center; }
  .right { text-align: right; }
  .bold { font-weight: 700; }
  .sm { font-size: 9pt; }
  .lg { font-size: 13pt; font-weight: 700; }
  .sep { border-top: 1px dashed #000; margin: 6px 0; }
  .row { display: flex; justify-content: space-between; gap: 6px; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 1px 0; vertical-align: top; }
  .item-nome { font-weight: 700; }
  .item-linha { padding: 3px 0; border-bottom: 1px dotted #999; }
  @media print { .noprint { display: none; } }
  .noprint { position: fixed; top: 8px; right: 8px; }
  .noprint button { padding: 6px 12px; font-size: 12px; cursor: pointer; }
</style></head>
<body>
  <div class="ticket">
    <div class="center bold">${esc(c?.nome ?? "")}</div>
    <div class="center sm">${endereco}</div>
    ${c?.telefone ? `<div class="center sm">FONE ${esc(c.telefone)}</div>` : ""}
    ${c?.cnpj ? `<div class="center sm">CNPJ ${esc(c.cnpj)}</div>` : ""}

    <div class="sep"></div>
    <div class="center lg">ORÇAMENTO Nº ${o.serie ? esc(formatNumeroOrcamento(o.serie, o.numero)) : String(o.numero).padStart(5, "0")}</div>
    <div class="center sm">${fmtData(o.created_at)}</div>
    <div class="sep"></div>

    <div class="bold">PACIENTE</div>
    <div>${esc(o.paciente_nome)}</div>
    ${o.paciente_telefone ? `<div class="sm">FONE: ${esc(o.paciente_telefone)}</div>` : ""}
    ${o.medico_nome ? `<div class="sm">PROFISSIONAL: ${esc(o.medico_nome)}</div>` : ""}

    <div class="sep"></div>
    <div class="bold">SERVIÇOS</div>
    ${its.map((i) => `
      <div class="item-linha">
        <div class="item-nome">${esc(i.descricao)}</div>
        <div class="row sm">
          <div>${Number(i.quantidade)} x ${fmtBRL(Number(i.valor_unitario))}</div>
          ${splitFormas(i) ? "" : `<div class="bold">${fmtBRL(Number(i.valor_total))}</div>`}
        </div>
        ${(() => {
          const sp = splitFormas(i);
          if (sp) {
            const qtd = Number(i.quantidade) || 1;
            return `
          <div class="sm" style="margin-top:2px; padding-left:4px">
            <div style="display:flex; justify-content:space-between">
              <span>DINHEIRO</span>
              <span>${fmtBRL(qtd * sp.din)}</span>
            </div>
            <div style="display:flex; justify-content:space-between">
              <span>CARTÃO/PIX</span>
              <span>${fmtBRL(qtd * sp.cart)}</span>
            </div>
          </div>`;
          }
          return formasList.length > 1 ? `
          <div class="sm" style="margin-top:2px; padding-left:4px">
            ${formasList.map((f: string) => {
              const vu = Number((i.valores_formas as Record<string, number>)?.[f] ?? i.valor_unitario ?? 0);
              const vt = Number(i.quantidade) * vu;
              return `<div style="display:flex; justify-content:space-between">
                <span>${esc(abreviar(f))}</span>
                <span>${fmtBRL(vt)}</span>
              </div>`;
            }).join("")}
          </div>
        ` : "";
        })()}
        ${(() => {
          const sinalIt = sinalDoItem(i);
          if (sinalIt <= 0) return "";
          const totalIt = totalDoItem(i);
          const saldoIt = Math.max(0, totalIt - sinalIt);
          return `
          <div class="sm" style="margin-top:2px; padding-left:4px">
            <div style="display:flex; justify-content:space-between">
              <span>SINAL</span><span>${fmtBRL(sinalIt)}</span>
            </div>
            <div style="display:flex; justify-content:space-between">
              <span>SALDO FINAL</span><span>${fmtBRL(saldoIt)}</span>
            </div>
          </div>`;
        })()}
      </div>
    `).join("")}

    <div class="sep"></div>
    <table>
      ${temSplit
        ? `${desconto > 0 ? `<tr><td>DESCONTO</td><td class="right">- ${fmtBRL(desconto)}</td></tr>` : ""}
           <tr class="bold lg"><td>DINHEIRO</td><td class="right">${fmtBRL(totalDinheiro)}</td></tr>
           <tr class="bold lg"><td>CARTÃO/PIX</td><td class="right">${fmtBRL(totalCartao)}</td></tr>`
        : `<tr><td>SUBTOTAL</td><td class="right">${fmtBRL(subtotal)}</td></tr>
           ${desconto > 0 ? `<tr><td>DESCONTO</td><td class="right">- ${fmtBRL(desconto)}</td></tr>` : ""}
           <tr class="bold lg"><td>TOTAL</td><td class="right">${fmtBRL(total)}</td></tr>`}
      ${temSinal
        ? `<tr><td>TOTAL SINAL</td><td class="right">${fmtBRL(totalSinal)}</td></tr>
           <tr><td>TOTAL SALDO FINAL</td><td class="right">${fmtBRL(totalSaldo)}</td></tr>`
        : ""}
    </table>

    ${o.forma_pagamento ? (() => {
      const formas = formasList;
      if (formas.length <= 1) {
        return `<div class="sm" style="margin-top:6px">PAGAMENTO: <span class="bold">${esc(o.forma_pagamento)}</span></div>`;
      }
      const vals = (o.valores_pagamento ?? {}) as Record<string, number>;
      const headerCols = formas.map((f: string) => `
        <td class="center bold" style="border:1px solid #000; padding:3px 2px; width:${(100 / formas.length).toFixed(2)}%">
          ${esc(f)}
        </td>`).join("");
      const valueCols = formas.map((f: string) => {
        const v = Number(vals[f] ?? 0);
        return `<td class="center bold" style="border:1px solid #000; padding:3px 2px">${fmtBRL(v)}</td>`;
      }).join("");
      return `
        <div class="sm bold" style="margin-top:6px">PAGAMENTO (escolha uma forma)</div>
        <table style="margin-top:2px; border-collapse:collapse; width:100%">
          <tr>${headerCols}</tr>
          <tr>${valueCols}</tr>
        </table>`;
    })() : ""}
    ${o.observacoes ? `<div class="sep"></div><div class="sm"><div class="bold">OBSERVAÇÕES</div>${esc(o.observacoes)}</div>` : ""}

    ${preparos.length > 0 ? `
    <div class="sep"></div>
    <div class="bold" style="text-align:center">** ATENÇÃO: PREPARO **</div>
    ${preparos.map((p) => `
      <div style="margin-top:4px">
        <div class="bold sm">${esc(p.nome)}</div>
        <div class="sm" style="white-space:pre-wrap">${esc(p.preparo)}</div>
      </div>
    `).join("")}
    ` : ""}

    <div class="sep"></div>
    <div class="center sm">VÁLIDO ATÉ ${validadeStr}</div>
    <div class="center sm" style="margin-top:8px">Obrigado pela preferência!</div>
  </div>
  <script>
    window.addEventListener("load", function () {
      setTimeout(function () { window.print(); }, 150);
    });
  </script>
</body></html>`;

  const html = formato === "a4" ? htmlA4 : htmlCupom;
  const w = window.open(
    "",
    "_blank",
    formato === "a4" ? "width=900,height=1000" : "width=420,height=720",
  );
  if (!w) throw new Error("O navegador bloqueou a janela de impressão. Permita pop-ups e tente novamente.");
  w.document.open();
  w.document.write(html);
  w.document.close();
}