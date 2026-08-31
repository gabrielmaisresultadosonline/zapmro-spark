// PERSISTENT STORAGE - Dados salvos no SERVIDOR por usuário
// Cada usuário tem seus dados em JSON no servidor
// Só busca novos dados após 30 dias para economizar requisições
// IMPORTANTE: Histórico de crescimento SEMPRE sincronizado via nuvem

import { MROSession, ProfileSession, InstagramProfile, ProfileAnalysis, GrowthSnapshot, GrowthInsight } from '@/types/instagram';
import { getSession, saveSession as baseSaveSession, createSnapshot, setServerSyncCallback } from '@/lib/storage';
import { supabase } from '@/integrations/supabase/client';

// 30 days in milliseconds
const REFRESH_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000;

// Merge growth histories by date - combines local and cloud data, removing duplicates
const mergeGrowthHistories = (local: GrowthSnapshot[], cloud: GrowthSnapshot[]): GrowthSnapshot[] => {
  const merged = new Map<string, GrowthSnapshot>();
  
  // Add all cloud entries first (cloud has priority)
  cloud.forEach(snapshot => {
    const dateKey = new Date(snapshot.date).toISOString().split('T')[0]; // Use date only as key
    merged.set(dateKey, snapshot);
  });
  
  // Add local entries that don't exist in cloud
  local.forEach(snapshot => {
    const dateKey = new Date(snapshot.date).toISOString().split('T')[0];
    if (!merged.has(dateKey)) {
      merged.set(dateKey, snapshot);
    }
  });
  
  // Sort by date ascending
  return Array.from(merged.values()).sort((a, b) => 
    new Date(a.date).getTime() - new Date(b.date).getTime()
  );
};

// Merge growth insights by week number - combines local and cloud data
const mergeGrowthInsights = (local: GrowthInsight[], cloud: GrowthInsight[]): GrowthInsight[] => {
  const merged = new Map<number, GrowthInsight>();
  
  // Add all cloud entries first (cloud has priority)
  cloud.forEach(insight => {
    merged.set(insight.weekNumber, insight);
  });
  
  // Add local entries that don't exist in cloud
  local.forEach(insight => {
    if (!merged.has(insight.weekNumber)) {
      merged.set(insight.weekNumber, insight);
    }
  });
  
  // Sort by week number ascending
  return Array.from(merged.values()).sort((a, b) => a.weekNumber - b.weekNumber);
};

// Local cache key (backup while server syncs)
const LOCAL_CACHE_KEY = 'mro_server_cache';
const AUTH_TOKEN_KEY = 'mro_paid_user_auth_token';
const AUTH_EMAIL_KEY = 'mro_paid_user_email';

export interface PersistentProfileData {
  username: string;
  profile: InstagramProfile;
  analysis: ProfileAnalysis;
  strategies: any[];
  creatives: any[];
  creativesRemaining: number;
  growthHistory: GrowthSnapshot[];
  growthInsights: any[];
  lastFetchDate: string;
  syncedAt: string;
  lastUpdated: string;
  lastStrategyGeneratedAt?: string; // Legacy - When the last strategy was generated
  strategyGenerationDates?: Record<string, string>; // Per-type strategy generation dates (30-day cooldown)
  screenshotUrl?: string; // URL do print do perfil enviado pelo cliente
  screenshotUploadCount?: number; // Número de vezes que o print foi enviado (máx 2)
  screenshotHistory?: { url: string; uploadedAt: string }[]; // Histórico de prints para admin
}

export interface UserServerData {
  username: string;
  profiles: Record<string, PersistentProfileData>;
  lastFetchDates: Record<string, string>;
  lastSyncedAt: string;
}

// Store auth token from login response
export const setAuthToken = (token: string, email: string): void => {
  sessionStorage.setItem(AUTH_TOKEN_KEY, token);
  sessionStorage.setItem(AUTH_EMAIL_KEY, email.toLowerCase());
};

// Get stored auth token
export const getAuthToken = (): string | null => {
  return sessionStorage.getItem(AUTH_TOKEN_KEY);
};

// Get stored email for auth
export const getAuthEmail = (): string | null => {
  return sessionStorage.getItem(AUTH_EMAIL_KEY);
};

// Clear auth data on logout
export const clearAuthData = (): void => {
  sessionStorage.removeItem(AUTH_TOKEN_KEY);
  sessionStorage.removeItem(AUTH_EMAIL_KEY);
};

// Local cache for faster access (syncs with server)
let localCache: UserServerData | null = null;
let cachedUsername: string | null = null; // Track which user's data is cached

// Get local cache (for offline/fast access) - ONLY for the current user
const getLocalCache = (forUsername?: string): UserServerData | null => {
  try {
    // If username provided, verify cache belongs to this user
    if (forUsername && cachedUsername && cachedUsername !== forUsername.toLowerCase()) {
      console.log(`⚠️ [persistentStorage] Cache mismatch: cached=${cachedUsername}, requested=${forUsername}`);
      clearLocalCache();
      return null;
    }
    
    const stored = localStorage.getItem(LOCAL_CACHE_KEY);
    if (!stored) return null;
    
    const parsed = JSON.parse(stored);
    
    // Verify the cached data belongs to the requested user
    if (forUsername && parsed.username && parsed.username.toLowerCase() !== forUsername.toLowerCase()) {
      console.log(`⚠️ [persistentStorage] Stored cache belongs to different user: ${parsed.username}`);
      clearLocalCache();
      return null;
    }
    
    return parsed;
  } catch {
    return null;
  }
};

// Save to local cache
const saveLocalCache = (data: UserServerData): void => {
  localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(data));
  localCache = data;
  cachedUsername = data.username?.toLowerCase() || null;
  console.log(`[persistentStorage] Cache saved for user: ${cachedUsername}`);
};

// Clear local cache (on logout or user switch) - EXPORTED for external use
export const clearLocalCache = (): void => {
  console.log(`[persistentStorage] 🗑️ Clearing local cache (was: ${cachedUsername || 'none'})`);
  localStorage.removeItem(LOCAL_CACHE_KEY);
  localCache = null;
  cachedUsername = null;
  clearAuthData();
};

// Force clear ALL persistent storage data (for user isolation)
export const clearAllPersistentData = (): void => {
  console.log(`[persistentStorage] 🔒 CLEARING ALL persistent storage data...`);
  localStorage.removeItem(LOCAL_CACHE_KEY);
  localCache = null;
  cachedUsername = null;
  clearAuthData();
};

// Load user data from server
export const loadUserDataFromServer = async (username: string): Promise<UserServerData | null> => {
  const normalizedUsername = username.toLowerCase();
  
  try {
    const auth_token = getAuthToken();
    const email = getAuthEmail();
    
    // If no auth token, can't load from server securely
    if (!auth_token || !email) {
      console.log(`⚠️ No auth token available for server load`);
      return getLocalCache(normalizedUsername); // Verify cache belongs to this user
    }
    
    console.log(`🔄 Carregando dados do servidor para: ${normalizedUsername}`);
    
    const { data, error } = await supabase.functions.invoke('user-data-storage', {
      body: { 
        action: 'load', 
        username: normalizedUsername,
        email,
        auth_token
      }
    });

    if (error) {
      console.error('Erro ao carregar do servidor:', error);
      // Fallback to local cache - only if it belongs to this user
      return getLocalCache(normalizedUsername);
    }

    if (data?.success && data?.data) {
      // Verify the data belongs to the correct user
      if (data.data.username && data.data.username.toLowerCase() !== normalizedUsername) {
        console.warn(`⚠️ Server returned data for wrong user: ${data.data.username}`);
        return null;
      }
      
      console.log(`✅ Dados carregados do servidor para: ${normalizedUsername}`);
      saveLocalCache(data.data);
      return data.data;
    }

    // No data on server - check local cache (only if it belongs to this user)
    const localData = getLocalCache(normalizedUsername);
    if (localData && localData.username?.toLowerCase() === normalizedUsername) {
      console.log(`📦 Usando cache local para: ${normalizedUsername}`);
      return localData;
    }

    // Initialize new user data
    const newUserData: UserServerData = {
      username: normalizedUsername,
      profiles: {},
      lastFetchDates: {},
      lastSyncedAt: new Date().toISOString()
    };
    
    return newUserData;
  } catch (error) {
    console.error('Erro ao carregar dados:', error);
    return getLocalCache(normalizedUsername);
  }
};

// Save user data to server
export const saveUserDataToServer = async (data: UserServerData): Promise<boolean> => {
  try {
    // Always save locally first (fast)
    saveLocalCache(data);
    
    const auth_token = getAuthToken();
    const email = getAuthEmail();
    
    // If no auth token, only save locally
    if (!auth_token || !email) {
      console.log(`⚠️ No auth token - saving only to local cache`);
      return true;
    }
    
    console.log(`💾 Salvando dados no servidor para: ${data.username}`);
    
    const { data: response, error } = await supabase.functions.invoke('user-data-storage', {
      body: { 
        action: 'save', 
        username: data.username, 
        email,
        auth_token,
        data 
      }
    });

    if (error) {
      console.error('Erro ao salvar no servidor:', error);
      return false;
    }

    if (response?.success) {
      console.log(`✅ Dados salvos no servidor para: ${data.username}`);
      return true;
    }

    return false;
  } catch (error) {
    console.error('Erro ao salvar dados:', error);
    return false;
  }
};

// Fetch screenshots from squarecloud_user_profiles table
export const fetchProfileScreenshotsFromCloud = async (
  squarecloudUsername: string,
  instagramUsernames: string[]
): Promise<Record<string, { screenshotUrl: string | null }>> => {
  const results: Record<string, { screenshotUrl: string | null }> = {};
  
  if (instagramUsernames.length === 0) return results;
  
  try {
    console.log(`🔍 Buscando screenshots da nuvem para ${instagramUsernames.length} perfis...`);
    
    const { data, error } = await supabase
      .from('squarecloud_user_profiles')
      .select('instagram_username, profile_screenshot_url')
      .eq('squarecloud_username', squarecloudUsername.toLowerCase())
      .in('instagram_username', instagramUsernames.map(u => u.toLowerCase()));
    
    if (error) {
      console.error('Erro ao buscar screenshots:', error);
      return results;
    }
    
    if (data) {
      data.forEach(row => {
        results[row.instagram_username.toLowerCase()] = {
          screenshotUrl: row.profile_screenshot_url
        };
      });
      console.log(`✅ Screenshots encontrados: ${Object.keys(results).length}`);
    }
  } catch (err) {
    console.error('Erro ao buscar screenshots da nuvem:', err);
  }
  
  return results;
};

// Initialize user data on login and register auto-sync callback
export const initializeUserData = async (username: string): Promise<void> => {
  const normalizedUsername = username.toLowerCase();
  
  // CRITICAL: Clear cache if it belongs to a different user
  if (cachedUsername && cachedUsername !== normalizedUsername) {
    console.log(`[persistentStorage] ⚠️ Cache belongs to different user (${cachedUsername}), clearing...`);
    clearLocalCache();
  }
  
  const serverData = await loadUserDataFromServer(username);
  if (serverData) {
    localCache = serverData;
    cachedUsername = serverData.username?.toLowerCase() || normalizedUsername;
    
    // Fetch and update screenshots from squarecloud_user_profiles table
    const instagramUsernames = Object.keys(serverData.profiles);
    if (instagramUsernames.length > 0) {
      const screenshots = await fetchProfileScreenshotsFromCloud(normalizedUsername, instagramUsernames);
      
      // Update profiles with screenshots from cloud
      Object.entries(screenshots).forEach(([igUsername, data]) => {
        if (serverData.profiles[igUsername] && data.screenshotUrl) {
          serverData.profiles[igUsername].screenshotUrl = data.screenshotUrl;
          console.log(`📸 Screenshot carregado da nuvem para @${igUsername}`);
        }
      });
      
      // Update cache with screenshot data
      localCache = serverData;
      saveLocalCache(serverData);
    }
  }
  
  // Register the auto-sync callback so every saveSession() syncs to server
  setServerSyncCallback(syncSessionToPersistent);
  console.log('✅ Auto-sync com servidor ativado');
};

// Get current user data (from cache or server) - optionally verify against expected username
export const getCurrentUserData = (expectedUsername?: string): UserServerData | null => {
  // If we have in-memory cache, verify it belongs to the expected user
  if (localCache) {
    if (expectedUsername && cachedUsername && cachedUsername !== expectedUsername.toLowerCase()) {
      console.log(`[persistentStorage] ⚠️ In-memory cache mismatch: expected=${expectedUsername}, cached=${cachedUsername}`);
      clearLocalCache();
      return null;
    }
    return localCache;
  }
  
  // Fall back to localStorage cache
  return getLocalCache(expectedUsername);
};

// Check if profile needs refresh (30 days since last fetch)
export const needsRefresh = (username: string): boolean => {
  const userData = getCurrentUserData();
  if (!userData) return true;
  
  const normalizedUsername = username.toLowerCase();
  const lastFetch = userData.lastFetchDates[normalizedUsername];
  
  if (!lastFetch) return true;
  
  const lastFetchDate = new Date(lastFetch);
  const now = new Date();
  const diffMs = now.getTime() - lastFetchDate.getTime();
  
  return diffMs >= REFRESH_INTERVAL_MS;
};

// Get days until next refresh
export const getDaysUntilRefresh = (username: string): number => {
  const userData = getCurrentUserData();
  if (!userData) return 0;
  
  const normalizedUsername = username.toLowerCase();
  const lastFetch = userData.lastFetchDates[normalizedUsername];
  
  if (!lastFetch) return 0;
  
  const lastFetchDate = new Date(lastFetch);
  const nextRefresh = new Date(lastFetchDate.getTime() + REFRESH_INTERVAL_MS);
  const now = new Date();
  const diffMs = nextRefresh.getTime() - now.getTime();
  
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
};

// Mark profile as fetched
export const markProfileFetched = (igUsername: string): void => {
  const userData = getCurrentUserData();
  if (userData) {
    userData.lastFetchDates[igUsername.toLowerCase()] = new Date().toISOString();
    saveLocalCache(userData);
    // Don't await - save in background
    saveUserDataToServer(userData);
  }
};

// Check if profile data exists
export const hasPersistedProfileData = (igUsername: string): boolean => {
  const userData = getCurrentUserData();
  if (!userData) return false;
  return !!userData.profiles[igUsername.toLowerCase()];
};

// Get persisted profile data
export const getPersistedProfile = (igUsername: string): PersistentProfileData | null => {
  const userData = getCurrentUserData();
  if (!userData) return null;
  return userData.profiles[igUsername.toLowerCase()] || null;
};

// Save profile data persistently (to cache and server)
export const persistProfileData = async (
  loggedInUsername: string,
  igUsername: string,
  profile: InstagramProfile,
  analysis: ProfileAnalysis,
  existingData?: Partial<PersistentProfileData>
): Promise<void> => {
  const normalizedIG = igUsername.toLowerCase();
  const now = new Date().toISOString();
  
  // Get or create user data
  let userData = getCurrentUserData();
  if (!userData) {
    userData = {
      username: loggedInUsername,
      profiles: {},
      lastFetchDates: {},
      lastSyncedAt: now
    };
  }
  
  // Get existing data to preserve strategies, creatives, etc.
  const existing = userData.profiles[normalizedIG];
  
  userData.profiles[normalizedIG] = {
    username: normalizedIG,
    profile,
    analysis,
    strategies: existingData?.strategies || existing?.strategies || [],
    creatives: existingData?.creatives || existing?.creatives || [],
    creativesRemaining: existingData?.creativesRemaining ?? existing?.creativesRemaining ?? 6,
    growthHistory: mergeGrowthHistories(
      existingData?.growthHistory || [], 
      existing?.growthHistory || [createSnapshot(profile)]
    ),
    growthInsights: mergeGrowthInsights(
      existingData?.growthInsights || [], 
      existing?.growthInsights || []
    ),
    lastFetchDate: now,
    syncedAt: existing?.syncedAt || now,
    lastUpdated: now,
    lastStrategyGeneratedAt: existing?.lastStrategyGeneratedAt,
    strategyGenerationDates: existing?.strategyGenerationDates || {}
  };
  
  userData.lastFetchDates[normalizedIG] = now;
  userData.lastSyncedAt = now;
  
  // Save locally first (fast)
  saveLocalCache(userData);
  
  // Save to server in background
  await saveUserDataToServer(userData);
  
  console.log(`💾 Perfil @${normalizedIG} salvo permanentemente no servidor`);
};
// Update profile in persistent storage
export const updatePersistedProfile = async (
  loggedInUsername: string,
  igUsername: string,
  updates: Partial<PersistentProfileData>
): Promise<void> => {
  const normalizedIG = igUsername.toLowerCase();
  const userData = getCurrentUserData();
  
  if (!userData || !userData.profiles[normalizedIG]) {
    console.warn(`Perfil @${igUsername} não encontrado para atualização`);
    return;
  }
  
  const now = new Date().toISOString();
  userData.profiles[normalizedIG] = {
    ...userData.profiles[normalizedIG],
    ...updates,
    lastUpdated: now
  };
  userData.lastSyncedAt = now;
  
  saveLocalCache(userData);
  await saveUserDataToServer(userData);
};

// Clear strategy dates from persistent storage (for admin reanalysis)
// This allows strategies to be regenerated immediately with the new niche
export const clearPersistedStrategyDates = async (
  loggedInUsername: string,
  igUsername: string
): Promise<void> => {
  const normalizedIG = igUsername.toLowerCase();
  const userData = getCurrentUserData();
  
  if (!userData || !userData.profiles[normalizedIG]) {
    console.warn(`Perfil @${igUsername} não encontrado para limpar datas`);
    return;
  }
  
  console.log(`🔄 Limpando datas de estratégias do cloud para @${igUsername}`);
  
  const now = new Date().toISOString();
  userData.profiles[normalizedIG] = {
    ...userData.profiles[normalizedIG],
    strategies: [], // Clear old strategies
    strategyGenerationDates: {}, // Clear all generation dates - allows immediate regeneration
    lastStrategyGeneratedAt: undefined, // Clear legacy date too
    lastUpdated: now
  };
  userData.lastSyncedAt = now;
  
  saveLocalCache(userData);
  await saveUserDataToServer(userData);
  
  console.log(`✅ Datas de estratégias limpas do cloud para @${igUsername}`);
};

// Sync persistent storage with session storage
export const syncPersistentToSession = (): void => {
  const userData = getCurrentUserData();
  if (!userData) return;
  
  const session = getSession();
  
  Object.values(userData.profiles).forEach(persistedData => {
    // Check if profile exists in session
    const existingInSession = session.profiles.find(
      p => p.profile.username.toLowerCase() === persistedData.username.toLowerCase()
    );
    
    if (!existingInSession) {
      // Add to session from persistent storage
      const profileSession: ProfileSession = {
        id: `profile_${Date.now()}_${persistedData.username}`,
        profile: persistedData.profile,
        analysis: persistedData.analysis,
        strategies: persistedData.strategies,
        creatives: persistedData.creatives,
        creativesRemaining: persistedData.creativesRemaining,
        initialSnapshot: persistedData.growthHistory[0] || createSnapshot(persistedData.profile),
        growthHistory: persistedData.growthHistory,
        growthInsights: persistedData.growthInsights,
        startedAt: persistedData.syncedAt,
        lastUpdated: persistedData.lastUpdated,
        lastStrategyGeneratedAt: persistedData.lastStrategyGeneratedAt,
        strategyGenerationDates: persistedData.strategyGenerationDates || {},
        // CRITICAL: Restore screenshot data from cloud
        screenshotUrl: persistedData.screenshotUrl,
        screenshotUploadCount: persistedData.screenshotUploadCount,
        screenshotHistory: persistedData.screenshotHistory
      };
      
      session.profiles.push(profileSession);
      if (!session.activeProfileId) {
        session.activeProfileId = profileSession.id;
      }
    } else {
      // Update existing session with data from persistent storage
      // CRITICAL: Cloud/server data takes precedence for limits and cooldowns
      existingInSession.strategies = existingInSession.strategies.length > 0 
        ? existingInSession.strategies 
        : persistedData.strategies;
      existingInSession.creatives = existingInSession.creatives.length > 0 
        ? existingInSession.creatives 
        : persistedData.creatives;
      // Use the LOWER value for credits remaining (prevents abuse)
      existingInSession.creativesRemaining = Math.min(
        existingInSession.creativesRemaining,
        persistedData.creativesRemaining
      );
      // CRITICAL: Merge growth data from cloud and local - never lose history
      existingInSession.growthHistory = mergeGrowthHistories(
        existingInSession.growthHistory || [],
        persistedData.growthHistory || []
      );
      existingInSession.growthInsights = mergeGrowthInsights(
        existingInSession.growthInsights || [],
        persistedData.growthInsights || []
      );
      // Update initial snapshot if cloud has earlier data
      if (existingInSession.growthHistory.length > 0) {
        const cloudFirstSnapshot = persistedData.growthHistory[0];
        const localFirstSnapshot = existingInSession.initialSnapshot;
        if (cloudFirstSnapshot && (!localFirstSnapshot || new Date(cloudFirstSnapshot.date) < new Date(localFirstSnapshot.date))) {
          existingInSession.initialSnapshot = cloudFirstSnapshot;
        }
      }
      // CRITICAL: Restore strategy generation dates (prevents regeneration abuse)
      if (persistedData.lastStrategyGeneratedAt) {
        existingInSession.lastStrategyGeneratedAt = persistedData.lastStrategyGeneratedAt;
      }
      // Merge strategy generation dates - keep the most restrictive (oldest dates)
      if (persistedData.strategyGenerationDates) {
        existingInSession.strategyGenerationDates = existingInSession.strategyGenerationDates || {};
        Object.entries(persistedData.strategyGenerationDates).forEach(([type, date]) => {
          const existingDate = existingInSession.strategyGenerationDates?.[type as keyof typeof existingInSession.strategyGenerationDates];
          // Keep the server date if it exists (prevents bypass)
          if (date && (!existingDate || new Date(date) < new Date(existingDate))) {
            existingInSession.strategyGenerationDates![type as keyof typeof existingInSession.strategyGenerationDates] = date;
          }
        });
      }
      // CRITICAL: Restore screenshot data from cloud (cloud takes precedence)
      if (persistedData.screenshotUrl && !existingInSession.screenshotUrl) {
        existingInSession.screenshotUrl = persistedData.screenshotUrl;
      }
      if (persistedData.screenshotUploadCount !== undefined) {
        existingInSession.screenshotUploadCount = persistedData.screenshotUploadCount;
      }
      if (persistedData.screenshotHistory && persistedData.screenshotHistory.length > 0) {
        existingInSession.screenshotHistory = persistedData.screenshotHistory;
      }
    }
  });
  
  baseSaveSession(session);
  console.log(`🔄 Sessão sincronizada com ${Object.keys(userData.profiles).length} perfis do servidor`);
};

// Sync session storage to persistent (call after any session update)
export const syncSessionToPersistent = async (loggedInUsername: string): Promise<void> => {
  const session = getSession();
  let userData = getCurrentUserData();
  
  if (!userData) {
    userData = {
      username: loggedInUsername,
      profiles: {},
      lastFetchDates: {},
      lastSyncedAt: new Date().toISOString()
    };
  }
  
  session.profiles.forEach(profileSession => {
    const normalizedUsername = profileSession.profile.username.toLowerCase();
    
    userData!.profiles[normalizedUsername] = {
      username: normalizedUsername,
      profile: profileSession.profile,
      analysis: profileSession.analysis,
      strategies: profileSession.strategies,
      creatives: profileSession.creatives,
      creativesRemaining: profileSession.creativesRemaining,
      growthHistory: profileSession.growthHistory,
      growthInsights: profileSession.growthInsights,
      lastFetchDate: profileSession.lastUpdated || new Date().toISOString(),
      syncedAt: profileSession.startedAt,
      lastUpdated: profileSession.lastUpdated,
      lastStrategyGeneratedAt: profileSession.lastStrategyGeneratedAt,
      strategyGenerationDates: (profileSession.strategyGenerationDates as Record<string, string>) || {},
      // CRITICAL: Save screenshot data to cloud
      screenshotUrl: profileSession.screenshotUrl,
      screenshotUploadCount: profileSession.screenshotUploadCount,
      screenshotHistory: profileSession.screenshotHistory
    };
  });
  
  userData.lastSyncedAt = new Date().toISOString();
  
  console.log(`🔄 Syncing to server: ${session.profiles.length} profiles`, 
    session.profiles.map(p => ({
      username: p.profile.username,
      strategies: p.strategies.length,
      creatives: p.creatives.length,
      creditsRemaining: p.creativesRemaining,
      strategyDates: p.strategyGenerationDates
    }))
  );
  
  saveLocalCache(userData);
  await saveUserDataToServer(userData);
};

// Load all persisted data on login
export const loadPersistedDataOnLogin = async (loggedInUsername: string, registeredUsernames: string[]): Promise<void> => {
  console.log(`🔐 Carregando dados do servidor para: ${loggedInUsername}`);
  
  // Load from server
  await initializeUserData(loggedInUsername);
  
  const userData = getCurrentUserData();
  if (!userData) {
    console.log('⚠️ Nenhum dado encontrado no servidor');
    return;
  }
  
  const session = getSession();
  
  registeredUsernames.forEach(username => {
    const normalizedUsername = username.toLowerCase();
    const persistedData = userData.profiles[normalizedUsername];
    
    if (persistedData) {
      // Check if already in session
      const existingIndex = session.profiles.findIndex(
        p => p.profile.username.toLowerCase() === normalizedUsername
      );
      
      if (existingIndex === -1) {
        // Create new profile session from cloud data
        const profileSession: ProfileSession = {
          id: `profile_${Date.now()}_${normalizedUsername}`,
          profile: persistedData.profile,
          analysis: persistedData.analysis,
          strategies: persistedData.strategies,
          creatives: persistedData.creatives,
          creativesRemaining: persistedData.creativesRemaining,
          initialSnapshot: persistedData.growthHistory[0] || createSnapshot(persistedData.profile),
          growthHistory: persistedData.growthHistory || [],
          growthInsights: persistedData.growthInsights || [],
          startedAt: persistedData.syncedAt,
          lastUpdated: persistedData.lastUpdated,
          lastStrategyGeneratedAt: persistedData.lastStrategyGeneratedAt,
          strategyGenerationDates: persistedData.strategyGenerationDates || {},
          screenshotUrl: persistedData.screenshotUrl,
          screenshotUploadCount: persistedData.screenshotUploadCount,
          screenshotHistory: persistedData.screenshotHistory
        };
        
        session.profiles.push(profileSession);
        console.log(`✅ Perfil @${normalizedUsername} restaurado do servidor:`, {
          strategies: profileSession.strategies.length,
          creatives: profileSession.creatives.length,
          growthHistory: profileSession.growthHistory.length,
          growthInsights: profileSession.growthInsights.length,
          screenshotUrl: profileSession.screenshotUrl
        });
      } else {
        // MERGE existing session with cloud data - cloud takes priority for growth data
        const existingSession = session.profiles[existingIndex];
        
        existingSession.growthHistory = mergeGrowthHistories(
          existingSession.growthHistory || [],
          persistedData.growthHistory || []
        );
        existingSession.growthInsights = mergeGrowthInsights(
          existingSession.growthInsights || [],
          persistedData.growthInsights || []
        );
        
        // Update initial snapshot if cloud has earlier data
        if (persistedData.growthHistory.length > 0) {
          const cloudFirstSnapshot = persistedData.growthHistory[0];
          if (cloudFirstSnapshot && (!existingSession.initialSnapshot || 
              new Date(cloudFirstSnapshot.date) < new Date(existingSession.initialSnapshot.date))) {
            existingSession.initialSnapshot = cloudFirstSnapshot;
          }
        }
        
        // Restore screenshot if missing locally
        if (persistedData.screenshotUrl && !existingSession.screenshotUrl) {
          existingSession.screenshotUrl = persistedData.screenshotUrl;
        }
        
        console.log(`🔄 Perfil @${normalizedUsername} mesclado com nuvem:`, {
          growthHistory: existingSession.growthHistory.length,
          growthInsights: existingSession.growthInsights.length
        });
      }
    }
  });
  
  if (session.profiles.length > 0 && !session.activeProfileId) {
    session.activeProfileId = session.profiles[0].id;
  }
  
  baseSaveSession(session);
};

// Check if data needs to be fetched or can use cached
export const shouldFetchProfile = (igUsername: string): { shouldFetch: boolean; reason: string } => {
  const normalizedUsername = igUsername.toLowerCase();
  const hasData = hasPersistedProfileData(normalizedUsername);
  const needsUpdate = needsRefresh(normalizedUsername);
  
  if (!hasData) {
    return { shouldFetch: true, reason: 'Nenhum dado armazenado' };
  }
  
  if (needsUpdate) {
    const daysUntil = getDaysUntilRefresh(normalizedUsername);
    return { shouldFetch: true, reason: `Dados desatualizados (próxima atualização em ${daysUntil} dias)` };
  }
  
  const daysUntil = getDaysUntilRefresh(normalizedUsername);
  return { shouldFetch: false, reason: `Usando dados do servidor. Próxima atualização em ${daysUntil} dias.` };
};

// Get profile summary for admin/debug
export const getStorageSummary = (): { 
  totalProfiles: number; 
  profiles: Array<{ username: string; lastFetch: string; daysUntilRefresh: number }>;
} => {
  const userData = getCurrentUserData();
  if (!userData) {
    return { totalProfiles: 0, profiles: [] };
  }
  
  const profileSummary = Object.keys(userData.profiles).map(username => ({
    username,
    lastFetch: userData.lastFetchDates[username] || 'Nunca',
    daysUntilRefresh: getDaysUntilRefresh(username)
  }));
  
  return {
    totalProfiles: profileSummary.length,
    profiles: profileSummary
  };
};
