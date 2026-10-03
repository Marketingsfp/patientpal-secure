/** Enter em composição de texto ou atalhos já consumidos nunca envia. */
export function deveEnviarPorTecla(
  e: {
    key: string;
    shiftKey: boolean;
    ctrlKey: boolean;
    metaKey: boolean;
    altKey: boolean;
    isComposing?: boolean;
    defaultPrevented?: boolean;
  },
  enterEnvia: boolean,
) {
  return (
    e.key === "Enter" &&
    !e.shiftKey &&
    !e.altKey &&
    !e.isComposing &&
    !e.defaultPrevented &&
    (enterEnvia || e.ctrlKey || e.metaKey)
  );
}
