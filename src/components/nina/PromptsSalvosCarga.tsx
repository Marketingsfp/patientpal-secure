import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { History, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { listarPromptsCarga } from "@/lib/nina/carga-prompts.functions";
import {
  juntarPromptsCarga,
  PROMPTS_POR_PAGINA,
  type PromptCargaSalvo,
} from "@/lib/nina/carga-prompts";

export function PromptsSalvosCarga({
  clinicaId,
  disabled,
  onUsar,
}: {
  clinicaId: string;
  disabled: boolean;
  onUsar: (pedido: string) => void;
}) {
  const listar = useServerFn(listarPromptsCarga);
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [offset, setOffset] = useState(0);
  const [prompts, setPrompts] = useState<PromptCargaSalvo[]>([]);
  const [temMais, setTemMais] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState(false);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    if (!aberto) return;
    let vigente = true;
    setCarregando(true);
    setErro(false);
    if (offset === 0) setPrompts([]);
    const timer = setTimeout(
      () => {
        void listar({ data: { clinicaId, busca, offset } })
          .then((pagina) => {
            if (!vigente) return;
            setPrompts((atuais) =>
              offset === 0 ? pagina.prompts : juntarPromptsCarga(atuais, pagina.prompts),
            );
            setTemMais(pagina.temMais);
          })
          .catch(() => {
            if (vigente) setErro(true);
          })
          .finally(() => {
            if (vigente) setCarregando(false);
          });
      },
      busca ? 250 : 0,
    );
    return () => {
      vigente = false;
      clearTimeout(timer);
    };
  }, [aberto, busca, clinicaId, listar, offset, tentativa]);

  return (
    <Dialog
      open={aberto}
      onOpenChange={(valor) => {
        if (valor && disabled) return;
        if (valor) {
          setBusca("");
          setOffset(0);
          setPrompts([]);
        }
        setAberto(valor);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" disabled={disabled}>
          <History className="mr-2 h-4 w-4" /> Meus prompts
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Meus prompts de simulação</DialogTitle>
          <DialogDescription>
            Seus pedidos ao Sol nesta clínica. Escolha um para revisar ou editar antes de gerar
            novamente.
          </DialogDescription>
        </DialogHeader>
        <Input
          aria-label="Buscar nos meus prompts"
          placeholder="Buscar nos meus prompts…"
          value={busca}
          maxLength={120}
          onChange={(e) => {
            setBusca(e.target.value);
            setOffset(0);
          }}
        />
        <div className="max-h-[50dvh] space-y-3 overflow-y-auto pr-1" aria-busy={carregando}>
          {prompts.map((p) => (
            <div key={p.id} className="space-y-3 rounded-lg border p-3">
              <p className="line-clamp-4 whitespace-pre-wrap break-words text-sm">{p.pedido}</p>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  Usado em {new Date(p.ultimo_usado_em).toLocaleDateString("pt-BR")}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={disabled || carregando}
                  onClick={() => {
                    onUsar(p.pedido);
                    setAberto(false);
                  }}
                >
                  Usar prompt
                </Button>
              </div>
            </div>
          ))}
          {carregando && (
            <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando prompts…
            </p>
          )}
          {erro && (
            <div role="alert" className="space-y-2 text-sm">
              <p>Não foi possível carregar seus prompts. Tente novamente.</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setTentativa((t) => t + 1)}
              >
                Tentar novamente
              </Button>
            </div>
          )}
          {!erro && !carregando && !prompts.length && (
            <p className="py-3 text-sm text-muted-foreground">
              {busca
                ? "Nenhum prompt encontrado para essa busca."
                : "Seus prompts aparecerão aqui quando você usar “Gerar cenários com Sol”."}
            </p>
          )}
          {temMais && !erro && !carregando && (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => setOffset((atual) => atual + PROMPTS_POR_PAGINA)}
            >
              Carregar mais
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
