import { forwardRef } from "react";
import type { LucideIcon, LucideProps } from "lucide-react";

// Ícone de dente compatível com a API do lucide-react.
export const Tooth = forwardRef<SVGSVGElement, LucideProps>(
  ({ size = 24, color = "currentColor", strokeWidth = 2, absoluteStrokeWidth, ...rest }, ref) => (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      <path d="M12 5.5c-1.5-1.2-3-2-4.7-2C4.9 3.5 3 5.6 3 8.4c0 2.1.7 3.4 1.3 5.2.5 1.4.7 3 .9 4.6.2 1.6.4 3.3 1.6 3.8 1.3.5 2-1 2.3-2.4.3-1.3.5-2.7.9-3.6.3-.7.9-1 2-1s1.7.3 2 1c.4.9.6 2.3.9 3.6.3 1.4 1 2.9 2.3 2.4 1.2-.5 1.4-2.2 1.6-3.8.2-1.6.4-3.2.9-4.6.6-1.8 1.3-3.1 1.3-5.2 0-2.8-1.9-4.9-4.3-4.9-1.7 0-3.2.8-4.7 2Z" />
    </svg>
  ),
) as unknown as LucideIcon;

Tooth.displayName = "Tooth";