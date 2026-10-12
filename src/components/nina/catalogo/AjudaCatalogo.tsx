import type { ReactNode } from "react";
import { CircleHelp } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  AJUDA_CATALOGO,
  preservadoNaSincronizacao,
  type ChaveAjudaCatalogo,
} from "@/lib/nina/catalogo-ajuda";
import { useCatalogoOrganizado, useItemEstruturado } from "./catalogo-organizado";

/** Botão “Como ler”: explica o que a opção muda no atendimento da Nina. */
export function ComoLer({ chave }: { chave: ChaveAjudaCatalogo }) {
  const ativo = useCatalogoOrganizado();
  const estruturado = useItemEstruturado();
  if (!ativo) return null;
  const ajuda = AJUDA_CATALOGO[chave];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Como ler: ${ajuda.titulo}`}
        >
          <CircleHelp className="h-3.5 w-3.5" aria-hidden="true" />
          Como ler
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(22rem,calc(100vw-2rem))] space-y-2 text-sm">
        <p className="font-semibold">{ajuda.titulo}</p>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Na Nina
          </p>
          <p>{ajuda.efeito}</p>
        </div>
        {"atencao" in ajuda && ajuda.atencao && (
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Atenção
            </p>
            <p>{ajuda.atencao}</p>
          </div>
        )}
        <p className="border-t pt-2 text-xs text-muted-foreground">
          {estruturado
            ? "Neste item estruturado, “Sincronizar com Clínica OS” atualiza só nome, quem realiza, horários e preços; as regras da equipe ficam."
            : preservadoNaSincronizacao(chave)
              ? "“Sincronizar com Clínica OS” preserva esta opção."
              : "“Sincronizar com Clínica OS” substitui esta opção pelo dado da origem (ou a deixa em branco)."}
        </p>
      </PopoverContent>
    </Popover>
  );
}

/** Rótulo do campo com o botão “Como ler” ao lado (quando a flag está ligada). */
export function RotuloAjuda({
  children,
  chave,
  htmlFor,
}: {
  children: ReactNode;
  chave: ChaveAjudaCatalogo;
  htmlFor?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Label htmlFor={htmlFor}>{children}</Label>
      <ComoLer chave={chave} />
    </div>
  );
}

/** Seção do formulário reorganizado. */
export function SecaoCatalogo({
  titulo,
  descricao,
  ajuda,
  children,
}: {
  titulo: string;
  descricao?: string;
  ajuda?: ChaveAjudaCatalogo;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-lg border p-4">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-medium">{titulo}</h3>
          {ajuda && <ComoLer chave={ajuda} />}
        </div>
        {descricao && <p className="text-xs text-muted-foreground">{descricao}</p>}
      </div>
      {children}
    </section>
  );
}
