import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { telefoneDoBloqueio } from "../contatos-bloqueados";

describe("contatos bloqueados", () => {
  it("guarda só os dígitos, como o banco compara", () => {
    expect(telefoneDoBloqueio("+55 (11) 90000-0000")).toBe("5511900000000");
    expect(telefoneDoBloqueio("5511900000000")).toBe("5511900000000");
  });
  it("recusa telefone inválido", () => {
    for (const t of ["", null, undefined, "123", "abc", "1".repeat(16)])
      expect(telefoneDoBloqueio(t)).toBeNull();
  });
  it("a migration restringe a tabela à supervisão, por clínica, com auditoria", () => {
    const sql = readFileSync(
      new URL(
        "../../../../supabase/migrations/20261016170000_contatos_bloqueados.sql",
        import.meta.url,
      ),
      "utf8",
    );
    expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("atend_pode_bloquear_contato(auth.uid(), clinica_id)");
    expect(sql).toContain("UNIQUE (clinica_id, telefone)");
    expect(sql).toContain("fn_audit_trigger");
    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toContain("SET search_path = public");
  });
  it("o webhook confere o bloqueio antes da Nina, da fila e dos lembretes", () => {
    const webhook = readFileSync(
      new URL("../../../routes/api/public/whatsapp.$clinicaId.ts", import.meta.url),
      "utf8",
    );
    const bloqueio = webhook.indexOf("contatoBloqueado(params.clinicaId, from)");
    expect(bloqueio).toBeGreaterThan(0);
    for (const depois of [
      "processarRespostaFrancisco",
      "processarRespostaConfirmacao",
      "processarRespostaPesquisaSatisfacao",
      "processarRespostaWhatsappNina",
    ])
      expect(webhook.indexOf(depois)).toBeGreaterThan(bloqueio);
  });
});
