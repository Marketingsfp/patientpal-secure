import { Fragment, type ReactNode } from "react";

/** Remove acentos e caixa para comparar do jeito que a busca faz. */
function norm(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

const onlyDigits = (s: string) => s.replace(/\D/g, "");

/**
 * Faixas [inicio, fim) do texto que correspondem ao termo pesquisado.
 * Termos numéricos (CPF, telefone, prontuário, data) casam ignorando
 * pontuação do texto formatado; os demais casam por texto sem acento.
 */
function ranges(text: string, termo: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const t = termo.trim();
  if (!t || t.length < 2 || !text) return out;

  const digitsTerm = onlyDigits(t);
  if (digitsTerm.length >= 2 && /^[\d.\-/()\s]+$/.test(t)) {
    // posições dos dígitos no texto original
    const pos: number[] = [];
    let digits = "";
    for (let i = 0; i < text.length; i++) {
      if (text[i] >= "0" && text[i] <= "9") { pos.push(i); digits += text[i]; }
    }
    let from = 0;
    for (;;) {
      const idx = digits.indexOf(digitsTerm, from);
      if (idx < 0) break;
      out.push([pos[idx], pos[idx + digitsTerm.length - 1] + 1]);
      from = idx + 1;
    }
    if (out.length > 0) return out;
  }

  const nt = norm(text);
  const nq = norm(t);
  let from = 0;
  for (;;) {
    const idx = nt.indexOf(nq, from);
    if (idx < 0) break;
    out.push([idx, idx + nq.length]);
    from = idx + nq.length;
  }
  return out;
}

interface Props {
  text?: string | null;
  termo?: string;
  className?: string;
}

/** Realça no texto os trechos que casam com o termo pesquisado. */
export function Highlight({ text, termo, className }: Props): ReactNode {
  const value = text ?? "";
  const marks = termo ? ranges(value, termo) : [];
  if (marks.length === 0) return <span className={className}>{value}</span>;

  const parts: ReactNode[] = [];
  let cursor = 0;
  marks.forEach(([ini, fim], i) => {
    if (ini > cursor) parts.push(<Fragment key={`t${i}`}>{value.slice(cursor, ini)}</Fragment>);
    parts.push(
      <mark
        key={`m${i}`}
        className="rounded-[3px] bg-amber-200/80 px-0.5 text-inherit dark:bg-amber-400/30"
      >
        {value.slice(ini, fim)}
      </mark>,
    );
    cursor = fim;
  });
  if (cursor < value.length) parts.push(<Fragment key="tail">{value.slice(cursor)}</Fragment>);
  return <span className={className}>{parts}</span>;
}
