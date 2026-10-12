/** Resultado real de ferramenta compartilhado pelo modelo, motor e auditoria. */
import { extrairEvidencia } from "./evidencia-extrator";
import type { ConsultaDoTurno, FatoRecuperado } from "./evidencia";
import type { ResultadoBroker } from "../tool-broker";

export function incorporarResultadoOficial(e: {
  clinicaId: string;
  nome: string;
  args: unknown;
  resultado: ResultadoBroker;
  fatos: FatoRecuperado[];
  consultas: ConsultaDoTurno[];
}) {
  const r = e.resultado;
  const ex = extrairEvidencia({
    ferramenta: e.nome,
    args: e.args,
    capacidade: r.capacidade,
    fonte: r.fonte,
    success: r.success,
    erro: r.erro,
    dados: r.dados,
    clinicaId: e.clinicaId,
  });
  // Uma referência identifica a consulta exata, não todos os resultados da
  // ferramenta. Retorno reconsultado substitui fatos anteriores do mesmo
  // registro; uma resposta vazia/falha nunca recupera o valor de um cache.
  const registrosAtuais = new Set(
    ex.fatos.filter((f) => f.registro).map((f) => `${f.fonte}|${f.registro}`),
  );
  for (let i = e.fatos.length - 1; i >= 0; i--) {
    const f = e.fatos[i]!;
    if (
      f.consulta === ex.consulta.id ||
      (f.registro && registrosAtuais.has(`${f.fonte}|${f.registro}`))
    )
      e.fatos.splice(i, 1);
  }
  const fatos = ex.fatos.map((f) => ({ ...f, consulta: ex.consulta.id }));
  e.fatos.push(...fatos);
  e.consultas.push(ex.consulta);
  return { consulta: ex.consulta, fatos };
}

type Registro = Record<string, unknown> & { extras?: Record<string, unknown> };

const semChaves = (o: Record<string, unknown> | undefined, chaves: readonly string[]) =>
  o ? Object.fromEntries(Object.entries(o).filter(([k]) => !chaves.includes(k))) : o;
const encurtar = (v: unknown, max: number) =>
  typeof v === "string" && v.length > max ? `${v.slice(0, max)}…` : v;

/**
 * Etapas de compactação de um retorno com `records` (catálogo): cada etapa
 * retira só o que já está repetido em outro campo do mesmo registro, para que
 * TODOS os registros (médicos, horários e preços) cheguem ao modelo.
 */
const ETAPAS_COMPACTACAO: Array<(r: Registro, posicao: number) => Registro> = [
  // Cópias: estrutura crua e textos brutos já resumidos em `observacoes`.
  (r) => ({
    ...r,
    extras: semChaves(r.extras, ["estrutura", "observacao_publica", "descricao_publica"]),
  }),
  // Detalhe por atendimento e listas: os mesmos fatos estão em `observacoes`,
  // `dia` (horários) e `preco_*`.
  (r) => ({
    ...r,
    extras: semChaves(r.extras, [
      "atendimentos_publicados",
      "horarios",
      "executantes",
      "formas_pagamento",
      "convenios",
      "especialidades",
    ]),
  }),
  // Textos longos encurtados; regras, horários e preços continuam.
  (r) => ({
    ...r,
    observacoes: encurtar(r.observacoes, 500),
    preparo: encurtar(r.preparo, 300),
  }),
  // Listas longas: depois dos 3 primeiros, observação curta; médico, `dia` e
  // preços de TODOS continuam.
  (r, posicao) => (posicao < 3 ? r : { ...r, observacoes: encurtar(r.observacoes, 160) }),
];

/** Campos de topo que repetem os registros ou descrevem caminhos já retirados. */
const TOPO_REPETIDO = ["notes", "trace", "mapa_campos"];

function compactarRegistros(o: Record<string, unknown>, maxCaracteres: number) {
  if (!Array.isArray(o.records)) return null;
  let atual: Record<string, unknown> = { ...o };
  for (const [i, etapa] of ETAPAS_COMPACTACAO.entries()) {
    atual = {
      ...(i >= 1 ? semChaves(atual, TOPO_REPETIDO) : atual),
      records: (atual.records as Registro[]).map((r, posicao) =>
        r && typeof r === "object" ? etapa(r, posicao) : r,
      ),
      retorno_compactado: true,
      limite:
        "Retorno compactado: detalhes repetidos foram omitidos. Os fatos de cada registro estão em observacoes, dia (horários habituais) e preços; nenhum registro foi retirado.",
    };
    if (JSON.stringify(atual).length <= maxCaracteres) return atual;
  }
  return null;
}

/** A mensagem é JSON completo; corte é explícito, nunca um JSON quebrado. */
export function limitarRetornoParaModelo(resultado: unknown, maxCaracteres = 24_000): unknown {
  if (JSON.stringify(resultado).length <= maxCaracteres) return resultado;
  if (resultado && typeof resultado === "object" && !Array.isArray(resultado)) {
    const compactado = compactarRegistros(resultado as Record<string, unknown>, maxCaracteres);
    if (compactado) return compactado;
  }
  const o =
    resultado && typeof resultado === "object" ? (resultado as Record<string, unknown>) : {};
  // Retorno resumido não declara ausência nem lista completa de pagamento.
  return {
    success: o.success ?? o.ok ?? null,
    capacidade: o.capacidade ?? null,
    fonte: o.fonte ?? null,
    retorno_truncado: true,
    dados_parciais: JSON.stringify(resultado).slice(0, Math.max(0, maxCaracteres - 300)),
    limite:
      "Conteúdo parcial; não comprova ausência. Refine a consulta para obter o registro necessário.",
  };
}
