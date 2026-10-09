/** Uma tentativa efetiva ao provedor; ausência de consumo nunca significa custo zero. */
export type ChamadaIA = {
  id: string;
  finalidade: "jev" | "leitura_imagem" | "transcricao_audio" | "sintese_voz";
  modelo: string;
  inicio: string;
  duracaoMs: number;
  estado: "concluido" | "falhou";
  erro: string | null;
  consumoEntrada: number | null;
  consumoSaida: number | null;
  caracteres: number | null;
  formato: string | null;
};
export type RegistrarChamadaIA = (chamada: ChamadaIA) => void | Promise<void>;
