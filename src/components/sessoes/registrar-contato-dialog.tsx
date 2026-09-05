/**
 * Registrar contato da busca ativa.
 *
 * Um desfecho de lista curta e uma observação opcional. Não pede mais nada de
 * propósito: o valor deste botão é a recepção conseguir anotar entre uma
 * ligação e outra, e todo campo a mais é uma ligação que não foi feita.
 *
 * O que ele NÃO faz: não cancela pacote, não gera cobrança e não tira a linha
 * do relatório, nem quando o desfecho é "Paciente desistiu". Encerrar
 * tratamento é ato de quem tem alçada — ver o comentário da migration
 * `20260905190000_busca_ativa_contatos.sql`.
 */
import { useEffect, useState } from "react";
import { Loader2, PhoneCall } from "lucide-react";
import { toast } from "sonner";
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
import { registrarContato } from "@/lib/sessoes/carregar-contatos";
import {
  RESULTADOS_CONTATO,
  ROTULO_RESULTADO,
  type ResultadoContato,
} from "@/lib/sessoes/busca-ativa-contatos";

export interface AlvoDoContato {
  pacienteId: string;
  pacienteNome: string;
  origem: "pacote" | "ciclo";
  procedimento: string;
}

interface Props {
  alvo: AlvoDoContato | null;
  clinicaId: string;
  onFechar: () => void;
  /** Chamado depois de gravar, para a tela recarregar a coluna de contatos. */
  onRegistrado: () => void;
}

export function RegistrarContatoDialog({ alvo, clinicaId, onFechar, onRegistrado }: Props) {
  const [resultado, setResultado] = useState<ResultadoContato>("reagendado");
  const [observacao, setObservacao] = useState("");
  const [salvando, setSalvando] = useState(false);

  // Cada paciente começa com o formulário limpo: manter a observação do
  // anterior faria a recepção gravar o recado de um no histórico do outro.
  useEffect(() => {
    if (!alvo) return;
    setResultado("reagendado");
    setObservacao("");
  }, [alvo?.pacienteId]);

  const salvar = async () => {
    if (!alvo || salvando) return;
    setSalvando(true);
    try {
      await registrarContato({
        clinicaId,
        pacienteId: alvo.pacienteId,
        origem: alvo.origem,
        procedimento: alvo.procedimento,
        resultado,
        observacao,
      });
      toast.success("Contato registrado.");
      onRegistrado();
      onFechar();
    } catch (e) {
      mostrarErro(e, "Não foi possível registrar o contato.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={!!alvo} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PhoneCall className="h-4 w-4 text-primary" />
            Registrar contato
          </DialogTitle>
          <DialogDescription>
            {alvo?.pacienteNome} — fica no histórico do paciente com o seu nome e a data.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-600">O que aconteceu</Label>
            <Select
              value={resultado}
              onValueChange={(v) => setResultado(v as ResultadoContato)}
              disabled={salvando}
            >
              <SelectTrigger className="h-10 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RESULTADOS_CONTATO.map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROTULO_RESULTADO[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-600">
              Observação <span className="font-normal text-slate-400">(opcional)</span>
            </Label>
            <Textarea
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Ex.: pediu para ligar depois das 17h; filha atendeu e vai avisar."
              rows={3}
              maxLength={1000}
              disabled={salvando}
            />
          </div>

          {/* Aviso explícito: já houve confusão entre "anotar" e "resolver". */}
          {resultado === "desistiu" && (
            <p className="rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
              A anotação fica registrada, mas o paciente <strong>continua na lista</strong> e o
              pacote não é encerrado. Encerrar tratamento é feito no cadastro do pacote, por quem
              tem essa alçada.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={salvando}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={salvando}>
            {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Registrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
