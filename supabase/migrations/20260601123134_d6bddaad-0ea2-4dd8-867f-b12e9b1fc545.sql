
CREATE TABLE IF NOT EXISTS public._stg_pagos2(
  inicio_local timestamp,
  medico_nome text,
  data_pagamento timestamp
);
GRANT ALL ON public._stg_pagos2 TO sandbox_exec, service_role;
