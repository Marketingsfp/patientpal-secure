import { supabase } from "@/integrations/supabase/client";

const esc = (s: string | null | undefined) =>
  (s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);

const fmtData = (iso?: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};

const fmtCPF = (s?: string | null) => {
  if (!s) return "";
  const d = s.replace(/\D/g, "");
  if (d.length !== 11) return s;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
};

function addMeses(iso: string, n: number): string {
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 10);
}

type CardItem = {
  nome: string;
  cpf: string;
  tipo: "TITULAR" | "DEPENDENTE" | "AGREGADO";
  numero: string;
  plano: string;
  validade: string;
  clinica: string;
  cidadeUf: string;
  telefone: string;
};

function corPlano(tipo: string): { bg: string; accent: string } {
  if (tipo === "cartao_consulta") return { bg: "linear-gradient(135deg,#0f766e,#0d9488)", accent: "#5eead4" };
  if (tipo === "cartao_desconto") return { bg: "linear-gradient(135deg,#1e3a8a,#3b82f6)", accent: "#93c5fd" };
  return { bg: "linear-gradient(135deg,#334155,#475569)", accent: "#cbd5e1" };
}

function renderCard(item: CardItem, planoTipo: string): string {
  const c = corPlano(planoTipo);
  return `
    <div class="card" style="background:${c.bg}">
      <div class="row">
        <div class="brand">
          <div class="chip"></div>
          <div class="brandText">${esc(item.clinica)}</div>
        </div>
        <div class="tipo" style="color:${c.accent}">${esc(item.tipo)}</div>
      </div>
      <div class="plano">${esc(item.plano)}</div>
      <div class="nome">${esc(item.nome.toUpperCase())}</div>
      <div class="meta">
        <div><span>CPF</span>${esc(fmtCPF(item.cpf))}</div>
        <div><span>Nº</span>${esc(item.numero)}</div>
        <div><span>Validade</span>${esc(item.validade)}</div>
      </div>
      <div class="footer">${esc(item.cidadeUf)} • ${esc(item.telefone)}</div>
    </div>`;
}

export async function printCartoes(contratoId: string) {
  const { data: c, error } = await supabase
    .from("contratos_assinatura")
    .select("*")
    .eq("id", contratoId)
    .maybeSingle();
  if (error || !c) throw new Error(error?.message ?? "Contrato não encontrado");

  const [{ data: pl }, { data: cl }, { data: pa }] = await Promise.all([
    c.plano_id
      ? supabase.from("planos_assinatura").select("nome, tipo, vigencia_meses").eq("id", c.plano_id).maybeSingle()
      : Promise.resolve({ data: null as any }),
    c.clinica_id
      ? supabase.from("clinicas").select("nome, cidade, estado, telefone").eq("id", c.clinica_id).maybeSingle()
      : Promise.resolve({ data: null as any }),
    c.paciente_id
      ? supabase.from("pacientes").select("cpf").eq("id", c.paciente_id).maybeSingle()
      : Promise.resolve({ data: null as any }),
  ]);

  const { data: deps } = await supabase
    .from("contrato_dependentes")
    .select("paciente_id, paciente_nome, tipo")
    .eq("contrato_id", contratoId)
    .eq("ativo", true);

  const _cl: any = cl ?? {};
  const _pl: any = pl ?? {};
  const _pa: any = pa ?? {};

  const vigencia = Number(_pl.vigencia_meses ?? 12);
  const validade = fmtData(addMeses(c.data_inicio, vigencia));
  const numero = String(c.numero).padStart(6, "0");

  // Buscar CPF dos dependentes
  const depIds = (deps ?? []).map((d: any) => d.paciente_id);
  let depCpf = new Map<string, string>();
  if (depIds.length) {
    const { data: pacs } = await supabase.from("pacientes").select("id, cpf").in("id", depIds);
    (pacs ?? []).forEach((p: any) => depCpf.set(p.id, p.cpf ?? ""));
  }

  const cidadeUf = [_cl.cidade, _cl.estado].filter(Boolean).join("/");
  const clinicaNome = _cl.nome ?? "";
  const telefone = _cl.telefone ?? "";
  const planoNome = _pl.nome ?? "";

  const items: CardItem[] = [
    {
      nome: c.paciente_nome,
      cpf: _pa.cpf ?? "",
      tipo: "TITULAR",
      numero, plano: planoNome, validade, clinica: clinicaNome, cidadeUf, telefone,
    },
    ...((deps ?? []) as any[]).map((d) => ({
      nome: d.paciente_nome,
      cpf: depCpf.get(d.paciente_id) ?? "",
      tipo: (d.tipo === "agregado" ? "AGREGADO" : "DEPENDENTE") as "DEPENDENTE" | "AGREGADO",
      numero, plano: planoNome, validade, clinica: clinicaNome, cidadeUf, telefone,
    })),
  ];

  const html = `<!doctype html><html><head><meta charset="utf-8"/>
<title>Cartão #${numero}</title>
<style>
  @page { size: A4; margin: 10mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; }
  .sheet { display: grid; grid-template-columns: repeat(2, 85.6mm); gap: 4mm; }
  .card {
    width: 85.6mm; height: 53.98mm; border-radius: 3mm; color: #fff;
    padding: 4mm 5mm; position: relative; overflow: hidden;
    box-shadow: 0 0 0 0.2mm rgba(0,0,0,.15);
    display: flex; flex-direction: column; justify-content: space-between;
    page-break-inside: avoid;
  }
  .row { display: flex; justify-content: space-between; align-items: center; }
  .brand { display: flex; align-items: center; gap: 2mm; }
  .chip { width: 7mm; height: 5mm; background: linear-gradient(135deg,#fde68a,#d97706); border-radius: 1mm; border: .2mm solid rgba(0,0,0,.2); }
  .brandText { font-weight: 700; font-size: 9pt; letter-spacing: .3pt; text-transform: uppercase; }
  .tipo { font-weight: 800; font-size: 7pt; letter-spacing: 1pt; }
  .plano { font-size: 11pt; font-weight: 700; opacity: .95; margin-top: -1mm; }
  .nome { font-size: 12pt; font-weight: 800; letter-spacing: .5pt; }
  .meta { display: grid; grid-template-columns: 1.4fr 1fr 1fr; gap: 2mm; font-size: 7.5pt; }
  .meta div { display: flex; flex-direction: column; }
  .meta span { font-size: 5.5pt; opacity: .8; text-transform: uppercase; letter-spacing: .5pt; }
  .footer { font-size: 6.5pt; opacity: .85; text-align: right; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head>
<body>
  <div class="sheet">${items.map((i) => renderCard(i, _pl.tipo ?? "outro")).join("")}</div>
  <script>window.onload = () => { setTimeout(() => { window.print(); }, 200); };</script>
</body></html>`;

  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) {
    alert("Bloqueador de pop-ups impediu a impressão. Permita pop-ups para este site.");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}