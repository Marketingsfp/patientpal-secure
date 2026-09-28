import { useEffect, useRef, useState } from "react";
import { Download, ExternalLink, FilePen, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { mostrarErro } from "@/lib/traduzir-erro";
import { Button } from "@/components/ui/button";

// O bucket cb-informativos é privado: o PDF é aberto por link assinado,
// gerado na hora e válido por 1 hora.
const BUCKET = "cb-informativos";
const VALIDADE_LINK_S = 60 * 60;
const PDF_MAX_BYTES = 20 * 1024 * 1024;

const ehPdf = (file: File) =>
  file.name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf";

/** Envia o PDF do informativo ao storage e devolve o caminho gravado. */
export async function enviarPdfInformativo(clinicaId: string, file: File): Promise<string | null> {
  if (!ehPdf(file)) {
    toast.error("Selecione um arquivo PDF.");
    return null;
  }
  if (file.size > PDF_MAX_BYTES) {
    toast.error("PDF muito grande (máx. 20 MB).");
    return null;
  }
  const nomeLimpo =
    file.name
      .replace(/\.pdf$/i, "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "informativo";
  const path = `${clinicaId}/informativos-pdf/${Date.now()}-${nomeLimpo}.pdf`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "3600",
    contentType: "application/pdf",
    upsert: false,
  });
  if (error) {
    mostrarErro(error, "Não foi possível enviar o PDF");
    return null;
  }
  return path;
}

const nomeDoArquivo = (path: string) =>
  (path.split("/").pop() ?? "informativo.pdf").replace(/^\d+-/, "");

interface Props {
  path: string;
  clinicaId: string;
  onSubstituir: (novoPath: string) => void;
  onEditarComoTexto: () => void;
}

export function InformativoPdfViewer({ path, clinicaId, onSubstituir, onEditarComoTexto }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState("");
  const [urlDownload, setUrlDownload] = useState("");
  const [erro, setErro] = useState(false);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    let ativo = true;
    setUrl("");
    setUrlDownload("");
    setErro(false);
    (async () => {
      const bucket = supabase.storage.from(BUCKET);
      const [ver, baixar] = await Promise.all([
        bucket.createSignedUrl(path, VALIDADE_LINK_S),
        bucket.createSignedUrl(path, VALIDADE_LINK_S, { download: nomeDoArquivo(path) }),
      ]);
      if (!ativo) return;
      if (ver.error || !ver.data?.signedUrl) {
        setErro(true);
        return;
      }
      setUrl(ver.data.signedUrl);
      setUrlDownload(baixar.data?.signedUrl ?? ver.data.signedUrl);
    })();
    return () => {
      ativo = false;
    };
  }, [path]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!urlDownload}
          onClick={() => window.open(urlDownload, "_blank")}
        >
          <Download className="h-4 w-4 mr-1" /> Baixar PDF original
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!url}
          onClick={() => window.open(url, "_blank")}
        >
          <ExternalLink className="h-4 w-4 mr-1" /> Abrir em nova aba
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={enviando}
          onClick={() => inputRef.current?.click()}
        >
          <RefreshCw className="h-4 w-4 mr-1" /> {enviando ? "Enviando…" : "Substituir arquivo"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onEditarComoTexto}>
          <FilePen className="h-4 w-4 mr-1" /> Editar como texto
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,application/pdf"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            setEnviando(true);
            try {
              const novo = await enviarPdfInformativo(clinicaId, file);
              if (novo) {
                onSubstituir(novo);
                toast.success("PDF substituído. Clique em Salvar convênio para gravar.");
              }
            } finally {
              setEnviando(false);
            }
          }}
        />
      </div>
      {erro ? (
        <div className="rounded-md border bg-muted p-6 text-sm text-muted-foreground">
          Não foi possível abrir o PDF salvo. Use "Substituir arquivo" para enviar de novo ou
          "Editar como texto" para voltar ao editor.
        </div>
      ) : url ? (
        <iframe
          src={url}
          title="Informativo do convênio (PDF)"
          className="w-full h-[75vh] rounded-md border bg-muted"
        />
      ) : (
        <div className="h-[75vh] rounded-md border bg-muted animate-pulse" />
      )}
    </div>
  );
}

/** Link assinado para abrir o PDF numa nova aba (usado pelo botão Imprimir). */
export async function abrirPdfInformativo(path: string) {
  // Abre a aba antes do await para o navegador não bloquear como pop-up.
  const aba = window.open("", "_blank");
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, VALIDADE_LINK_S);
  if (error || !data?.signedUrl) {
    aba?.close();
    mostrarErro(error, "Não foi possível abrir o PDF");
    return;
  }
  if (aba) aba.location.href = data.signedUrl;
  else window.open(data.signedUrl, "_blank");
}
