import { useState, useEffect, useRef } from 'react';
import { 
  getSyncData, 
  saveSyncData, 
  SyncData, 
  SyncedInstagramProfile,
  SquareCloudUser,
  wasProfileSyncedToday,
  updateProfile,
  getTopGrowingProfiles,
  isProfileAlreadySynced,
  isProfileInDashboard,
  markSyncComplete,
  stopSync,
  pauseSync,
  resumeSync,
  shouldAutoSync,
  forceSyncToServer,
  isProfileInvalid,
  markProfileAsInvalid,
  getInvalidProfiles,
  clearInvalidProfiles
} from '@/lib/syncStorage';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { 
  RefreshCw, Play, Pause, Users, TrendingUp, Instagram, 
  CheckCircle, XCircle, Clock, ChevronLeft, ChevronRight,
  Loader2, AlertCircle, User, Square, Check, Ban, Trash2, Calendar,
  Image as ImageIcon
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

const SQUARECLOUD_API = 'https://dashboardmroinstagramvini-online.squareweb.app';
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

const SyncDashboard = () => {
  const { toast } = useToast();
  const [syncData, setSyncData] = useState<SyncData>(getSyncData());
  const [isSyncing, setIsSyncing] = useState(false);
  const [isUpdatingDays, setIsUpdatingDays] = useState(false);
  const [updateDaysLog, setUpdateDaysLog] = useState<string | null>(null);
  const [syncProgress, setSyncProgress] = useState({ current: 0, total: 0 });
  const [currentSlide, setCurrentSlide] = useState(0);
  const syncAbortedRef = useRef(false);
  
  // User-specific sync state
  const [userSyncUsername, setUserSyncUsername] = useState('');
  const [isSyncingUser, setIsSyncingUser] = useState(false);
  const [userSyncLog, setUserSyncLog] = useState<string | null>(null);
  
  // Compare growth state
  const [isComparing, setIsComparing] = useState(false);
  const [compareUsername, setCompareUsername] = useState('');
  const [compareResult, setCompareResult] = useState<{
    username: string;
    oldFollowers: number;
    newFollowers: number;
    growth: number;
  } | null>(null);

  // Image cache state
  const [imageCacheStatus, setImageCacheStatus] = useState<{ total: number; cached: number; remaining: number } | null>(null);
  const [isCachingImages, setIsCachingImages] = useState(false);
  const [cacheProgress, setCacheProgress] = useState<{ cached: number; failed: number; processed: number; total: number } | null>(null);

  // Load data on mount and check for auto-sync
  useEffect(() => {
    setSyncData(getSyncData());
    
    // Check if we need auto-sync at midnight
    if (syncData.isSyncComplete && shouldAutoSync()) {
      console.log('Auto-sync triggered - checking for new accounts...');
      startAutoSync();
    }
  }, []);

  // Refresh data periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setSyncData(getSyncData());
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // Fetch users from SquareCloud
  const fetchSquareCloudUsers = async (): Promise<SquareCloudUser[]> => {
    try {
      const response = await fetch(`${SQUARECLOUD_API}/obter-usuarios`);
      const text = await response.text();
      const data = JSON.parse(text);
      
      if (!data.success || !Array.isArray(data.usuarios)) {
        throw new Error('Invalid response format');
      }
      
      return data.usuarios.map((u: any) => ({
        ID: u.ID,
        numero: u.data?.numero || '',
        dataDeExpiracao: u.data?.dataDeExpiracao ?? 0,
        blackList: u.data?.blackList || false,
        igInstagram: u.data?.igInstagram || []
      }));
    } catch (error) {
      console.error('Error fetching SquareCloud users:', error);
      throw error;
    }
  };

  // Fetch Instagram profile data via Edge Function (to avoid CORS/mixed content)
  const fetchInstagramProfile = async (username: string): Promise<Partial<SyncedInstagramProfile> | null> => {
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/sync-instagram-profile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username })
      });
      
      if (!response.ok) {
        console.log(`Profile ${username} not found`);
        return null;
      }
      
      const data = await response.json();
      
      if (!data.success || !data.profile) {
        console.log(`Profile ${username} data not available`);
        return null;
      }
      
      return data.profile;
    } catch (error) {
      console.error(`Error fetching Instagram profile ${username}:`, error);
      return null;
    }
  };

  // Auto-sync for new accounts only
  const startAutoSync = async () => {
    try {
      const users = await fetchSquareCloudUsers();
      const currentData = getSyncData();
      
      // Find new Instagram usernames
      const allInstagramUsernames: { username: string; ownerId: string; ownerName: string }[] = [];
      users.forEach(user => {
        user.igInstagram.forEach(ig => {
          const username = ig.replace('@', '').toLowerCase();
          // Only add if not already synced, not in dashboard, and not marked as invalid
          if (!isProfileAlreadySynced(username) && !isProfileInDashboard(username) && !isProfileInvalid(username)) {
            allInstagramUsernames.push({
              username,
              ownerId: user.ID,
              ownerName: user.ID
            });
          }
        });
      });
      
      if (allInstagramUsernames.length > 0) {
        toast({ 
          title: "Novos perfis encontrados!", 
          description: `${allInstagramUsernames.length} novos perfis serão sincronizados` 
        });
        
        // Sync new profiles
        setIsSyncing(true);
        syncAbortedRef.current = false;
        await syncProfiles(allInstagramUsernames);
      } else {
        toast({ 
          title: "Tudo sincronizado!", 
          description: "Nenhuma nova conta encontrada" 
        });
      }
      
      // Update auto-sync date
      const updatedData = getSyncData();
      updatedData.lastAutoSyncDate = new Date().toISOString();
      updatedData.users = users;
      saveSyncData(updatedData);
      setSyncData(updatedData);
      
    } catch (error) {
      console.error('Auto-sync error:', error);
    }
  };

  // Start full sync
  const startFullSync = async () => {
    if (isSyncing) return;
    
    setIsSyncing(true);
    syncAbortedRef.current = false;
    
    try {
      toast({ title: "Iniciando sincronização...", description: "Buscando usuários do SquareCloud" });
      
      // Step 1: Fetch users
      const users = await fetchSquareCloudUsers();
      
      // Step 2: Collect all Instagram usernames (skip already synced/dashboard/invalid ones)
      const allInstagramUsernames: { username: string; ownerId: string; ownerName: string }[] = [];
      users.forEach(user => {
        user.igInstagram.forEach(ig => {
          const username = ig.replace('@', '').toLowerCase();
          // Skip if already synced, in dashboard, or marked as invalid
          if (!isProfileAlreadySynced(username) && !isProfileInDashboard(username) && !isProfileInvalid(username)) {
            allInstagramUsernames.push({
              username,
              ownerId: user.ID,
              ownerName: user.ID
            });
          }
        });
      });
      
      // Count total including already synced
      let totalCount = 0;
      users.forEach(user => {
        totalCount += user.igInstagram.length;
      });
      
      // Step 3: Update sync data with users
      const updatedData: SyncData = {
        ...getSyncData(),
        users,
        lastSyncDate: new Date().toISOString(),
        totalProfilesCount: totalCount,
        syncQueue: allInstagramUsernames.map(u => u.username),
        isPaused: false,
        isStopped: false,
        isSyncComplete: false
      };
      
      saveSyncData(updatedData);
      setSyncData(updatedData);
      
      const alreadySyncedCount = totalCount - allInstagramUsernames.length;
      toast({ 
        title: "Usuários carregados!", 
        description: `${users.length} usuários, ${allInstagramUsernames.length} novos perfis para sincronizar (${alreadySyncedCount} já sincronizados)` 
      });
      
      // Step 4: Start syncing profiles one by one
      if (allInstagramUsernames.length > 0) {
        await syncProfiles(allInstagramUsernames);
      } else {
        markSyncComplete();
        setSyncData(getSyncData());
        toast({ title: "Sincronização completa!", description: "Todos os perfis já estavam sincronizados" });
      }
      
    } catch (error) {
      toast({ 
        title: "Erro na sincronização", 
        description: "Falha ao buscar dados do SquareCloud",
        variant: "destructive"
      });
    } finally {
      setIsSyncing(false);
    }
  };

  // Sync profiles one by one with random delays
  const syncProfiles = async (profiles: { username: string; ownerId: string; ownerName: string }[]) => {
    setSyncProgress({ current: 0, total: profiles.length });
    let savedCount = 0;
    let skippedCount = 0;
    
    for (let i = 0; i < profiles.length; i++) {
      // Check if stopped or paused
      const currentData = getSyncData();
      if (currentData.isStopped || syncAbortedRef.current) {
        toast({ title: "Sincronização parada", description: `${i} perfis sincronizados e salvos` });
        setIsSyncing(false);
        return;
      }
      
      if (currentData.isPaused) {
        toast({ title: "Sincronização pausada", description: `${i}/${profiles.length} perfis sincronizados` });
        // Wait while paused
        while (getSyncData().isPaused && !getSyncData().isStopped) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        if (getSyncData().isStopped) {
          setIsSyncing(false);
          return;
        }
      }
      
      const { username, ownerId, ownerName } = profiles[i];
      
      // Skip if already synced today
      if (wasProfileSyncedToday(username)) {
        console.log(`Skipping ${username} - already synced today`);
        continue;
      }
      
      setSyncProgress({ current: i + 1, total: profiles.length });
      
      // Update currently syncing
      const updatingData = getSyncData();
      updatingData.currentlySyncing = username;
      updatingData.syncQueue = profiles.slice(i + 1).map(p => p.username);
      saveSyncData(updatingData);
      setSyncData(updatingData);
      
      // Fetch profile data
      const profileData = await fetchInstagramProfile(username);
      
      const isConnected = isProfileInDashboard(username);
      
      // Só salvar se tiver dados reais do Instagram (foto, seguidores, etc)
      if (profileData && profileData.profilePicUrl && profileData.followers !== undefined && profileData.followers > 0) {
        const fullProfile: SyncedInstagramProfile = {
          ...profileData as SyncedInstagramProfile,
          ownerUserId: ownerId,
          ownerUserName: ownerName,
          syncedAt: new Date().toISOString(),
          lastUpdated: new Date().toISOString(),
          isConnectedToDashboard: isConnected,
          growthHistory: []
        };
        
        // Salvar imediatamente após buscar dados reais
        updateProfile(fullProfile);
        savedCount++;
        
        // Atualizar estado local para refletir imediatamente
        const freshData = getSyncData();
        setSyncData(freshData);
        
        console.log(`✅ Perfil @${username} sincronizado e SALVO com ${fullProfile.followers} seguidores`);
        
        toast({ 
          title: `Perfil @${username} salvo!`, 
          description: `${fullProfile.followers.toLocaleString()} seguidores - Total salvos: ${savedCount}` 
        });
      } else {
        // Marcar perfil como inválido para não tentar sincronizar novamente
        markProfileAsInvalid(username, 'Perfil não encontrado ou dados indisponíveis');
        skippedCount++;
        console.log(`🚫 Perfil @${username} marcado como inválido - não será buscado novamente`);
      }
      
      // Random delay between 2-5 seconds to avoid overloading
      const delay = Math.floor(Math.random() * 3000) + 2000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    // Mark sync complete
    markSyncComplete();
    setSyncData(getSyncData());
    setIsSyncing(false);
    
    toast({ 
      title: "Sincronização concluída!", 
      description: `${savedCount} perfis salvos, ${skippedCount} não encontrados` 
    });
  };

  // Handle pause
  const handlePause = () => {
    pauseSync();
    setSyncData(getSyncData());
    toast({ title: "Sincronização pausada" });
  };

  // Handle resume
  const handleResume = () => {
    resumeSync();
    setSyncData(getSyncData());
    toast({ title: "Retomando sincronização..." });
  };

  // Handle stop (saves progress - perfis já sincronizados NUNCA são perdidos)
  const handleStop = async () => {
    syncAbortedRef.current = true;
    stopSync();
    
    // Garantir que os dados estão salvos NO SERVIDOR
    const finalData = getSyncData();
    setSyncData(finalData);
    setIsSyncing(false);
    
    // Forçar sync com servidor
    await forceSyncToServer();
    
    const savedCount = finalData.profiles.length;
    toast({ 
      title: "Sincronização parada e salva no servidor!", 
      description: `${savedCount} perfis salvos permanentemente. Dados disponíveis em qualquer lugar.` 
    });
  };

  // Force sync to server button
  const handleForceSaveToServer = async () => {
    toast({ title: "Salvando no servidor...", description: "Aguarde..." });
    const success = await forceSyncToServer();
    if (success) {
      toast({ title: "Dados salvos no servidor!", description: "Todos os perfis estão seguros." });
    } else {
      toast({ title: "Erro ao salvar", description: "Tente novamente", variant: "destructive" });
    }
  };

  // Update user days remaining from SquareCloud
  const handleUpdateUserDays = async () => {
    setIsUpdatingDays(true);
    setUpdateDaysLog('🔄 Iniciando atualização...');
    
    try {
      const { data, error } = await supabase.functions.invoke('update-user-days');
      
      if (error) {
        setUpdateDaysLog(`❌ Erro: ${error.message}`);
        throw error;
      }
      
      if (data?.success) {
        if (data?.background) {
          // Background task started
          setUpdateDaysLog('⏳ Atualização iniciada em segundo plano (~2-3 min para 700+ usuários)');
          toast({
            title: 'Atualização iniciada!',
            description: 'Os dias serão atualizados em segundo plano. Aguarde ~2-3 minutos.',
          });
          // Clear log after 10 seconds
          setTimeout(() => setUpdateDaysLog(null), 10000);
        } else {
          const logMsg = `✅ Atualizado! ${data.updated} de ${data.totalUsers} usuários`;
          setUpdateDaysLog(logMsg);
          toast({
            title: 'Dias atualizados!',
            description: `${data.updated} usuários atualizados de ${data.totalUsers} total`,
          });
          setTimeout(() => setUpdateDaysLog(null), 5000);
        }
      } else {
        setUpdateDaysLog(`❌ Erro: ${data?.error || 'Erro desconhecido'}`);
        toast({
          title: 'Erro ao atualizar',
          description: data?.error || 'Erro desconhecido',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error updating user days:', error);
      setUpdateDaysLog('❌ Erro de conexão - tente novamente');
      toast({
        title: 'Erro ao atualizar dias',
        description: 'Não foi possível conectar ao servidor',
        variant: 'destructive',
      });
    } finally {
      setIsUpdatingDays(false);
    }
  };

  // Sync specific user's Instagram accounts
  const syncByUsername = async () => {
    if (!userSyncUsername.trim()) {
      toast({ title: 'Digite um usuário', variant: 'destructive' });
      return;
    }
    
    setIsSyncingUser(true);
    setUserSyncLog('🔍 Buscando usuário...');
    
    try {
      // Fetch all users from SquareCloud
      const users = await fetchSquareCloudUsers();
      
      // Find the specific user (case-insensitive)
      const targetUser = users.find(u => 
        u.ID.toLowerCase() === userSyncUsername.trim().toLowerCase()
      );
      
      if (!targetUser) {
        setUserSyncLog(`❌ Usuário "${userSyncUsername}" não encontrado`);
        toast({ title: 'Usuário não encontrado', variant: 'destructive' });
        setIsSyncingUser(false);
        return;
      }
      
      const igAccounts = targetUser.igInstagram || [];
      
      if (igAccounts.length === 0) {
        setUserSyncLog(`⚠️ Usuário "${targetUser.ID}" não possui contas Instagram`);
        toast({ title: 'Sem contas Instagram', description: 'Este usuário não possui contas vinculadas' });
        setIsSyncingUser(false);
        return;
      }
      
      setUserSyncLog(`📱 ${igAccounts.length} conta(s) encontrada(s). Sincronizando...`);
      
      let syncedCount = 0;
      let skippedCount = 0;
      
      for (let i = 0; i < igAccounts.length; i++) {
        const igUsername = igAccounts[i].replace('@', '').toLowerCase();
        setUserSyncLog(`🔄 Sincronizando @${igUsername} (${i + 1}/${igAccounts.length})...`);
        
        // Fetch Instagram profile data
        const profileData = await fetchInstagramProfile(igUsername);
        
        if (profileData && profileData.profilePicUrl && profileData.followers !== undefined && profileData.followers > 0) {
          const fullProfile: SyncedInstagramProfile = {
            ...profileData as SyncedInstagramProfile,
            ownerUserId: targetUser.ID,
            ownerUserName: targetUser.ID,
            syncedAt: new Date().toISOString(),
            lastUpdated: new Date().toISOString(),
            isConnectedToDashboard: isProfileInDashboard(igUsername),
            growthHistory: []
          };
          
          updateProfile(fullProfile);
          syncedCount++;
          
          console.log(`✅ @${igUsername} sincronizado via usuário ${targetUser.ID}`);
        } else {
          skippedCount++;
          console.log(`⚠️ @${igUsername} não encontrado ou sem dados`);
        }
        
        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
      
      // Force save to server
      await forceSyncToServer();
      
      const successMsg = `✅ Concluído! ${syncedCount} sincronizado(s), ${skippedCount} não encontrado(s)`;
      setUserSyncLog(successMsg);
      setSyncData(getSyncData());
      
      toast({ 
        title: 'Sincronização do usuário concluída!', 
        description: `${syncedCount} perfil(is) salvo(s)` 
      });
      
      setTimeout(() => setUserSyncLog(null), 5000);
      
    } catch (error) {
      console.error('Error syncing user:', error);
      setUserSyncLog('❌ Erro ao sincronizar usuário');
      toast({ title: 'Erro na sincronização', variant: 'destructive' });
    } finally {
      setIsSyncingUser(false);
    }
  };

  // Compare growth - fetch fresh data and compare
  const compareGrowth = async () => {
    if (!compareUsername.trim()) {
      toast({ title: 'Digite um @username do Instagram', variant: 'destructive' });
      return;
    }
    
    const username = compareUsername.trim().replace('@', '').toLowerCase();
    setIsComparing(true);
    setCompareResult(null);
    
    try {
      // Find existing profile data
      const existingProfile = syncData.profiles.find(p => 
        p.username.toLowerCase() === username
      );
      
      const oldFollowers = existingProfile?.followers || 0;
      
      // Fetch fresh data
      toast({ title: 'Buscando dados atuais...', description: `@${username}` });
      const freshData = await fetchInstagramProfile(username);
      
      if (!freshData || !freshData.followers) {
        toast({ title: 'Perfil não encontrado', variant: 'destructive' });
        setIsComparing(false);
        return;
      }
      
      const newFollowers = freshData.followers;
      const growth = newFollowers - oldFollowers;
      
      setCompareResult({
        username,
        oldFollowers,
        newFollowers,
        growth
      });
      
      // Update the profile with new data
      if (existingProfile) {
        const updatedProfile: SyncedInstagramProfile = {
          ...existingProfile,
          ...freshData as SyncedInstagramProfile,
          lastUpdated: new Date().toISOString(),
        };
        updateProfile(updatedProfile);
        await forceSyncToServer();
        setSyncData(getSyncData());
      }
      
      toast({ 
        title: growth >= 0 ? '📈 Crescimento detectado!' : '📉 Queda detectada',
        description: `${growth >= 0 ? '+' : ''}${growth.toLocaleString()} seguidores`
      });
      
    } catch (error) {
      console.error('Error comparing growth:', error);
      toast({ title: 'Erro ao comparar', variant: 'destructive' });
    } finally {
      setIsComparing(false);
    }
  };

  // Fetch image cache status
  const fetchImageCacheStatus = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('cache-profile-images', {
        body: { action: 'status' }
      });
      if (!error && data?.success) {
        setImageCacheStatus({ total: data.total, cached: data.cached, remaining: data.remaining });
      }
    } catch (e) {
      console.error('Error fetching cache status:', e);
    }
  };

  // Load cache status on mount
  useEffect(() => {
    fetchImageCacheStatus();
  }, []);

  // Start batch image caching
  const startImageCaching = async (forceRefresh: boolean = false) => {
    setIsCachingImages(true);
    setCacheProgress({ cached: 0, failed: 0, processed: 0, total: imageCacheStatus?.total || 0 });
    
    toast({ 
      title: 'Cache de Imagens', 
      description: forceRefresh ? 'Forçando recache de todas as imagens...' : 'Iniciando pré-cache em lote...' 
    });
    
    let offset = 0;
    const batchSize = 50;
    let totalCached = 0;
    let totalFailed = 0;
    let hasMore = true;
    
    while (hasMore) {
      try {
        const { data, error } = await supabase.functions.invoke('cache-profile-images', {
          body: { action: 'process-batch', batchSize, offset, forceRefresh }
        });
        
        if (error || !data?.success) {
          console.error('Batch error:', error || data?.error);
          break;
        }
        
        totalCached += data.cached || 0;
        totalFailed += data.failed || 0;
        offset = data.nextOffset || offset + batchSize;
        hasMore = data.hasMore;
        
        setCacheProgress({
          cached: totalCached,
          failed: totalFailed,
          processed: offset,
          total: data.total
        });
        
      } catch (e) {
        console.error('Cache batch error:', e);
        break;
      }
    }
    
    setIsCachingImages(false);
    await fetchImageCacheStatus();
    
    toast({ 
      title: 'Cache Concluído!', 
      description: `${totalCached} imagens cacheadas, ${totalFailed} falhas` 
    });
  };

  // Get top growing profiles for slider
  const topGrowing = getTopGrowingProfiles(10);
  
  // Calculate growth for a profile
  const getGrowth = (profile: SyncedInstagramProfile) => {
    if (profile.growthHistory.length < 2) return 0;
    const first = profile.growthHistory[0].followers;
    const last = profile.growthHistory[profile.growthHistory.length - 1].followers;
    return last - first;
  };

  // Auto-slide for top growing
  useEffect(() => {
    if (topGrowing.length <= 1) return;
    
    const interval = setInterval(() => {
      setCurrentSlide(prev => (prev + 1) % topGrowing.length);
    }, 4000);
    
    return () => clearInterval(interval);
  }, [topGrowing.length]);

  const connectedProfiles = syncData.profiles.filter(p => p.isConnectedToDashboard);
  const notConnectedProfiles = syncData.profiles.filter(p => !p.isConnectedToDashboard);

  return (
    <div className="space-y-6">
      {/* Sync Status Banner */}
      {syncData.isSyncComplete && (
        <div className="glass-card p-4 border-l-4 border-green-500 bg-green-500/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Check className="w-6 h-6 text-green-500" />
              <div>
                <p className="font-semibold text-green-500">Sincronização Total Concluída</p>
                <p className="text-sm text-muted-foreground">
                  Auto-sync ativo às 00h diariamente • Última: {syncData.lastAutoSyncDate 
                    ? new Date(syncData.lastAutoSyncDate).toLocaleString('pt-BR')
                    : 'N/A'}
                </p>
              </div>
            </div>
            <Button 
              variant="outline" 
              size="sm"
              onClick={startAutoSync}
              className="cursor-pointer"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Verificar Novos
            </Button>
          </div>
        </div>
      )}

      {/* Header Stats */}
      <div className="grid grid-cols-5 gap-4">
        <div className="glass-card p-4 text-center">
          <Users className="w-8 h-8 mx-auto text-primary mb-2" />
          <p className="text-2xl font-bold">{syncData.users.length}</p>
          <p className="text-xs text-muted-foreground">Usuários MRO</p>
        </div>
        <div className="glass-card p-4 text-center">
          <Instagram className="w-8 h-8 mx-auto text-pink-500 mb-2" />
          <p className="text-2xl font-bold">{syncData.totalProfilesCount}</p>
          <p className="text-xs text-muted-foreground">Perfis Instagram Total</p>
        </div>
        <div className="glass-card p-4 text-center">
          <CheckCircle className="w-8 h-8 mx-auto text-green-500 mb-2" />
          <p className="text-2xl font-bold">{connectedProfiles.length}</p>
          <p className="text-xs text-muted-foreground">Conectados ao Dashboard</p>
        </div>
        <div className="glass-card p-4 text-center">
          <XCircle className="w-8 h-8 mx-auto text-yellow-500 mb-2" />
          <p className="text-2xl font-bold">{notConnectedProfiles.length}</p>
          <p className="text-xs text-muted-foreground">Ainda não conectados</p>
        </div>
        <div className="glass-card p-4 text-center">
          <Ban className="w-8 h-8 mx-auto text-red-500 mb-2" />
          <p className="text-2xl font-bold">{(syncData.invalidProfiles || []).length}</p>
          <p className="text-xs text-muted-foreground">Perfis Inválidos</p>
        </div>
      </div>

      {/* Sync Controls */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-lg">Sincronização de Usuários</h3>
            <p className="text-sm text-muted-foreground">
              Última sincronização: {syncData.lastSyncDate 
                ? new Date(syncData.lastSyncDate).toLocaleString('pt-BR')
                : 'Nunca'}
            </p>
          </div>
          <div className="flex gap-2">
            {isSyncing ? (
              <>
                {syncData.isPaused ? (
                  <Button 
                    variant="outline" 
                    onClick={handleResume}
                    className="cursor-pointer"
                  >
                    <Play className="w-4 h-4 mr-2" /> Retomar
                  </Button>
                ) : (
                  <Button 
                    variant="outline" 
                    onClick={handlePause}
                    className="cursor-pointer"
                  >
                    <Pause className="w-4 h-4 mr-2" /> Pausar
                  </Button>
                )}
                <Button 
                  variant="destructive" 
                  onClick={handleStop}
                  className="cursor-pointer"
                >
                  <Square className="w-4 h-4 mr-2" /> Parar e Salvar
                </Button>
              </>
            ) : (
              <>
                <Button 
                  onClick={startFullSync}
                  className="cursor-pointer"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Sincronizar (Apenas Novos)
                </Button>
                <Button 
                  variant="outline"
                  onClick={handleUpdateUserDays}
                  disabled={isUpdatingDays}
                  className="cursor-pointer"
                >
                  {isUpdatingDays ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Calendar className="w-4 h-4 mr-2" />
                  )}
                  Atualizar Dias
                </Button>
                <Button 
                  variant="outline"
                  onClick={handleForceSaveToServer}
                  className="cursor-pointer"
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Salvar no Servidor
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Update Days Log */}
        {updateDaysLog && (
          <div className="p-3 bg-muted/50 rounded-lg border border-border/50 flex items-center gap-2">
            {isUpdatingDays && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
            <span className="text-sm">{updateDaysLog}</span>
          </div>
        )}
        {isSyncing && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              {syncData.isPaused ? (
                <Pause className="w-5 h-5 text-yellow-500" />
              ) : (
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
              )}
              <span className="text-sm">
                {syncData.isPaused ? 'Pausado em: ' : 'Sincronizando: '}
                <strong>@{syncData.currentlySyncing}</strong>
              </span>
              <span className="text-xs text-muted-foreground ml-auto">
                {syncProgress.current}/{syncProgress.total}
              </span>
            </div>
            <div className="h-2 bg-secondary rounded-full overflow-hidden">
              <div 
                className={`h-full transition-all duration-500 ${
                  syncData.isPaused 
                    ? 'bg-yellow-500' 
                    : 'bg-gradient-to-r from-primary to-mro-cyan'
                }`}
                style={{ width: `${(syncProgress.current / Math.max(1, syncProgress.total)) * 100}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {syncData.syncQueue.length} perfis restantes na fila
              {syncData.isPaused && ' (pausado)'}
            </p>
          </div>
        )}
      </div>

      {/* User-specific Sync & Compare Growth */}
      <div className="grid grid-cols-2 gap-4">
        {/* Sync by Username */}
        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <User className="w-5 h-5 text-primary" />
            <div>
              <h3 className="font-semibold text-lg">Sincronizar por Usuário</h3>
              <p className="text-xs text-muted-foreground">Digite o ID do usuário MRO para sincronizar todas as contas</p>
        </div>
      </div>

      {/* Image Cache Section */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <ImageIcon className="w-5 h-5 text-purple-500" />
            <div>
              <h3 className="font-semibold text-lg">Cache de Fotos de Perfil</h3>
              <p className="text-xs text-muted-foreground">Pré-cachear todas as fotos no storage para exibição consistente</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchImageCacheStatus}
              disabled={isCachingImages}
              className="cursor-pointer"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Atualizar Status
            </Button>
            <Button
              onClick={() => startImageCaching(false)}
              disabled={isCachingImages || (imageCacheStatus?.remaining === 0)}
              className="cursor-pointer bg-purple-600 hover:bg-purple-700"
            >
              {isCachingImages ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <ImageIcon className="w-4 h-4 mr-2" />
              )}
              {isCachingImages ? 'Cacheando...' : 'Cachear Pendentes'}
            </Button>
            <Button
              onClick={() => startImageCaching(true)}
              disabled={isCachingImages}
              variant="outline"
              className="cursor-pointer border-orange-500 text-orange-500 hover:bg-orange-500/10"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Forçar Recache Todas
            </Button>
          </div>
        </div>
        
        {imageCacheStatus && (
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="p-3 bg-secondary/50 rounded-lg text-center">
              <p className="text-2xl font-bold text-foreground">{imageCacheStatus.total}</p>
              <p className="text-xs text-muted-foreground">Total de Perfis</p>
            </div>
            <div className="p-3 bg-green-500/20 rounded-lg text-center">
              <p className="text-2xl font-bold text-green-500">{imageCacheStatus.cached}</p>
              <p className="text-xs text-muted-foreground">Já Cacheadas</p>
            </div>
            <div className="p-3 bg-yellow-500/20 rounded-lg text-center">
              <p className="text-2xl font-bold text-yellow-500">{imageCacheStatus.remaining}</p>
              <p className="text-xs text-muted-foreground">Pendentes</p>
            </div>
          </div>
        )}
        
        {isCachingImages && cacheProgress && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span>Progresso: {cacheProgress.processed} / {cacheProgress.total}</span>
              <span className="text-green-500">✅ {cacheProgress.cached} cacheadas</span>
              {cacheProgress.failed > 0 && (
                <span className="text-red-500">❌ {cacheProgress.failed} falhas</span>
              )}
            </div>
            <div className="h-2 bg-secondary rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-300"
                style={{ width: `${(cacheProgress.processed / Math.max(1, cacheProgress.total)) * 100}%` }}
              />
            </div>
          </div>
        )}
        
        {imageCacheStatus?.remaining === 0 && !isCachingImages && (
          <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-500" />
            <span className="text-green-500 text-sm font-medium">Todas as imagens estão cacheadas no storage!</span>
          </div>
        )}
      </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={userSyncUsername}
              onChange={(e) => setUserSyncUsername(e.target.value)}
              placeholder="Digite o ID do usuário (ex: 123C)"
              className="flex-1 px-4 py-2 bg-secondary/50 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              disabled={isSyncingUser}
            />
            <Button
              onClick={syncByUsername}
              disabled={isSyncingUser || !userSyncUsername.trim()}
              className="cursor-pointer"
            >
              {isSyncingUser ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              <span className="ml-2">Sincronizar</span>
            </Button>
          </div>
          
          {userSyncLog && (
            <div className="mt-3 p-3 bg-muted/50 rounded-lg border border-border/50 flex items-center gap-2">
              {isSyncingUser && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
              <span className="text-sm">{userSyncLog}</span>
            </div>
          )}
        </div>

        {/* Compare Growth */}
        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <TrendingUp className="w-5 h-5 text-green-500" />
            <div>
              <h3 className="font-semibold text-lg">Comparar Crescimento</h3>
              <p className="text-xs text-muted-foreground">Busque dados atuais e compare com os salvos</p>
            </div>
          </div>
          
          <div className="flex gap-2">
            <input
              type="text"
              value={compareUsername}
              onChange={(e) => setCompareUsername(e.target.value)}
              placeholder="@username do Instagram"
              className="flex-1 px-4 py-2 bg-secondary/50 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              disabled={isComparing}
            />
            <Button
              onClick={compareGrowth}
              disabled={isComparing || !compareUsername.trim()}
              variant="outline"
              className="cursor-pointer"
            >
              {isComparing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <TrendingUp className="w-4 h-4" />
              )}
              <span className="ml-2">Comparar</span>
            </Button>
          </div>
          
          {compareResult && (
            <div className={`mt-3 p-4 rounded-lg border ${
              compareResult.growth >= 0 
                ? 'bg-green-500/10 border-green-500/30' 
                : 'bg-red-500/10 border-red-500/30'
            }`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold">@{compareResult.username}</p>
                  <p className="text-xs text-muted-foreground">
                    Anterior: {compareResult.oldFollowers.toLocaleString()} → Atual: {compareResult.newFollowers.toLocaleString()}
                  </p>
                </div>
                <div className={`text-2xl font-bold ${compareResult.growth >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {compareResult.growth >= 0 ? '+' : ''}{compareResult.growth.toLocaleString()}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {(syncData.invalidProfiles || []).length > 0 && (
        <div className="glass-card p-4 border-l-4 border-red-500 bg-red-500/10">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <Ban className="w-5 h-5 text-red-500" />
              <div>
                <p className="font-semibold text-red-500">Perfis Inválidos/Inexistentes</p>
                <p className="text-xs text-muted-foreground">
                  {(syncData.invalidProfiles || []).length} perfis marcados como inválidos (serão pulados em sincronizações futuras)
                </p>
              </div>
            </div>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => {
                clearInvalidProfiles();
                setSyncData(getSyncData());
                toast({ 
                  title: "Lista limpa!", 
                  description: "Perfis inválidos serão verificados novamente na próxima sincronização" 
                });
              }}
              className="cursor-pointer text-red-500 hover:text-red-600 border-red-500/50"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Limpar Lista
            </Button>
          </div>
          
          <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto">
            {(syncData.invalidProfiles || []).slice(0, 50).map((invalid) => (
              <span 
                key={invalid.username}
                className="px-2 py-1 bg-red-500/20 text-red-500 text-xs rounded-full"
                title={`Marcado em: ${new Date(invalid.markedAt).toLocaleString('pt-BR')} - ${invalid.reason}`}
              >
                @{invalid.username}
              </span>
            ))}
            {(syncData.invalidProfiles || []).length > 50 && (
              <span className="px-2 py-1 bg-secondary text-muted-foreground text-xs rounded-full">
                +{(syncData.invalidProfiles || []).length - 50} mais
              </span>
            )}
          </div>
        </div>
      )}
      {topGrowing.length > 0 && (
        <div className="glass-card p-6 overflow-hidden">
          <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-green-500" />
            Perfis com Maior Crescimento
          </h3>
          
          <div className="relative">
            <div 
              className="flex transition-transform duration-500 ease-in-out"
              style={{ transform: `translateX(-${currentSlide * 100}%)` }}
            >
              {topGrowing.map((profile, idx) => {
                const growth = getGrowth(profile);
                return (
                  <div 
                    key={profile.username}
                    className="min-w-full p-6 bg-gradient-to-br from-green-500/10 to-emerald-500/10 rounded-xl"
                  >
                    <div className="flex items-center gap-6">
                      {profile.profilePicUrl && !profile.profilePicUrl.includes('dicebear') ? (
                        <img 
                          src={profile.profilePicUrl}
                          alt={profile.username}
                          className="w-20 h-20 rounded-full object-cover border-4 border-green-500"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      ) : (
                        <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center border-4 border-green-500">
                          <span className="text-2xl font-bold text-green-500">{profile.username?.charAt(0).toUpperCase()}</span>
                        </div>
                      )}
                      <div className="flex-1">
                        <p className="text-xl font-bold">@{profile.username}</p>
                        <p className="text-muted-foreground">{profile.fullName}</p>
                        <div className="flex gap-4 mt-2">
                          <span className="text-sm">{profile.followers.toLocaleString()} seguidores</span>
                          <span className="text-sm text-green-500 font-bold">
                            +{growth.toLocaleString()} crescimento
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-4xl font-bold text-green-500">#{idx + 1}</p>
                        <p className="text-xs text-muted-foreground">ranking</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            
            {/* Slider Controls */}
            {topGrowing.length > 1 && (
              <div className="flex justify-center gap-2 mt-4">
                <button 
                  onClick={() => setCurrentSlide(prev => Math.max(0, prev - 1))}
                  className="p-2 rounded-full bg-secondary hover:bg-secondary/80 cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {topGrowing.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setCurrentSlide(idx)}
                    className={`w-2 h-2 rounded-full transition-all cursor-pointer ${
                      idx === currentSlide ? 'bg-primary w-6' : 'bg-muted-foreground/30'
                    }`}
                  />
                ))}
                <button 
                  onClick={() => setCurrentSlide(prev => Math.min(topGrowing.length - 1, prev + 1))}
                  className="p-2 rounded-full bg-secondary hover:bg-secondary/80 cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Profile Lists */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Not Connected Profiles */}
        <div className="glass-card p-6">
          <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-yellow-500" />
            Usuário ainda não se conectou
            <span className="ml-auto text-sm font-normal text-muted-foreground">
              {notConnectedProfiles.length} perfis
            </span>
          </h3>
          
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {notConnectedProfiles.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                Todos os perfis estão conectados!
              </p>
            ) : (
              notConnectedProfiles.map(profile => (
                <div 
                  key={profile.username}
                  className="flex items-center gap-3 p-3 bg-secondary/30 rounded-lg"
                >
                  {profile.profilePicUrl && !profile.profilePicUrl.includes('dicebear') ? (
                    <img 
                      src={profile.profilePicUrl}
                      alt={profile.username}
                      className="w-12 h-12 rounded-full object-cover border border-yellow-500/50"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-yellow-500/20 flex items-center justify-center border border-yellow-500/50">
                      <span className="text-lg font-bold text-yellow-500">{profile.username?.charAt(0).toUpperCase()}</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">@{profile.username}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <User className="w-3 h-3" />
                      {profile.ownerUserName}
                    </p>
                  </div>
                  <div className="text-right text-xs">
                    <p className="font-medium">{profile.followers.toLocaleString()}</p>
                    <p className="text-muted-foreground">seguidores</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Connected Profiles */}
        <div className="glass-card p-6">
          <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-500" />
            Conectados ao Dashboard
            <span className="ml-auto text-sm font-normal text-muted-foreground">
              {connectedProfiles.length} perfis
            </span>
          </h3>
          
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {connectedProfiles.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                Nenhum perfil conectado ainda
              </p>
            ) : (
              connectedProfiles.map(profile => {
                const growth = getGrowth(profile);
                return (
                  <div 
                    key={profile.username}
                    className="flex items-center gap-3 p-3 bg-secondary/30 rounded-lg border border-green-500/20"
                  >
                    {profile.profilePicUrl && !profile.profilePicUrl.includes('dicebear') ? (
                      <img 
                        src={profile.profilePicUrl}
                        alt={profile.username}
                        className="w-12 h-12 rounded-full object-cover border-2 border-green-500"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center border-2 border-green-500">
                        <span className="text-lg font-bold text-green-500">{profile.username?.charAt(0).toUpperCase()}</span>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">@{profile.username}</p>
                      <p className="text-xs text-muted-foreground">
                        Atualizado: {new Date(profile.lastUpdated).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                    <div className="text-right text-xs">
                      <p className="font-medium">{profile.followers.toLocaleString()}</p>
                      {growth > 0 && (
                        <p className="text-green-500 font-bold">+{growth.toLocaleString()}</p>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* All Synced Profiles Grid */}
      <div className="glass-card p-6">
        <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
          <Instagram className="w-5 h-5 text-pink-500" />
          Todos os Perfis Sincronizados
          <span className="ml-auto text-sm font-normal text-muted-foreground">
            {syncData.profiles.length} perfis
          </span>
        </h3>
        
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 max-h-[600px] overflow-y-auto">
          {syncData.profiles.map(profile => {
            const growth = getGrowth(profile);
            return (
              <div 
                key={profile.username}
                className={`p-4 rounded-xl text-center transition-all hover:scale-105 ${
                  profile.isConnectedToDashboard 
                    ? 'bg-gradient-to-br from-green-500/10 to-emerald-500/10 border border-green-500/30' 
                    : 'bg-secondary/30 border border-border'
                }`}
              >
                {profile.profilePicUrl && !profile.profilePicUrl.includes('dicebear') ? (
                  <img 
                    src={profile.profilePicUrl}
                    alt={profile.username}
                    className={`w-16 h-16 rounded-full object-cover mx-auto mb-2 border-2 ${
                      profile.isConnectedToDashboard ? 'border-green-500' : 'border-muted'
                    }`}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                ) : (
                  <div className={`w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-2 border-2 ${
                    profile.isConnectedToDashboard ? 'border-green-500' : 'border-muted'
                  }`}>
                    <span className="text-xl font-bold text-muted-foreground">{profile.username?.charAt(0).toUpperCase()}</span>
                  </div>
                )}
                <p className="font-medium text-sm truncate">@{profile.username}</p>
                <p className="text-xs text-muted-foreground">
                  {profile.followers.toLocaleString()} seg.
                </p>
                {growth > 0 && (
                  <p className="text-xs text-green-500 font-bold mt-1">
                    +{growth.toLocaleString()}
                  </p>
                )}
                {!profile.isConnectedToDashboard && (
                  <div className="relative group inline-block mt-2">
                    <div className="w-3 h-3 rounded-full bg-yellow-500 mx-auto" />
                    <span className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-background border border-border rounded text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10">
                      Não conectado
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default SyncDashboard;
