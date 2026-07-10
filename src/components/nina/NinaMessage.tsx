import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

type Props = {
  content: string;
  variant: "assistant" | "user";
  className?: string;
};

/**
 * Renders Nina (assistant) messages as Markdown; user messages as plain text
 * with preserved line breaks. Styled to fit inside the chat bubble.
 */
export function NinaMessage({ content, variant, className }: Props) {
  if (variant === "user") {
    return <div className={cn("whitespace-pre-wrap", className)}>{content}</div>;
  }

  return (
    <div
      className={cn(
        "prose prose-sm max-w-none",
        // tighter spacing inside bubbles
        "prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0",
        "prose-headings:my-2 prose-headings:font-semibold",
        "prose-pre:my-2 prose-pre:p-2 prose-pre:rounded-md prose-pre:bg-muted prose-pre:text-foreground",
        "prose-code:before:content-none prose-code:after:content-none prose-code:px-1 prose-code:rounded prose-code:bg-muted",
        "prose-a:underline prose-a:text-primary",
        "prose-table:my-2 prose-th:px-2 prose-td:px-2 prose-th:py-1 prose-td:py-1",
        "dark:prose-invert",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ node, ...props }) => <a {...props} target="_blank" rel="noreferrer noopener" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

export function TypingDots({ className }: { className?: string }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1", className)}
      aria-label="Nina está digitando"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce [animation-delay:-0.3s]" />
      <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce [animation-delay:-0.15s]" />
      <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce" />
    </span>
  );
}
