/**
 * Grupo de botões em pílula, no lugar de um `select`, para as escolhas que a
 * recepção troca o tempo todo: com as opções à vista o modo atual se lê sem
 * abrir nada.
 *
 * Vive em componente próprio, e não dentro da tela que o usa, porque a barra
 * de controles do financeiro tende a se repetir: assim a próxima tela que
 * precisar dela herda o mesmo comportamento de teclado e o mesmo destaque do
 * item ativo, em vez de nascer com uma cópia que vai divergir na primeira
 * mudança de estilo.
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
