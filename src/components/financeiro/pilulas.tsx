/**
 * Grupo de botões em pílula, no lugar de um `select`, para as escolhas que a
 * recepção troca o tempo todo: com as opções à vista o modo atual se lê sem
 * abrir nada.
 *
 * Vive em componente próprio porque o Movimento de Caixa e o Estacionamento
 * usam a mesma barra de controles — se os dois tivessem cópias, a primeira
 * diferença de estilo entre elas passaria despercebida.
 */
export function Pilulas<T extends string>({
  valor,
  opcoes,
  onChange,
  ariaLabel,
}: {
  valor: T;
  opcoes: Array<{ valor: T; label: string }>;
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="inline-flex rounded-md border bg-muted/40 p-0.5"
    >
      {opcoes.map((o) => (
        <button
          key={o.valor}
          type="button"
          aria-pressed={valor === o.valor}
          onClick={() => onChange(o.valor)}
          className={`px-3 py-1.5 text-xs rounded transition ${
            valor === o.valor
              ? "bg-background shadow-sm font-medium"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
