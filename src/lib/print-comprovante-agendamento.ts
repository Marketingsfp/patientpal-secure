/**
 * Comprovante de Agendamento — impresso simples para entregar ao paciente
 * quando ele apenas agenda (não passou pelo caixa). Diferente da GR:
 *  - Não exige pagamento.
 *  - Não mostra valor, repasse nem número de ficha.
 *  - Não grava em `gr_impressoes` (não é guia oficial).
 *
 * Layout enxuto no mesmo estilo dos demais comprovantes (papel térmico 80mm),
 * usando iframe oculto para disparar `window.print()` sem bloqueio de pop-up.
 *
 * Desempenho: a versão original fazia até 4 rodadas de consulta ao banco, uma
 * dependendo da outra (agendamento → agenda do médico → paciente/médico →
 * especialidade). Quem imprime logo depois de salvar já tem quase tudo isso na
 * memória da tela, então existem dois atalhos:
 *  - `dadosLocais` evita reler o que a tela acabou de gravar;
 *  - `precarregarComprovanteAgendamento` dispara o que sobrou (cabeçalho da
 *    clínica e cadastro do paciente) em paralelo com o salvamento, para que os
 *    dados já estejam prontos quando o INSERT responder.
 * Sem esses atalhos o comportamento é exatamente o de antes.
 */
import { supabase } from "@/integrations/supabase/client";

const esc = (s: string | null | undefined) =>
  (s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);

function fmtDataHora(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtDataSimples(iso: string): string {
  if (!iso) return "";
  const d = iso.length <= 10 ? new Date(`${iso}T12:00:00`) : new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

interface LinhaAgendamento {
  id: string;
  paciente_nome: string;
  paciente_id: string | null;
  medico_id: string | null;
  agenda_id: string | null;
  inicio: string;
  procedimento: string | null;
  especialidade_id: string | null;
}

interface ClinicaCabecalho {
  nome: string | null;
  endereco: string | null;
  cidade: string | null;
  estado: string | null;
  telefone: string | null;
  cnpj: string | null;
}

interface PacienteImpresso {
  nome: string;
  cpf: string | null;
  telefone: string | null;
  data_nascimento: string | null;
  codigo_prontuario: string | null;
}

export interface DadosRemotosComprovante {
  clinica: ClinicaCabecalho | null;
  paciente: PacienteImpresso | null;
}

/**
 * O cabeçalho da clínica (nome, endereço, telefone, CNPJ) não muda durante o
 * expediente. Guardar em memória evita uma ida ao banco em toda impressão — a
 * recepção emite dezenas por dia, sempre da mesma clínica.
 */
const cacheClinica = new Map<string, ClinicaCabecalho | null>();

async function buscarClinica(clinicaId: string): Promise<ClinicaCabecalho | null> {
  const emCache = cacheClinica.get(clinicaId);
  if (emCache !== undefined) return emCache;
  const { data } = await supabase
    .from("clinicas")
    .select("nome, endereco, cidade, estado, telefone, cnpj")
    .eq("id", clinicaId)
    .maybeSingle();
  const clinica = (data as ClinicaCabecalho | null) ?? null;
  cacheClinica.set(clinicaId, clinica);
  return clinica;
}

async function buscarPaciente(pacienteId: string | null): Promise<PacienteImpresso | null> {
  if (!pacienteId) return null;
  const { data } = await supabase
    .from("pacientes")
    .select("nome, cpf, telefone, data_nascimento, codigo_prontuario")
    .eq("id", pacienteId)
    .maybeSingle();
  return (data as PacienteImpresso | null) ?? null;
}

/**
 * Dispara, em paralelo, as duas únicas informações que o comprovante não tem
 * como tirar do estado da tela: o cabeçalho da clínica e o cadastro do paciente
 * (prontuário, CPF, telefone, nascimento).
 *
 * Deve ser chamada ANTES do salvamento, para que as consultas corram junto com
 * o INSERT em vez de depois dele. Nunca rejeita: uma falha de rede aqui degrada
 * o comprovante do mesmo jeito que já degradava antes (campos em branco) e não
 * pode derrubar um agendamento que foi gravado com sucesso.
 */
export function precarregarComprovanteAgendamento(
  clinicaId: string,
  pacienteId: string | null,
): Promise<DadosRemotosComprovante> {
  return Promise.all([buscarClinica(clinicaId), buscarPaciente(pacienteId)])
    .then(([clinica, paciente]) => ({ clinica, paciente }))
    .catch((err) => {
      console.error("[comprovante] falha ao pré-carregar dados da impressão", err);
      return { clinica: null, paciente: null };
    });
}

/** O que a tela chamadora já sabe sobre o agendamento que acabou de gravar. */
export interface DadosLocaisComprovante {
  pacienteId: string | null;
  pacienteNome: string;
  inicio: string;
  procedimento: string | null;
  /** Nome do médico como está no cadastro (sem "Dr./Dra."). */
  medicoNome?: string | null;
  especialidadeNome?: string | null;
}

export interface PrintComprovanteAgendamentoInput {
  agendamentoId: string;
  clinicaId: string;
  usuarioNome?: string;
  /** Evita reler do banco o que a tela acabou de gravar. */
  dadosLocais?: DadosLocaisComprovante | null;
  /** Consultas já em andamento, vindas de `precarregarComprovanteAgendamento`. */
  precarregado?: Promise<DadosRemotosComprovante> | null;
}

export async function printComprovanteAgendamento({
  agendamentoId,
  clinicaId,
  usuarioNome,
  dadosLocais,
  precarregado,
}: PrintComprovanteAgendamentoInput): Promise<void> {
  // A linha do agendamento só é lida do banco quando falta alguma informação —
  // no caminho rápido (logo depois de salvar) ela nunca chega a ser buscada.
  let linha: LinhaAgendamento | null = null;
  const carregarLinha = async (): Promise<LinhaAgendamento> => {
    if (linha) return linha;
    const { data, error } = await supabase
      .from("agendamentos")
      .select(
        "id, paciente_nome, paciente_id, medico_id, agenda_id, inicio, procedimento, especialidade_id",
      )
      .eq("id", agendamentoId)
      .maybeSingle();
    if (error || !data) throw new Error(error?.message ?? "Agendamento não encontrado");
    linha = data as LinhaAgendamento;
    return linha;
  };

  const a = dadosLocais
    ? {
        paciente_nome: dadosLocais.pacienteNome,
        paciente_id: dadosLocais.pacienteId,
        inicio: dadosLocais.inicio,
        procedimento: dadosLocais.procedimento,
      }
    : await carregarLinha();

  const remotos = await (precarregado ??
    precarregarComprovanteAgendamento(clinicaId, a.paciente_id));
  const c = remotos.clinica;
  const paciente = remotos.paciente;

  // Médico e especialidade vêm da tela quando ela os conhece. Quando não vêm
  // (agendamento sem médico direto, preso a uma agenda), cai no caminho antigo:
  // resolve pela agenda e lê o cadastro, para não imprimir "—" no lugar do nome
  // do profissional.
  let medicoNome = dadosLocais?.medicoNome?.trim() || "";
  let espNome = (dadosLocais?.especialidadeNome ?? "").trim().toUpperCase();
  if (!medicoNome) {
    const linhaAg = await carregarLinha();
    let medicoIdEfetivo: string | null = linhaAg.medico_id ?? null;
    if (!medicoIdEfetivo && linhaAg.agenda_id) {
      const { data } = await supabase
        .from("medico_agendas")
        .select("medico_id")
        .eq("id", linhaAg.agenda_id)
        .maybeSingle();
      medicoIdEfetivo = (data as { medico_id: string | null } | null)?.medico_id ?? null;
    }
    if (medicoIdEfetivo) {
      const { data: med } = await supabase
        .from("medicos")
        .select("nome, especialidade:especialidades!medicos_especialidade_id_fkey(nome)")
        .eq("id", medicoIdEfetivo)
        .maybeSingle();
      const medicoBasic = med as { nome: string; especialidade: { nome: string } | null } | null;
      medicoNome = medicoBasic?.nome ?? "";
      if (!espNome) espNome = medicoBasic?.especialidade?.nome?.toUpperCase() ?? "";
    }
    // Se o agendamento tiver uma especialidade escolhida na hora de agendar,
    // ela prevalece sobre a especialidade principal do médico.
    if (linhaAg.especialidade_id) {
      const { data: esp } = await supabase
        .from("especialidades")
        .select("nome")
        .eq("id", linhaAg.especialidade_id)
        .maybeSingle();
      const nome = (esp as { nome: string } | null)?.nome;
      if (nome) espNome = nome.toUpperCase();
    }
  }
  if (!medicoNome) medicoNome = "—";

  const procNomeBase = (a.procedimento || "CONSULTA").toUpperCase();
  const procNome =
    espNome && !procNomeBase.includes(espNome) ? `${espNome} - ${procNomeBase}` : procNomeBase;

  const endereco = [
    c?.endereco,
    c?.cidade && c?.estado ? `${c.cidade} - ${c.estado}` : (c?.cidade ?? c?.estado),
  ]
    .filter(Boolean)
    .join("<br/>");

  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8" />
<title>Comprovante - ${esc(paciente?.nome ?? a.paciente_nome)}</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #000; }
  body {
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    font-size: 10.5pt; line-height: 1.35; font-weight: 500;
    word-break: break-word; overflow-wrap: anywhere;
    -webkit-font-smoothing: antialiased;
  }
  .ticket { width: 76mm; max-width: 100%; padding: 4mm 3mm 3mm; }
  .center { text-align: center; }
  .sm { font-size: 8.5pt; font-weight: 500; letter-spacing: 0.02em; }
  .lg {
    font-size: 13pt;
    font-weight: 800;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    padding: 2px 0;
  }
  .xl { font-size: 15pt; font-weight: 800; letter-spacing: 0.06em; }
  .sep { border-top: 1px solid #000; margin: 7px 0; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  td { padding: 2px 0; vertical-align: top; word-break: break-word; overflow-wrap: anywhere; }
  .label {
    color: #000;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-size: 8.5pt;
  }
  .clinica-nome {
    font-size: 13pt;
    font-weight: 800;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    text-align: center;
    padding: 2px 0 4px;
  }
  ul.orient { margin: 4px 0 0 0; padding-left: 14px; }
  ul.orient li { margin-bottom: 3px; }
</style></head>
<body>
  <div class="ticket">
    <div class="clinica-nome">${esc(c?.nome ?? "")}</div>
    ${endereco ? `<div class="center sm">${endereco}</div>` : ""}
    ${c?.telefone ? `<div class="center sm">FONE ${esc(c.telefone)}</div>` : ""}
    ${c?.cnpj ? `<div class="center sm">CNPJ ${esc(c.cnpj)}</div>` : ""}

    <div class="sep"></div>
    <div class="center lg">COMPROVANTE DE AGENDAMENTO</div>
    <div class="sep"></div>

    <div class="center" style="font-size:12pt; font-weight:700">${esc(paciente?.nome ?? a.paciente_nome)}</div>
    ${paciente?.codigo_prontuario ? `<div class="center sm">PRONTUÁRIO: ${esc(paciente.codigo_prontuario)}</div>` : ""}
    ${paciente?.cpf ? `<div class="center sm">CPF: ${esc(paciente.cpf)}</div>` : ""}
    ${paciente?.telefone ? `<div class="center sm">FONE: ${esc(paciente.telefone)}</div>` : ""}
    ${paciente?.data_nascimento ? `<div class="center sm">NASC: ${fmtDataSimples(paciente.data_nascimento)}</div>` : ""}

    <div class="sep"></div>

    <div class="center label sm">DATA E HORÁRIO</div>
    <div class="center xl">${fmtDataHora(a.inicio)}</div>

    <div class="sep"></div>

    <table>
      <tr><td class="label">PROFISSIONAL:</td></tr>
      <tr><td>${esc(medicoNome)}</td></tr>
      ${espNome ? `<tr><td class="label">ESPECIALIDADE:</td></tr><tr><td>${esc(espNome)}</td></tr>` : ""}
      <tr><td class="label">SERVIÇO:</td></tr>
      <tr><td>${esc(procNome)}</td></tr>
    </table>

    <div class="sep"></div>

    <div class="label sm">ORIENTAÇÕES</div>
    <ul class="orient sm">
      <li>Chegar com 15 minutos de antecedência.</li>
      <li>Trazer documento com foto e, se aplicável, cartão do convênio.</li>
      <li>Em caso de imprevisto, avisar a clínica com antecedência.</li>
      <li>Este comprovante NÃO substitui a Guia de Recepção (GR), emitida no caixa.</li>
    </ul>

    <div class="sep"></div>
    <div class="sm center">
      Emitido em ${fmtDataHora(new Date().toISOString())}
      ${usuarioNome ? `<br/>por ${esc(usuarioNome)}` : ""}
    </div>
  </div>
</body></html>`;

  imprimirViaIframe(html);
}

function imprimirViaIframe(html: string): void {
  if (typeof document === "undefined") return;
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.opacity = "0";
  document.body.appendChild(iframe);
  const cw = iframe.contentWindow;
  if (!cw) {
    try {
      document.body.removeChild(iframe);
    } catch {
      /* noop */
    }
    throw new Error("Não foi possível inicializar a impressão.");
  }
  const doc = cw.document;
  doc.open();
  doc.write(html);
  doc.close();
  const cleanup = () => {
    try {
      document.body.removeChild(iframe);
    } catch {
      /* noop */
    }
  };
  let jaImprimiu = false;
  const dispararPrint = () => {
    if (jaImprimiu) return;
    jaImprimiu = true;
    try {
      cw.focus();
      cw.print();
    } catch {
      /* noop */
    }
    setTimeout(cleanup, 4000);
  };
  iframe.onload = () => setTimeout(dispararPrint, 80);
  setTimeout(() => {
    if (iframe.isConnected) dispararPrint();
  }, 600);
}
