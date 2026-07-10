import { createFileRoute, useParams } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import { Check, Eraser } from "lucide-react";

export const Route = createFileRoute("/p/contrato/$token")({
  component: AssinarContrato,
  head: () => ({
    meta: [
      { title: "Assinar contrato — ClinicaOS" },
      { name: "description", content: "Leia e assine seu contrato digital de forma segura." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

function AssinarContrato() {
  const { token } = useParams({ from: "/p/contrato/$token" });
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.rpc("contrato_publico", { _token: token });
      if (error) mostrarErro(error);
      setData(data);
      setLoading(false);
    })();
  }, [token]);

  const getPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current!; const r = c.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) };
  };
  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    drawing.current = true;
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = getPos(e);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.strokeStyle = "#111";
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = getPos(e); ctx.lineTo(x, y); ctx.stroke();
  };
  const end = () => { drawing.current = false; };
  const limpar = () => {
    const c = canvasRef.current!; c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
  };

  const assinar = async () => {
    const c = canvasRef.current!;
    const empty = !c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data.some((v, i) => i % 4 === 3 && v > 0);
    if (empty) return toast.error("Por favor, desenhe sua assinatura");
    setSaving(true);
    const dataUrl = c.toDataURL("image/png");
    let ip = "";
    try { ip = (await (await fetch("https://api.ipify.org?format=json")).json()).ip; } catch {}
    const { error } = await supabase.rpc("assinar_contrato_publico", { _token: token, _assinatura_svg: dataUrl, _ip: ip });
    setSaving(false);
    if (error) return mostrarErro(error);
    toast.success("Contrato assinado com sucesso!");
    const { data: novo } = await supabase.rpc("contrato_publico", { _token: token });
    setData(novo);
  };

  if (loading) return <div className="p-6 text-center">Carregando…</div>;
  if (!data) return <div className="p-6 text-center text-destructive">Contrato não encontrado</div>;

  const c = data.contrato;
  const assinado = !!c.assinado_em;

  return (
    <div className="min-h-screen bg-muted/30 p-4">
      <div className="max-w-3xl mx-auto bg-card rounded-lg border shadow-sm p-6 space-y-4">
        <div>
          <div className="text-xs text-muted-foreground">{c.clinica_nome}</div>
          <h1 className="text-xl font-bold">Contrato Nº {c.numero} — {c.plano_nome}</h1>
          <div className="text-sm text-muted-foreground">Titular: <strong>{c.paciente_nome}</strong></div>
        </div>
        <div className="rounded-md border bg-muted/30 p-3 max-h-80 overflow-auto whitespace-pre-wrap text-sm">
          {c.template_contrato ?? c.descricao_beneficios ?? "Termo de adesão"}
        </div>
        {data.dependentes?.length > 0 ? (
          <div className="text-sm">
            <strong>Dependentes/Agregados:</strong>
            <ul className="list-disc ml-5">{data.dependentes.map((d: any) => <li key={d.id}>{d.paciente_nome} — {d.parentesco ?? "—"} ({d.tipo})</li>)}</ul>
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-md border p-2"><div className="text-muted-foreground text-xs">Mensalidade</div><div className="font-bold">R$ {Number(c.valor_mensal).toFixed(2)}</div></div>
          <div className="rounded-md border p-2"><div className="text-muted-foreground text-xs">Parcelas</div><div className="font-bold">{c.num_parcelas}x</div></div>
        </div>

        {assinado ? (
          <div className="rounded-md border-2 border-green-500 bg-green-50 p-4 text-center">
            <Check className="h-8 w-8 text-green-600 mx-auto"/>
            <div className="font-semibold text-green-800">Contrato assinado em {new Date(c.assinado_em).toLocaleString("pt-BR")}</div>
            {c.assinatura_svg ? <img src={c.assinatura_svg} alt="Assinatura digital do contratante" className="h-20 mx-auto mt-2"/> : null}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-sm font-medium">Assine no quadro abaixo:</div>
            <canvas ref={canvasRef} width={600} height={200} className="border-2 border-dashed rounded-md w-full bg-white touch-none"
              onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerLeave={end}/>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={limpar}><Eraser className="h-4 w-4 mr-1"/>Limpar</Button>
              <Button size="sm" onClick={assinar} disabled={saving}><Check className="h-4 w-4 mr-1"/>Confirmar assinatura</Button>
            </div>
            <p className="text-xs text-muted-foreground">Ao assinar, declaro que li e concordo com o contrato. Assinatura registrada com data/hora e IP (Lei 14.063/2020).</p>
          </div>
        )}
      </div>
    </div>
  );
}