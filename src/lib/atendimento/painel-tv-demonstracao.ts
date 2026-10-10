import type { AtendenteTv } from "./painel-tv.server";

export type DadosPainelTv = {
  atendentes: AtendenteTv[];
  naoAtribuidas: number;
  emAndamento: number;
  comNina: number;
  espera: string[];
  conversasDoDia: number;
  tempoMedioRespostaSeg: number | null;
  respostasMedidas: number;
  volumePorHora: number[];
  respostas: { equipe: number; nina: number };
  encaminhadasHoje: number;
  resolvidasHoje: number;
  atualizadoEm: string;
};

/** Somente memória: não cria conversas, presenças, mensagens nem registros no banco. */
export function criarDemonstracaoPainelTv(agora: number): DadosPainelTv {
  const antes = (minutos: number) => new Date(agora - minutos * 60_000).toISOString();
  const nomes = [
    "Ana Martins",
    "Bruna Lima",
    "Carla Souza",
    "Daniela Alves",
    "Elisa Santos",
    "Fernanda Costa",
    "Gabriela Rocha",
    "Helena Ribeiro",
    "Isabela Gomes",
    "Juliana Freitas",
    "Karina Mendes",
    "Larissa Nunes",
    "Mariana Lopes",
    "Natalia Barros",
    "Olivia Teixeira",
    "Patricia Moreira",
    "Renata Cardoso",
    "Sabrina Ferreira",
    "Talita Oliveira",
    "Ursula Pereira",
    "Valeria Ramos",
    "Aline Moura",
    "Beatriz Campos",
    "Camila Duarte",
    "Debora Castro",
    "Erica Monteiro",
    "Flavia Correia",
    "Giovana Araujo",
    "Heloisa Vieira",
    "Ingrid Batista",
  ] as const;
  const atendentes: AtendenteTv[] = nomes.map((nome, indice) => {
    const estado: AtendenteTv["estado"] =
      indice < 18
        ? "ONLINE"
        : indice < 26
          ? indice % 2 === 0
            ? "PAUSA"
            : "PAUSA_SAIDA"
          : "OFFLINE";
    const atribuidas = estado === "ONLINE" ? 3 + (indice % 6) : 1 + (indice % 4);
    const quantidadeEsperas = Math.min(atribuidas, indice % 5);
    const esperas = Array.from({ length: quantidadeEsperas }, (_, posicao) =>
      antes(1 + ((indice * 3 + posicao * 5) % 24)),
    );
    return {
      id: `demo-${String(indice + 1).padStart(2, "0")}`,
      nome,
      estado,
      inicioPausa:
        estado === "PAUSA" || estado === "PAUSA_SAIDA" ? antes(6 + (indice % 6) * 5) : null,
      atribuidas,
      esperas,
      resolvidasHoje: 6 + ((indice * 3) % 19),
      tempoMedioRespostaSeg: indice % 9 === 0 ? null : 48 + ((indice * 37) % 260),
    };
  });
  const semAtendente = [16, 2].map(antes);
  return {
    atendentes,
    naoAtribuidas: semAtendente.length,
    emAndamento: atendentes.reduce((total, a) => total + a.atribuidas, semAtendente.length),
    comNina: 31,
    espera: [...atendentes.flatMap((a) => a.esperas), ...semAtendente],
    conversasDoDia: 123,
    tempoMedioRespostaSeg: 146,
    respostasMedidas: 67,
    volumePorHora: [
      0, 0, 0, 0, 0, 0, 0, 8, 26, 44, 57, 39, 24, 31, 48, 61, 46, 33, 19, 10, 4, 0, 0, 0,
    ],
    respostas: { equipe: 194, nina: 312 },
    encaminhadasHoje: 94,
    resolvidasHoje: atendentes.reduce((total, a) => total + a.resolvidasHoje, 0),
    atualizadoEm: new Date(agora).toISOString(),
  };
}
