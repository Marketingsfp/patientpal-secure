import { createFileRoute } from '@tanstack/react-router'
import { CONTRATO_MJ_CARTAO_CONSULTA_SEGUROS } from '@/lib/contract-templates/menino-jesus-cartao-consulta-seguros'

export const Route = createFileRoute('/api/public/tmp-load-mj-template')({
  server: {
    handlers: {
      GET: async () => {
        const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
        const { data, error } = await supabaseAdmin
          .from('cb_convenios')
          .update({ modelo_contrato: CONTRATO_MJ_CARTAO_CONSULTA_SEGUROS })
          .eq('id', '4fdce541-5b2b-4816-ba7d-911b36741b7d')
          .select('id, nome')
        if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })
        return new Response(JSON.stringify({ ok: true, updated: data, bytes: CONTRATO_MJ_CARTAO_CONSULTA_SEGUROS.length }), { headers: { 'content-type': 'application/json' } })
      },
    },
  },
})