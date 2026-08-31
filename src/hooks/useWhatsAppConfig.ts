import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export const useWhatsAppConfig = () => {
  const [whatsappNumber, setWhatsappNumber] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const fetchConfig = async () => {
      try {
        const { data, error } = await supabase.rpc("get_whatsapp_public_config");
        if (cancelled) return;

        if (!error && data) {
          const config = data as { whatsapp_number?: string };
          if (config.whatsapp_number) {
            setWhatsappNumber(config.whatsapp_number);
          }
        }
      } catch (err) {
        console.error("Error fetching WhatsApp config:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchConfig();

    return () => {
      cancelled = true;
    };
  }, []);

  return { whatsappNumber, loading };
};
