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
// Importante: o certificado `root-ca` exibido no diagnóstico local do QZ Tray
// é usado pelo navegador para confiar no websocket local do QZ, não para
// assinar comandos de impressão. Configurar esse root-ca como certificado do
// app com assinatura vazia faz o QZ recusar a operação em produção.
//
// Sem o par oficial `digital-certificate.txt` + `private-key.pem`, a opção
// funcional é manter o QZ sem assinatura e deixar o operador autorizar pelo
// popup local do QZ Tray.

export async function imprimirDocumentoSilencioso(pdfBase64: string): Promise<void> {
  if (!pdfBase64 || typeof pdfBase64 !== "string") {
    throw new Error("PDF em base64 não informado para impressão.");
  }

  // Remove eventual prefixo data URL, garantindo apenas o base64 puro.
  const base64Limpo = pdfBase64.replace(/^data:application\/pdf;base64,/, "").trim();

  try {
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