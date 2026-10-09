import type { ResultadoBroker } from "./tool-broker";
import { registrosDoRetorno } from "./confidence/evidencia-extrator";

const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const objeto = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" ? (v as Record<string, unknown>) : {};
const dia =
  /\b(segundas?|ter[cç]as?|quartas?|quintas?|sextas?|s[aá]bados?|domingos?|diariamente|todos os dias)\b/i;
const hora = /\b\d{1,2}(?::\d{2}|h(?:\d{2})?)\b|\b(manh[ãa]|tarde|noite)(?=\s|$|[.,;])/i;

/** Só avalia campos de escala retornados pelo catálogo, nunca a fala do paciente. */
function temEscala(registro: Record<string, unknown>): boolean {
  const extras = objeto(registro.extras);
  const horarios = Array.isArray(extras.horarios) ? extras.horarios : [];
  if (
    horarios.some((h) => {
      const item = objeto(h);
      return (
        dia.test(texto(item.dia)) &&
        hora.test([item.inicio, item.fim, item.observacao].map(texto).join(" "))
      );
    })
  )
    return true;
  // Cadastros legados podem publicar a escala em observação, em vez da lista.
  const legado = [registro.dia, registro.horario, registro.dias_horarios, extras.observacao_publica]
    .map(texto)
    .join(" ");
  return dia.test(legado) && hora.test(legado);
}

function profissionaisDoRetorno(resultado: ResultadoBroker): Record<string, unknown>[] {
  if (
    !resultado.success ||
    resultado.erro ||
    !["searchKnowledgeBase", "listCatalog"].includes(resultado.capacidade ?? "")
  )
    return [];
  const dados = objeto(resultado.dados);
  if (
    dados.esclarecimento ||
    dados.found === false ||
    ["conflict", "not_found"].includes(String(dados.knowledge_status))
  )
    return [];
  const registros = registrosDoRetorno(dados).map(objeto);
  return registros.filter(
    (r) =>
      (r.tipo === "profissional" || objeto(r.extras).catalogo_tipo === "profissional") &&
      texto(r.medico),
  );
}

/** Orienta a apresentação sem apagar candidatos, escolher médico ou alterar o catálogo. */
export function orientacaoHorariosHabituais(resultado: ResultadoBroker) {
  const profissionais = profissionaisDoRetorno(resultado);
  if (!profissionais.length) return null;
  const classificar = (r: Record<string, unknown>) =>
    temEscala(r)
      ? "com_horarios"
      : Array.isArray(objeto(r.extras).horarios)
        ? "sem_horarios"
        : "nao_verificados";
  const grupo = (status: string) =>
    profissionais
      .filter((r) => classificar(r) === status)
      .map((r) => ({ registro: texto(r.id), nome: texto(r.medico) }));
  return {
    com_horarios: grupo("com_horarios"),
    sem_horarios: grupo("sem_horarios"),
    nao_verificados: grupo("nao_verificados"),
    instrucao:
      "Pedido genérico: apresente somente profissionais de com_horarios, com seus horários habituais publicados. Não encaminhe pela falta de horários dos demais. Médico solicitado especificamente prevalece: se estiver sem_horarios, encaminhe para a equipe; não o substitua. nao_verificados exige completar a leitura, não comprova ausência. Esta classificação cobre apenas este retorno e não confirma vagas na agenda.",
  };
}

/** Ausência explícita da escala não pode ser contornada consultando vagas. */
export function motivoSemHorariosHabituais(
  resultado: ResultadoBroker,
  referencias: readonly string[] = [],
): string | null {
  const profissionaisRetornados = profissionaisDoRetorno(resultado);
  // Busca ampla não é escolha de todos os médicos. Uma referência ausente
  // neste retorno tampouco autoriza avaliar outro profissional em seu lugar.
  const profissionais = referencias.length
    ? profissionaisRetornados.filter((r) => referencias.includes(String(r.id ?? "")))
    : profissionaisRetornados.length === 1
      ? profissionaisRetornados
      : [];
  const semEscala = profissionais.filter((r) => {
    // Retorno parcial, sem o campo, não comprova ausência no cadastro.
    if (!Array.isArray(objeto(r.extras).horarios)) return false;
    return !temEscala(r);
  });
  const nomes = [...new Set(semEscala.map((r) => texto(r.medico)))];
  return nomes.length
    ? `HORARIOS_HABITUAIS_NAO_INFORMADOS: ${nomes.join("; ")}. A equipe deve conferir a escala; não consultar vagas nem substituir o profissional.`.slice(
        0,
        500,
      )
    : null;
}
