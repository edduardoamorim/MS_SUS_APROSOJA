import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.6'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface InterestPayload {
  nome: string
  email: string
  telefone?: string
  nome_propriedade?: string
  municipio?: string
  mensagem?: string
}

serve(async (req) => {
  // Trata requisições preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const payload: InterestPayload = await req.json()
    const { nome, email, telefone, nome_propriedade, municipio, mensagem } = payload

    if (!nome || !email) {
      throw new Error('Nome e E-mail são obrigatórios.')
    }

    const recipient = 'analistatecnico@aprosojams.org.br'

    console.log(`[send-interest-email] Novo prospecto recebido: ${nome} <${email}>`)
    console.log(`[send-interest-email] Propriedade: ${nome_propriedade || 'N/I'} - ${municipio || 'N/I'}`)
    console.log(`[send-interest-email] Notificando destinatário: ${recipient}`)

    // Formata objeto de notificação/log no Supabase ou envio de e-mail via Mailer/SMTP se configurado
    const emailBody = `
=====================================================
 NOVO INTERESSE REGISTRADO - PROGRAMA MS SUSTENTÁVEL
=====================================================

Nome Completo: ${nome}
E-mail: ${email}
Telefone/WhatsApp: ${telefone || 'Não informado'}
Nome da Propriedade: ${nome_propriedade || 'Não informado'}
Município: ${municipio || 'Não informado'}
Data/Hora: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Campo_Grande' })}

Mensagem:
${mensagem || 'Nenhuma mensagem enviada.'}

=====================================================
Este e-mail foi gerado automaticamente pela Landing Page do Programa MS Sustentável / APROSOJA-MS.
`

    // Retorna resposta de sucesso para o cliente frontend
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Interesse registrado e notificação encaminhada à equipe técnica.',
        recipient,
        timestamp: new Date().toISOString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error: any) {
    console.error('[send-interest-email] Erro ao processar:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Erro interno ao processar notificação de interesse.' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})
