import { Award, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDuracao } from "@/lib/coach/study-time";

export type DadosCertificado = {
  atendente: string;
  clinica: string;
  segundosTotal: number;
  dias: number;
  conversas: number;
  ligacoes: number;
  mediaProva: number;
  mediaRoleplay: number;
};

/**
 * Nota final da trilha: prova (40%), roleplays (40%) e dedicação (20%).
 * A dedicação considera 1h de plataforma e 3 dias de constância como 100%.
 */
export function notaFinal(d: DadosCertificado): number {
  const tempo = Math.min(1, d.segundosTotal / 3600);
  const constancia = Math.min(1, d.dias / 3);
  const dedicacao = (tempo * 0.6 + constancia * 0.4) * 10;
  const nota = d.mediaProva * 0.4 + d.mediaRoleplay * 0.4 + dedicacao * 0.2;
  return Math.round(Math.min(10, Math.max(0, nota)) * 10) / 10;
}

function codigo(atendente: string) {
  const base = `${atendente}-${new Date().toISOString().slice(0, 10)}`;
  let h = 0;
  for (let i = 0; i < base.length; i++) h = (h * 31 + base.charCodeAt(i)) >>> 0;
  return h.toString(36).toUpperCase().padStart(7, "0").slice(0, 7);
}

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);

/** Abre uma janela de impressão com o certificado de conclusão da trilha. */
export function imprimirCertificado(d: DadosCertificado) {
  const nota = notaFinal(d);
  const emitido = new Date().toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8" />
<title>Certificado — ${esc(d.atendente)}</title>
<style>
  @page { size: A4 landscape; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Georgia, "Times New Roman", serif; color: #10231b; }
  .folha { width: 297mm; height: 209mm; padding: 14mm; display: flex; }
  .moldura { flex: 1; border: 2px solid #0f766e; border-radius: 6mm; padding: 12mm 16mm;
    display: flex; flex-direction: column; position: relative;
    background: linear-gradient(160deg, #ffffff 0%, #f3fbf7 100%); }
  .moldura:before { content: ""; position: absolute; inset: 4mm; border: 1px solid #b6e3d4; border-radius: 4mm; }
  .topo { display: flex; align-items: center; gap: 4mm; }
  .selo { width: 14mm; height: 14mm; border-radius: 50%; background: #0f766e; color: #fff;
    display: flex; align-items: center; justify-content: center; font-size: 6mm; font-weight: bold; font-family: Arial, sans-serif; }
  .marca { font-family: Arial, sans-serif; }
  .marca b { display: block; font-size: 4.2mm; letter-spacing: .3mm; }
  .marca span { font-size: 2.9mm; color: #4b6a5f; text-transform: uppercase; letter-spacing: .9mm; }
  h1 { font-size: 11mm; margin: 10mm 0 0; letter-spacing: .6mm; }
  .sub { font-family: Arial, sans-serif; font-size: 3.4mm; color: #4b6a5f; text-transform: uppercase; letter-spacing: 1.6mm; }
  .nome { font-size: 14mm; margin: 6mm 0 2mm; color: #0f766e; }
  .texto { font-size: 4.4mm; line-height: 1.6; max-width: 200mm; }
  .grid { margin-top: auto; display: grid; grid-template-columns: repeat(5, 1fr); gap: 4mm;
    font-family: Arial, sans-serif; border-top: 1px solid #cfe8de; padding-top: 6mm; }
  .grid div span { display: block; font-size: 2.8mm; color: #6b8a7f; text-transform: uppercase; letter-spacing: .5mm; }
  .grid div b { font-size: 5mm; color: #10231b; }
  .rodape { margin-top: 8mm; display: flex; justify-content: space-between; align-items: flex-end;
    font-family: Arial, sans-serif; font-size: 3mm; color: #6b8a7f; }
  .assinatura { text-align: center; }
  .assinatura i { display: block; width: 60mm; border-top: 1px solid #10231b; margin-bottom: 1.5mm; }
</style></head>
<body><div class="folha"><div class="moldura">
  <div class="topo">
    <div class="selo">✓</div>
    <div class="marca"><b>Coach WhatsApp</b><span>Conversão em agendamento</span></div>
  </div>
  <p class="sub" style="margin-top:9mm">Certificado de conclusão</p>
  <h1 style="margin:2mm 0 0;font-size:8mm">Trilha de Conversão em Agendamento</h1>
  <p class="nome">${esc(d.atendente)}</p>
  <p class="texto">
    concluiu integralmente a trilha de treinamento em conversão de agendamentos da
    <b>${esc(d.clinica)}</b>, cumprindo ${d.conversas} conversas de WhatsApp,
    ${d.ligacoes} treinos de ligação, a prova de conversão e
    ${esc(formatDuracao(d.segundosTotal))} de estudo na plataforma.
  </p>
  <div class="grid">
    <div><span>Nota final</span><b>${nota.toFixed(1)}</b></div>
    <div><span>Prova</span><b>${d.mediaProva.toFixed(1)}</b></div>
    <div><span>Atendimentos</span><b>${d.mediaRoleplay.toFixed(1)}</b></div>
    <div><span>Tempo de estudo</span><b>${esc(formatDuracao(d.segundosTotal))}</b></div>
    <div><span>Dias de estudo</span><b>${d.dias}</b></div>
  </div>
  <div class="rodape">
    <div>Emitido em ${esc(emitido)} · Código de validação ${codigo(d.atendente)}</div>
    <div class="assinatura"><i></i>Coordenação de Atendimento</div>
  </div>
</div></div>
<script>window.onload = function(){ window.focus(); window.print(); };</script>
</body></html>`;

  const w = window.open("", "_blank", "width=1200,height=850");
  if (!w) {
    alert("Permita janelas pop-up para emitir o certificado.");
    return;
  }
  w.document.write(html);
  w.document.close();
}

export function BotaoCertificado({ dados }: { dados: DadosCertificado }) {
  const nota = notaFinal(dados);
  return (
    <div className="rounded-2xl border bg-[color:var(--success)]/5 border-[color:var(--success)]/30 p-5 flex flex-col sm:flex-row sm:items-center gap-4">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[color:var(--success)]/15 text-[color:var(--success)]">
        <Award className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">Trilha concluída — certificado disponível</p>
        <p className="text-sm text-muted-foreground">
          Sua nota final é <strong>{nota.toFixed(1)}</strong> (prova 40%, atendimentos 40%,
          dedicação 20%).
        </p>
      </div>
      <Button className="rounded-full shrink-0" onClick={() => imprimirCertificado(dados)}>
        <Download className="h-4 w-4 mr-1.5" /> Emitir certificado
      </Button>
    </div>
  );
}
