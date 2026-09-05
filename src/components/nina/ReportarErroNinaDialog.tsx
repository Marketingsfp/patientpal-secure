/**
 * Reportar erro da Nina — uso interno (FASE 1).
 *
 * Só registra feedback estruturado. Não altera a Nina, não interrompe a
 * conversa e nunca aparece para o paciente (é uma tela interna do sistema).
 */
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { mostrarErro } from "@/lib/traduzir-erro";
import { CATEGORIAS_FEEDBACK_NINA, type CategoriaFeedbackNina } from "@/lib/nina/feedback-erros";
import { registrarFeedbackErroNina } from "@/lib/nina/feedback-erros.functions";

type Props = {
  clinicaId: string;
  conversaId?: string | null;
  mensagemId?: string | null;
  respostaNina: string;
  perguntaPaciente?: string | null;
  /** Botão discreto dentro da bolha da Nina. */
  className?: string;
};

export function ReportarErroNinaBotao({
  clinicaId,
  conversaId,
  mensagemId,
  respostaNina,
  perguntaPaciente,
  className,
}: Props) {
  const [aberto, setAberto] = useState(false);
  const [categoria, setCategoria] = useState<CategoriaFeedbackNina | "">("");
  const [correcao, setCorrecao] = useState("");
  const [observacao, setObservacao] = useState("");
  const [salvando, setSalvando] = useState(false);
  const registrar = useServerFn(registrarFeedbackErroNina);

  const enviar = async () => {
    if (!categoria) {
      toast.error("Escolha o que estava errado.");
      return;
    }
    if (correcao.trim().length < 3) {
      toast.error("Descreva qual seria a informação correta.");
      return;
    }
    setSalvando(true);
    try {
      await registrar({
        data: {
          clinicaId,
          conversaId: conversaId ?? null,
          mensagemId: mensagemId ?? null,
          mensagemTexto: respostaNina?.slice(0, 8000) ?? null,
          perguntaTexto: perguntaPaciente?.slice(0, 8000) ?? null,
          categoria,
          correcao: correcao.trim(),
          observacao: observacao.trim() || null,
        },
      });
      toast.success("Erro reportado. A conversa segue normalmente.");
      setAberto(false);
      setCategoria("");
      setCorrecao("");
      setObservacao("");
    } catch (e) {
      mostrarErro(e);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <>
      <button
        type="button"
        title="Reportar resposta incorreta"
        aria-label="Reportar erro da Nina"
        className={
          className ??
          "mt-1 inline-flex items-center gap-1 rounded px-1 py-0.5 text-[11px] opacity-70 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        }
        onClick={(e) => {
          e.stopPropagation();
          setAberto(true);
        }}
      >
        <AlertTriangle className="h-3 w-3" aria-hidden="true" />
        Reportar erro
      </button>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Reportar erro da Nina</DialogTitle>
            <DialogDescription>
              Uso interno. O paciente não vê este registro e a conversa continua normalmente.
              Nesta etapa o envio apenas registra o feedback — nada muda na Nina automaticamente.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            <div>
              <Label className="text-xs text-muted-foreground">Pergunta do paciente</Label>
              <div className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-2 text-xs">
                {perguntaPaciente?.trim() || "—"}
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Resposta da Nina</Label>
              <div className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-2 text-xs">
                {respostaNina?.trim() || "—"}
              </div>
            </div>

            <div>
              <Label htmlFor="fb-categoria">O que estava errado?</Label>
              <Select
                value={categoria}
                onValueChange={(v) => setCategoria(v as CategoriaFeedbackNina)}
              >
                <SelectTrigger id="fb-categoria" className="mt-1">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIAS_FEEDBACK_NINA.map((c) => (
                    <SelectItem key={c.valor} value={c.valor}>
                      {c.rotulo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="fb-correcao">Qual seria a informação correta?</Label>
              <Textarea
                id="fb-correcao"
                rows={3}
                className="mt-1"
                value={correcao}
                onChange={(e) => setCorrecao(e.target.value)}
                placeholder="Ex.: o valor do exame é R$ 120,00 à vista."
              />
            </div>

            <div>
              <Label htmlFor="fb-obs">Observação interna (opcional)</Label>
              <Textarea
                id="fb-obs"
                rows={2}
                className="mt-1"
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                placeholder="Contexto para quem for revisar."
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(false)} disabled={salvando}>
              Cancelar
            </Button>
            <Button onClick={enviar} disabled={salvando}>
              {salvando ? "Registrando…" : "Registrar erro"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
