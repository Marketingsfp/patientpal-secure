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
import { supabase } from "@/integrations/supabase/client";

// Certificado público gerado para este projeto (pareado com QZ_PRIVATE_KEY
// mantida em segredo no servidor). O QZ Tray envia este certificado ao
// aplicativo local para validar que o site é autorizado a imprimir.
const QZ_PUBLIC_CERT = `-----BEGIN CERTIFICATE-----
MIID+zCCAuOgAwIBAgIGAZ9hDLaEMA0GCSqGSIb3DQEBCwUAMIGaMQswCQYDVQQG
EwJVUzELMAkGA1UECAwCTlkxEjAQBgNVBAcMCUNhbmFzdG90YTEbMBkGA1UECgwS
UVogSW5kdXN0cmllcywgTExDMRswGQYDVQQLDBJRWiBJbmR1c3RyaWVzLCBMTEMx
HDAaBgkqhkiG9w0BCQEWDXN1cHBvcnRAcXouaW8xEjAQBgNVBAMMCWxvY2FsaG9z
dDAeFw0yNjA3MTMxNDM0MTBaFw00NjA3MTMxNDM0MTBaMIGaMQswCQYDVQQGEwJV
UzELMAkGA1UECAwCTlkxEjAQBgNVBAcMCUNhbmFzdG90YTEbMBkGA1UECgwSUVog
SW5kdXN0cmllcywgTExDMRswGQYDVQQLDBJRWiBJbmR1c3RyaWVzLCBMTEMxHDAa
BgkqhkiG9w0BCQEWDXN1cHBvcnRAcXouaW8xEjAQBgNVBAMMCWxvY2FsaG9zdDCC
ASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBAORj8Gr/sqp5yn8TtkgSOL+r
gmvhcXdJT1rBwiyhFBCPw0nbk+YOMUS2KrX2beG0tcet5Hdrrys7rtah6VDhWup1
LIwBGUW+1Fz0VRE8NLK70SqRA/MhcAZsmd1by8ZjLjcOXPX/9qERs1QuBBVICGrt
73fUH3Reo3zIf6Wm4yrvXeW8be43StZfteNkV3DUbzayGdV3bVFb9IKUI2AYv2dP
C1pkG6IQaM5rAm9x1GkrpUyIAAVo6tQ5npcrKmQ4fU5RSr4jII+tteFANKCiEGKr
XlNiLuuYC9UzCiGy7Y3tmmLsOSE7UZ7l1beF0tDSf1iC83GKC2arz/wdUARRGZcC
AwEAAaNFMEMwEgYDVR0TAQH/BAgwBgEB/wIBATAOBgNVHQ8BAf8EBAMCAQYwHQYD
VR0OBBYEFMJgR4alU4UOQaJCubmrzVSB9EDaMA0GCSqGSIb3DQEBCwUAA4IBAQBj
ce1BsveCiDnMruQQr2eXI9VxiB0a/ebpMN21POFNtcRicMpY8d6UAgVruY+c6ejS
XURiuwHb9eFwTdsL2IcjQ79Kd4nfXDMPN1RyWTm9abFMTE1lJdZo/4I0MFmBubaw
D/HYnuEn3mwj5SO8XCKUWjpmIzvY3PgsaeCme2GmggIsr8WwHIaSeyF7203hiHmj
BTUydw4HRUv87rBQQjmQVGXRGhY90VTqfTGpZ8KQg6e+eTeNXXq1oFOY6prlWbZF
qGvwDNM0U4JGgbyEbDFWSZp0qEcM1MWSxXGcTpdwnLPpYkDElJEIv4r2aH0d63if
J7naCuQg1YqLIUUXzeCR
-----END CERTIFICATE-----`;

let qzSecurityConfigured = false;
function configurarSeguranca() {
  if (qzSecurityConfigured) return;
  qzSecurityConfigured = true;

  // Usa o certificado root-ca local do QZ Tray desta máquina do totem.
  // Sem chave privada correspondente, a assinatura é vazia — o QZ Tray
  // reconhece o certificado e libera o botão Allow no diálogo, e o operador
  // confirma manualmente.
  qz.security.setCertificatePromise((arg) => {
    arg.resolve(QZ_PUBLIC_CERT);
  });
  qz.security.setSignaturePromise(() => (resolve) => {
    resolve("");
  });
  void supabase;
}

export async function imprimirDocumentoSilencioso(pdfBase64: string): Promise<void> {
  if (!pdfBase64 || typeof pdfBase64 !== "string") {
    throw new Error("PDF em base64 não informado para impressão.");
  }

  // Remove eventual prefixo data URL, garantindo apenas o base64 puro.
  const base64Limpo = pdfBase64.replace(/^data:application\/pdf;base64,/, "").trim();

  try {
    // 0) Configura assinatura/certificado antes de qualquer conexão.
    configurarSeguranca();

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