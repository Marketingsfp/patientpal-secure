import { useLayoutEffect, useRef, type ComponentProps } from "react";
import { aplicarCaixaAlta, useCaixaAlta } from "@/components/ui/caixa-alta";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Props = ComponentProps<"textarea"> & { linhaUnica?: boolean };

/** Campos do catálogo expandem sem criar uma segunda área de rolagem. */
export function TextoCatalogo({ className, onChange, linhaUnica = false, ...props }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const caixaAlta = useCaixaAlta(linhaUnica ? undefined : false, "text");

  useLayoutEffect(() => {
    const campo = ref.current;
    if (!campo || CSS.supports("field-sizing", "content")) return;

    // Compatibilidade com navegadores anteriores a field-sizing: content.
    const ajustar = () => {
      if (!campo.getClientRects().length) return;
      const estilo = getComputedStyle(campo);
      const anterior = campo.style.height;
      campo.style.height = "0px";
      const borda = parseFloat(estilo.borderTopWidth) + parseFloat(estilo.borderBottomWidth);
      const altura = `${Math.ceil(campo.scrollHeight + borda)}px`;
      campo.style.height = altura === anterior ? anterior : altura;
    };
    ajustar();
    let largura = -1;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width === largura) return;
      largura = entry.contentRect.width;
      ajustar();
    });
    observer.observe(campo);
    // Abrir seções e alterar a escala de leitura também pode mudar a altura.
    const detalhes = campo.closest("details");
    detalhes?.addEventListener("toggle", ajustar);
    const preferencias = new MutationObserver(ajustar);
    preferencias.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });
    document.fonts?.addEventListener("loadingdone", ajustar);
    campo.addEventListener("input", ajustar);
    return () => {
      observer.disconnect();
      preferencias.disconnect();
      detalhes?.removeEventListener("toggle", ajustar);
      document.fonts?.removeEventListener("loadingdone", ajustar);
      campo.removeEventListener("input", ajustar);
    };
  }, [props.value, props.defaultValue, props.placeholder]);

  return (
    <Textarea
      {...props}
      ref={ref}
      rows={1}
      wrap="soft"
      className={cn(
        "oszap-base-texto",
        caixaAlta && "uppercase placeholder:normal-case",
        className,
      )}
      onChange={(e) => {
        // Os antigos inputs continuam guardando uma única linha no cadastro.
        if (linhaUnica) e.currentTarget.value = e.currentTarget.value.replace(/[\r\n]+/g, " ");
        if (caixaAlta) aplicarCaixaAlta(e.currentTarget);
        onChange?.(e);
      }}
    />
  );
}

export function CampoTextoCatalogo(props: ComponentProps<"textarea">) {
  return <TextoCatalogo {...props} linhaUnica />;
}
