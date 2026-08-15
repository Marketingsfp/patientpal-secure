// Server function que assina os comandos enviados ao QZ Tray usando a
// chave privada armazenada no secret QZ_PRIVATE_KEY. Isso permite
// impressão silenciosa sem o popup de autorização do QZ.
import { createServerFn } from "@tanstack/react-start";
import { createSign } from "node:crypto";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Este endpoint assina com a chave privada do QZ Tray, e uma assinatura
// válida dispensa o popup de autorização na estação. Sem middleware ele era
// um oráculo de assinatura aberto à internet: qualquer um obtinha comandos
// de impressão assinados. Exigir sessão é o mínimo — só quem está logado no
// sistema pode pedir assinatura.
export const assinarQzMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { toSign: string }) => {
    if (!input || typeof input.toSign !== "string") {
      throw new Error("Payload inválido para assinatura QZ.");
    }
    // Limite defensivo: a assinatura QZ recebe apenas o payload de comando,
    // nunca documentos inteiros.
    if (input.toSign.length === 0 || input.toSign.length > 8000) {
      throw new Error("Payload de assinatura QZ fora do tamanho permitido.");
    }
    return input;
  })
  .handler(async ({ data }) => {
    const privateKey = process.env.QZ_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error("QZ_PRIVATE_KEY não configurada no servidor.");
    }
    // QZ Tray usa SHA512 por padrão para o certificado do site (2.1+).
    const signer = createSign("SHA512");
    signer.update(data.toSign);
    signer.end();
    const signature = signer.sign(privateKey).toString("base64");
    return { signature };
  });
