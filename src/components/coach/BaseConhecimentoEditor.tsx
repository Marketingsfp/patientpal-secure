/**
 * Bloco da gestora para a base de conhecimento do Coach.
 *
 * A base em si não é editável: ela vem do próprio sistema (procedimentos,
 * catálogo publicado, profissionais, unidades) e é atualizada sozinha quando
 * passa de 24 horas. O que a gestora controla é o COMPLEMENTO — informação
 * que ainda não está cadastrada em lugar nenhum — e o botão para forçar a
 * releitura logo depois de mexer no cadastro.
 */
import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Database, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function BaseConhecimentoEditor({
  tamanho,
  geradaEm,
  complemento,
  gerando,
  erro,
  onAtualizar,
  onComplemento,
}: {
  tamanho: number;
  geradaEm: Date | null;
  complemento: string;
  gerando: boolean;
  erro: string | null;
  onAtualizar: () => void;
  onComplemento: (texto: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(complemento);
  useEffect(() => setDraft(complemento), [complemento]);

  const quando = geradaEm
    ? geradaEm.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
    : "ainda não gerada";

  return (
    <div className="mb-5 rounded-lg border bg-secondary/30">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium"
      >
        <Database className="h-4 w-4 text-muted-foreground" />
        Base de conhecimento da clínica
        <span className="ml-auto text-xs font-normal text-muted-foreground">
          {gerando
            ? "atualizando…"
            : `${tamanho.toLocaleString("pt-BR")} caracteres · ${quando}`}
        </span>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {open && (
        <div className="space-y-3 border-t px-4 py-4">
          <p className="text-xs text-muted-foreground">
            Os serviços, valores, profissionais, horários e endereços vêm direto do cadastro do
            sistema e se atualizam sozinhos a cada 24 horas. Use o botão abaixo logo após mexer no
            cadastro para valer na hora.
          </p>
          <div className="flex items-center gap-3">
            <Button type="button" variant="outline" size="sm" onClick={onAtualizar} disabled={gerando}>
              {gerando ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Atualizar do sistema
            </Button>
            {erro && <span className="text-xs text-destructive">{erro}</span>}
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Complemento (opcional)
            </label>
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => {
                if (draft !== complemento) onComplemento(draft);
              }}
              placeholder="Informações que ainda não estão no cadastro: campanhas, avisos, combinados internos…"
              className="min-h-[120px] bg-background text-sm"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Esse texto é anexado ao final da base enviada à IA.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
