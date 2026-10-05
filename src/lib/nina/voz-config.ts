import { z } from "zod";

// O interruptor já existente continua sendo a única fonte para ativar o áudio.
export const FLAG_VOZ_NINA = "nina_resposta_audio_desativada";
export const MODELO_VOZ_NINA = "openai/gpt-4o-mini-tts";
export const VOZES_NINA = [
  "nova",
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "fable",
  "onyx",
  "sage",
  "shimmer",
  "verse",
  "marin",
  "cedar",
] as const;
export const ESTILOS_VOZ = {
  natural: "Natural",
  acolhedor: "Acolhedor",
  tranquilo: "Tranquilo",
  profissional: "Profissional",
  animado: "Animado",
} as const;
export const vozConfigSchema = z
  .object({
    voz: z.enum(VOZES_NINA),
    velocidade: z.number().min(0.25).max(4),
    estilo: z.enum(["natural", "acolhedor", "tranquilo", "profissional", "animado"]),
    orientacoes: z.string().trim().max(2000),
    respostasLongas: z.enum(["resumo_texto", "somente_texto"]),
    limiteResumo: z.number().int().min(100).max(3000),
  })
  .strict();
export type VozConfig = z.infer<typeof vozConfigSchema>;
export const VOZ_PADRAO: VozConfig = {
  voz: "nova",
  velocidade: 1,
  estilo: "natural",
  orientacoes: "",
  respostasLongas: "resumo_texto",
  limiteResumo: 350,
};
export const TEXTO_PREVIA_VOZ =
  "Olá! Sou a atendente virtual da clínica. Posso ajudar você com informações sobre consultas e exames. Como posso ajudar?";
export const previaVozSchema = z.string().trim().min(1).max(600);

export function selecaoVoz(linha: any) {
  const salvo = linha?.config?.voz_nina;
  const validado = vozConfigSchema.safeParse(salvo);
  return {
    configuracao: validado.success ? validado.data : { ...VOZ_PADRAO },
    audioAtivo: linha?.ativo !== true,
    revisao: typeof linha?.updated_at === "string" ? linha.updated_at : null,
    origem:
      salvo == null
        ? ("padrao" as const)
        : validado.success
          ? ("configurada" as const)
          : ("configuracao_invalida" as const),
  };
}

export function instrucoesVoz(config: VozConfig): string | undefined {
  // Ausência de personalização preserva a geração anterior.
  if (config.estilo === "natural" && !config.orientacoes) return undefined;
  const estilos = {
    natural: "Fale naturalmente.",
    acolhedor: "Use um tom acolhedor, cordial e atencioso.",
    tranquilo: "Use um tom tranquilo, com articulação clara e pausas naturais.",
    profissional: "Use um tom profissional, claro e seguro, sem soar rígido.",
    animado: "Use um tom animado e positivo, sem exageros.",
  };
  return [
    "Leia fielmente o texto fornecido em português brasileiro. Preserve nomes, valores e números; não acrescente informações.",
    estilos[config.estilo],
    config.orientacoes ? `Orientações de voz e pronúncia: ${config.orientacoes}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
