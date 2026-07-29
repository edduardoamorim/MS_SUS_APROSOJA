import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.6'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { email, redirectTo } = await req.json()

    if (!email) {
      throw new Error('E-mail é obrigatório.')
    }

    // 1. Gerar link oficial seguro de recuperação de senha via Admin API
    const { data: linkData, error: linkError } = await supabaseClient.auth.admin.generateLink({
      type: 'recovery',
      email: email,
      options: {
        redirectTo: redirectTo || 'https://ms-sus-aprosoja.vercel.app/redefinir-senha'
      }
    })

    if (linkError) {
      console.warn('Aviso ao gerar link via Admin, fallback para resetPasswordForEmail:', linkError)
    }

    const resetLink = linkData?.properties?.action_link || `${redirectTo || 'https://ms-sus-aprosoja.vercel.app'}/redefinir-senha`

    // 2. Disparar reset de e-mail através da API padrão de autenticação do Supabase
    const { error: resetError } = await supabaseClient.auth.resetPasswordForEmail(email, {
      redirectTo: redirectTo || 'https://ms-sus-aprosoja.vercel.app/redefinir-senha'
    })

    if (resetError) {
      console.warn('Aviso do Supabase Auth no resetPasswordForEmail:', resetError)
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Link de recuperação enviado com sucesso.',
        action_link: resetLink
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message || 'Erro ao processar recuperação de senha' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
