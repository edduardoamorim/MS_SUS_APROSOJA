import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.6'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { email, nome, role, regiao } = await req.json()

    // 1. Invitar usuário através do Auth (Isso enviará o e-mail de convite padrão configurado no Supabase)
    const { data: authData, error: authError } = await supabaseClient.auth.admin.inviteUserByEmail(email, {
      data: {
        nome,
        role
      }
    })

    if (authError) throw authError

    // 2. Após invitar, a trigger on_auth_user_created lidará com a criação na tabela public.perfis
    // Ou, se quisermos forçar a atualização dos dados que faltam (ex: regiao), podemos fazer um UPDATE
    
    // Esperar um momento curto para a trigger do banco terminar
    await new Promise(resolve => setTimeout(resolve, 500));

    const { error: profileError } = await supabaseClient
      .from('perfis')
      .update({ regiao, role, nome })
      .eq('id', authData.user.id)

    if (profileError) {
      console.error('Erro ao atualizar perfil adicional:', profileError)
      // Não joga erro aqui porque o usuário já foi convidado com sucesso
    }

    return new Response(
      JSON.stringify({ success: true, user: authData.user }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
