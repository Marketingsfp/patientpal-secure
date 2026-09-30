/**
 * Monta a discriminação da NFS-e garantindo que TODA nota tenha uma descrição
 * completa (procedimento + paciente + data de referência). Sem isso a
 * prefeitura aceita, mas o consumidor final recebe uma NFS-e vaga como
 * "Serviços prestados".
 *
 * Chamado por todos os pontos de emissão (Agenda, Financeiro › Atendimentos,
 * Financeiro › Notas). Se o `dependenteAtendido` estiver preenchido no
 * tomador, o call site adiciona o sufixo "— Dependente do pagador: X" após montar a base.
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

const normEsp = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();

/**
 * Especialidade que vem no fim do nome do procedimento da agenda, ex.:
 * "CONSULTA 2 (NEUROLOGIA)" → "NEUROLOGIA". Só vale se o texto entre
 * parênteses for uma especialidade cadastrada — "(ADULTO)" ou "(2)" não são.
 */
export function especialidadeDoProcedimento(
  procedimento: string | null | undefined,
  especialidadesCadastradas: string[],
): string | null {
  const m = (procedimento ?? "").trim().match(/\(([^()]+)\)\s*$/);
  if (!m) return null;
  const alvo = normEsp(m[1]);
  return especialidadesCadastradas.some((e) => normEsp(e) === alvo) ? alvo : null;
}

/**
 * Formato do portal: "CONSULTA (PEDIATRIA)". Põe a especialidade entre
 * parênteses logo depois do primeiro trecho da descrição (antes do primeiro
 * " — " ou quebra de linha). Se a descrição já cita a especialidade, ou se ela
 * não é conhecida, devolve a descrição sem mudança.
 */
export function acrescentarEspecialidade(
  descricao: string,
  especialidade: string | null,
  procedimentos: (string | null | undefined)[] = [],
): string {
  if (!especialidade) return descricao;
  // Só mexe quando a descrição COMEÇA com o nome do procedimento do
  // agendamento (sem o sufixo "(ESPECIALIDADE)"). Descrição escrita à mão,
  // ex. "Serviços laboratoriais", fica como está.
  if (!procedimentos.some((p) => descricaoComecaComProcedimento(descricao, p))) return descricao;
  if (normEsp(descricao).includes(`(${normEsp(especialidade)})`)) return descricao;
  const corte = descricao.search(/\n| — /);
  const primeiro = corte === -1 ? descricao : descricao.slice(0, corte);
  const resto = corte === -1 ? "" : descricao.slice(corte);
  if (!primeiro.trim()) return descricao;
  return `${primeiro.trimEnd()} (${especialidade})${resto}`;
}

/** Nome do procedimento sem o sufixo final entre parênteses: "CONSULTA (ORTOPEDIA)" → "CONSULTA". */
export function procedimentoSemSufixo(procedimento: string | null | undefined): string {
  return (procedimento ?? "").replace(/\s*\([^()]*\)\s*$/, "").trim();
}

/** Ignora maiúsculas, acentos e espaço extra; exige fim de palavra após o nome. */
export function descricaoComecaComProcedimento(
  descricao: string,
  procedimento: string | null | undefined,
): boolean {
  const base = normEsp(procedimentoSemSufixo(procedimento));
  if (!base) return false;
  const d = normEsp(descricao);
  if (!d.startsWith(base)) return false;
  const prox = d.charAt(base.length);
  return prox === "" || !/[A-Z0-9]/.test(prox);
}
