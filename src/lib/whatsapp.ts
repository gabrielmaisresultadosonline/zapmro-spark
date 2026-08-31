export const normalizeWhatsAppNumber = (input: string) => {
  const digits = input.replace(/\D/g, "");

  if (!digits) return "";
  if (digits.startsWith("55")) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;

  return digits;
};

export const buildWhatsAppUrl = (phone: string, message: string) => {
  const normalizedPhone = normalizeWhatsAppNumber(phone);
  if (!normalizedPhone) return "";

  const text = message.trim();
  const query = text ? `?text=${encodeURIComponent(text)}` : "";

  return `https://wa.me/${normalizedPhone}${query}`;
};

export const openWhatsAppChat = (phone: string, message: string) => {
  const url = buildWhatsAppUrl(phone, message);
  if (!url) return false;

  try {
    if (window.top && window.top !== window.self) {
      try {
        window.top.location.href = url;
        return true;
      } catch {
        // Fallbacks below handle cross-origin preview contexts.
      }
    }

    const popup = window.open(url, "_blank", "noopener,noreferrer");
    if (popup) {
      popup.opener = null;
      return true;
    }

    window.location.href = url;
    return true;
  } catch {
    window.location.href = url;
    return true;
  }
};