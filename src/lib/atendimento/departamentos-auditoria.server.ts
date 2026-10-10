import { getRequest } from "@tanstack/react-start/server";

/** Mesmo cabeçalho de origem usado pelas APIs internas; local sem proxy fica sem IP. */
export function ipOrigemDepartamentos(): string | undefined {
  const headers = getRequest().headers;
  return (
    headers.get("cf-connecting-ip") ??
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    undefined
  );
}
