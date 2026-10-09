import { textoDaDecisaoJev } from "@/lib/nina/jev-auditoria";

export function JevConversa({ id, numero }: { id: string | null; numero?: number }) {
  if (!id) return <span className="text-xs text-muted-foreground">Conversa não registrada</span>;
  return (
    <div className="min-w-32 max-w-52">
      {numero !== undefined && <p className="font-semibold">#{numero}</p>}
      <details>
        <summary className="cursor-pointer text-xs text-muted-foreground">ID da conversa</summary>
        <p className="mt-1 select-text break-all font-mono text-xs">{id}</p>
      </details>
    </div>
  );
}

export function JevTextoAnalisado({ perguntas }: { perguntas: unknown }) {
  const mensagem = textoDaDecisaoJev(perguntas);
  if (!mensagem)
    return (
      <span className="text-xs text-muted-foreground">Texto não registrado nesta decisão.</span>
    );
  return (
    <div className="min-w-52 max-w-sm space-y-1">
      <p className="text-xs text-muted-foreground">{mensagem.rotulo}</p>
      <p className="line-clamp-2 whitespace-pre-wrap break-words">{mensagem.texto}</p>
      <details>
        <summary className="cursor-pointer text-xs text-primary">Ver texto registrado</summary>
        <p className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap break-words">
          {mensagem.texto}
        </p>
        {mensagem.truncado && (
          <p className="text-xs text-muted-foreground">
            Registro parcial: primeiros 6.000 caracteres.
          </p>
        )}
      </details>
    </div>
  );
}
