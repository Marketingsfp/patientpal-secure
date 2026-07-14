// Serviço de impressão silenciosa via QZ Tray.
// Requer o QZ Tray instalado e rodando na máquina do usuário
// (https://qz.io). O QZ Tray expõe um websocket local que este
// serviço utiliza para enviar o PDF diretamente à impressora
// padrão, sem abrir a caixa de diálogo do navegador.
//
// Uso:
//   import { imprimirDocumentoSilencioso } from "@/utils/printService";
//   await imprimirDocumentoSilencioso(pdfBase64);
//
// `pdfBase64` deve ser somente o conteúdo base64 do PDF
// (sem o prefixo "data:application/pdf;base64,").

import qz from "qz-tray";
import { assinarQzMessage } from "@/lib/qz/sign.functions";

// Certificado público auto-assinado (par da chave QZ_PRIVATE_KEY guardada no
// backend). Enviado ao QZ Tray para que ele confie neste site e execute os
// comandos assinados sem exibir o popup de autorização.
const QZ_PUBLIC_CERT = `-----BEGIN CERTIFICATE-----
MIIDzzCCAregAwIBAgIUXqD5xVKLlimgESeGgdvETGs267MwDQYJKoZIhvcNAQEL
BQAwdzELMAkGA1UEBhMCQlIxCzAJBgNVBAgMAlNQMREwDwYDVQQHDAhTYW9QYXVs
bzETMBEGA1UECgwKU3VhQ2xpbmljYTELMAkGA1UECwwCVEkxJjAkBgNVBAMMHXBh
dGllbnRwYWwtc2VjdXJlLmxvdmFibGUuYXBwMB4XDTI2MDcxNDIwMjM1M1oXDTM2
MDcxMTIwMjM1M1owdzELMAkGA1UEBhMCQlIxCzAJBgNVBAgMAlNQMREwDwYDVQQH
DAhTYW9QYXVsbzETMBEGA1UECgwKU3VhQ2xpbmljYTELMAkGA1UECwwCVEkxJjAk
BgNVBAMMHXBhdGllbnRwYWwtc2VjdXJlLmxvdmFibGUuYXBwMIIBIjANBgkqhkiG
9w0BAQEFAAOCAQ8AMIIBCgKCAQEA2ObFGvT1jnX4tBKqkk08FnxjWyqnpr/Ue6DL
i9pWWDWrtYVS+6brLYQpqGrRv45PE2MKuoA5TA+oAc2uUIjxmdfibJwowBzXwl+i
IJHBqCh6Y5MlwphWrnw9uETeJskZtCK7+kD22GGxHfytzpVZCAhyyVSFy+EBNGMj
Ge4cNdxzBuE4svgWW/IlH2wNxele8gt6lMMsJcmClKhAqxgLmYPmYsAIq0LqJy31
zu5qGt7K80vcezPRTKGeZcEyyT9M36DcFuuuolDVkrRTi0t7ZmsjpDy/YCfOolXf
fsAu/+Fj90Ih3Ui7QBHxMVxnHiMzDktcbB6nVs7J6rJfQCoiiQIDAQABo1MwUTAd
BgNVHQ4EFgQUCQY1Mfzmh+PdjneaUhbe+lNE6b4wHwYDVR0jBBgwFoAUCQY1Mfzm
h+PdjneaUhbe+lNE6b4wDwYDVR0TAQH/BAUwAwEB/zANBgkqhkiG9w0BAQsFAAOC
AQEAb9I0xuDlAkMarWdpu9lQHr+nfhO3jvThbjbaPxBOEV9XgaiA9TM11OeAzE32
2IqL1Rk2zanmIAFBvtI9VSWEcnfKAhIko91hSOT4ZVHbOTtNu8c+OyRqLLPe2j6O
d+jElCHlTMniYQWiNe7W0Ou8gWionsiX9biIMEz/bVelyPZfXlgqx6bPjAwGz+xW
wyMSI8LKhYJptEHUYdjJnTmn/kHhiyFPtf9zT0+uialdXMXPoLS/G457OLGt5mcJ
QcYMFI4W0Au3e5rI/TmVcPSetw55lGyBggSTzXBpr9vDIU79lclJA4ZrYJsOgEWC
C+z11nSEQpzbGw/luxLvuAvQYg==
-----END CERTIFICATE-----`;

let qzConfigurado = false;
function configurarQzUmaVez() {
  if (qzConfigurado) return;
  qzConfigurado = true;

  qz.security.setCertificatePromise((resolve) => {
    resolve(QZ_PUBLIC_CERT);
  }, { rejectOnFailure: true });

  if (qz.security.setSignatureAlgorithm) {
    qz.security.setSignatureAlgorithm("SHA512");
  }

  qz.security.setSignaturePromise((toSign) => (resolve, reject) => {
    assinarQzMessage({ data: { toSign } })
      .then((r) => resolve(r.signature))
      .catch((e) => reject(e));
  });
}

export async function imprimirDocumentoSilencioso(pdfBase64: string): Promise<void> {
  if (!pdfBase64 || typeof pdfBase64 !== "string") {
    throw new Error("PDF em base64 não informado para impressão.");
  }

  // Remove eventual prefixo data URL, garantindo apenas o base64 puro.
  const base64Limpo = pdfBase64.replace(/^data:application\/pdf;base64,/, "").trim();

  try {
    // 0) Registra certificado e assinatura antes de conectar.
    configurarQzUmaVez();

    // 1) Garante o websocket ativo antes de qualquer chamada.
    if (!qz.websocket.isActive()) {
      await qz.websocket.connect();
    }

    // 2) Busca a impressora padrão do sistema.
    const impressora = await qz.printers.getDefault();
    if (!impressora) {
      throw new Error("Nenhuma impressora padrão configurada no sistema.");
    }

    // 3) Configuração do trabalho de impressão.
    const config = qz.configs.create(impressora);

    // 4) Payload no formato esperado pelo QZ Tray para PDF em base64.
    const data = [
      {
        type: "pdf",
        format: "base64",
        data: base64Limpo,
      },
    ];

    // 5) Envia à impressora.
    await qz.print(config, data);
  } finally {
    // 6) Encerra o websocket ao final (sucesso ou erro).
    try {
      if (qz.websocket.isActive()) {
        await qz.websocket.disconnect();
      }
    } catch {
      // Silencia falhas de disconnect — a impressão já foi tentada.
    }
  }
}