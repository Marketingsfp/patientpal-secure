// Server function que assina os comandos enviados ao QZ Tray usando a
// chave privada armazenada no secret QZ_PRIVATE_KEY. Isso permite
// impressão silenciosa sem o popup de autorização do QZ.
import { createServerFn } from "@tanstack/react-start";
import { createSign } from "node:crypto";

export const assinarQzMessage = createServerFn({ method: "POST" })
  .inputValidator((input: { toSign: string }) => {
    if (!input || typeof input.toSign !== "string") {
      throw new Error("Payload inválido para assinatura QZ.");
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