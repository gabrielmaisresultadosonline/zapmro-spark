import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// 1x1 transparent PNG pixel
const TRACKING_PIXEL = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
  0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
  0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82
]);

serve(async (req) => {
  const url = new URL(req.url);
  const trackingId = url.searchParams.get('tid');

  console.log(`[EMAIL-TRACKING] Tracking pixel requested for: ${trackingId}`);

  if (trackingId) {
    try {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
      );

      // Update email_opened status
      const { error } = await supabase
        .from('created_accesses')
        .update({
          email_opened: true,
          email_opened_at: new Date().toISOString(),
        })
        .eq('tracking_id', trackingId)
        .eq('email_opened', false); // Only update if not already opened

      if (error) {
        console.log(`[EMAIL-TRACKING] Error updating: ${error.message}`);
      } else {
        console.log(`[EMAIL-TRACKING] Email opened recorded for: ${trackingId}`);
      }
    } catch (e: any) {
      console.log(`[EMAIL-TRACKING] Error: ${e.message}`);
    }
  }

  // Always return the tracking pixel
  return new Response(TRACKING_PIXEL, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
      ...corsHeaders,
    },
  });
});
