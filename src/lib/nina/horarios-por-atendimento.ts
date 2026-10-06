/** Separação de escalas declaradas; não consulta vagas nem infere equivalência clínica. */
export type TipoEscala = "consulta" | "exame_procedimento";
const normal = (v: unknown) => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

export function tipoDaAgenda(nome: unknown): TipoEscala | null {
  const n = normal(nome).replace(/\s*\(ordem de chegada\)$/, "");
  if (/^consultas?$/.test(n)) return "consulta";
  if (/^(?:exames?|procedimentos?|exames?\s*(?:e|\/)\s*procedimentos?)$/.test(n)) return "exame_procedimento";
  return null;
}

export function tipoDaObservacao(observacao: unknown): TipoEscala | null {
  const agenda = /(?:^|[·\n])\s*Agenda:\s*([^·\n]+)/i.exec(String(observacao ?? ""));
  return agenda ? tipoDaAgenda(agenda[1]) : null;
}

export function horariosPorTipo<T extends { observacao?: unknown; tipo_escala?: unknown }>(horarios: T[], tipo: TipoEscala): T[] {
  return horarios.filter(h => {
    const categoria = h.tipo_escala === "consulta" || h.tipo_escala === "exame_procedimento" ? h.tipo_escala : tipoDaObservacao(h.observacao);
    return !categoria || categoria === tipo;
  });
}

/** Repara só o resumo legado gerado de TODAS as escalas, mantendo textos editoriais diferentes. */
export function corrigirResumoLegado(texto: string | null, antes: string, depois: string): string | null {
  if (!texto || antes === depois) return texto;
  return texto.replace(/^(Dias e hor[aá]rios:\s*)([^\r\n]*)/gim, (linha, rotulo, valor) =>
    valor.trim() === antes.trim() ? `${rotulo}${depois}` : linha);
}

/** Importações antigas de serviços guardavam a agenda na observação de cada executante. */
export function escalaLegadaExecutante(horarios: unknown, observacao: unknown, tipo: TipoEscala) {
  const linhas = String(observacao ?? "").split(/\r?\n/);
  const parsed = linhas.map(l => /^(.*?)\s*:\s+((?:.*?·\s*)?Agenda:\s*.*)$/i.exec(l));
  // Só reconstruir quando todas as linhas possuem dia e horário explícitos.
  if (!parsed.length || parsed.some(m => !m || !/\b\d{1,2}:\d{2}\b/.test(m[1]!)) ||
      !parsed.some(m => tipoDaObservacao(m![2]) && tipoDaObservacao(m![2]) !== tipo))
    return { horarios, observacao };
  const permitidos = parsed.filter(m => !tipoDaObservacao(m![2]) || tipoDaObservacao(m![2]) === tipo);
  return { horarios: permitidos.map(m => m![1]!.trim()).join(" · ") || null,
    observacao: permitidos.map(m => m![0]).join("\n") || null };
}
