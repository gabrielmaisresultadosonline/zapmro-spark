export interface InstagramProfile {
  username: string;
  fullName: string;
  bio: string;
  followers: number;
  following: number;
  posts: number;
  profilePicUrl: string;
  isBusinessAccount: boolean;
  category: string;
  externalUrl: string;
  recentPosts: InstagramPost[];
  engagement: number;
  avgLikes: number;
  avgComments: number;
  needsScreenshotAnalysis?: boolean; // Indica que perfil precisa de análise via screenshot (restrição de idade)
  dataSource?: 'placeholder' | 'screenshot';
}

export interface InstagramPost {
  id: string;
  imageUrl: string;
  caption: string;
  likes: number;
  comments: number;
  timestamp: string;
  hasHumanFace: boolean;
}

export interface ProfileAnalysis {
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  niche: string;
  audienceType: string;
  contentScore: number;
  engagementScore: number;
  profileScore: number;
  recommendations: string[];
}

export interface Strategy {
  id: string;
  title: string;
  description: string;
  type: 'mro' | 'content' | 'engagement' | 'sales' | 'bio';
  steps: string[];
  scripts: SalesScript[];
  storiesCalendar: StoriesDay[];
  postsCalendar?: PostDay[];
  mroTutorial?: MROTutorial;
  metaSchedulingTutorial?: string[];
  // Bio strategy specific fields
  bioAnalysis?: {
    currentBio: string;
    problems: string[];
    strengths: string[];
  };
  suggestedBios?: {
    bio: string;
    focus: string;
  }[];
  tips?: string[];
  createdAt: string;
}

export interface PostDay {
  date: string;
  dayOfWeek: string;
  postType: string;
  content: string;
  hashtags: string[];
  bestTime: string;
  cta: string;
}

export interface MROTutorial {
  dailyActions: MRODailyAction[];
  unfollowStrategy: string[];
  competitorReference: string;
}

export interface MRODailyAction {
  action: string;
  quantity: string;
  description: string;
}

export interface SalesScript {
  situation: string;
  opening: string;
  body: string;
  closing: string;
  scarcityTriggers: string[];
}

export interface StoriesDay {
  day: string;
  stories: StoryIdea[];
}

export interface StoryIdea {
  time: string;
  type: 'engagement' | 'cta' | 'behind-scenes' | 'testimonial' | 'offer';
  content: string;
  hasButton: boolean;
  buttonText?: string;
  buttonUrl?: string;
}

export interface Creative {
  id: string;
  imageUrl: string;
  ctaText: string;
  headline: string;
  strategyId: string;
  createdAt: string;
  expiresAt: string;
  colors: CreativeColors;
  logoUrl?: string;
  downloaded: boolean;
}

export interface CreativeColors {
  primary: string;
  secondary: string;
  text: string;
}

export interface CreativeConfig {
  colors: CreativeColors;
  logoType: 'profile' | 'custom' | 'none';
  logoPosition: 'left' | 'center' | 'right';
  fontColor: string;
  customLogoUrl?: string;
  businessType: string;
  customColors?: string[];
}

// Growth Tracking Types
export interface GrowthSnapshot {
  date: string;
  followers: number;
  following: number;
  posts: number;
  avgLikes: number;
  avgComments: number;
  engagement: number;
}

export interface GrowthInsight {
  weekNumber: number;
  startDate: string;
  endDate: string;
  followersGain: number;
  followersGainPercent: number;
  engagementChange: number;
  strategyBonus: string;
  insights: string[];
}

export type StrategyType = 'mro' | 'content' | 'engagement' | 'sales' | 'bio';

export interface StrategyGenerationDates {
  mro?: string;
  content?: string;
  engagement?: string;
  sales?: string;
  bio?: string;
}

export interface ProfileSession {
  id: string;
  profile: InstagramProfile;
  analysis: ProfileAnalysis;
  strategies: Strategy[];
  creatives: Creative[];
  creativesRemaining: number;
  initialSnapshot: GrowthSnapshot;
  growthHistory: GrowthSnapshot[];
  growthInsights: GrowthInsight[];
  startedAt: string;
  lastUpdated: string;
  lastStrategyGeneratedAt?: string; // Legacy - kept for backward compatibility
  strategyGenerationDates?: StrategyGenerationDates; // Per-type generation dates
  screenshotUrl?: string; // URL do print do perfil enviado pelo cliente
  screenshotUploadCount?: number; // Número de vezes que o print foi enviado (máx 2)
  screenshotHistory?: { url: string; uploadedAt: string }[]; // Histórico de prints para admin
}

export interface MROSession {
  profiles: ProfileSession[];
  activeProfileId: string | null;
  lastUpdated: string;
  // Legacy support
  profile?: InstagramProfile | null;
  analysis?: ProfileAnalysis | null;
  strategies?: Strategy[];
  creatives?: Creative[];
  creativesRemaining?: number;
}
