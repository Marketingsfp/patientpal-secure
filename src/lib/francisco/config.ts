import { z } from "zod";
import { vozConfigSchema, VOZ_PADRAO } from "@/lib/nina/voz-config";

export const ABAS_FRANCISCO = [
  ["visao-geral", "Visão geral"],
  ["arquitetura", "Arquitetura"],
  ["voz", "Voz"],
  ["mensagens", "Mensagens"],
  ["acompanhamento", "Acompanhamento"],
  ["homologacao", "Homologação"],
  ["historico", "Histórico"],
] as const;
export type AbaFrancisco = (typeof ABAS_FRANCISCO)[number][0];
export const PROMPT_FRANCISCO = `Você é Francisco, assistente de orçamentos da clínica. Apresente-se no primeiro contato. Faça um acompanhamento breve, cordial e sem pressão. Não exponha exames, diagnósticos ou outros dados médicos. Não cobre dívidas, não prometa descontos e não confirme pagamentos. Pagamentos e respostas são tratados pela equipe humana. Respeite pedidos para não receber mensagens. Não encaminhe para a Nina. As mensagens ativas usam exclusivamente o texto do template aprovado; este prompt serve para homologação e elaboração de propostas.`;
export const TEXTOS_FRANCISCO = {
  d1: "Olá! Sou Francisco, assistente de orçamentos da {{1}}. Gostaria de saber se precisa de ajuda com seu orçamento. Se desejar, nossa equipe pode continuar o atendimento por aqui. Para não receber mais mensagens, responda SAIR.",
  d4: "Olá! Aqui é Francisco, assistente de orçamentos da {{1}}. Estou passando para saber se ainda deseja ajuda com seu orçamento. Nossa equipe está à disposição por aqui. Para não receber mais mensagens, responda SAIR.",
};
const horario = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const template = z.object({
  nome: z
    .string()
    .trim()
    .max(100)
    .regex(/^[a-z0-9_]*$/),
  idioma: z.literal("pt_BR"),
  texto: z
    .string()
    .trim()
    .min(30)
    .max(1000)
    .refine(
      (v) => (v.match(/\{\{1\}\}/g) ?? []).length === 1 && !/\{\{(?!1\}\})/.test(v),
      "Use somente {{1}}, uma vez, para o nome da clínica.",
    ),
});
export const franciscoConfigSchema = z
  .object({
    ativo: z.boolean(),
    modo: z.enum(["simulacao", "real"]),
    nome: z.literal("Francisco"),
    modelo: z
      .string()
      .trim()
      .min(3)
      .max(100)
      .regex(/^[\w./-]+$/),
    temperatura: z.number().min(0).max(2),
    systemPrompt: z.string().trim().min(30).max(12000),
    voz: vozConfigSchema,
    inicio: horario,
    fim: horario,
    dias: z.array(z.number().int().min(1).max(7)).min(1).max(7),
    limiteRodada: z.number().int().min(1).max(40),
    d1: z.boolean(),
    d4: z.boolean(),
    departamento: z.string().trim().min(2).max(100),
    templates: z.object({ d1: template, d4: template }),
  })
  .strict()
  .refine((v) => v.inicio < v.fim, "O horário final deve ser posterior ao inicial.");
export type FranciscoConfig = z.infer<typeof franciscoConfigSchema>;
export function configPadraoFrancisco(): FranciscoConfig {
  return {
    ativo: false,
    modo: "simulacao",
    nome: "Francisco",
    modelo: "google/gemini-3.8-flash",
    temperatura: 1,
    systemPrompt: PROMPT_FRANCISCO,
    voz: { ...VOZ_PADRAO, voz: "onyx", estilo: "acolhedor" },
    inicio: "09:00",
    fim: "18:00",
    dias: [1, 2, 3, 4, 5],
    limiteRodada: 20,
    d1: true,
    d4: true,
    departamento: "Recepção",
    templates: {
      d1: { nome: "francisco_orcamento_d1", idioma: "pt_BR", texto: TEXTOS_FRANCISCO.d1 },
      d4: { nome: "francisco_orcamento_d4", idioma: "pt_BR", texto: TEXTOS_FRANCISCO.d4 },
    },
  };
}
export function naJanelaFrancisco(c: FranciscoConfig, agora: Date): boolean {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(agora);
  const parte = (tipo: string) => p.find((v) => v.type === tipo)?.value ?? "";
  const dia = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(parte("weekday")) + 1;
  const hora = `${parte("hour")}:${parte("minute")}`;
  return c.dias.includes(dia) && hora >= c.inicio && hora < c.fim;
}
export function pediuSaidaFrancisco(texto: string): boolean {
  const t = texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (
    /^(sair|pare|parar|cancelar|remover|stop)$/.test(t) ||
    /nao (quero|desejo|me envie|mandem|envie).*(mensage|contato|receber)|pare de (mandar|enviar)/.test(
      t,
    )
  );
}
export function textoTemplateFrancisco(
  c: FranciscoConfig,
  etapa: "d1" | "d4",
  clinica: string,
): string {
  return c.templates[etapa].texto.replace("{{1}}", clinica);
}
