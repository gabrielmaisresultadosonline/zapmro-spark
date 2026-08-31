import logoMro from '@/assets/logo-mro.png';
import logoMroLight from '@/assets/logo-mro-light.png';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const sizeClasses = {
  sm: 'h-8',
  md: 'h-12',
  lg: 'h-16',
  xl: 'h-24',
};

export const Logo = ({ className = '', size = 'md' }: LogoProps) => {
  return (
    <>
      <img
        src={logoMro}
        alt="I.A MRO"
        className={`${sizeClasses[size]} w-auto object-contain crm-logo-dark ${className}`}
      />
      <img
        src={logoMroLight}
        alt="I.A MRO"
        className={`${sizeClasses[size]} w-auto object-contain crm-logo-light hidden ${className}`}
      />
    </>
  );
};
