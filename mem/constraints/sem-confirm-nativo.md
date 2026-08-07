---
name: Proibido window.confirm / alert nativo
description: Toda confirmação deve usar o modal global confirmDialog (AlertDialog), nunca popups nativos do navegador
type: constraint
---
Nunca usar `window.confirm()`, `confirm()` ou `alert()` para confirmações (exclusão, cancelamento, desmarcar paciente, avisos).

**Como aplicar:** usar sempre `confirmDialog()` de `@/lib/confirm`:

```ts
import { confirmDialog } from "@/lib/confirm";
if (!(await confirmDialog({ title: "Excluir item", description: "...", tone: "danger", confirmText: "Excluir" }))) return;
```

O host `<ConfirmDialogHost />` já está montado em `src/routes/__root.tsx`.

**Why:** popups nativos quebram a identidade visual e mostram o domínio interno do preview.
