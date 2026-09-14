import { createFileRoute } from "@tanstack/react-router";
import { NINA_RUNTIME_VERSION, NINA_SOURCE_FINGERPRINT } from "@/lib/nina/runtime-version";

/** Identifica o artefato servido sem consultar clínica, banco ou modelo. */
export const Route = createFileRoute("/api/public/nina-runtime")({
  server: {
    handlers: {
      GET: () =>
        Response.json(
          { runtime: NINA_RUNTIME_VERSION, fingerprint: NINA_SOURCE_FINGERPRINT },
          { headers: { "Cache-Control": "no-store" } },
        ),
    },
  },
});
