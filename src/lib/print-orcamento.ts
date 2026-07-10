import { supabase } from "@/integrations/supabase/client";

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

const fmtData = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const esc = (s: string | null | undefined) =>
  (s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);

export async function printOrcamento(orcamentoId: string, clinicaId: string) {
  const [orc, itens, cli] = await Promise.all([
    supabase.from("orcamentos").select("*").eq("id", orcamentoId).maybeSingle(),
    supabase.from("orcamento_itens").select("*").eq("orcamento_id", orcamentoId).order("ordem"),
    supabase
      .from("clinicas")
      .select("nome, endereco, cidade, estado, telefone, cnpj")
      .eq("id", clinicaId)
      .maybeSingle(),
  ]);

  if (orc.error || !orc.data) throw new Error(orc.error?.message ?? "Orçamento não encontrado");
  const o = orc.data as any;
  const its = (itens.data ?? []) as any[];
  const c = cli.data as any;

  // Busca preparos dos procedimentos para destacar no cupom
  const procIds = Array.from(
    new Set(its.map((i) => i.procedimento_id).filter(Boolean)),
  ) as string[];
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

  const formasList: string[] = o.forma_pagamento
    ? String(o.forma_pagamento)
        .split("+")
        .map((s: string) => s.trim())
        .filter(Boolean)
    : [];
  const abreviar = (f: string) =>
    f === "Cartão de Crédito" ? "CRÉDITO" : f === "Cartão de Débito" ? "DÉBITO" : f.toUpperCase();

  const validade = new Date(new Date(o.created_at).getTime() + (o.validade_dias || 30) * 86400000);
  const validadeStr = `${String(validade.getDate()).padStart(2, "0")}/${String(validade.getMonth() + 1).padStart(2, "0")}/${validade.getFullYear()}`;

  const endereco = [
    c?.endereco,
    c?.cidade && c?.estado ? `${c.cidade} - ${c.estado}` : (c?.cidade ?? c?.estado),
  ]
    .filter(Boolean)
    .join("<br/>");

  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"/>
<title>Orçamento #${o.numero} - ${esc(o.paciente_nome)}</title>
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
    <div class="center lg">ORÇAMENTO Nº ${String(o.numero).padStart(5, "0")}</div>
    <div class="center sm">${fmtData(o.created_at)}</div>
    <div class="sep"></div>

    <div class="bold">PACIENTE</div>
    <div>${esc(o.paciente_nome)}</div>
    ${o.paciente_telefone ? `<div class="sm">FONE: ${esc(o.paciente_telefone)}</div>` : ""}
    ${o.medico_nome ? `<div class="sm">PROFISSIONAL: ${esc(o.medico_nome)}</div>` : ""}

    <div class="sep"></div>
    <div class="bold">SERVIÇOS</div>
    ${its
      .map(
        (i) => `
      <div class="item-linha">
        <div class="item-nome">${esc(i.descricao)}</div>
        <div class="row sm">
          <div>${Number(i.quantidade)} x ${fmtBRL(Number(i.valor_unitario))}</div>
          <div class="bold">${fmtBRL(Number(i.valor_total))}</div>
        </div>
        ${
          formasList.length > 1
            ? `
          <div class="sm" style="margin-top:2px; padding-left:4px">
            ${formasList
              .map((f: string) => {
                const vu = Number(
                  (i.valores_formas as Record<string, number>)?.[f] ?? i.valor_unitario ?? 0,
                );
                const vt = Number(i.quantidade) * vu;
                return `<div style="display:flex; justify-content:space-between">
                <span>${esc(abreviar(f))}</span>
                <span>${fmtBRL(vt)}</span>
              </div>`;
              })
              .join("")}
          </div>
        `
            : ""
        }
      </div>
    `,
      )
      .join("")}

    <div class="sep"></div>
    <table>
      <tr><td>SUBTOTAL</td><td class="right">${fmtBRL(subtotal)}</td></tr>
      ${desconto > 0 ? `<tr><td>DESCONTO</td><td class="right">- ${fmtBRL(desconto)}</td></tr>` : ""}
      <tr class="bold lg"><td>TOTAL</td><td class="right">${fmtBRL(total)}</td></tr>
    </table>

    ${
      o.forma_pagamento
        ? (() => {
            const formas = formasList;
            if (formas.length <= 1) {
              return `<div class="sm" style="margin-top:6px">PAGAMENTO: <span class="bold">${esc(o.forma_pagamento)}</span></div>`;
            }
            const vals = (o.valores_pagamento ?? {}) as Record<string, number>;
            const headerCols = formas
              .map(
                (f: string) => `
        <td class="center bold" style="border:1px solid #000; padding:3px 2px; width:${(100 / formas.length).toFixed(2)}%">
          ${esc(f)}
        </td>`,
              )
              .join("");
            const valueCols = formas
              .map((f: string) => {
                const v = Number(vals[f] ?? 0);
                return `<td class="center bold" style="border:1px solid #000; padding:3px 2px">${fmtBRL(v)}</td>`;
              })
              .join("");
            return `
        <div class="sm bold" style="margin-top:6px">PAGAMENTO (escolha uma forma)</div>
        <table style="margin-top:2px; border-collapse:collapse; width:100%">
          <tr>${headerCols}</tr>
          <tr>${valueCols}</tr>
        </table>`;
          })()
        : ""
    }
    ${o.observacoes ? `<div class="sep"></div><div class="sm"><div class="bold">OBSERVAÇÕES</div>${esc(o.observacoes)}</div>` : ""}

    ${
      preparos.length > 0
        ? `
    <div class="sep"></div>
    <div class="bold" style="text-align:center">** ATENÇÃO: PREPARO **</div>
    ${preparos
      .map(
        (p) => `
      <div style="margin-top:4px">
        <div class="bold sm">${esc(p.nome)}</div>
        <div class="sm" style="white-space:pre-wrap">${esc(p.preparo)}</div>
      </div>
    `,
      )
      .join("")}
    `
        : ""
    }

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

  const w = window.open("", "_blank", "width=420,height=720");
  if (!w)
    throw new Error(
      "O navegador bloqueou a janela de impressão. Permita pop-ups e tente novamente.",
    );
  w.document.open();
  w.document.write(html);
  w.document.close();
}
