import { createFileRoute, useParams } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { comprimirImagem } from "@/lib/odonto-imagens";
import {
  consultarFotoCelular,
  enviarFotoCelular,
  type RespostaFotoCelular,
} from "@/lib/orcamentos/foto-celular.functions";

export const Route = createFileRoute("/p/pedido/$token")({
  component: FotoPedidoCelular,
  head: () => ({
    meta: [{ title: "Foto do pedido médico" }, { name: "robots", content: "noindex, nofollow" }],
  }),
});

type Etapa = "conferindo" | "pronto" | "enviando" | "enviado" | "expirado";

const MENSAGEM_ERRO: Record<Exclude<RespostaFotoCelular, { ok: true }>["motivo"], string> = {
  expirado: "Este QR code venceu. Gere outro no computador.",
  ja_enviado: "Este pedido já foi enviado. Confira no computador.",
  ocupado: "Ainda estamos lendo a foto anterior. Aguarde um instante.",
  receita_remedio: "A foto parece ser uma receita de remédios, não um pedido de exames.",
  outro: "A foto não parece ser um pedido médico. Tente de novo.",
  ilegivel: "Não deu para ler com segurança. Tire outra foto com boa luz e o papel inteiro.",
  falha_tecnica: "A leitura não está disponível agora. Tente de novo em instantes.",
};

/** Página aberta pelo QR code do "Novo orçamento": o celular só tira e envia a foto. */
function FotoPedidoCelular() {
  const { token } = useParams({ from: "/p/pedido/$token" });
  const consultar = useServerFn(consultarFotoCelular);
  const enviar = useServerFn(enviarFotoCelular);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [etapa, setEtapa] = useState<Etapa>("conferindo");
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    consultar({ data: { token } })
      .then((s) =>
        setEtapa(s === "aguardando" ? "pronto" : s === "enviado" ? "enviado" : "expirado"),
      )
      .catch(() => setEtapa("expirado"));
  }, [token, consultar]);

  const enviarFoto = async (arquivo: File) => {
    setErro(null);
    setEtapa("enviando");
    try {
      const { blob, mime } = await comprimirImagem(arquivo);
      if (!/^image\/(jpeg|png|webp)$/i.test(mime) || blob.size > 8_000_000) {
        setErro("Não foi possível usar esta foto. Tire outra.");
        return setEtapa("pronto");
      }
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const leitor = new FileReader();
        leitor.onload = () =>
          resolve(String(leitor.result).replace(/^data:[^;]*;/, `data:${mime};`));
        leitor.onerror = () => reject(leitor.error);
        leitor.readAsDataURL(blob);
      });
      const r = await enviar({ data: { token, arquivo: dataUrl } });
      if (r.ok) return setEtapa("enviado");
      setErro(MENSAGEM_ERRO[r.motivo]);
      setEtapa(
        r.motivo === "expirado" ? "expirado" : r.motivo === "ja_enviado" ? "enviado" : "pronto",
      );
    } catch {
      setErro("Falha de conexão. Confira a internet e tente de novo.");
      setEtapa("pronto");
    }
  };

  return (
    <div className="min-h-dvh bg-background text-foreground flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-5 text-center">
        <h1 className="text-xl font-semibold">Foto do pedido médico</h1>

        {etapa === "conferindo" && (
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
        )}

        {(etapa === "pronto" || etapa === "enviando") && (
          <>
            <p className="text-sm text-muted-foreground">
              Fotografe o pedido inteiro, com boa luz e sem cortar as bordas. O pedido aparece
              sozinho no orçamento aberto no computador.
            </p>
            {erro && (
              <p className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-left text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                {erro}
              </p>
            )}
            <Button
              type="button"
              size="lg"
              className="h-16 w-full gap-2 text-lg"
              disabled={etapa === "enviando"}
              onClick={() => cameraRef.current?.click()}
            >
              {etapa === "enviando" ? (
                <>
                  <Loader2 className="h-6 w-6 animate-spin" /> Lendo o pedido…
                </>
              ) : (
                <>
                  <Camera className="h-6 w-6" /> Tirar foto
                </>
              )}
            </Button>
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const arquivo = e.target.files?.[0];
                e.target.value = "";
                if (arquivo) void enviarFoto(arquivo);
              }}
            />
          </>
        )}

        {etapa === "enviado" && (
          <div className="space-y-2">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
            <p className="font-medium">Pedido enviado!</p>
            <p className="text-sm text-muted-foreground">
              Confira os dados no computador. Pode fechar esta página.
            </p>
          </div>
        )}

        {etapa === "expirado" && (
          <div className="space-y-2">
            <AlertTriangle className="mx-auto h-10 w-10 text-amber-600" />
            <p className="text-sm text-muted-foreground">
              {erro ?? "Este QR code venceu ou não é válido. Gere outro no computador."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
