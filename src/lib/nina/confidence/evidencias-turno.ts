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

/** A mensagem é JSON completo; corte é explícito, nunca um JSON quebrado. */
export function limitarRetornoParaModelo(resultado: unknown, maxCaracteres = 24_000): unknown {
  if (JSON.stringify(resultado).length <= maxCaracteres) return resultado;
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
