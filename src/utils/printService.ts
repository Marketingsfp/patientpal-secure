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

// ---------------------------------------------------------------------------
// Estado compartilhado entre impressões (totem: uma senha atrás da outra).
//
// Cada chamada à API do QZ é assinada por uma server function (round-trip ao
// backend), e `qz.websocket.connect()` varre wss://localhost:8181/8282/8383/
// 8484 + hosts alternativos antes de desistir. Reconectar/redescobrir a
// impressora a cada senha custava vários segundos com o papel já saindo — por
// isso o socket e o nome da impressora ficam vivos entre os trabalhos, e o
// aquecimento acontece fora do caminho crítico (ver `prepararImpressao`).
// ---------------------------------------------------------------------------

let impressoraPadraoPromise: Promise<string> | null = null;

// Quando o QZ Tray não está instalado/rodando, a varredura de portas leva
// segundos para falhar. Guardamos a indisponibilidade por um tempo para que as
// próximas senhas caiam direto no fallback por iframe, sem repetir a varredura.
const QZ_INDISPONIVEL_MS = 60_000;
let qzIndisponivelAte = 0;

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

/** Abre o websocket do QZ Tray, reaproveitando a conexão já ativa. */
async function garantirConexao(): Promise<void> {
  if (Date.now() < qzIndisponivelAte) {
    throw new Error("QZ Tray indisponível (verificado há pouco).");
  }
  // Registra certificado e assinatura antes de conectar.
  configurarQzUmaVez();
  if (qz.websocket.isActive()) return;
  try {
    await qz.websocket.connect();
  } catch (e) {
    qzIndisponivelAte = Date.now() + QZ_INDISPONIVEL_MS;
    throw e;
  }
}

/** Nome da impressora padrão, resolvido uma vez e reaproveitado. */
function obterImpressoraPadrao(): Promise<string> {
  if (!impressoraPadraoPromise) {
    impressoraPadraoPromise = (async () => {
      const impressora = await qz.printers.getDefault();
      if (!impressora) {
        throw new Error("Nenhuma impressora padrão configurada no sistema.");
      }
      return impressora;
    })().catch((e) => {
      impressoraPadraoPromise = null; // não cacheia falha
      throw e;
    });
  }
  return impressoraPadraoPromise;
}

/** Derruba o estado do QZ para que a próxima tentativa comece limpa. */
function descartarConexao(): void {
  impressoraPadraoPromise = null;
  try {
    if (qz.websocket.isActive()) void qz.websocket.disconnect();
  } catch {
    // Silencia falhas de disconnect — a impressão já foi tentada.
  }
}

/**
 * Aquecimento: conecta o websocket e resolve a impressora padrão antes de o
 * paciente pedir a senha, para que a impressão em si só faça o `qz.print`.
 * Nunca lança — se o QZ Tray não estiver disponível, a impressão cai no
 * fallback por diálogo do navegador normalmente.
 */
export async function prepararImpressao(): Promise<boolean> {
  try {
    await garantirConexao();
    await obterImpressoraPadrao();
    return true;
  } catch {
    return false;
  }
}

export async function imprimirDocumentoSilencioso(pdfBase64: string): Promise<void> {
  if (!pdfBase64 || typeof pdfBase64 !== "string") {
    throw new Error("PDF em base64 não informado para impressão.");
  }

  // Remove eventual prefixo data URL, garantindo apenas o base64 puro.
  const base64Limpo = pdfBase64.replace(/^data:application\/pdf;base64,/, "").trim();

  try {
    // 1) Websocket ativo (normalmente já aberto pelo aquecimento).
    await garantirConexao();

    // 2) Impressora padrão (normalmente já em cache).
    const impressora = await obterImpressoraPadrao();

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

    // 5) Envia à impressora. O socket fica aberto para a próxima senha —
    //    desconectar aqui só adiava o fim do "Imprimindo…" na tela.
    await qz.print(config, data);
  } catch (e) {
    descartarConexao();
    throw e;
  }
}