import { useState } from 'react';
import { 
  SyncedInstagramProfile, 
  blockProfile, 
  unblockProfile, 
  removeProfileFromSync, 
  resetProfileStrategy,
  getStrategyDaysRemaining,
  canGenerateStrategy,
  getCreativesInfo,
  getSyncData,
  saveSyncData,
  isUserLifetime,
  formatUserDays,
  unlockCreativesForSquareUser,
  lockCreativesForSquareUser,
  isUserCreativesUnlocked
} from '@/lib/syncStorage';
import { enqueueRequest, getQueueStatus, isInQueue } from '@/lib/requestQueue';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { 
  MoreVertical, Ban, Trash2, RefreshCw, Sparkles, 
  Calendar, Image, Loader2, CheckCircle, Clock,
  Crown, Lock, Unlock
} from 'lucide-react';

interface ProfileActionsProps {
  profile: SyncedInstagramProfile;
  onUpdate: () => void;
}

const ProfileActions = ({ profile, onUpdate }: ProfileActionsProps) => {
  const { toast } = useToast();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showBlockDialog, setShowBlockDialog] = useState(false);
  const [showCreativesDialog, setShowCreativesDialog] = useState(false);
  const [processing, setProcessing] = useState<string | null>(null);
  
  const daysRemaining = getStrategyDaysRemaining(profile);
  const canGenerate = canGenerateStrategy(profile);
  const creativesInfo = getCreativesInfo(profile);
  const queueStatus = getQueueStatus();
  const inQueue = isInQueue(profile.username);
  
  // Get owner user info to check if lifetime
  const syncData = getSyncData();
  const ownerUser = syncData.users.find(u => u.ID.toLowerCase() === profile.ownerUserName.toLowerCase());
  const userDays = ownerUser?.dataDeExpiracao || 0;
  const isLifetime = isUserLifetime(userDays);
  const creativesUnlocked = ownerUser ? isUserCreativesUnlocked(ownerUser.ID) : false;

  const handleBlock = async () => {
    if (profile.isBlocked) {
      unblockProfile(profile.username);
      toast({ title: 'Perfil desbloqueado', description: `@${profile.username} foi desbloqueado` });
    } else {
      blockProfile(profile.username);
      toast({ title: 'Perfil bloqueado', description: `@${profile.username} foi bloqueado` });
    }
    setShowBlockDialog(false);
    onUpdate();
  };

  const handleDelete = () => {
    removeProfileFromSync(profile.username);
    toast({ title: 'Perfil removido', description: `@${profile.username} foi removido da lista` });
    setShowDeleteDialog(false);
    onUpdate();
  };

  const handleResetStrategy = async () => {
    setProcessing('reset');
    
    try {
      await enqueueRequest('reset_strategy', profile.username, async () => {
        // Just reset the timestamp, no API call needed
        resetProfileStrategy(profile.username);
        return true;
      });
      
      toast({ 
        title: 'Estratégia resetada', 
        description: `@${profile.username} pode gerar nova estratégia agora` 
      });
    } catch (error) {
      toast({ 
        title: 'Erro', 
        description: 'Não foi possível resetar a estratégia',
        variant: 'destructive'
      });
    } finally {
      setProcessing(null);
      onUpdate();
    }
  };

  const handleRefreshProfile = async () => {
    setProcessing('refresh');
    
    try {
      await enqueueRequest('refresh_profile', profile.username, async () => {
        const { data, error } = await supabase.functions.invoke('sync-instagram-profile', {
          body: { username: profile.username }
        });
        
        if (error) throw error;
        return data;
      });
      
      toast({ 
        title: 'Perfil atualizado', 
        description: `Dados de @${profile.username} foram atualizados` 
      });
    } catch (error) {
      toast({ 
        title: 'Erro', 
        description: 'Não foi possível atualizar o perfil',
        variant: 'destructive'
      });
    } finally {
      setProcessing(null);
      onUpdate();
    }
  };

  const handleToggleCreatives = () => {
    if (!ownerUser) return;
    
    if (creativesUnlocked) {
      lockCreativesForSquareUser(ownerUser.ID);
      toast({ 
        title: 'Criativos bloqueados', 
        description: `Usuário ${ownerUser.ID} não pode mais gerar criativos` 
      });
    } else {
      unlockCreativesForSquareUser(ownerUser.ID);
      toast({ 
        title: 'Criativos liberados', 
        description: `Usuário ${ownerUser.ID} agora pode gerar criativos` 
      });
    }
    setShowCreativesDialog(false);
    onUpdate();
  };

  return (
    <>
      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        {/* Quick Stats */}
        <div className="flex items-center gap-3 text-xs">
          {/* User Days / Lifetime Status */}
          {ownerUser && (
            <div className={`flex items-center gap-1 px-2 py-1 rounded ${
              isLifetime 
                ? 'bg-amber-500/20 text-amber-500' 
                : 'bg-blue-500/20 text-blue-500'
            }`}>
              {isLifetime ? <Crown className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
              {formatUserDays(userDays)}
            </div>
          )}
          
          {/* Creatives unlock status for lifetime users */}
          {isLifetime && (
            <div className={`flex items-center gap-1 px-2 py-1 rounded ${
              creativesUnlocked 
                ? 'bg-green-500/20 text-green-500' 
                : 'bg-red-500/20 text-red-500'
            }`}>
              {creativesUnlocked ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
              {creativesUnlocked ? 'Criativos OK' : 'Criativos ⛔'}
            </div>
          )}
          
          {/* Strategy Days */}
          <div className={`flex items-center gap-1 px-2 py-1 rounded ${
            canGenerate ? 'bg-green-500/20 text-green-500' : 'bg-secondary text-muted-foreground'
          }`}>
            <Calendar className="w-3 h-3" />
            {canGenerate ? 'Disponível' : `${daysRemaining}d`}
          </div>
          
          {/* Creatives */}
          <div className="flex items-center gap-1 px-2 py-1 rounded bg-secondary text-muted-foreground">
            <Image className="w-3 h-3" />
            {creativesInfo.available}/{creativesInfo.limit}
          </div>
          
          {/* Blocked indicator */}
          {profile.isBlocked && (
            <div className="flex items-center gap-1 px-2 py-1 rounded bg-red-500/20 text-red-500">
              <Ban className="w-3 h-3" />
              Bloqueado
            </div>
          )}

          {/* Queue indicator */}
          {inQueue && (
            <div className="flex items-center gap-1 px-2 py-1 rounded bg-primary/20 text-primary animate-pulse">
              <Clock className="w-3 h-3" />
              Na fila
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleResetStrategy}
          disabled={processing === 'reset' || canGenerate}
          className="text-xs"
          title="Resetar estratégia"
        >
          {processing === 'reset' ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Sparkles className="w-4 h-4" />
          )}
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleRefreshProfile}
          disabled={processing === 'refresh'}
          className="text-xs"
          title="Atualizar dados"
        >
          {processing === 'refresh' ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm">
              <MoreVertical className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {isLifetime && (
              <>
                <DropdownMenuItem onClick={() => setShowCreativesDialog(true)}>
                  {creativesUnlocked ? <Lock className="w-4 h-4 mr-2" /> : <Unlock className="w-4 h-4 mr-2" />}
                  {creativesUnlocked ? 'Bloquear Criativos' : 'Liberar Criativos'}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem onClick={() => setShowBlockDialog(true)}>
              <Ban className="w-4 h-4 mr-2" />
              {profile.isBlocked ? 'Desbloquear Perfil' : 'Bloquear Perfil'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              onClick={() => setShowDeleteDialog(true)}
              className="text-red-500 focus:text-red-500"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Remover Perfil
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover Perfil</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover @{profile.username} da lista de sincronização?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-500 hover:bg-red-600">
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Block Confirmation Dialog */}
      <AlertDialog open={showBlockDialog} onOpenChange={setShowBlockDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {profile.isBlocked ? 'Desbloquear Perfil' : 'Bloquear Perfil'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {profile.isBlocked 
                ? `Deseja desbloquear @${profile.username}? O perfil poderá usar o sistema normalmente.`
                : `Deseja bloquear @${profile.username}? O perfil não poderá gerar estratégias ou criativos.`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleBlock}>
              {profile.isBlocked ? 'Desbloquear' : 'Bloquear'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Creatives Unlock Dialog for Lifetime Users */}
      <AlertDialog open={showCreativesDialog} onOpenChange={setShowCreativesDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Crown className="w-5 h-5 text-amber-500" />
              {creativesUnlocked ? 'Bloquear Criativos' : 'Liberar Criativos'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {creativesUnlocked 
                ? `Deseja bloquear o acesso ao gerador de criativos para o usuário vitalício ${ownerUser?.ID}?`
                : `Deseja liberar o gerador de criativos para o usuário vitalício ${ownerUser?.ID}? Usuários vitalícios precisam de liberação do admin para usar esta funcionalidade.`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleToggleCreatives} className={creativesUnlocked ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'}>
              {creativesUnlocked ? 'Bloquear' : 'Liberar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default ProfileActions;
