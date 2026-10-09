import { supabase } from "@/integrations/supabase/client";
import { prontuarioExibicao } from "@/lib/prontuario";
import { printHtmlViaIframe } from "@/lib/print-html";

/**
 * Gera um carnê interno em HTML a partir das parcelas de um contrato
 * de convênio. Abre uma nova aba com window.print() para salvar como PDF
 * ou imprimir direto.
 *
 * Layout: bobina térmica 80mm (mesma impressora da GR). Cada parcela sai com
 * a via do cliente e, logo abaixo, a via da clínica, separadas por linha
 * picotada para recorte. Antes era A4 com as vias lado a lado e altura fixa
 * de 1/3 de folha — na impressora de bobina saía enorme e comprido.
 */

/**
 * Sobrescreve o layout A4 dos dois modelos de carnê para a bobina de 80mm:
 * vias uma embaixo da outra, sem altura fixa, letra de 10px e linhas juntas.
 * Vai no fim do <style> para ganhar das regras anteriores.
 */
const CSS_BOBINA_80MM = `
  html, body { background: #fff; color: #000; }
  body {
    width: 76mm; max-width: 100%; padding: 3mm 2mm;
    font-size: 10px; line-height: 1.15;
    word-break: break-word; overflow-wrap: anywhere;
  }
  .lab, .capa-grid .lab, .ficha-grid .lab, .ficha-parcela .lab, .campo-manual .lab { font-size: 8px; color: #000; }
  .capa {
    height: auto; border: none; border-radius: 0; border-bottom: 1px dashed #000;
    padding: 0 0 4px; margin: 0; gap: 3px;
  }
  .capa h1 { font-size: 12px; margin: 0; }
  .capa-clinica { font-size: 11px; margin-bottom: 2px; }
  .capa-clinica .cnpj { font-size: 9px; color: #000; }
  .capa-grid { grid-template-columns: 1fr 1fr; gap: 3px 8px; font-size: 10px; }
  .capa-grid .cell { gap: 0; }
  .capa-topo { gap: 6px; padding-bottom: 3px; }
  .capa-marca { font-size: 15px; }
  .capa-nome { font-size: 11px; margin-top: 1px; }
  .capa-end, .capa-whats { font-size: 9px; margin-top: 1px; color: #000; }
  .capa-codigo { min-width: 0; flex-shrink: 0; padding: 2px 5px; border-width: 1px; }
  .capa-topo > div:first-child { min-width: 0; }
  .capa-codigo .lab { font-size: 8px; }
  .capa-codigo .val { font-size: 13px; white-space: nowrap; word-break: normal; overflow-wrap: normal; }
  .capa-titulo { font-size: 10px; }
  .capa-rodape { font-size: 9px; padding: 3px; margin-top: 2px; }

  .ficha-par { display: block; margin: 0; }
  .ficha-via { gap: 0; }
  .ficha, .ficha-via:first-child .ficha, .ficha-via:last-child .ficha {
    height: auto; border: none; border-radius: 0; border-bottom: 1px dashed #000;
    padding: 4px 0; gap: 3px;
  }
  .via-label { font-size: 8px; margin: 0; }
  .ficha-header { flex-wrap: wrap; gap: 3px 6px; padding-bottom: 3px; border-bottom-color: #000; }
  .ficha-marca { font-size: 11px; }
  .ficha-clinica { font-size: 10px; }
  .ficha-doc { font-size: 8px; color: #000; }
  .ficha-parcelas { gap: 6px; }
  .ficha-parcela .val { font-size: 11px; }
  .ficha-grid { gap: 2px 8px; font-size: 10px; }
  .ficha-grid > div { gap: 0; }
  .ficha-grid .val.destaque { font-size: 12px; }
  .ficha-grid .val.obs { font-size: 8px; }
  .ficha-rodape { margin-top: 4px; gap: 8px; }
  .ficha-rodape .campo-manual .lab { min-height: 0; }
  .campo-manual .linha-assin { height: 14px; }
  .campo-manual .val.pago { font-size: 10px; }
`;

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
      "id, numero, paciente_nome, paciente_id, convenio_id, valor_mensal, data_inicio, dia_vencimento, clinica_id, observacoes",
    )
    .eq("id", contratoId)
    .single();
  if (error || !contrato) throw new Error(error?.message ?? "Contrato não encontrado");

  const [
    { data: parcelas },
    { data: paciente },
    { data: clinica },
    { data: convenio },
    { data: dependentesRows },
  ] = await Promise.all([
    supabase
      .from("contrato_mensalidades")
      .select("id, numero_parcela, vencimento, valor, status, pago_em, forma_pagamento")
      .eq("contrato_id", contratoId)
      // A cobrança do Crédito na clínica é separada e muda a cada uso: não
      // entra no carnê impresso.
      .is("origem" as never, null)
      .order("numero_parcela"),
    supabase
      .from("pacientes")
      .select("nome, cpf, telefone, codigo_prontuario, codigo_prontuario_anterior, numero_pasta")
      .eq("id", contrato.paciente_id as string)
      .maybeSingle(),
    supabase
      .from("clinicas")
      .select("nome, cnpj, telefone, endereco, cidade, estado, branding")
      .eq("id", contrato.clinica_id as string)
      .maybeSingle(),
    contrato.convenio_id
      ? supabase
          .from("cb_convenios")
          .select("nome")
          .eq("id", contrato.convenio_id as string)
          .maybeSingle()
      : Promise.resolve({ data: null as { nome: string | null } | null }),
    supabase
      .from("contrato_dependentes")
      .select("paciente_id, paciente_nome")
      .eq("contrato_id", contratoId)
      .eq("ativo", true),
  ]);

  const convenioNome = convenio?.nome ?? "—";
  const depPacienteIds = (dependentesRows ?? [])
    .map((d: any) => d.paciente_id as string | null)
    .filter((id): id is string => !!id);
  const { data: depPacientes } = depPacienteIds.length
    ? await supabase.from("pacientes").select("id, cpf").in("id", depPacienteIds)
    : { data: [] as { id: string; cpf: string | null }[] };
  const cpfMap = new Map((depPacientes ?? []).map((p: any) => [p.id, p.cpf as string | null]));
  const dependentes = (dependentesRows ?? []).map((d: any) => ({
    nome: d.paciente_nome as string,
    cpf: d.paciente_id ? (cpfMap.get(d.paciente_id) ?? null) : null,
  }));
  const pessoasConvenio = 1 + dependentes.length;

  const titularNomes =
    `<span class="val">${esc(contrato.paciente_nome)}</span>` +
    (dependentes.length
      ? `<span class="lab" style="margin-top:6px;">Dependentes</span>` +
        dependentes.map((d) => `<span class="val">${esc(d.nome)}</span>`).join("")
      : "");
  const titularCpfs =
    `<span class="val">${esc(paciente?.cpf ?? "—")}</span>` +
    (dependentes.length
      ? `<span class="lab" style="margin-top:6px;">&nbsp;</span>` +
        dependentes.map((d) => `<span class="val">${esc(d.cpf ?? "—")}</span>`).join("")
      : "");

  if (layoutCarne(clinica?.nome) === "a4") {
    // A4 via iframe oculto (sem pop-up), esperando o logo carregar.
    printHtmlViaIframe(
      htmlCarneSaoFrancisco({
        contrato,
        parcelas: parcelas ?? [],
        clinica,
        cpf: paciente?.cpf ?? null,
        prontuario: prontuarioExibicao(paciente) ?? "—",
        convenioNome,
        dependentes,
      }),
      { esperarImagens: true },
    );
    return;
  }

  const parcelasAbertas = (parcelas ?? []).filter((p) => p.status !== "pago");
  if (parcelasAbertas.length === 0) {
    throw new Error("Nenhuma mensalidade em aberto para gerar carnê.");
  }
  const fichas = parcelasAbertas.map((p) => {
    const isAdesao = Number(p.numero_parcela) === 0;
    const total = (parcelas ?? []).filter((parcela) => Number(parcela.numero_parcela) !== 0).length;
    const parcelaLabel = isAdesao ? "Adesao" : `${p.numero_parcela}/${total}`;
    const docLabel = isAdesao ? "TAXA DE ADESAO" : "CARNE DE PAGAMENTO";
    const buildFicha = (viaLabel: string) => `
      <div class="ficha">
        <div class="via-label">${viaLabel}</div>
        <div class="ficha-header">
          <div class="ficha-titulo">
            <div class="ficha-clinica">${esc(clinica?.nome ?? "Clínica")}</div>
            <div class="ficha-doc">${docLabel} - Contrato #${esc(contrato.numero)}</div>
          </div>
          <div style="display:flex;gap:18px;align-items:flex-start;">
            <div class="ficha-parcela">
              <div class="lab">Parcela</div>
              <div class="val">${parcelaLabel}</div>
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
            <span class="lab" style="margin-top:3px;">Pessoas no convênio</span><span class="val">${pessoasConvenio}</span>
          </div>
          <div>
            <span class="lab">Observação</span>
            <span class="val" style="font-weight:500;font-size:8px;">Após o vencimento será cobrado 10% de multa e juros de 0,33% ao dia.</span>
          </div>
          <div></div>
          <div>
            <span class="lab">Valor</span><span class="val destaque">${BRL(Number(p.valor))}</span>
          </div>
        </div>
        <div class="ficha-rodape">
          <div class="campo-manual">
            ${
              p.status === "pago"
                ? `<span class="val" style="font-weight:600;font-size:11px;">${fmtD(p.pago_em)}</span>`
                : `<span class="linha-assin"></span>`
            }
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
  @page { size: 80mm auto; margin: 0; }
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
  ${CSS_BOBINA_80MM}
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
        const f = (d: Date) =>
          `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
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

  abrirJanelaCarne(html);
}

function abrirJanelaCarne(html: string) {
  const w = window.open("", "_blank", "width=900,height=1000");
  if (!w) throw new Error("Bloqueio de pop-up impediu a abertura do carnê.");
  w.document.open();
  w.document.write(html);
  w.document.close();
}

/**
 * Layout próprio da Policlínica São Francisco de Paula (marca Policardmed),
 * reproduzindo a capa gráfica física da unidade. A Menino Jesus continua no
 * layout acima.
 */
const normalizar = (s: string | null | undefined) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();

export const isSaoFranciscoDePaula = (clinicaNome: string | null | undefined) =>
  normalizar(clinicaNome).includes("SAO FRANCISCO DE PAULA");

type ParcelaCarne = {
  numero_parcela: number;
  vencimento: string;
  valor: number;
  status: string;
  pago_em: string | null;
};

/**
 * Parcelas impressas no carnê da São Francisco: todas as mensalidades
 * contratadas a partir da 1/N, inclusive as já pagas (a 1ª costuma ser paga
 * na emissão e não pode sumir do carnê). Canceladas ficam fora. Adesão (0) e
 * taxa de inclusão de dependente (< 0) só entram enquanto estão em aberto.
 * N é o maior número de parcela, para que 12/12 continue 12/12 mesmo quando
 * uma parcela do meio foi cancelada.
 */
export function parcelasCarneSaoFrancisco(parcelas: ParcelaCarne[]) {
  const validas = parcelas.filter((p) => p.status !== "cancelado");
  const mensalidades = validas
    .filter((p) => Number(p.numero_parcela) >= 1)
    .sort((a, b) => Number(a.numero_parcela) - Number(b.numero_parcela));
  const total = mensalidades.reduce((mx, p) => Math.max(mx, Number(p.numero_parcela)), 0);
  const taxasAbertas = validas
    .filter((p) => Number(p.numero_parcela) < 1 && p.status !== "pago")
    .sort((a, b) => Number(b.numero_parcela) - Number(a.numero_parcela));
  return [
    ...taxasAbertas.map((p) => ({
      ...p,
      rotulo: Number(p.numero_parcela) === 0 ? "Adesão" : "Inclusão",
      doc: Number(p.numero_parcela) === 0 ? "TAXA DE ADESÃO" : "TAXA DE INCLUSÃO",
    })),
    ...mensalidades.map((p) => ({
      ...p,
      rotulo: `${p.numero_parcela}/${total}`,
      doc: "CARNÊ DE PAGAMENTO",
    })),
  ];
}

/**
 * Reserva da São Francisco de Paula: só entra quando o campo correspondente
 * do cadastro (`clinicas`) estiver vazio. A marca não tem campo no cadastro.
 */
const SFP = {
  marca: "POLICARDMED",
  nome: "Policlínica São Francisco de Paula",
  endereco: "Av. Comendador Telles 2414, Vilar dos Teles, São João de Meriti RJ",
  whatsapp: "(21) 96736-5396",
  cnpj: "",
  rodape: "O PAGAMENTO DO CARNÊ SÓ PODE SER EFETUADO NA NOSSA UNIDADE",
};

/** Logo de reserva do Cartão Benefícios, usado quando a clínica não tem `branding.logo_url`. */
const LOGO_RESERVA_SFP = "/cartao-beneficios/logo-policardmed.png";

/**
 * Taxa da 2ª via do carnê. Espelha `VALOR_TAXA_SEGUNDA_VIA` de
 * `contratos-page.tsx`, que não é exportada (vive dentro da tela) — mudar lá
 * exige mudar aqui.
 */
const VALOR_TAXA_SEGUNDA_VIA = 10;

export type ClinicaCarne = {
  nome?: string | null;
  cnpj?: string | null;
  telefone?: string | null;
  endereco?: string | null;
  cidade?: string | null;
  estado?: string | null;
  branding?: unknown;
};

/** Qual papel o carnê usa: A4 só na São Francisco; o resto segue na bobina de 80mm. */
export const layoutCarne = (clinicaNome: string | null | undefined) =>
  isSaoFranciscoDePaula(clinicaNome) ? ("a4" as const) : ("bobina-80mm" as const);

const preenchido = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Dados da clínica no carnê da SFP: cadastro primeiro, constante `SFP` em cada campo vazio. */
export function dadosClinicaSfp(c: ClinicaCarne | null | undefined) {
  const branding = (c?.branding ?? null) as Record<string, unknown> | null;
  const endBase = preenchido(c?.endereco);
  const local = [preenchido(c?.cidade), preenchido(c?.estado)].filter(Boolean).join(" ");
  const endereco = endBase ? [endBase, local].filter(Boolean).join(", ") : SFP.endereco;
  return {
    marca: SFP.marca,
    nome: preenchido(c?.nome) || SFP.nome,
    endereco,
    whatsapp: preenchido(c?.telefone) || SFP.whatsapp,
    cnpj: preenchido(c?.cnpj) || SFP.cnpj,
    logo: (branding && preenchido(branding.logo_url)) || LOGO_RESERVA_SFP,
  };
}

/** Agrupa as fichas em folhas A4 de até 3. */
export function folhasDeFichas<T>(itens: T[], porFolha = 3): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < itens.length; i += porFolha) out.push(itens.slice(i, i + porFolha));
  return out;
}

/** Slot do logo: se a imagem falhar, some e o slot fica vazio no mesmo tamanho. */
const logoSlot = (cls: string, src: string) =>
  `<div class="${cls}"><img src="${esc(src)}" alt="" onerror="this.remove()" /></div>`;

const CSS_CARNE_SFP_A4 = `
  @page { size: A4 portrait; margin: 8mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #000; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 9pt; line-height: 1.2; }
  .lab { display: block; font-size: 7.5pt; color: #555; text-transform: uppercase; letter-spacing: .04em; }
  .val { display: block; font-size: 11pt; font-weight: 700; }
  .verde { color: #1f8a3b; }
  .logo-capa, .logo-ficha { flex-shrink: 0; display: flex; align-items: center; justify-content: center; overflow: hidden; }
  .logo-capa { width: 34mm; height: 22mm; }
  .logo-ficha { width: 22mm; height: 13mm; }
  .logo-capa img, .logo-ficha img { max-width: 100%; max-height: 100%; object-fit: contain; }

  /* Capa */
  .folha-capa { height: 281mm; display: flex; flex-direction: column; gap: 5mm; break-after: page; }
  .capa-topo { display: flex; align-items: center; gap: 5mm; border-bottom: 3px solid #1f8a3b; padding-bottom: 3mm; }
  .capa-ident { flex: 1; min-width: 0; }
  .capa-marca { font-size: 23pt; font-weight: 900; letter-spacing: .05em; color: #1f8a3b; line-height: 1; }
  .capa-nome { font-size: 12pt; font-weight: 700; margin-top: 1.5mm; }
  .capa-info { font-size: 8.5pt; color: #555; margin-top: .8mm; }
  .capa-codigo { border: 2px solid #000; border-radius: 2mm; padding: 2mm 4mm; text-align: center; min-width: 40mm; }
  .capa-codigo .val { font-size: 19pt; font-weight: 900; }
  .capa-titulo { font-size: 14pt; font-weight: 800; }
  .capa-campos { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm 8mm; }
  .capa-campos .campo { border-bottom: 1px solid #000; padding-bottom: 1mm; }
  .capa-campos .inteira { grid-column: span 2; }
  .capa-resumo { display: grid; grid-template-columns: repeat(4, 1fr); border: 1.5px solid #000; border-radius: 2mm; }
  .capa-resumo > div { padding: 3mm; border-right: 1px solid #000; }
  .capa-resumo > div:last-child { border-right: none; }
  .capa-resumo .destaque { font-size: 17pt; font-weight: 900; color: #1f8a3b; }
  .como-pagar { border-left: 4px solid #c8922a; padding: 2mm 0 2mm 4mm; }
  .como-pagar h2 { font-size: 11pt; margin: 0 0 2mm; }
  .como-pagar ul { margin: 0; padding-left: 5mm; font-size: 10pt; }
  .como-pagar li { margin-bottom: 1.2mm; }
  .capa-rodape {
    margin-top: auto; background: #000; color: #fff; text-align: center; font-weight: 800;
    font-size: 11pt; letter-spacing: .04em; padding: 3mm; border-radius: 1.5mm;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }

  /* Folhas de fichas: 3 por folha, picote horizontal entre elas */
  .folha-fichas { break-after: page; }
  .folha-fichas:last-child { break-after: auto; }
  .ficha {
    height: 92mm; break-inside: avoid; page-break-inside: avoid;
    display: grid; grid-template-columns: 56mm 1fr;
    border-bottom: 1px dashed #000;
  }
  .ficha:last-child { border-bottom: none; }

  /* Canhoto — via da clínica */
  .canhoto { border-right: 1px dashed #000; padding: 3mm 3mm 3mm 0; display: flex; flex-direction: column; gap: 1mm; }
  .canhoto .via { font-size: 7pt; letter-spacing: .15em; font-weight: 700; }
  .canhoto .marca { font-size: 11pt; font-weight: 900; color: #1f8a3b; letter-spacing: .04em; }
  .linha { display: flex; justify-content: space-between; gap: 2mm; border-bottom: 1px dotted #777; padding: .6mm 0; font-size: 8pt; }
  .linha .l { color: #555; text-transform: uppercase; font-size: 7pt; }
  .linha .v { font-weight: 700; text-align: right; overflow-wrap: anywhere; }
  .canhoto .valor { border: 1.2px solid #000; border-radius: 1.5mm; padding: 1.5mm; text-align: center; margin-top: 1mm; }
  .canhoto .valor .v { font-size: 14pt; font-weight: 900; }
  .canhoto .pgto { margin-top: auto; border-top: 1px solid #000; padding-top: 1mm; font-size: 7.5pt; text-align: center; }

  /* Via do cliente */
  .cliente { padding: 3mm 0 3mm 4mm; display: flex; flex-direction: column; gap: 2mm; min-width: 0; }
  .cli-topo { display: flex; align-items: center; gap: 3mm; border-bottom: 2px solid #1f8a3b; padding-bottom: 1.5mm; }
  .cli-ident { flex: 1; min-width: 0; }
  .cli-ident .marca { font-size: 11pt; font-weight: 900; color: #1f8a3b; letter-spacing: .04em; }
  .cli-ident .nome { font-size: 9pt; font-weight: 700; }
  .cli-ident .end { font-size: 7pt; color: #555; }
  .cli-parcela { text-align: right; }
  .cli-parcela .doc { font-size: 7.5pt; text-transform: uppercase; letter-spacing: .06em; font-weight: 700; }
  .cli-parcela .n { font-size: 16pt; font-weight: 900; }
  .cli-corpo { flex: 1; display: grid; grid-template-columns: 1fr 32mm; gap: 4mm; min-height: 0; }
  .cli-dados { display: flex; flex-direction: column; }
  .cli-dados .aviso { font-size: 7pt; margin-top: 1.5mm; color: #333; }
  .cli-lado { display: flex; flex-direction: column; gap: 2mm; }
  .cli-valor { border: 2px solid #000; border-radius: 1.5mm; padding: 1.5mm; text-align: center; }
  .cli-valor .v { font-size: 18pt; font-weight: 900; }
  .pix { flex: 1; border: 1.2px dashed #000; border-radius: 1.5mm; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 2mm; }
  .pix .t { font-size: 12pt; font-weight: 900; letter-spacing: .15em; }
  .pix .s { font-size: 6.5pt; color: #555; margin-top: 1mm; }
  .cli-assin { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; }
  .cli-assin > div { border-top: 1px solid #000; padding-top: 1mm; font-size: 7.5pt; text-align: center; }
`;

type ItemCarne = ReturnType<typeof parcelasCarneSaoFrancisco>[number];
type DadosClinicaSfp = ReturnType<typeof dadosClinicaSfp>;

/** Monta uma ficha: canhoto de 56mm (via da clínica) + via do cliente. */
function fichaSfp(
  p: ItemCarne,
  ctx: { clinica: DadosClinicaSfp; contratoNumero: unknown; titular: string | null; prontuario: string },
): string {
  const { clinica, contratoNumero, titular, prontuario } = ctx;
  const pago = p.status === "pago";
  const linha = (l: string, v: string) => `<div class="linha"><span class="l">${l}</span><span class="v">${v}</span></div>`;
  return `
    <div class="ficha">
      <div class="canhoto">
        <div class="via">VIA DA CLÍNICA</div>
        <div class="marca">${esc(clinica.marca)}</div>
        ${linha("Contrato", `nº ${esc(contratoNumero)}`)}
        ${linha("Prontuário", esc(prontuario))}
        ${linha("Parcela", esc(p.rotulo))}
        ${linha("Mês ref.", fmtMesAno(p.vencimento))}
        ${linha("Vencimento", fmtD(p.vencimento))}
        <div class="valor"><span class="lab">Valor</span><span class="v">${BRL(Number(p.valor))}</span></div>
        <div class="pgto">${pago ? `Pago em ${fmtD(p.pago_em)}` : "Data do pagamento / carimbo"}</div>
      </div>
      <div class="cliente">
        <div class="cli-topo">
          ${logoSlot("logo-ficha", clinica.logo)}
          <div class="cli-ident">
            <div class="marca">${esc(clinica.marca)}</div>
            <div class="nome">${esc(clinica.nome)}</div>
            <div class="end">${esc(clinica.endereco)}</div>
          </div>
          <div class="cli-parcela"><div class="doc">${esc(p.doc)}</div><div class="n">${esc(p.rotulo)}</div></div>
        </div>
        <div class="cli-corpo">
          <div class="cli-dados">
            ${linha("Titular", esc(titular))}
            ${linha("Contrato", `nº ${esc(contratoNumero)}`)}
            ${linha("Prontuário", esc(prontuario))}
            ${linha("Mês ref.", fmtMesAno(p.vencimento))}
            ${linha("Vencimento", fmtD(p.vencimento))}
            <div class="aviso">Após o vencimento será cobrado 10% de multa e juros de 0,33% ao dia. ${esc(SFP.rodape.charAt(0) + SFP.rodape.slice(1).toLowerCase())}.</div>
          </div>
          <div class="cli-lado">
            <div class="cli-valor"><span class="lab">Valor</span><span class="v">${BRL(Number(p.valor))}</span></div>
            <!--
              Espaço reservado do Pix. NÃO há QR Code aqui de propósito: não
              chamamos montarPayloadPix nem a lib qrcode. Ligar só depois que a
              chave Pix da clínica estiver cadastrada (clinicas.pix_chave).
            -->
            <div class="pix"><div class="t">PIX</div><div class="s">Espaço reservado para o QR Code de pagamento</div></div>
          </div>
        </div>
        <div class="cli-assin">
          <div>${pago ? `Pago em ${fmtD(p.pago_em)}` : "Data do pagamento"}</div>
          <div>Assinatura / carimbo do recebedor</div>
        </div>
      </div>
    </div>`;
}

function htmlCarneSaoFrancisco(args: {
  contrato: {
    numero: unknown;
    paciente_nome: string | null;
    valor_mensal: unknown;
    data_inicio: string | null;
    dia_vencimento: unknown;
  };
  parcelas: ParcelaCarne[];
  clinica: ClinicaCarne | null;
  cpf: string | null;
  prontuario: string;
  convenioNome: string;
  dependentes: { nome: string; cpf: string | null }[];
}): string {
  const { contrato, cpf, prontuario, convenioNome, dependentes } = args;
  const itens = parcelasCarneSaoFrancisco(args.parcelas);
  if (itens.length === 0) {
    throw new Error("Contrato sem parcelas para gerar carnê.");
  }
  const clinica = dadosClinicaSfp(args.clinica);
  const totalMensalidades = itens.reduce((mx, p) => Math.max(mx, Number(p.numero_parcela)), 0);
  const pessoasConvenio = 1 + dependentes.length;
  const mens = itens.filter((p) => Number(p.numero_parcela) >= 1);

  const vigencia = (() => {
    const ini = contrato.data_inicio ?? mens[0]?.vencimento ?? null;
    const fim = mens[mens.length - 1]?.vencimento ?? null;
    return ini ? `${fmtD(ini)} a ${fmtD(fim)}` : "—";
  })();
  const depTexto = dependentes.length
    ? dependentes.map((d) => `${esc(d.nome)} — CPF ${esc(d.cpf ?? "—")}`).join("<br/>")
    : "Nenhum";
  const infoClinica = [
    clinica.endereco,
    clinica.whatsapp ? `WhatsApp: ${clinica.whatsapp}` : "",
    clinica.cnpj ? `CNPJ: ${clinica.cnpj}` : "",
  ].filter(Boolean);

  const ctx = { clinica, contratoNumero: contrato.numero, titular: contrato.paciente_nome, prontuario };
  const folhas = folhasDeFichas(itens).map(
    (grupo) => `<div class="folha-fichas">${grupo.map((p) => fichaSfp(p, ctx)).join("")}</div>`,
  );

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>Carnê — Contrato nº ${esc(contrato.numero)} — ${esc(contrato.paciente_nome)}</title>
<style>${CSS_CARNE_SFP_A4}</style>
</head>
<body>
  <div class="folha-capa">
    <div class="capa-topo">
      ${logoSlot("logo-capa", clinica.logo)}
      <div class="capa-ident">
        <div class="capa-marca">${esc(clinica.marca)}</div>
        <div class="capa-nome">${esc(clinica.nome)}</div>
        ${infoClinica.map((t) => `<div class="capa-info">${esc(t)}</div>`).join("")}
      </div>
      <div class="capa-codigo"><span class="lab">Código</span><span class="val">${esc(prontuario)}</span></div>
    </div>
    <div class="capa-titulo">Carnê de pagamento — Contrato nº ${esc(contrato.numero)}</div>
    <div class="capa-campos">
      <div class="campo inteira"><span class="lab">Titular</span><span class="val">${esc(contrato.paciente_nome)}</span></div>
      <div class="campo"><span class="lab">CPF</span><span class="val">${esc(cpf ?? "—")}</span></div>
      <div class="campo"><span class="lab">Convênio</span><span class="val">${esc(convenioNome)}</span></div>
      <div class="campo inteira"><span class="lab">Dependentes com CPF</span><span class="val">${depTexto}</span></div>
      <div class="campo"><span class="lab">Vigência</span><span class="val">${vigencia}</span></div>
      <div class="campo"><span class="lab">Pessoas no convênio</span><span class="val">${pessoasConvenio}</span></div>
    </div>
    <div class="capa-resumo">
      <div><span class="lab">Parcelas</span><span class="val">${totalMensalidades}</span></div>
      <div><span class="lab">Dia do vencimento</span><span class="val">${esc(contrato.dia_vencimento ?? "—")}</span></div>
      <div><span class="lab">Valor mensal</span><span class="destaque">${BRL(Number(contrato.valor_mensal))}</span></div>
      <div><span class="lab">1ª parcela</span><span class="val">${fmtD(mens[0]?.vencimento)}</span></div>
    </div>
    <div class="como-pagar">
      <h2>Como pagar</h2>
      <ul>
        <li>Apresente a ficha do mês no balcão da unidade e guarde a via carimbada.</li>
        <li>Após o vencimento, multa de 10% e juros de 0,33% ao dia.</li>
        <li>2ª via do carnê é emitida na recepção, com taxa de ${BRL(VALOR_TAXA_SEGUNDA_VIA)}.</li>
        <li>Dúvidas pelo WhatsApp da clínica: ${esc(clinica.whatsapp)}.</li>
      </ul>
    </div>
    <div class="capa-rodape">${esc(SFP.rodape)}</div>
  </div>
  ${folhas.join("\n")}
</body>
</html>`;
}
