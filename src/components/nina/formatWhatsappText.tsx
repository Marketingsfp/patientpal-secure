import React from "react";

// WhatsApp-style light formatting: *bold*, _italic_, ~strike~, ```code```, autolinks.
// Returns React nodes preserving line breaks.
export function formatWhatsappText(text: string): React.ReactNode {
  if (!text) return null;
  const lines = text.split("\n");
  return lines.map((line, li) => (
    <React.Fragment key={li}>
      {renderLine(line)}
      {li < lines.length - 1 && <br />}
    </React.Fragment>
  ));
}

function renderLine(line: string): React.ReactNode[] {
  // Tokenize: bold *...*, italic _..._, strike ~...~, code `...`, urls
  const pattern =
    /(\*[^*\n]+\*)|(_[^_\n]+_)|(~[^~\n]+~)|(`[^`\n]+`)|((?:https?:\/\/|www\.)[^\s]+)/g;
  const out: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = pattern.exec(line)) !== null) {
    if (m.index > last) out.push(line.slice(last, m.index));
    const tok = m[0];
    if (m[1]) out.push(<strong key={key++}>{tok.slice(1, -1)}</strong>);
    else if (m[2]) out.push(<em key={key++}>{tok.slice(1, -1)}</em>);
    else if (m[3]) out.push(<s key={key++}>{tok.slice(1, -1)}</s>);
    else if (m[4])
      out.push(
        <code key={key++} className="px-1 rounded bg-black/10 text-[0.85em] font-mono">
          {tok.slice(1, -1)}
        </code>,
      );
    else if (m[5]) {
      const href = tok.startsWith("http") ? tok : `https://${tok}`;
      out.push(
        <a
          key={key++}
          href={href}
          target="_blank"
          rel="noreferrer noopener"
          className="underline break-all"
        >
          {tok}
        </a>,
      );
    }
    last = m.index + tok.length;
  }
  if (last < line.length) out.push(line.slice(last));
  return out;
}
