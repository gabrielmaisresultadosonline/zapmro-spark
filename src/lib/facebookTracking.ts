import { supabase } from "@/integrations/supabase/client";
import { getAdminData } from "./adminConfig";

// Default Facebook Pixel ID (fallback)
const DEFAULT_PIXEL_ID = '1009304915232936';

// Helper to generate a unique event ID for deduplication
const generateEventId = () => {
  return `evt_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
};

// Get Facebook cookies
const getFacebookCookies = () => {
  if (typeof document === 'undefined') return { fbc: '', fbp: '' };
  
  const cookies = document.cookie.split(';');
  let fbc = '';
  let fbp = '';
  
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split('=');
    if (name === '_fbc') fbc = value;
    if (name === '_fbp') fbp = value;
  }
  
  // If fbc is not in cookies, try to get fbclid from URL and construct it
  if (!fbc) {
    const urlParams = new URLSearchParams(window.location.search);
    const fbclid = urlParams.get('fbclid');
    if (fbclid) {
      // Format: fb.1.{timestamp}.{fbclid}
      fbc = `fb.1.${Date.now()}.${fbclid}`;
    }
  }
  
  return { fbc, fbp };
};

// Get test event code from URL
const getTestEventCode = (): string | null => {
  if (typeof window === 'undefined') return null;
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('test_event_code');
};

// Declare fbq for TypeScript
declare global {
  interface Window {
    fbq: any;
  }
}

/**
 * Track Facebook event - fires both client-side Pixel AND server-side Conversions API
 * @param eventName - Event name (PageView, Lead, InitiateCheckout, Purchase, ViewContent, etc.)
 * @param customData - Optional custom data for the event
 */
export const trackFacebookEvent = async (
  eventName: string,
  customData?: {
    content_name?: string;
    content_category?: string;
    value?: number;
    currency?: string;
    email?: string;
    phone?: string;
    event_id?: string;
  }
) => {
  try {
    const adminData = getAdminData();
    const pixelSettings = adminData?.settings?.pixelSettings;
    const pixelId = pixelSettings?.pixelId || DEFAULT_PIXEL_ID;
    const isEnabled = pixelSettings?.enabled !== false;

    if (!isEnabled) {
      console.log(`[FB-TRACKING] Tracking is disabled in settings, skipping ${eventName}`);
      return;
    }

    const eventId = customData?.event_id || generateEventId();
    const currency = customData?.currency || 'BRL';

    // 1. Fire client-side Pixel event (immediate)
    if (typeof window !== 'undefined' && window.fbq) {
      // Ensure pixel is initialized with current ID if it hasn't been already
      // Note: Meta recommends only one init per page, but re-calling with the same ID is harmless
      // or calling with a new one for multiple pixels.
      
      if (eventName === 'PageView') {
        window.fbq('track', 'PageView', {}, { eventID: eventId });
      } else if (customData) {
        const trackingData: Record<string, any> = {
          content_name: customData.content_name,
          content_category: customData.content_category,
          value: customData.value,
          currency: currency
        };
        // Remove undefined from trackingData
        Object.keys(trackingData).forEach(key => {
          if (trackingData[key] === undefined) delete trackingData[key];
        });
        
        window.fbq('track', eventName, trackingData, { eventID: eventId });
      } else {
        window.fbq('track', eventName, {}, { eventID: eventId });
      }
      console.log(`[FB-PIXEL] Client event fired: ${eventName} (${eventId}) to Pixel ${pixelId}`);
    } else {
      console.warn(`[FB-PIXEL] fbq not found, skipping client event: ${eventName}`);
    }

    // 2. Fire server-side Conversions API (for better tracking)
    const { fbc, fbp } = getFacebookCookies();
    const testEventCode = getTestEventCode();

    const payload: Record<string, any> = {
      pixel_id: pixelId, // Pass the dynamic Pixel ID to the edge function
      event_name: eventName,
      event_id: eventId,
      event_source_url: typeof window !== 'undefined' ? window.location.href : '',
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      fbc: fbc || undefined,
      fbp: fbp || undefined,
      test_event_code: testEventCode || undefined,
      currency: currency,
      ...customData
    };

    // Remove undefined values
    Object.keys(payload).forEach(key => {
      if (payload[key] === undefined) delete payload[key];
    });

    const { data, error } = await supabase.functions.invoke('meta-conversions', {
      body: payload
    });

    if (error) {
      console.error(`[FB-API] Error sending ${eventName}:`, error);
    } else {
      console.log(`[FB-API] Server event sent: ${eventName} (${eventId})`, data);
    }
  } catch (err) {
    console.error(`[FB-TRACKING] Error tracking ${eventName}:`, err);
  }
};

/**
 * Track PageView - call on page load
 */
export const trackPageView = (pageName?: string) => {
  trackFacebookEvent('PageView', pageName ? { content_name: pageName } : undefined);
};

/**
 * Track Lead - when user shows purchase intent (e.g., clicks WhatsApp)
 */
export const trackLead = (leadSource?: string) => {
  trackFacebookEvent('Lead', {
    content_name: leadSource || 'WhatsApp Contact',
    content_category: 'Lead',
    currency: 'BRL'
  });
};

/**
 * Track InitiateCheckout - when user clicks buy button
 */
export const trackInitiateCheckout = (productName?: string, value?: number) => {
  trackFacebookEvent('InitiateCheckout', {
    content_name: productName || 'MRO Product',
    value: value,
    currency: 'BRL'
  });
};

/**
 * Track ViewContent - when user views important content
 */
export const trackViewContent = (contentName: string, category?: string) => {
  trackFacebookEvent('ViewContent', {
    content_name: contentName,
    content_category: category,
    currency: 'BRL'
  });
};

/**
 * Track Purchase - when purchase is completed
 */
export const trackPurchase = (value: number, productName?: string, email?: string) => {
  // Try to get email from localStorage if not provided
  const savedEmail = email || (typeof localStorage !== 'undefined' ? localStorage.getItem('mro_customer_email') : undefined);
  
  trackFacebookEvent('Purchase', {
    content_name: productName || 'MRO Product',
    value: value,
    currency: 'BRL',
    email: savedEmail || undefined
  });
};

/**
 * Track button click with custom event
 */
export const trackButtonClick = (buttonName: string, category?: string) => {
  trackFacebookEvent('ViewContent', {
    content_name: `Button: ${buttonName}`,
    content_category: category || 'Button Click',
    currency: 'BRL'
  });
};
