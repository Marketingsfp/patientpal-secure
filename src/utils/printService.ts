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

// Certificado público gerado para este projeto (pareado com QZ_PRIVATE_KEY
// mantida em segredo no servidor). O QZ Tray envia este certificado ao
// aplicativo local para validar que o site é autorizado a imprimir.
const QZ_PUBLIC_CERT = `-----BEGIN CERTIFICATE-----
MIIECzCCAvOgAwIBAgIGAZ9hK3mnMA0GCSqGSIb3DQEBCwUAMIGiMQswCQYDVQQG
EwJVUzELMAkGA1UECAwCTlkxEjAQBgNVBAcMCUNhbmFzdG90YTEbMBkGA1UECgwS
UVogSW5kdXN0cmllcywgTExDMRswGQYDVQQLDBJRWiBJbmR1c3RyaWVzLCBMTEMx
HDAaBgkqhkiG9w0BCQEWDXN1cHBvcnRAcXouaW8xGjAYBgNVBAMMEVFaIFRyYXkg
RGVtbyBDZXJ0MB4XDTI2MDcxMzE1MDc0NloXDTQ2MDcxMzE1MDc0NlowgaIxCzAJ
BgNVBAYTAlVTMQswCQYDVQQIDAJOWTESMBAGA1UEBwwJQ2FuYXN0b3RhMRswGQYD
VQQKDBJRWiBJbmR1c3RyaWVzLCBMTEMxGzAZBgNVBAsMElFaIEluZHVzdHJpZXMs
IExMQzEcMBoGCSqGSIb3DQEJARYNc3VwcG9ydEBxei5pbzEaMBgGA1UEAwwRUVog
VHJheSBEZW1vIENlcnQwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQCa
r74A9U3lWNRczws871Fiwe9yNdXVIpVWVxBin294Kw0iu/4/bcarUo30Ez49tiQ+
gPBMWwdGH90m0qJ/mKPagqdUgnqJdaSJA8rHBXBQ2oPCirR6CAvEmsUuHEdai0YW
BNiXD9J4RevykVviLxt2YXtG4qk4oeJeoFe8Fo2bh7FaiIV6LbVDwY9HmAsis5tn
Ihcw8SYH9fb91D03Jdk2qbByLDflHmHN4cZEQlJLFhz/JQBQHnyaRqznlNO8wCcf
XlUHSu3u6Y/gpd1O6c9tB1g6Fw1swir4EDNCVcneZN+T/fdGdNbRuGnUmkd2tzpW
TB1LQpm3e+PpZ1KCPX7rAgMBAAGjRTBDMBIGA1UdEwEB/wQIMAYBAf8CAQEwDgYD
VR0PAQH/BAQDAgEGMB0GA1UdDgQWBBQ329DVjOCCrUrb371w6SlwMGYP6jANBgkq
hkiG9w0BAQsFAAOCAQEAi9OjVPobFMgVfdXDHX8uEwAZ636b7nHL7j4CtVstJtbP
/bb8FgY3JMT+LI8A/4bO+fib7Iwp2DBpSlH+0/cEDIBIMK6EXsJp+/RYzohVeun2
jPsc8vByD+OjKvhhYB0NskKLFSV0qllYBCSYBpXa1lhazwOKZywVZMmGRO6IAds7
8de/NAAtmaKiS24RQXTIBdhYXqrXLOGNlNYq+ZXrCWjZv043BqmvhToNOhl1+u9o
P8+R1/Yd17Edza1AlIIl82j4SUbm9xvrODi6M311ugnJgDFGDPvl4mJb3/ADjXKt
clGgs+KzMvapNrPUElCRB209qqZuQmRbWR0MUPEvtw==
-----END CERTIFICATE-----`;

// URL da Edge Function que assina o payload usando a chave privada
// (mantida apenas no servidor, jamais no bundle do navegador).
const SIGN_QZ_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sign-qz`;

let qzSecurityConfigured = false;
function configurarSeguranca() {
  if (qzSecurityConfigured) return;
  qzSecurityConfigured = true;

  // Algoritmo casando com a Edge Function (SHA-512).
  qz.security.setSignatureAlgorithm?.("SHA512");

  // 1) Certificado público — enviado ao QZ Tray para identificar o site.
  qz.security.setCertificatePromise((arg) => {
    arg.resolve(QZ_PUBLIC_CERT);
  });

  // 2) Assinatura — o QZ chama este callback com a string a ser assinada.
  //    Encaminhamos para a Edge Function `sign-qz`, que assina em SHA-512
  //    com a chave privada (QZ_PRIVATE_KEY) e devolve a assinatura em base64.
  qz.security.setSignaturePromise((toSign: string) => (arg) => {
    fetch(SIGN_QZ_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toSign }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`sign-qz respondeu ${res.status}`);
        const json = (await res.json()) as { signature?: string };
        if (!json.signature) throw new Error("Assinatura ausente na resposta do sign-qz.");
        arg.resolve(json.signature);
      })
      .catch((err) => arg.reject(err));
  });
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