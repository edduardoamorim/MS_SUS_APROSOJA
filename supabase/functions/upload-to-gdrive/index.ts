import { serve } from "https://deno.land/std@0.192.0/http/server.ts"
import { GoogleAuth } from "npm:google-auth-library"
import { createClient } from "npm:@supabase/supabase-js"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File
    const tableName = formData.get('table') as string 

    if (!file) {
      return new Response(JSON.stringify({ error: 'Nenhum arquivo enviado.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const gdriveFolderId = Deno.env.get('GOOGLE_DRIVE_FOLDER_ID')
    const serviceAccountJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_KEY')
    const supabaseUrl = Deno.env.get('PROJECT_URL')
    const supabaseServiceKey = Deno.env.get('PROJECT_SERVICE_ROLE_KEY')

    if (!serviceAccountJson || !gdriveFolderId || !supabaseUrl || !supabaseServiceKey) {
      throw new Error('Configurações de ambiente ausentes no Supabase.')
    }

    const auth = new GoogleAuth({
      credentials: JSON.parse(serviceAccountJson),
      scopes: ['https://www.googleapis.com/auth/drive.file'],
    })
    
    const client = await auth.getClient()
    const tokenResponse = await client.getAccessToken()
    const accessToken = tokenResponse.token

    if (!accessToken) {
      throw new Error('Falha ao gerar Token de Acesso do Google.')
    }

    const boundary = '-------314159265358979323846'
    const delimiter = `\r\n--${boundary}\r\n`
    const closeDelimiter = `\r\n--${boundary}--`

    const metadata = {
      name: file.name,
      parents: [gdriveFolderId],
    }

    const fileReader = await file.arrayBuffer()
    const fileBytes = new Uint8Array(fileReader)

    const encoder = new TextEncoder()
    const part1 = encoder.encode(
      `${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n${delimiter}Content-Type: ${file.type}\r\n\r\n`
    )
    const part2 = fileBytes
    const part3 = encoder.encode(closeDelimiter)

    const body = new Uint8Array(part1.length + part2.length + part3.length)
    body.set(part1, 0)
    body.set(part2, part1.length)
    body.set(part3, part1.length + part2.length)

    const gdriveResponse = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
          'Content-Length': body.length.toString(),
        },
        body: body,
      }
    )

    if (!gdriveResponse.ok) {
      const errorText = await gdriveResponse.text()
      throw new Error(`Erro na API do Google Drive: ${errorText}`)
    }

    const gdriveData = await gdriveResponse.json()
    const fileId = gdriveData.id
    const fileUrl = gdriveData.webViewLink

    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const targetTable = tableName === 'pendencias' ? 'pendencias' : 'documentos'

    const { data: dbData, error: dbError } = await supabase
      .from(targetTable)
      .insert([
        {
          nome_arquivo: file.name,
          gdrive_id: fileId,
          gdrive_url: fileUrl,
          criado_em: new Date().toISOString(),
        }
      ])
      .select()

    if (dbError) throw dbError

    return new Response(
      JSON.stringify({ success: true, fileId, fileUrl, database: dbData }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})