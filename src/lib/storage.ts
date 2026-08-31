import { 
  MROSession, 
  InstagramProfile, 
  ProfileAnalysis, 
  Strategy, 
  Creative,
  ProfileSession,
  GrowthSnapshot,
  GrowthInsight,
  StrategyType
} from '@/types/instagram';

const STORAGE_KEY = 'mro_session';
const ARCHIVE_KEY = 'mro_archived_profiles';

export const getSession = (): MROSession => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Validate basic structure
      if (!parsed || typeof parsed !== 'object') {
        console.warn('[storage] Invalid session format, returning empty');
        return createEmptySession();
      }
      // Migrate old session format to new multi-profile format
      if (parsed.profile && !parsed.profiles) {
        return migrateOldSession(parsed);
      }
      // Ensure profiles array exists
      if (!Array.isArray(parsed.profiles)) {
        console.warn('[storage] Missing profiles array, returning empty');
        return createEmptySession();
      }
      return parsed;
    }
  } catch (e) {
    console.error('[storage] Error parsing session, clearing:', e);
    localStorage.removeItem(STORAGE_KEY);
  }
  return createEmptySession();
};

const migrateOldSession = (oldSession: any): MROSession => {
  if (!oldSession.profile) {
    return createEmptySession();
  }
  
  const profileId = `profile_${Date.now()}`;
  const now = new Date().toISOString();
  
  const profileSession: ProfileSession = {
    id: profileId,
    profile: oldSession.profile,
    analysis: oldSession.analysis,
    strategies: oldSession.strategies || [],
    creatives: oldSession.creatives || [],
    creativesRemaining: oldSession.creativesRemaining ?? 6,
    initialSnapshot: createSnapshot(oldSession.profile),
    growthHistory: [createSnapshot(oldSession.profile)],
    growthInsights: [],
    startedAt: oldSession.lastUpdated || now,
    lastUpdated: now,
  };

  return {
    profiles: [profileSession],
    activeProfileId: profileId,
    lastUpdated: now,
  };
};

export const createEmptySession = (): MROSession => ({
  profiles: [],
  activeProfileId: null,
  lastUpdated: new Date().toISOString(),
});

export const createSnapshot = (profile: InstagramProfile): GrowthSnapshot => ({
  date: new Date().toISOString(),
  followers: profile.followers,
  following: profile.following,
  posts: profile.posts,
  avgLikes: profile.avgLikes,
  avgComments: profile.avgComments,
  engagement: profile.engagement,
});

// Flag to prevent circular sync calls
let isSyncingToServer = false;
let isSyncingToCloud = false;

// Callback to sync to server (set by persistentStorage)
let serverSyncCallback: ((username: string) => Promise<void>) | null = null;

// Cloud sync function reference (set externally)
let cloudSyncCallback: ((
  username: string,
  email: string | undefined,
  daysRemaining: number,
  profileSessions: ProfileSession[],
  archivedProfiles: ProfileSession[]
) => Promise<boolean>) | null = null;

export const setServerSyncCallback = (callback: (username: string) => Promise<void>) => {
  serverSyncCallback = callback;
};

export const setCloudSyncCallback = (callback: typeof cloudSyncCallback) => {
  cloudSyncCallback = callback;
};

// Get logged in username from userStorage
const getLoggedUsername = (): string => {
  try {
    const stored = localStorage.getItem('mro_user_session');
    if (stored) {
      const parsed = JSON.parse(stored);
      return parsed.user?.username || 'anonymous';
    }
  } catch {}
  return 'anonymous';
};

// Get user data for cloud sync
const getLoggedUserData = (): { username: string; email?: string; daysRemaining: number } => {
  try {
    const stored = localStorage.getItem('mro_user_session');
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        username: parsed.user?.username || 'anonymous',
        email: parsed.user?.email,
        daysRemaining: parsed.user?.daysRemaining || 365
      };
    }
  } catch {}
  return { username: 'anonymous', daysRemaining: 365 };
};

// Sync session to cloud storage
const syncToCloud = async (session: MROSession) => {
  if (isSyncingToCloud) {
    console.log('☁️ Sync already in progress, skipping...');
    return;
  }
  
  if (!cloudSyncCallback) {
    console.warn('☁️ Cloud sync callback not set - data will not persist to cloud!');
    return;
  }
  
  const userData = getLoggedUserData();
  if (userData.username === 'anonymous') {
    console.log('☁️ Anonymous user, skipping cloud sync');
    return;
  }
  
  isSyncingToCloud = true;
  try {
    const archived = getArchivedProfiles();
    const totalStrategies = session.profiles.reduce((sum, p) => sum + p.strategies.length, 0);
    const totalCreatives = session.profiles.reduce((sum, p) => sum + p.creatives.length, 0);
    const totalGrowthHistory = session.profiles.reduce((sum, p) => sum + (p.growthHistory?.length || 0), 0);
    const totalGrowthInsights = session.profiles.reduce((sum, p) => sum + (p.growthInsights?.length || 0), 0);
    
    // Log detailed info including growth data
    session.profiles.forEach(p => {
      console.log(`☁️ Profile @${p.profile.username}:`, {
        creatives: p.creatives.length,
        creditsRemaining: p.creativesRemaining,
        growthHistory: p.growthHistory?.length || 0,
        growthInsights: p.growthInsights?.length || 0
      });
    });
    
    console.log(`☁️ Syncing to cloud: ${session.profiles.length} profiles, ${totalStrategies} strategies, ${totalCreatives} creatives, ${totalGrowthHistory} snapshots, ${totalGrowthInsights} insights`);
    
    const success = await cloudSyncCallback(
      userData.username,
      userData.email,
      userData.daysRemaining,
      session.profiles,
      archived
    );
    
    if (success) {
      console.log('✅ Cloud sync completed successfully');
    } else {
      console.warn('⚠️ Cloud sync returned false');
    }
  } catch (error) {
    console.error('❌ Error syncing to cloud:', error);
  } finally {
    isSyncingToCloud = false;
  }
};

export const saveSession = (session: MROSession): void => {
  session.lastUpdated = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  console.log(`💾 Sessão salva: ${session.profiles.length} perfis`);
  
  // Auto-sync to server in background (only if not already syncing)
  if (serverSyncCallback && !isSyncingToServer) {
    const username = getLoggedUsername();
    if (username !== 'anonymous') {
      isSyncingToServer = true;
      serverSyncCallback(username).finally(() => {
        isSyncingToServer = false;
      });
    }
  }
  
  // Auto-sync to cloud in background
  syncToCloud(session);
};

// Initialize session from cloud data
// CRITICAL: This REPLACES local data entirely - NO MERGING to prevent data contamination!
export const initializeFromCloud = (profileSessions: ProfileSession[], archivedProfiles: ProfileSession[]): void => {
  const loggedUsername = getLoggedUsername();
  
  console.log(`☁️ [${loggedUsername}] ===========================================`);
  console.log(`☁️ [${loggedUsername}] INITIALIZING FROM CLOUD (COMPLETE REPLACEMENT)`);
  console.log(`☁️ [${loggedUsername}] ===========================================`);
  console.log(`☁️ [${loggedUsername}] Incoming cloud data:`, {
    cloudProfiles: profileSessions.length,
    cloudArchived: archivedProfiles.length,
    profileUsernames: profileSessions.map(p => p.profile.username)
  });
  
  // CRITICAL: Check what's currently in local storage BEFORE clearing
  const existingLocal = localStorage.getItem(STORAGE_KEY);
  if (existingLocal) {
    try {
      const parsed = JSON.parse(existingLocal);
      console.log(`☁️ [${loggedUsername}] ⚠️ Existing local data being REPLACED:`, {
        localProfiles: parsed.profiles?.length || 0,
        localUsernames: parsed.profiles?.map((p: ProfileSession) => p.profile?.username) || []
      });
    } catch (e) {
      console.log(`☁️ [${loggedUsername}] ⚠️ Corrupted local data found, will be cleared`);
    }
  }
  
  // Log detailed info about each cloud profile - INCLUDING growth data
  profileSessions.forEach(p => {
    console.log(`☁️ [${loggedUsername}] Cloud profile @${p.profile.username}:`, {
      id: p.id,
      strategies: p.strategies?.length || 0,
      creatives: p.creatives?.length || 0,
      creativesRemaining: p.creativesRemaining,
      growthHistory: p.growthHistory?.length || 0,
      growthInsights: p.growthInsights?.length || 0,
    });
  });
  
  // CRITICAL: Clear local data BEFORE setting new data to prevent any contamination
  console.log(`☁️ [${loggedUsername}] 🗑️ Clearing local storage...`);
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(ARCHIVE_KEY);
  
  // CRITICAL: Deduplicate profiles by username (keep the one with most data)
  const profileMap = new Map<string, ProfileSession>();
  profileSessions.forEach(cloudProfile => {
    const username = cloudProfile.profile.username.toLowerCase();
    const existing = profileMap.get(username);
    
    if (!existing) {
      profileMap.set(username, cloudProfile);
    } else {
      // Keep the profile with more data (strategies, creatives, etc.)
      const existingScore = (existing.strategies?.length || 0) + (existing.creatives?.length || 0) + (existing.growthHistory?.length || 0);
      const newScore = (cloudProfile.strategies?.length || 0) + (cloudProfile.creatives?.length || 0) + (cloudProfile.growthHistory?.length || 0);
      
      if (newScore > existingScore) {
        console.log(`☁️ [${loggedUsername}] Replacing duplicate @${username} with better data`);
        profileMap.set(username, cloudProfile);
      } else {
        console.log(`☁️ [${loggedUsername}] Skipping duplicate @${username}`);
      }
    }
  });
  
  const deduplicatedProfiles = Array.from(profileMap.values());
  console.log(`☁️ [${loggedUsername}] Deduplicated: ${profileSessions.length} -> ${deduplicatedProfiles.length} profiles`);
  
  // CRITICAL: Cloud data is the ONLY source of truth - NO MERGING with local data!
  const normalizedProfiles: ProfileSession[] = deduplicatedProfiles.map(cloudProfile => {
    // Ensure initialSnapshot exists - use first growth history entry or create from profile
    let initialSnapshot = cloudProfile.initialSnapshot;
    if (!initialSnapshot && cloudProfile.growthHistory && cloudProfile.growthHistory.length > 0) {
      initialSnapshot = cloudProfile.growthHistory[0];
    }
    if (!initialSnapshot && cloudProfile.profile) {
      initialSnapshot = createSnapshot(cloudProfile.profile);
    }
    
    return {
      ...cloudProfile,
      strategies: cloudProfile.strategies || [],
      creatives: cloudProfile.creatives || [],
      creativesRemaining: cloudProfile.creativesRemaining ?? 6,
      strategyGenerationDates: cloudProfile.strategyGenerationDates || {},
      lastStrategyGeneratedAt: cloudProfile.lastStrategyGeneratedAt,
      initialSnapshot: initialSnapshot!,
      growthHistory: cloudProfile.growthHistory || [],
      growthInsights: cloudProfile.growthInsights || [],
      screenshotUrl: cloudProfile.screenshotUrl,
      screenshotUploadCount: cloudProfile.screenshotUploadCount || 0,
      screenshotHistory: cloudProfile.screenshotHistory || [],
    };
  });
  
  // Create fresh session with ONLY cloud profiles for THIS user
  const session: MROSession = {
    profiles: normalizedProfiles,
    activeProfileId: normalizedProfiles.length > 0 ? normalizedProfiles[0].id : null,
    lastUpdated: new Date().toISOString(),
  };
  
  // Log final state with growth data
  console.log(`☁️ [${loggedUsername}] ✅ Final initialized state:`, {
    totalProfiles: session.profiles.length,
    activeProfileId: session.activeProfileId,
    profileUsernames: session.profiles.map(p => p.profile.username),
    totalCreatives: session.profiles.reduce((sum, p) => sum + p.creatives.length, 0),
    totalStrategies: session.profiles.reduce((sum, p) => sum + p.strategies.length, 0),
    totalGrowthHistory: session.profiles.reduce((sum, p) => sum + p.growthHistory.length, 0),
    totalGrowthInsights: session.profiles.reduce((sum, p) => sum + p.growthInsights.length, 0)
  });
  
  // Save locally but don't trigger cloud sync (would be circular)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  
  // Also restore archived profiles from cloud ONLY (replace local)
  if (archivedProfiles.length > 0) {
    localStorage.setItem(ARCHIVE_KEY, JSON.stringify(archivedProfiles));
    console.log(`☁️ [${loggedUsername}] Restored ${archivedProfiles.length} archived profiles`);
  }
  
  console.log(`☁️ [${loggedUsername}] ===========================================`);
  console.log(`☁️ [${loggedUsername}] ✅ CLOUD INITIALIZATION COMPLETE`);
  console.log(`☁️ [${loggedUsername}] ===========================================`);
};

export const getActiveProfile = (): ProfileSession | null => {
  const session = getSession();
  if (!session.activeProfileId) return null;
  return session.profiles.find(p => p.id === session.activeProfileId) || null;
};

export const addProfile = (profile: InstagramProfile, analysis: ProfileAnalysis): ProfileSession => {
  const session = getSession();
  const normalizedUsername = profile.username.toLowerCase();
  
  // CRITICAL: Check if profile already exists in session to prevent duplicates
  const existingProfile = session.profiles.find(
    p => p.profile.username.toLowerCase() === normalizedUsername
  );
  
  if (existingProfile) {
    console.log(`⚠️ Profile @${profile.username} already exists in session, updating instead of adding`);
    // Update existing profile instead of creating duplicate
    existingProfile.profile = profile;
    existingProfile.analysis = analysis;
    existingProfile.lastUpdated = new Date().toISOString();
    
    // Add new growth snapshot if data changed
    const lastSnapshot = existingProfile.growthHistory[existingProfile.growthHistory.length - 1];
    if (!lastSnapshot || lastSnapshot.followers !== profile.followers) {
      existingProfile.growthHistory.push(createSnapshot(profile));
    }
    
    session.activeProfileId = existingProfile.id;
    saveSession(session);
    return existingProfile;
  }
  
  // Check if this profile was previously archived (removed then re-synced)
  const archivedProfile = getArchivedByUsername(profile.username);
  
  if (archivedProfile) {
    // Restore from archive - keeps strategies, creatives, credits used, etc.
    const restoredProfile: ProfileSession = {
      ...archivedProfile,
      id: `profile_${Date.now()}`, // New ID
      profile, // Update with fresh profile data
      analysis, // Update with fresh analysis
      lastUpdated: new Date().toISOString(),
    };
    
    // Add new growth snapshot with current data
    restoredProfile.growthHistory.push(createSnapshot(profile));
    
    session.profiles.push(restoredProfile);
    session.activeProfileId = restoredProfile.id;
    saveSession(session);
    
    // Remove from archive since it's now active again
    removeFromArchive(profile.username);
    
    return restoredProfile;
  }
  
  // New profile - create fresh session
  const profileId = `profile_${Date.now()}`;
  const now = new Date().toISOString();
  
  const newProfileSession: ProfileSession = {
    id: profileId,
    profile,
    analysis,
    strategies: [],
    creatives: [],
    creativesRemaining: 6,
    initialSnapshot: createSnapshot(profile),
    growthHistory: [createSnapshot(profile)],
    growthInsights: [],
    startedAt: now,
    lastUpdated: now,
  };

  session.profiles.push(newProfileSession);
  session.activeProfileId = profileId;
  saveSession(session);
  
  return newProfileSession;
};

export const setActiveProfile = (profileId: string): void => {
  const session = getSession();
  if (session.profiles.find(p => p.id === profileId)) {
    session.activeProfileId = profileId;
    saveSession(session);
  }
};

// Archive management - keeps removed profiles for restoration
export const getArchivedProfiles = (): ProfileSession[] => {
  const stored = localStorage.getItem(ARCHIVE_KEY);
  if (stored) {
    return JSON.parse(stored);
  }
  return [];
};

export const saveArchivedProfiles = (archived: ProfileSession[]): void => {
  localStorage.setItem(ARCHIVE_KEY, JSON.stringify(archived));
};

export const archiveProfile = (profileSession: ProfileSession): void => {
  const archived = getArchivedProfiles();
  // Remove any existing archive for this username
  const username = profileSession.profile.username.toLowerCase();
  const filtered = archived.filter(p => p.profile.username.toLowerCase() !== username);
  filtered.push(profileSession);
  saveArchivedProfiles(filtered);
};

export const getArchivedByUsername = (username: string): ProfileSession | null => {
  const archived = getArchivedProfiles();
  const normalizedUsername = username.toLowerCase();
  return archived.find(p => p.profile.username.toLowerCase() === normalizedUsername) || null;
};

export const removeFromArchive = (username: string): void => {
  const archived = getArchivedProfiles();
  const normalizedUsername = username.toLowerCase();
  const filtered = archived.filter(p => p.profile.username.toLowerCase() !== normalizedUsername);
  saveArchivedProfiles(filtered);
};

// Restore a synced profile from archive (without full profile/analysis data)
export const restoreProfileFromArchive = (username: string): ProfileSession | null => {
  const archivedProfile = getArchivedByUsername(username);
  if (!archivedProfile) return null;
  
  const session = getSession();
  
  // Check if already active
  const existingProfile = session.profiles.find(
    p => p.profile.username.toLowerCase() === username.toLowerCase()
  );
  if (existingProfile) {
    session.activeProfileId = existingProfile.id;
    saveSession(session);
    return existingProfile;
  }
  
  // Restore from archive
  const restoredProfile: ProfileSession = {
    ...archivedProfile,
    id: `profile_${Date.now()}`,
    lastUpdated: new Date().toISOString(),
  };
  
  session.profiles.push(restoredProfile);
  session.activeProfileId = restoredProfile.id;
  saveSession(session);
  
  // Remove from archive
  removeFromArchive(username);
  
  return restoredProfile;
};

export const removeProfile = (profileId: string): void => {
  const session = getSession();
  const profileToRemove = session.profiles.find(p => p.id === profileId);
  
  // Archive the profile before removing (keeps strategies, creatives, etc.)
  if (profileToRemove) {
    archiveProfile(profileToRemove);
  }
  
  session.profiles = session.profiles.filter(p => p.id !== profileId);
  if (session.activeProfileId === profileId) {
    session.activeProfileId = session.profiles[0]?.id || null;
  }
  saveSession(session);
};

export const updateProfile = (profile: InstagramProfile): void => {
  const session = getSession();
  const activeProfile = session.profiles.find(p => p.id === session.activeProfileId);
  if (activeProfile) {
    activeProfile.profile = profile;
    activeProfile.lastUpdated = new Date().toISOString();
    saveSession(session);
  }
};

export const updateAnalysis = (analysis: ProfileAnalysis, clearStrategies: boolean = false): void => {
  const session = getSession();
  const activeProfile = session.profiles.find(p => p.id === session.activeProfileId);
  if (activeProfile) {
    activeProfile.analysis = analysis;
    activeProfile.lastUpdated = new Date().toISOString();
    
    // When admin reanalyzes with new niche, clear old strategies so they regenerate with correct niche
    if (clearStrategies) {
      console.log(`🔄 Clearing strategies for reanalysis - new niche: ${analysis.niche}`);
      activeProfile.strategies = [];
      activeProfile.strategyGenerationDates = {};
      activeProfile.lastStrategyGeneratedAt = undefined;
    }
    
    saveSession(session);
  }
};

// Clear all strategies for current active profile (used when niche is reanalyzed)
export const clearStrategies = (): void => {
  const session = getSession();
  const activeProfile = session.profiles.find(p => p.id === session.activeProfileId);
  if (activeProfile) {
    console.log(`🗑️ Clearing all strategies for @${activeProfile.profile.username}`);
    activeProfile.strategies = [];
    activeProfile.strategyGenerationDates = {};
    activeProfile.lastStrategyGeneratedAt = undefined;
    activeProfile.lastUpdated = new Date().toISOString();
    saveSession(session);
  }
};

export const addStrategy = (strategy: Strategy): void => {
  const session = getSession();
  const activeProfile = session.profiles.find(p => p.id === session.activeProfileId);
  if (activeProfile) {
    activeProfile.strategies.push(strategy);
    
    // Update per-type generation date
    if (!activeProfile.strategyGenerationDates) {
      activeProfile.strategyGenerationDates = {};
    }
    activeProfile.strategyGenerationDates[strategy.type as StrategyType] = new Date().toISOString();
    
    // Legacy support
    activeProfile.lastStrategyGeneratedAt = new Date().toISOString();
    activeProfile.lastUpdated = new Date().toISOString();
    saveSession(session);
  }
};

export const getStrategyDaysRemaining = (profileId?: string, strategyType?: StrategyType): number => {
  const session = getSession();
  const profile = profileId 
    ? session.profiles.find(p => p.id === profileId)
    : session.profiles.find(p => p.id === session.activeProfileId);
  
  if (!profile) return 0;
  
  // Get per-type date or fallback to legacy date
  let lastGenerated: Date | null = null;
  
  if (strategyType && profile.strategyGenerationDates?.[strategyType]) {
    lastGenerated = new Date(profile.strategyGenerationDates[strategyType]!);
  } else if (!strategyType && profile.lastStrategyGeneratedAt) {
    // Legacy behavior for backward compatibility
    lastGenerated = new Date(profile.lastStrategyGeneratedAt);
  }
  
  if (!lastGenerated) return 0; // Can generate now
  
  const nextAvailable = new Date(lastGenerated);
  nextAvailable.setDate(nextAvailable.getDate() + 30);
  
  const now = new Date();
  const diffTime = nextAvailable.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return Math.max(0, diffDays);
};

export const canGenerateStrategy = (profileId?: string, strategyType?: StrategyType): boolean => {
  return getStrategyDaysRemaining(profileId, strategyType) === 0;
};

export const resetProfileStrategy = (profileId: string, strategyType?: StrategyType): void => {
  const session = getSession();
  const profile = session.profiles.find(p => p.id === profileId);
  if (profile) {
    if (strategyType && profile.strategyGenerationDates) {
      delete profile.strategyGenerationDates[strategyType];
    } else {
      // Reset all
      profile.lastStrategyGeneratedAt = undefined;
      profile.strategyGenerationDates = {};
    }
    profile.lastUpdated = new Date().toISOString();
    saveSession(session);
  }
};

export const addCreative = (creative: Creative): void => {
  const session = getSession();
  console.log('🎨 addCreative called:', {
    activeProfileId: session.activeProfileId,
    profilesCount: session.profiles.length,
    creativeId: creative.id,
    imageUrlType: creative.imageUrl?.startsWith('data:') ? 'base64' : 'url'
  });
  
  const activeProfile = session.profiles.find(p => p.id === session.activeProfileId);
  
  if (!activeProfile) {
    console.error('❌ addCreative: No active profile found!');
    return;
  }
  
  if (activeProfile.creativesRemaining <= 0) {
    console.error('❌ addCreative: No credits remaining!', activeProfile.creativesRemaining);
    return;
  }
  
  const expiresAt = new Date();
  expiresAt.setMonth(expiresAt.getMonth() + 1);
  creative.expiresAt = expiresAt.toISOString();
  
  activeProfile.creatives.push(creative);
  activeProfile.creativesRemaining--;
  activeProfile.lastUpdated = new Date().toISOString();
  
  console.log('✅ Creative added to profile:', {
    profileUsername: activeProfile.profile.username,
    creativesCount: activeProfile.creatives.length,
    creditsRemaining: activeProfile.creativesRemaining
  });
  
  saveSession(session);
};

export const cleanExpiredCreatives = async (): Promise<void> => {
  const session = getSession();
  const now = new Date();
  const expiredCreatives: { username: string; creativeId: string }[] = [];
  
  session.profiles.forEach(profile => {
    const validCreatives = profile.creatives.filter(c => {
      if (!c.expiresAt) return true;
      const isExpired = new Date(c.expiresAt) <= now;
      if (isExpired) {
        expiredCreatives.push({
          username: profile.profile.username,
          creativeId: c.id
        });
      }
      return !isExpired;
    });
    
    const expiredCount = profile.creatives.length - validCreatives.length;
    if (expiredCount > 0) {
      console.log(`🗑️ Removendo ${expiredCount} criativos expirados de @${profile.profile.username}`);
    }
    profile.creatives = validCreatives;
    profile.creativesRemaining = Math.min(6, profile.creativesRemaining + expiredCount);
  });
  
  saveSession(session);
  
  // Delete expired images from storage in background
  if (expiredCreatives.length > 0) {
    const { deleteCreativeImage } = await import('@/lib/api');
    for (const expired of expiredCreatives) {
      await deleteCreativeImage(expired.username, expired.creativeId);
    }
  }
};

// Clean expired strategies (30 days old)
export const cleanExpiredStrategies = (): void => {
  const session = getSession();
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  
  session.profiles.forEach(profile => {
    // Filter out strategies older than 30 days
    const validStrategies = profile.strategies.filter(s => {
      const createdAt = new Date(s.createdAt);
      return createdAt > thirtyDaysAgo;
    });
    
    const expiredCount = profile.strategies.length - validStrategies.length;
    if (expiredCount > 0) {
      console.log(`🗑️ Removendo ${expiredCount} estratégias expiradas de @${profile.profile.username}`);
      profile.strategies = validStrategies;
      
      // Reset the strategy generation dates for expired types
      if (profile.strategyGenerationDates) {
        Object.keys(profile.strategyGenerationDates).forEach(type => {
          const genDate = profile.strategyGenerationDates?.[type as keyof typeof profile.strategyGenerationDates];
          if (genDate) {
            const date = new Date(genDate);
            if (date <= thirtyDaysAgo) {
              delete profile.strategyGenerationDates![type as keyof typeof profile.strategyGenerationDates];
            }
          }
        });
      }
    }
  });
  
  saveSession(session);
};

export const markCreativeAsDownloaded = (creativeId: string): void => {
  const session = getSession();
  session.profiles.forEach(profile => {
    const creative = profile.creatives.find(c => c.id === creativeId);
    if (creative) {
      creative.downloaded = true;
    }
  });
  saveSession(session);
};

export const addGrowthSnapshot = (profileId: string, profile: InstagramProfile): void => {
  const session = getSession();
  const profileSession = session.profiles.find(p => p.id === profileId);
  if (profileSession) {
    const snapshot = createSnapshot(profile);
    profileSession.growthHistory.push(snapshot);
    profileSession.profile = profile;
    profileSession.lastUpdated = new Date().toISOString();
    
    console.log(`📈 [storage] Added growth snapshot for @${profileSession.profile.username}:`, {
      totalSnapshots: profileSession.growthHistory.length,
      latestFollowers: snapshot.followers
    });
    
    saveSession(session);
  } else {
    console.warn(`⚠️ [storage] Profile not found for growth snapshot: ${profileId}`);
  }
};

export const addGrowthInsight = (profileId: string, insight: GrowthInsight): void => {
  const session = getSession();
  const profileSession = session.profiles.find(p => p.id === profileId);
  if (profileSession) {
    profileSession.growthInsights.push(insight);
    profileSession.lastUpdated = new Date().toISOString();
    
    console.log(`💡 [storage] Added growth insight for @${profileSession.profile.username}:`, {
      weekNumber: insight.weekNumber,
      totalInsights: profileSession.growthInsights.length,
      followersGain: insight.followersGain
    });
    
    saveSession(session);
  } else {
    console.warn(`⚠️ [storage] Profile not found for growth insight: ${profileId}`);
  }
};

export const resetSession = (): void => {
  // IMPORTANT: This only clears the session, NOT the persistent storage
  // Persistent data remains in mro_persistent_profiles
  console.log('⚠️ Resetando sessão (dados persistentes mantidos)');
  localStorage.removeItem(STORAGE_KEY);
};

export const hasExistingSession = (): boolean => {
  const session = getSession();
  return session.profiles.length > 0;
};

// Legacy compatibility helpers
export const getLegacySessionFormat = (session: MROSession): any => {
  const activeProfile = session.profiles.find(p => p.id === session.activeProfileId);
  if (!activeProfile) {
    return {
      profile: null,
      analysis: null,
      strategies: [],
      creatives: [],
      creativesRemaining: 6,
      lastUpdated: session.lastUpdated,
    };
  }
  return {
    profile: activeProfile.profile,
    analysis: activeProfile.analysis,
    strategies: activeProfile.strategies,
    creatives: activeProfile.creatives,
    creativesRemaining: activeProfile.creativesRemaining,
    lastUpdated: activeProfile.lastUpdated,
  };
};
