// Numeração da FICHA do dia — fonte única da regra.
//
// A ficha é POSICIONAL: dentro de cada (dia, profissional, agenda) as linhas
// são ordenadas pelo horário e recebem 001, 002, 003… Nenhum filtro da tela
// (médico, status, cliente) muda esses números — eles são calculados sempre
// sobre a lista inteira do dia, para que a ficha exibida seja igual à ficha
// impressa na guia.
//
// SEM NÚMERO REPETIDO (16/10/2026, decisão do João): cada linha recebe número
// próprio. O banco já soma 1 segundo ao início de quem cai num horário ocupado
// (trg_agendamento_inicio_sem_repetir); linhas antigas no mesmo instante são
// desempatadas por created_at e id.

export type LinhaParaFicha = {
  id: string;
  inicio: string;
  paciente_nome?: string | null;
  medico_id?: string | null;
  agenda_id?: string | null;
  created_at?: string | null;
};

/**
 * Devolve `id do agendamento → número da ficha` para todas as linhas passadas.
 * A lista deve conter TODAS as linhas dos dias envolvidos (inclusive vagas
 * livres e canceladas), senão a numeração sai deslocada.
 */
export function numerarFichas(linhas: readonly LinhaParaFicha[]): Map<string, number> {
  const numeros = new Map<string, number>();
  const ordenados = [...linhas].sort((a, b) => {
    const t = a.inicio.localeCompare(b.inicio);
    if (t !== 0) return t;
    // Mesmo horário (linhas antigas, antes da trava no banco): quem foi lançado
    // primeiro fica com o número menor; depois desempata pelo id.
    const c = (a.created_at ?? "").localeCompare(b.created_at ?? "");
    if (c !== 0) return c;
    return a.id.localeCompare(b.id);
  });
  const contadores = new Map<string, number>();
  for (const a of ordenados) {
    // Data LOCAL (America/Sao_Paulo), não UTC: usar os 10 primeiros caracteres
    // do ISO joga tudo que acontece depois das 21:00 locais para o dia UTC
    // seguinte, o que reiniciava a numeração no meio da agenda do mesmo dia.
    const dia = new Date(a.inicio).toLocaleDateString("en-CA", {
      timeZone: "America/Sao_Paulo",
    });
    // Chave por profissional: `medico_id` já engloba os recursos de enfermagem
    // (mapeados como "médicos virtuais"). Linhas sem profissional formam um
    // balde próprio por dia.
    const prof = a.medico_id ?? "__sem_profissional__";
    // Cada agenda do médico tem a própria sequência (decisão do gestor): ao
    // filtrar por uma agenda a numeração fica limpa e sequencial. Na lista sem
    // filtro de agenda, números iguais entre agendas diferentes são esperados —
    // são filas distintas, não duplicação.
    const agenda = a.agenda_id ?? "__sem_agenda__";
    const chave = `${dia}::${prof}::${agenda}`;
    const n = (contadores.get(chave) ?? 0) + 1;
    contadores.set(chave, n);
    numeros.set(a.id, n);
  }
  return numeros;
}

/** Mesma numeração, já formatada em três dígitos ("007") para exibição. */
export function numerarFichasFormatadas(linhas: readonly LinhaParaFicha[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const [id, n] of numerarFichas(linhas)) m.set(id, String(n).padStart(3, "0"));
  return m;
}
