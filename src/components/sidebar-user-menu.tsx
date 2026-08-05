import { useEffect, useRef, useState } from "react";
import { KeyRound, LogOut, ImageUp } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { mostrarErro } from "@/lib/traduzir-erro";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Props {
  userId?: string;
  userName: string;
  email?: string | null;
  initial: string;
  color: string;
  /** Quando verdadeiro, mostra avatar + nome em linha (uso no rodapé). */
  showName?: boolean;
  onChangePassword: () => void;
  onSignOut: () => void;
}

/** Redimensiona a foto para 128px e devolve um data URL leve (JPEG). */
async function comprimirFoto(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Não foi possível processar a imagem.");
  const lado = Math.min(bitmap.width, bitmap.height);
  ctx.drawImage(
    bitmap,
    (bitmap.width - lado) / 2,
    (bitmap.height - lado) / 2,
    lado,
    lado,
    0,
    0,
    size,
    size,
  );
  return canvas.toDataURL("image/jpeg", 0.85);
}

export function SidebarUserMenu({
  userId,
  userName,
  email,
  initial,
  color,
  showName = false,
  onChangePassword,
  onSignOut,
}: Props) {
  const [avatar, setAvatar] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!userId) {
      setAvatar(null);
      return;
    }
    let cancelled = false;
    void supabase
      .from("profiles")
      .select("avatar_url")
      .eq("id", userId)
      .maybeSingle()
      .then((res: { data: { avatar_url: string | null } | null }) => {
        if (!cancelled) setAvatar(res.data?.avatar_url ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const handleFile = async (file: File | undefined) => {
    if (!file || !userId) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione um arquivo de imagem.");
      return;
    }
    try {
      const dataUrl = await comprimirFoto(file);
      const { error } = await supabase
        .from("profiles")
        .update({ avatar_url: dataUrl })
        .eq("id", userId);
      if (error) {
        mostrarErro(error);
        return;
      }
      setAvatar(dataUrl);
      toast.success("Foto de perfil atualizada.");
    } catch (e) {
      mostrarErro(e);
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          void handleFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {showName ? (
            <button
              type="button"
              className="w-full flex items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/60"
              title={userName || email || "Conta"}
              aria-label="Conta do usuário"
            >
              <span
                className="h-9 w-9 rounded-full overflow-hidden flex items-center justify-center text-sm font-semibold text-white shadow-sm shrink-0 ring-1 ring-white/20"
                style={{ backgroundColor: color }}
              >
                {avatar ? (
                  <img src={avatar} alt="Foto de perfil" className="h-full w-full object-cover" />
                ) : (
                  initial
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-white">{userName || email}</span>
                {userName && email && (
                  <span className="block truncate text-[11px] text-white/60">{email}</span>
                )}
              </span>
            </button>
          ) : (
          <button
            type="button"
            className="h-9 w-9 rounded-full overflow-hidden flex items-center justify-center text-sm font-semibold text-white shadow-sm shrink-0 ring-1 ring-white/20 hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-white/60"
            style={{ backgroundColor: color }}
            title={userName || email || "Conta"}
            aria-label="Conta do usuário"
          >
            {avatar ? (
              <img src={avatar} alt="Foto de perfil" className="h-full w-full object-cover" />
            ) : (
              initial
            )}
          </button>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top" className="w-56">
          <DropdownMenuLabel className="truncate">{userName || email}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => inputRef.current?.click()}>
            <ImageUp className="h-4 w-4 mr-2" />
            {avatar ? "Alterar foto" : "Enviar foto"}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onChangePassword}>
            <KeyRound className="h-4 w-4 mr-2" />
            Alterar senha
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onSignOut}>
            <LogOut className="h-4 w-4 mr-2" />
            Sair
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
