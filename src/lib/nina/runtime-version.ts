/** Versão do núcleo compartilhado do atendimento Nina, registrada ao iniciar o turno. */
export const NINA_RUNTIME_VERSION = "nina-paridade-20260914-v3";

/** Injetado pelo Vite a partir dos fontes Nina e manifests; não depende de .git no Lovable. */
declare const __NINA_SOURCE_FINGERPRINT__: string;

/** Ausente fora do build Vite (ex.: Bun) significa versão não comprovada, nunca igualdade. */
export const NINA_SOURCE_FINGERPRINT: string | null =
  typeof __NINA_SOURCE_FINGERPRINT__ === "string" &&
  /^sha256:[a-f0-9]{64}$/.test(__NINA_SOURCE_FINGERPRINT__)
    ? __NINA_SOURCE_FINGERPRINT__
    : null;
