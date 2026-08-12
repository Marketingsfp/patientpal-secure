/** Pedido de compra / reposição — folha A4 pronta para impressão ou PDF. */

const esc = (s: string | null | undefined) =>
  (s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

export interface ItemPedidoCompra {
  codigo: string | null;
  nome: string;
  categoria: string;
  unidade: string;
  atual: number;
  minimo: number;
  sugestao: number;
  custo: number;
  fornecedor: string | null;
}

export interface PedidoCompraInput {
  clinicaNome: string;
  clinicaEndereco?: string | null;
  clinicaCnpj?: string | null;
  solicitante: string;
  itens: ItemPedidoCompra[];
}

export function printPedidoCompra(input: PedidoCompraInput) {
  const agora = new Date();
  const dataStr = agora.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  const total = input.itens.reduce((s, i) => s + i.sugestao * (i.custo || 0), 0);

  const linhas = input.itens
    .map(
      (i, idx) => `
      <tr>
        <td class="num">${idx + 1}</td>
        <td>${esc(i.codigo) || "—"}</td>
        <td><strong>${esc(i.nome)}</strong><div class="sub">${esc(i.categoria)}${i.fornecedor ? " · " + esc(i.fornecedor) : ""}</div></td>
        <td class="num">${i.atual} ${esc(i.unidade)}</td>
        <td class="num">${i.minimo}</td>
        <td class="num strong">${i.sugestao} ${esc(i.unidade)}</td>
        <td class="num">${fmtBRL(i.custo)}</td>
        <td class="num strong">${fmtBRL(i.sugestao * (i.custo || 0))}</td>
      </tr>`,
    )
    .join("");

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
  <title>Pedido de compra — ${esc(input.clinicaNome)}</title>
  <style>
    @page { size: A4; margin: 14mm; }
    * { box-sizing: border-box; }
    body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #0f172a; margin: 0; font-size: 12px; }
    header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f172a; padding-bottom: 10px; }
    h1 { font-size: 17px; margin: 0 0 2px; letter-spacing: -.2px; }
    .muted { color: #64748b; font-size: 11px; }
    .badge { display:inline-block; border:1px solid #cbd5e1; border-radius:6px; padding:3px 8px; font-size:11px; font-weight:700; }
    table { width: 100%; border-collapse: collapse; margin-top: 14px; }
    th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: .5px; color:#475569; border-bottom:1px solid #cbd5e1; padding:6px 6px; }
    td { padding: 7px 6px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
    td.num, th.num { text-align: right; white-space: nowrap; }
    .sub { color:#64748b; font-size:10px; margin-top:2px; }
    .strong { font-weight: 700; }
    tfoot td { border-top: 2px solid #0f172a; border-bottom: none; font-weight: 700; }
    .assinaturas { display:flex; gap:40px; margin-top:48px; }
    .assinaturas div { flex:1; border-top:1px solid #0f172a; padding-top:6px; text-align:center; font-size:11px; }
    .vazio { margin-top: 24px; color:#64748b; }
  </style></head><body>
  <header>
    <div>
      <h1>Pedido de compra / reposição</h1>
      <div class="muted">${esc(input.clinicaNome)}${input.clinicaCnpj ? " · CNPJ " + esc(input.clinicaCnpj) : ""}</div>
      ${input.clinicaEndereco ? `<div class="muted">${esc(input.clinicaEndereco)}</div>` : ""}
    </div>
    <div style="text-align:right">
      <div class="badge">${input.itens.length} ${input.itens.length === 1 ? "item" : "itens"}</div>
      <div class="muted" style="margin-top:6px">Emitido em ${esc(dataStr)}</div>
      <div class="muted">Solicitante: ${esc(input.solicitante)}</div>
    </div>
  </header>

  ${input.itens.length === 0
      ? `<p class="vazio">Nenhum item abaixo do estoque mínimo no momento.</p>`
      : `<table>
    <thead><tr>
      <th class="num">#</th><th>Código</th><th>Item</th>
      <th class="num">Atual</th><th class="num">Mínimo</th><th class="num">Sugerido</th>
      <th class="num">Custo un.</th><th class="num">Subtotal</th>
    </tr></thead>
    <tbody>${linhas}</tbody>
    <tfoot><tr><td colspan="7" style="text-align:right">Estimativa total</td><td class="num">${fmtBRL(total)}</td></tr></tfoot>
  </table>`}

  <div class="assinaturas">
    <div>Solicitante</div><div>Aprovação / Compras</div>
  </div>
  <script>window.onload = () => { window.print(); setTimeout(() => window.close(), 400); };<\/script>
  </body></html>`;

  const w = window.open("", "_blank", "width=900,height=1000");
  if (!w) return;
  w.document.write(html);
  w.document.close();
}
