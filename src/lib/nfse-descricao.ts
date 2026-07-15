/**
 * Monta a discriminação da NFS-e garantindo que TODA nota tenha uma descrição
 * completa (procedimento + paciente + data de referência). Sem isso a
 * prefeitura aceita, mas o consumidor final recebe uma NFS-e vaga como
 * "Serviços prestados".
 *
 * Chamado por todos os pontos de emissão (Agenda, Financeiro › Atendimentos,
 * Financeiro › Notas). Se o `dependenteAtendido` estiver preenchido no
 * tomador, o call site adiciona o sufixo "— Atendido: X" após montar a base.
 */
export interface DiscriminacaoInput {
  procedimento?: string | null;
  pacienteNome?: string | null;
  dataReferencia?: string | Date | null;
}

function formatarData(v: string | Date | null | undefined): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toLocaleDateString("pt-BR");
  // "YYYY-MM-DD" — sem hora, o parser assume UTC 00:00 e em BRT (UTC-3) volta
  // 1 dia. Ancoramos no meio-dia para evitar o deslocamento.
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(`${s}T12:00:00`).toLocaleDateString("pt-BR");
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("pt-BR");
}

export function montarDiscriminacaoNfse(input: DiscriminacaoInput): string {
  const partes: string[] = [];
  const proc = (input.procedimento ?? "").trim();
  partes.push(proc || "Serviços prestados");
  const pac = (input.pacienteNome ?? "").trim();
  if (pac) partes.push(`Paciente: ${pac}`);
  const data = formatarData(input.dataReferencia ?? null);
  if (data) partes.push(`Data: ${data}`);
  return partes.join(" — ");
}