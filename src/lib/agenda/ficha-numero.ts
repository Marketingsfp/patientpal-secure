// Numeração da FICHA do dia — fonte única da regra.
//
// A ficha é POSICIONAL: dentro de cada (dia, profissional, agenda) as linhas
// são ordenadas pelo horário e recebem 001, 002, 003… Nenhum filtro da tela
// (médico, status, cliente) muda esses números — eles são calculados sempre
// sobre a lista inteira do dia, para que a ficha exibida seja igual à ficha
// impressa na guia.
//
// ENCAIXE (2026-09-09): quando a recepção lança um paciente a mais EM CIMA de
// um horário já ocupado, a linha nova nasce com exatamente o mesmo `inicio` da
// ficha sobreposta. Nesse caso as duas COMPARTILHAM o número da ficha, em vez
// de a linha nova consumir uma posição e empurrar em +1 todas as fichas do
// resto do dia — fichas que já foram impressas e entregues ao paciente não
// podem mudar de número depois. Duas linhas com o mesmo número no mesmo minuto
// são exatamente o que um encaixe é no balcão.
//
// Nas agendas de ORDEM DE CHEGADA isso nunca dispara: lá o encaixe entra com
// horário estritamente posterior ao último da fila (ver `proximaPosicaoDaFila`
// em app.agenda.tsx), então cada ficha continua com número próprio.

export type LinhaParaFicha = {
  id: string;
  inicio: string;
  paciente_nome?: string | null;
  medico_id?: string | null;
  agenda_id?: string | null;
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
    // Mesmo horário: desempata pelo nome do paciente (pt-BR, acento-insensível)
    // só para a ordem ficar estável entre recargas. O número em si é o mesmo
    // para as duas linhas — ver o comentário do encaixe no topo do arquivo.
    return (a.paciente_nome ?? "").localeCompare(b.paciente_nome ?? "", "pt-BR", {
      sensitivity: "base",
    });
  });
  const contadores = new Map<string, number>();
  // Último instante numerado em cada fila, para reconhecer o encaixe.
  const ultimoInstante = new Map<string, number>();
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
    const instante = new Date(a.inicio).getTime();
    const atual = contadores.get(chave) ?? 0;
    const mesmoInstante = atual > 0 && ultimoInstante.get(chave) === instante;
    const n = mesmoInstante ? atual : atual + 1;
    contadores.set(chave, n);
    ultimoInstante.set(chave, instante);
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
