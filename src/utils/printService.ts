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

let qzSecurityConfigured = false;
function configurarSeguranca() {
  if (qzSecurityConfigured) return;
  qzSecurityConfigured = true;

  // TEMPORÁRIO: as chamadas setCertificatePromise/setSignaturePromise foram
  // desativadas porque o QZ Tray recusa o certificado com "Invalid
  // Certificate" e desabilita o botão Allow no diálogo. Sem esses callbacks,
  // a requisição volta a ser anônima — o operador do totem consegue clicar
  // manualmente em "Allow" e a impressão prossegue. Reativar quando o par
  // certificado/chave for regerado e validado pelo QZ Tray.
  //
  // qz.security.setSignatureAlgorithm?.("SHA512");
  // qz.security.setCertificatePromise((arg) => { arg.resolve(QZ_PUBLIC_CERT); });
  // qz.security.setSignaturePromise((toSign: string) => (resolve, reject) => {
  //   supabase.functions.invoke("sign-qz", { body: { toSign } })
  //     .then(({ data, error }) => {
  //       if (error) { reject(error); return; }
  //       const signature = typeof data === "string"
  //         ? data
  //         : (data as { signature?: string } | null)?.signature;
  //       if (!signature) { reject(new Error("Assinatura ausente na resposta do sign-qz.")); return; }
  //       resolve(signature);
  //     })
  //     .catch(reject);
  // });
  void QZ_PUBLIC_CERT;
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