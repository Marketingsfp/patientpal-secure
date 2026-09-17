import { temaClinica } from "@/lib/coach/clinica-tema";
import { cn } from "@/lib/utils";

/**
 * Selo da clínica: mostra a logo oficial quando a unidade tem uma cadastrada,
 * com fallback para o monograma colorido derivado do nome.
 */
export function MarcaClinica({
  nome,
  className,
  fallback,
}: {
  nome: string | null | undefined;
  className?: string;
  fallback?: React.ReactNode;
}) {
  const tema = temaClinica(nome);
  return (
    <span
      className={cn(
        "grid place-items-center overflow-hidden rounded-xl font-bold text-white shrink-0",
        className,
      )}
      style={{ backgroundImage: tema.gradiente }}
    >
      {tema.logo ? (
        <img
          src={tema.logo}
          alt={`Logo ${nome ?? "clínica"}`}
          className="h-[70%] w-[80%] object-contain"
        />
      ) : (
        (fallback ?? tema.monograma)
      )}
    </span>
  );
}
