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
  respostas: { equipe: number; nina: number; automaticas: number };
  encaminhadasHoje: number;
  resolvidasHoje: number;
  atualizadoEm: string;
};

/** Somente memória: não cria conversas, presenças, mensagens nem registros no banco. */
export function criarDemonstracaoPainelTv(agora: number): DadosPainelTv {
  const antes = (minutos: number) => new Date(agora - minutos * 60_000).toISOString();
  const atendentes: AtendenteTv[] = [
    {
      id: "demo-ana",
      nome: "Ana Martins",
      estado: "ONLINE",
      inicioPausa: null,
      atribuidas: 8,
      esperas: [18, 11, 6, 2].map(antes),
      resolvidasHoje: 17,
    },
    {
      id: "demo-bruna",
      nome: "Bruna Lima",
      estado: "ONLINE",
      inicioPausa: null,
      atribuidas: 6,
      esperas: [8, 4, 1].map(antes),
      resolvidasHoje: 21,
    },
    {
      id: "demo-carla",
      nome: "Carla Souza",
      estado: "ONLINE",
      inicioPausa: null,
      atribuidas: 5,
      esperas: [7, 3].map(antes),
      resolvidasHoje: 14,
    },
    {
      id: "demo-diana",
      nome: "Diana Alves",
      estado: "PAUSA",
      inicioPausa: antes(9.75),
      atribuidas: 3,
      esperas: [9].map(antes),
      resolvidasHoje: 12,
    },
    {
      id: "demo-elisa",
      nome: "Elisa Santos",
      estado: "PAUSA_SAIDA",
      inicioPausa: antes(25.2),
      atribuidas: 2,
      esperas: [],
      resolvidasHoje: 8,
    },
    {
      id: "demo-fernanda",
      nome: "Fernanda Costa",
      estado: "OFFLINE",
      inicioPausa: null,
      atribuidas: 1,
      esperas: [14].map(antes),
      resolvidasHoje: 6,
    },
  ];
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
    respostas: { equipe: 194, nina: 312, automaticas: 46 },
    encaminhadasHoje: 94,
    resolvidasHoje: atendentes.reduce((total, a) => total + a.resolvidasHoje, 0),
    atualizadoEm: new Date(agora).toISOString(),
  };
}
