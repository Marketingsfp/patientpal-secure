import { z } from "zod";
import { franciscoConfigSchema, pediuSaidaFrancisco, textoTemplateFrancisco } from "./config";

export const inicioTesteFranciscoSchema = z.object({
  config: franciscoConfigSchema,
  clinicaNome: z.string().trim().min(1).max(200),
  etapa: z.enum(["d1", "d4"]),
});
export const acaoTesteFranciscoSchema = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("paciente"), texto: z.string().trim().min(1).max(4000) }),
  z.object({ tipo: z.literal("d4") }),
  z.object({ tipo: z.literal("pagamento") }),
]);
export type InicioTesteFrancisco = z.infer<typeof inicioTesteFranciscoSchema>;
export type AcaoTesteFrancisco = z.infer<typeof acaoTesteFranciscoSchema>;
export type MensagemTesteFrancisco = {
  id: string;
  autor: "francisco" | "paciente" | "sistema";
  texto: string;
  em: string;
};
export type SessaoTesteFrancisco = {
  id: string;
  em: string;
  inicio: InicioTesteFrancisco;
  estado: "aguardando" | "humano" | "recusado" | "pago";
  d4Enviado: boolean;
  mensagens: MensagemTesteFrancisco[];
};

export function iniciarTesteFrancisco(
  id: string,
  em: string,
  valor: InicioTesteFrancisco,
): SessaoTesteFrancisco {
  const inicio = inicioTesteFranciscoSchema.parse(valor);
  if (!inicio.config[inicio.etapa]) throw new Error("Esta etapa está desativada no rascunho.");
  return {
    id,
    em,
    inicio,
    estado: "aguardando",
    d4Enviado: inicio.etapa === "d4",
    mensagens: [
      {
        id: `${id}:inicio`,
        autor: "sistema",
        em,
        texto: `Teste iniciado no ${inicio.etapa.toUpperCase()}. Orçamento fictício aberto e sem pagamento; contato autorizado. Nenhum WhatsApp será enviado.`,
      },
      {
        id: `${id}:template`,
        autor: "francisco",
        em,
        texto: textoTemplateFrancisco(inicio.config, inicio.etapa, inicio.clinicaNome),
      },
    ],
  };
}

export function aplicarAcaoTesteFrancisco(
  sessao: SessaoTesteFrancisco,
  id: string,
  em: string,
  valor: AcaoTesteFrancisco,
): SessaoTesteFrancisco {
  const acao = acaoTesteFranciscoSchema.parse(valor);
  const proxima = { ...sessao, mensagens: [...sessao.mensagens] };
  const mensagem = (autor: MensagemTesteFrancisco["autor"], texto: string) =>
    proxima.mensagens.push({ id: `${id}:${autor}`, autor, texto, em });
  if (acao.tipo === "d4") {
    if (sessao.estado !== "aguardando")
      throw new Error("A sequência foi interrompida. Inicie outro teste para enviar um template.");
    if (sessao.d4Enviado) throw new Error("O template D4 já foi enviado neste teste.");
    if (!sessao.inicio.config.d4) throw new Error("D4 está desativado no rascunho deste teste.");
    mensagem(
      "sistema",
      "Avanço simulado para 96 horas após o orçamento. Continua sem resposta ou pagamento.",
    );
    mensagem(
      "francisco",
      textoTemplateFrancisco(sessao.inicio.config, "d4", sessao.inicio.clinicaNome),
    );
    proxima.d4Enviado = true;
  } else if (acao.tipo === "pagamento") {
    proxima.estado = "pago";
    mensagem(
      "sistema",
      "Pagamento fictício registrado. A sequência foi interrompida. Nenhum registro financeiro real foi alterado.",
    );
  } else {
    mensagem("paciente", acao.texto);
    if (pediuSaidaFrancisco(acao.texto)) {
      proxima.estado = "recusado";
      mensagem(
        "sistema",
        "Pedido de saída reconhecido. Contato bloqueado neste teste e sequência interrompida. Encaminhamento humano simulado.",
      );
    } else if (sessao.estado === "aguardando") {
      proxima.estado = "humano";
      mensagem(
        "sistema",
        `Resposta recebida. Sequência interrompida e atendimento encaminhado para ${sessao.inicio.config.departamento} (simulação). Pagamento será tratado pela equipe humana.`,
      );
    } else {
      mensagem(
        "sistema",
        "Mensagem recebida pela equipe humana (simulação). Nenhuma resposta automática do Francisco.",
      );
    }
  }
  return proxima;
}
