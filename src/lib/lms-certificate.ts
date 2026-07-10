import jsPDF from "jspdf";
import QRCode from "qrcode";

export async function gerarCertificadoPDF(opts: {
  nomeAluno: string;
  curso: string;
  cargaHorariaMin: number;
  clinicaNome: string;
  codigoVerificacao: string;
  emitidoEm: Date;
}) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const W = 297;
  const H = 210;

  // moldura
  doc.setDrawColor(30, 58, 138);
  doc.setLineWidth(2);
  doc.rect(10, 10, W - 20, H - 20);
  doc.setLineWidth(0.4);
  doc.rect(14, 14, W - 28, H - 28);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(34);
  doc.setTextColor(30, 58, 138);
  doc.text("CERTIFICADO", W / 2, 45, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(14);
  doc.setTextColor(60, 60, 60);
  doc.text("Certificamos que", W / 2, 70, { align: "center" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  doc.setTextColor(20, 20, 20);
  doc.text(opts.nomeAluno, W / 2, 88, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(13);
  doc.setTextColor(60, 60, 60);
  const txt = `concluiu com aproveitamento o curso "${opts.curso}", com carga horária de ${Math.max(1, Math.round(opts.cargaHorariaMin / 60))}h, oferecido por ${opts.clinicaNome}.`;
  const lines = doc.splitTextToSize(txt, W - 80);
  doc.text(lines, W / 2, 108, { align: "center" });

  doc.setFontSize(11);
  doc.text(`Emitido em ${opts.emitidoEm.toLocaleDateString("pt-BR")}`, W / 2, 150, { align: "center" });

  // QR
  const verifyUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/verificar/${opts.codigoVerificacao}`;
  const qrData = await QRCode.toDataURL(verifyUrl, { margin: 0, width: 200 });
  doc.addImage(qrData, "PNG", W - 50, H - 55, 30, 30);
  doc.setFontSize(8);
  doc.text(`Código: ${opts.codigoVerificacao}`, W - 35, H - 20, { align: "center" });

  doc.save(`certificado-${opts.codigoVerificacao}.pdf`);
}