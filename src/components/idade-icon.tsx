import iconBebe from "@/assets/icon-bebe-removebg-preview.png";
import iconCriancas from "@/assets/criancas-icon-svg-download-png-4478349-removebg-preview.png";
import iconIdoso from "@/assets/icon-idoso-removebg-preview.png";

export function calcIdadeAnos(d: string | null | undefined): number | null {
  if (!d) return null;
  const nasc = new Date(d + "T00:00:00");
  if (isNaN(nasc.getTime())) return null;
  const hoje = new Date();
  let idade = hoje.getFullYear() - nasc.getFullYear();
  const m = hoje.getMonth() - nasc.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) idade--;
  return idade;
}

interface IdadeIconProps {
  nascimento: string | null | undefined;
  size?: number;
  className?: string;
}

export function IdadeIcon({ nascimento, size = 18, className }: IdadeIconProps) {
  const idade = calcIdadeAnos(nascimento);
  if (idade === null || idade < 0) return null;
  let src: string | null = null;
  let label = "";
  if (idade <= 2) { src = iconBebe; label = "Bebê"; }
  else if (idade <= 10) { src = iconCriancas; label = "Criança"; }
  else if (idade >= 65) { src = iconIdoso; label = "Idoso"; }
  if (!src) return null;
  return (
    <img
      src={src}
      alt={label}
      title={label}
      width={size}
      height={size}
      loading="lazy"
      className={className ?? "inline-block object-contain shrink-0"}
      style={{ width: size, height: size }}
    />
  );
}