// Regra pura: quando uma alteração de vínculo exige que quem chama seja
// administrador (da clínica ou da plataforma). Gestor não pode conceder,
// tirar ou mexer no perfil de administrador, nem alterar o próprio vínculo.

export const MSG_SO_ADMIN = "Somente um administrador pode conceder o perfil de administrador";

export function exigeAdministrador(entrada: {
  papelFinal: string;
  papelAtual?: string | null;
  alvoEhOProprio?: boolean;
}): boolean {
  return (
    entrada.papelFinal === "admin" || entrada.papelAtual === "admin" || entrada.alvoEhOProprio === true
  );
}
