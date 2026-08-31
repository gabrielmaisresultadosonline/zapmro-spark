import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.0"
import { executeVisualNode, processStep } from "../_shared/flow-executor.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ... rest of the file ...
// Since the file is 3k+ lines, I'll use line_replace to fix the specific status code issue and ensure history saving.
// But first I need to see where handleInternalSendMessage ends to make sure I don't break the flow.
