// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface GrafanaResponse {
  results: {
    A: {
      frames: Array<{
        schema: {
          fields: Array<{
            name: string;
            labels?: {
              host?: string;
            };
          }>;
        };
        data: {
          values: Array<Array<number>>;
        };
      }>;
    };
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Create Supabase client (commented out for testing)
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Calculate timestamp for today (UTC midnight)
    const now = new Date()
    now.setUTCHours(23, 59, 59, 999) // End of day
    const endTimestamp = now.getTime()

    // Calculate timestamp for 2 days ago
    const twoDaysAgo = new Date(now)
    twoDaysAgo.setDate(now.getDate() - 2)
    twoDaysAgo.setUTCHours(0, 0, 0, 0) // Start of day
    const startTimestamp = twoDaysAgo.getTime()

    console.log('[Debug] Time range:', {
      from: new Date(startTimestamp).toISOString(),
      to: new Date(endTimestamp).toISOString()
    })

    // Prepare Grafana query
    const queryBody = {
      queries: [{
        datasource: {
          type: 'prometheus',
          uid: 'adx7lanbillvke'
        },
        expr: 'sum_over_time(algod_network_incoming_peers{network="mainnet"}[24h]) / 17280',
        format: 'table',
        instant: false,
        interval: '24h',
        range: true,
        refId: 'A',
        intervalMs: 86400000, // 24 hours in milliseconds
        maxDataPoints: 100
      }],
      range: {
        from: new Date(startTimestamp).toISOString(),
        to: new Date(endTimestamp).toISOString(),
      },
      from: startTimestamp.toString(),
      to: endTimestamp.toString()
    }

    console.log('[Debug] Sending query:', JSON.stringify(queryBody, null, 2))

    // Fetch data from Grafana
    const response = await fetch('https://dashboard.voi.network/api/ds/query?ds_type=prometheus', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(queryBody)
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Failed to fetch data: ${response.statusText}. Details: ${errorText}`)
    }

    const data: GrafanaResponse = await response.json()
    console.log('[Debug] Received response with', data.results.A.frames.length, 'frames')

    // Process and insert data
    const records = []
    
    // Process each frame in the response
    for (const frame of data.results.A.frames) {
      const timeField = frame.schema.fields.find(f => f.name === 'Time')
      const valueField = frame.schema.fields.find(f => f.name === 'Value')
      const hostName = valueField?.labels?.host || ''

      if (!timeField || !valueField || !hostName) {
        console.log('[Debug] Skipping frame due to missing data:', { timeField, valueField, hostName })
        continue
      }

      const timeIndex = frame.schema.fields.findIndex(f => f.name === 'Time')
      const valueIndex = frame.schema.fields.findIndex(f => f.name === 'Value')

      const times = frame.data.values[timeIndex] as number[]
      const values = frame.data.values[valueIndex] as number[]

      for (let i = 0; i < times.length; i++) {
        // Only include records from the last 2 days
        if (times[i] >= startTimestamp) {
          records.push({
            host_name: hostName,
            peer_date: new Date(times[i]).toISOString().split('T')[0],
            peer_count: values[i]
          })
        }
      }
    }

    console.log('[Debug] Processing', records.length, 'records')

    // Supabase upsert code
    for (const record of records) {
      const { error } = await supabaseClient.rpc('upsert_peer_count', {
        p_host_name: record.host_name,
        p_peer_date: record.peer_date,
        p_peer_count: record.peer_count
      })

      if (error) {
        throw error
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        recordsProcessed: records.length
      }, null, 2),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    console.error('[Error]:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/fetch-relay-peers' \
    --header 'Authorization: Bearer ' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
