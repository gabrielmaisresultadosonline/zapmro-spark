export interface PaidUser {
  id: string;
  email: string;
  username: string;
  instagram_username: string | null;
  stripe_customer_id: string | null;
  subscription_status: 'pending' | 'active' | 'canceled' | 'expired';
  subscription_id: string | null;
  subscription_end: string | null;
  strategies_generated: number;
  creatives_used: number;
  created_at: string;
  updated_at: string;
}

export interface PaidUserSession {
  user: PaidUser | null;
  isAuthenticated: boolean;
}

export const PAID_USER_STORAGE_KEY = 'mro_paid_user_session';

export const getPaidUserSession = (): PaidUserSession => {
  const stored = localStorage.getItem(PAID_USER_STORAGE_KEY);
  if (stored) {
    return JSON.parse(stored);
  }
  return {
    user: null,
    isAuthenticated: false
  };
};

export const savePaidUserSession = (session: PaidUserSession): void => {
  localStorage.setItem(PAID_USER_STORAGE_KEY, JSON.stringify(session));
};

export const clearPaidUserSession = (): void => {
  localStorage.removeItem(PAID_USER_STORAGE_KEY);
};
