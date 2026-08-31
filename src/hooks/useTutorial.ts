import { useState, useCallback } from 'react';

export interface TutorialStep {
  id: string;
  targetSelector: string;
  title: string;
  description: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

export interface TutorialSection {
  id: string;
  title: string;
  icon: string;
  warning?: string;
  steps: TutorialStep[];
}

// Tutorial para página de Registro de Perfil
export const profileRegistrationTutorial: TutorialSection[] = [
  {
    id: 'email',
    title: 'Seu E-mail',
    icon: '📧',
    steps: [
      {
        id: 'email-input',
        targetSelector: '[data-tutorial="email-input"]',
        title: 'Campo de E-mail',
        description: 'Digite seu e-mail aqui. Ele será vinculado permanentemente à sua conta.',
        position: 'bottom'
      }
    ]
  },
  {
    id: 'cadastrar',
    title: 'Cadastrar Instagram',
    icon: '➕',
    steps: [
      {
        id: 'instagram-input',
        targetSelector: '[data-tutorial="instagram-input"]',
        title: 'Campo Instagram',
        description: 'Digite o @ do Instagram que deseja cadastrar.',
        position: 'bottom'
      },
      {
        id: 'buscar-button',
        targetSelector: '[data-tutorial="buscar-button"]',
        title: 'Cadastrar Instagram',
        description: 'Clique para cadastrar o perfil. Ele aparecerá como placeholder até que você envie o print.',
        position: 'bottom'
      }
    ]
  },
  {
    id: 'perfis',
    title: 'Perfis Cadastrados',
    icon: '✅',
    steps: [
      {
        id: 'perfis-list',
        targetSelector: '[data-tutorial="perfis-list"]',
        title: 'Lista de Perfis',
        description: 'Clique em um perfil para acessar o dashboard. Na primeira vez, envie o print do perfil para a I.A analisar.',
        position: 'top'
      }
    ]
  }
];

// Tutorial para Dashboard
export const dashboardTutorial: TutorialSection[] = [
  {
    id: 'print',
    title: 'Enviar Print do Perfil',
    icon: '📸',
    steps: [
      {
        id: 'print-upload',
        targetSelector: '[data-tutorial="tab-perfil"]',
        title: 'Aba Perfil - Envie seu Print',
        description: 'Na aba Perfil, envie um print/screenshot do seu Instagram. A I.A vai extrair seguidores, bio, nicho e gerar a análise automaticamente.',
        position: 'bottom'
      }
    ]
  },
  {
    id: 'ferramenta',
    title: 'Ferramenta MRO',
    icon: '🔧',
    steps: [
      {
        id: 'mro-button',
        targetSelector: '[data-tutorial="mro-button"]',
        title: 'Ferramenta MRO',
        description: 'Acesse a ferramenta de automação MRO para interagir com 200 pessoas por dia, seguir + curtir automaticamente e enviar mensagens em massa.',
        position: 'bottom'
      }
    ]
  },
  {
    id: 'tabs',
    title: 'Abas de Navegação',
    icon: '📑',
    steps: [
      {
        id: 'tab-perfil',
        targetSelector: '[data-tutorial="tab-perfil"]',
        title: 'Aba Perfil',
        description: 'Visualize os dados extraídos do seu print: seguidores, bio, nicho. Envie o print aqui na primeira vez.',
        position: 'bottom'
      },
      {
        id: 'tab-analise',
        targetSelector: '[data-tutorial="tab-analise"]',
        title: 'Aba Análise',
        description: 'Veja a análise da I.A: pontuações de conteúdo, engajamento, pontos fortes e fracos do perfil.',
        position: 'bottom'
      },
      {
        id: 'tab-estrategias',
        targetSelector: '[data-tutorial="tab-estrategias"]',
        title: 'Aba Estratégias',
        description: 'Gere estratégias MRO personalizadas com calendário de posts, stories, scripts de vendas e mensagens em massa.',
        position: 'bottom'
      },
      {
        id: 'tab-legendas',
        targetSelector: '[data-tutorial="tab-legendas"]',
        title: 'Gerar Legendas',
        description: 'Gere legendas profissionais com I.A para seus posts do Instagram.',
        position: 'bottom'
      },
      {
        id: 'tab-crescimento',
        targetSelector: '[data-tutorial="tab-crescimento"]',
        title: 'Aba Crescimento',
        description: 'Acompanhe a evolução do seu perfil: seguidores ganhos e engajamento ao longo do tempo.',
        position: 'bottom'
      }
    ]
  },
  {
    id: 'usuario',
    title: 'Menu do Usuário',
    icon: '⚙️',
    steps: [
      {
        id: 'user-menu',
        targetSelector: '[data-tutorial="user-menu"]',
        title: 'Informações do Usuário',
        description: 'Veja seu nome, dias restantes de acesso. Use o ícone de ajuda (vermelho) para ver este tutorial novamente.',
        position: 'bottom'
      }
    ]
  }
];

// Tutorial para Estratégias
export const strategyTutorial: TutorialSection[] = [
  {
    id: 'tipo',
    title: 'Tipos de Estratégia',
    icon: '🎯',
    steps: [
      {
        id: 'strategy-types',
        targetSelector: '[data-tutorial="strategy-types"]',
        title: 'Escolha o Tipo',
        description: 'Selecione: MRO (interações + mensagens em massa), Conteúdo (calendário), Engajamento, Vendas (scripts) ou Bio (otimização).',
        position: 'bottom'
      }
    ]
  },
  {
    id: 'gerar',
    title: 'Gerar Estratégia',
    icon: '✨',
    steps: [
      {
        id: 'generate-button',
        targetSelector: '[data-tutorial="generate-button"]',
        title: 'Botão Gerar',
        description: 'Gere uma estratégia personalizada de 30 dias baseada nos dados do seu print. Inclui calendário, stories e scripts de vendas.',
        position: 'top'
      }
    ]
  },
  {
    id: 'resultado',
    title: 'Estratégia Gerada',
    icon: '📋',
    steps: [
      {
        id: 'strategy-display',
        targetSelector: '[data-tutorial="strategy-display"]',
        title: 'Sua Estratégia',
        description: 'Veja passos detalhados, calendário de 30 dias, scripts de vendas e tutorial da ferramenta MRO para interagir e enviar mensagens.',
        position: 'top'
      }
    ]
  }
];

export const useTutorial = () => {
  const [isActive, setIsActive] = useState(false);
  const [currentSection, setCurrentSection] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);
  const [showList, setShowList] = useState(false);
  const [tutorialData, setTutorialData] = useState<TutorialSection[]>([]);

  const startTutorial = useCallback((sections: TutorialSection[]) => {
    setTutorialData(sections);
    setCurrentSection(0);
    setCurrentStep(0);
    setIsActive(true);
    setShowList(false);
  }, []);

  const startListView = useCallback((sections: TutorialSection[]) => {
    setTutorialData(sections);
    setShowList(true);
    setIsActive(false);
  }, []);

  const nextStep = useCallback(() => {
    const currentSectionData = tutorialData[currentSection];
    if (!currentSectionData) return;

    if (currentStep < currentSectionData.steps.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else if (currentSection < tutorialData.length - 1) {
      setCurrentSection(prev => prev + 1);
      setCurrentStep(0);
    } else {
      // Tutorial finished
      setIsActive(false);
    }
  }, [currentSection, currentStep, tutorialData]);

  const prevStep = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    } else if (currentSection > 0) {
      const prevSectionIndex = currentSection - 1;
      setCurrentSection(prevSectionIndex);
      setCurrentStep(tutorialData[prevSectionIndex].steps.length - 1);
    }
  }, [currentSection, currentStep, tutorialData]);

  const stopTutorial = useCallback(() => {
    setIsActive(false);
    setShowList(false);
  }, []);

  const getCurrentStepData = useCallback(() => {
    if (!tutorialData.length) return null;
    const section = tutorialData[currentSection];
    if (!section) return null;
    return section.steps[currentStep] || null;
  }, [tutorialData, currentSection, currentStep]);

  const getTotalSteps = useCallback(() => {
    return tutorialData.reduce((acc, section) => acc + section.steps.length, 0);
  }, [tutorialData]);

  const getCurrentStepNumber = useCallback(() => {
    let count = 0;
    for (let i = 0; i < currentSection; i++) {
      count += tutorialData[i].steps.length;
    }
    return count + currentStep + 1;
  }, [tutorialData, currentSection, currentStep]);

  return {
    isActive,
    showList,
    currentSection,
    currentStep,
    tutorialData,
    startTutorial,
    startListView,
    nextStep,
    prevStep,
    stopTutorial,
    getCurrentStepData,
    getTotalSteps,
    getCurrentStepNumber,
    setShowList
  };
};
