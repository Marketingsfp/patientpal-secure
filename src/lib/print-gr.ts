import { supabase } from "@/integrations/supabase/client";

/**
 * Imprime a GR (Guia de Recebimento / Guia de Atendimento) no formato
 * térmico 80mm — compatível com Bematech MP-4200 TH e similares.
 *
 * Abre uma janela de impressão com CSS @page de 80mm de largura
 * e dispara window.print() automaticamente.
 */

export interface PrintGRInput {
  agendamentoId: string;
  clinicaId: string;
  usuarioNome?: string;
  pagamento?: {
    valor: number;
    forma_pagamento: string | null;
    parcelas: number | null;
    bandeira_cartao: string | null;
  };
}

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

const fmtData = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const fmtDataSimples = (iso: string | null) => {
  if (!iso) return "";
  const s = iso.length === 10 ? `${iso}T00:00:00` : iso;
  const d = new Date(s);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};

const esc = (s: string | null | undefined) =>
  (s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));

const FORMA_LABEL: Record<string, string> = {
  dinheiro: "DINHEIRO",
  pix: "PIX",
  cartao_credito: "CARTÃO CRÉDITO",
  cartao_debito: "CARTÃO DÉBITO",
  boleto: "BOLETO",
  convenio: "CONVÊNIO",
  transferencia: "TRANSFERÊNCIA",
};

export async function printGuiaAtendimento({ agendamentoId, clinicaId, usuarioNome, pagamento }: PrintGRInput) {
  // Busca dados em paralelo
  const [ag, cli] = await Promise.all([
    supabase
      .from("agendamentos")
      .select("id, paciente_nome, paciente_id, medico_id, inicio, procedimento, observacoes")
      .eq("id", agendamentoId)
      .maybeSingle(),
    supabase
      .from("clinicas")
      .select("nome, endereco, cidade, estado, telefone, cnpj")
      .eq("id", clinicaId)
      .maybeSingle(),
  ]);

  if (ag.error || !ag.data) {
    throw new Error(ag.error?.message ?? "Agendamento não encontrado");
  }
  const a = ag.data;
  const c = cli.data;

  const [pac, med, proc] = await Promise.all([
    a.paciente_id
      ? supabase
          .from("pacientes")
          .select("nome, cpf, telefone, data_nascimento")
          .eq("id", a.paciente_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    a.medico_id
      ? supabase.from("medicos").select("nome").eq("id", a.medico_id).maybeSingle()
      : Promise.resolve({ data: null }),
    a.procedimento
      ? supabase
          .from("procedimentos")
          .select("nome, valor_dinheiro_pix, valor_cartao")
          .eq("clinica_id", clinicaId)
          .ilike("nome", a.procedimento)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const paciente = pac.data as { nome: string; cpf: string | null; telefone: string | null; data_nascimento: string | null } | null;
  const medicoNome = (med.data as { nome: string } | null)?.nome ?? "—";
  const procData = proc.data as { nome: string; valor_dinheiro_pix: number | null; valor_cartao: number | null } | null;

  // Se já temos pagamento informado, usa ele; senão tenta tabela de procedimentos
  const valor = pagamento ? Number(pagamento.valor) : Number(procData?.valor_dinheiro_pix ?? 0);
  const procNome = (a.procedimento || procData?.nome || "CONSULTA").toUpperCase();

  // Ficha = sequência do dia (placeholder simples baseado nos minutos)
  const inicioDt = new Date(a.inicio);
  const ficha = String(inicioDt.getHours() * 60 + inicioDt.getMinutes()).padStart(3, "0");

  // Repasse padrão 50/50 — pode ser ajustado depois pelas regras de split
  const clinica = valor / 2;
  const prestador = valor / 2;

  const formaLbl = pagamento?.forma_pagamento ? (FORMA_LABEL[pagamento.forma_pagamento] ?? pagamento.forma_pagamento.toUpperCase()) : "DINHEIRO";
  const parcelasTxt = pagamento && pagamento.forma_pagamento === "cartao_credito" && pagamento.parcelas && pagamento.parcelas > 1
    ? `${pagamento.parcelas}x DE ${fmtBRL(valor / pagamento.parcelas)}`
    : "À VISTA";
  const bandeiraTxt = pagamento?.bandeira_cartao ? pagamento.bandeira_cartao.toUpperCase() : "";

  const endereco = [c?.endereco, c?.cidade && c?.estado ? `${c.cidade} - ${c.estado}` : c?.cidade ?? c?.estado].filter(Boolean).join("<br/>");

  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8" />
<title>GR - ${esc(paciente?.nome ?? a.paciente_nome)}</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #000; }
  body { font-family: "Courier New", "Consolas", monospace; font-size: 11pt; line-height: 1.25; }
  .ticket { width: 76mm; padding: 3mm 2mm 6mm; }
  .center { text-align: center; }
  .right  { text-align: right; }
  .bold   { font-weight: 700; }
  .sm     { font-size: 9pt; }
  .lg     { font-size: 13pt; font-weight: 700; }
  .sep    { border-top: 1px dashed #000; margin: 6px 0; }
  .row    { display: flex; justify-content: space-between; gap: 6px; }
  table   { width: 100%; border-collapse: collapse; }
  td      { padding: 1px 0; vertical-align: top; }
  .label  { color: #000; }
  .v      { font-weight: 700; }
  h1, h2, h3 { margin: 0; }
  @media print { .noprint { display: none; } }
  .noprint { position: fixed; top: 8px; right: 8px; }
  .noprint button { padding: 6px 12px; font-size: 12px; cursor: pointer; }
</style></head>
<body>
  <div class="noprint">
    <button onclick="window.print()">Imprimir</button>
    <button onclick="window.close()">Fechar</button>
  </div>
  <div class="ticket">
    <div class="center bold">${esc(c?.nome ?? "")}</div>
    <div class="center sm">${endereco}</div>
    ${c?.telefone ? `<div class="center sm">FONE ${esc(c.telefone)}</div>` : ""}
    ${c?.cnpj ? `<div class="center sm">CNPJ ${esc(c.cnpj)}</div>` : ""}

    <div class="sep"></div>
    <div class="center lg">GUIA DE ATENDIMENTO</div>
    <div class="sep"></div>

    <div class="center bold">${esc(paciente?.nome ?? a.paciente_nome)}</div>
    ${paciente?.cpf ? `<div class="center sm">CPF: <span class="v">${esc(paciente.cpf)}</span></div>` : ""}
    ${paciente?.telefone ? `<div class="center sm">FONE: <span class="v">${esc(paciente.telefone)}</span></div>` : ""}
    ${paciente?.data_nascimento ? `<div class="center sm">NASC: <span class="v">${fmtDataSimples(paciente.data_nascimento)}</span></div>` : ""}

    <div class="sep"></div>

    <table>
      <tr><td class="label">FICHA:</td><td class="v right">${ficha}</td></tr>
      <tr><td class="label">PROFISSIONAL:</td><td class="v right">${esc(medicoNome)}</td></tr>
      <tr><td class="label">HORÁRIO:</td><td class="v right">${fmtData(a.inicio)}</td></tr>
      ${usuarioNome ? `<tr><td class="label">USUÁRIO:</td><td class="v right">${esc(usuarioNome)}</td></tr>` : ""}
    </table>

    <div class="sep"></div>

    <table>
      <tr class="bold">
        <td style="width:14mm">QTD</td>
        <td>PROCEDIMENTO</td>
      </tr>
      <tr>
        <td>1</td>
        <td>${esc(procNome)}</td>
      </tr>
    </table>

    ${valor > 0 ? `
    <div class="row" style="margin-top:8px">
      <div class="bold">VALOR RECEBIDO<br/><span class="sm">(${esc(formaLbl)})</span></div>
      <div class="bold lg">${fmtBRL(valor)}</div>
    </div>

    ${pagamento?.forma_pagamento === "cartao_credito" ? `
    <table>
      ${bandeiraTxt ? `<tr><td class="label">BANDEIRA:</td><td class="v right">${esc(bandeiraTxt)}</td></tr>` : ""}
      <tr><td class="label">PARCELAMENTO:</td><td class="v right">${parcelasTxt}</td></tr>
    </table>
    ` : ""}

    <div class="sep"></div>
    <table>
      <tr><td class="label">CLINICA:</td><td class="v right">${fmtBRL(clinica)}</td></tr>
      <tr><td class="label">PRESTADOR:</td><td class="v right">${fmtBRL(prestador)}</td></tr>
    </table>
    ` : ""}

    <div class="sep"></div>
    <div class="row sm">
      <div>DATA IMPRESSAO</div>
      <div>${fmtData(new Date().toISOString())}</div>
    </div>
  </div>
  <script>
    window.addEventListener("load", function () {
      setTimeout(function () { window.print(); }, 150);
    });
  </script>
</body></html>`;

  const w = window.open("", "_blank", "width=420,height=720");
  if (!w) {
    throw new Error("O navegador bloqueou a janela de impressão. Permita pop-ups e tente novamente.");
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}