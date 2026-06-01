import type {ReactNode} from 'react';
import clsx from 'clsx';
import Heading from '@theme/Heading';
import Link from '@docusaurus/Link';

type FeatureItem = {
  title: string;
  icon: ReactNode;
  description: ReactNode;
  linkTo: string;
  linkText: string;
};

const FeatureList: FeatureItem[] = [
  {
    title: 'Uygulama Bilgileri',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
        <line x1="12" y1="18" x2="12.01" y2="18" />
      </svg>
    ),
    description: (
      <>
        TheFoodHero mobil ve web uygulamalarına ait kullanıcı rehberleri, işlevsel ekran tasarımları, 
        konfigürasyon ayarları ve temel iş kurallarına ilişkin detaylı anlatımlar.
      </>
    ),
    linkTo: '/docs/intro',
    linkText: 'Uygulamayı Keşfet',
  },
  {
    title: 'Yazılım ve Teknik Mimari',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
      </svg>
    ),
    description: (
      <>
        Sistem tasarımı, mikroservis mimarisi (Auth, Payment, Chat), veritabanı şemaları, 
        kullanılan yazılım tasarım desenleri (Saga Pattern vb.) ve kod standartları.
      </>
    ),
    linkTo: '/docs/services/auth-service',
    linkText: 'Teknik Detaylar',
  },
  {
    title: 'Yazılım Prensipleri',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
        <line x1="12" y1="4" x2="12" y2="20" />
      </svg>
    ),
    description: (
      <>
        Geliştirme ortamının kurulması, bağımlılıklar, local çalıştırma adımları, deployment 
        ve dağıtım süreçleri, CI/CD hatları ve API entegrasyon kılavuzları.
      </>
    ),
    linkTo: '/docs/learnings/software-patterns/saga-pattern',
    linkText: 'Geliştirici Rehberi',
  },
];

function Feature({title, icon, description, linkTo, linkText}: FeatureItem) {
  return (
    <div className={clsx('col col--4 margin-bottom--lg')}>
      <div className="featureCard">
        <div className="featureIconWrapper">
          {icon}
        </div>
        <Heading as="h3" className="featureCardTitle">{title}</Heading>
        <p className="featureCardDesc">{description}</p>
        <div style={{ marginTop: '1.8rem' }}>
          <Link 
            className="btnPremium" 
            style={{ 
              fontSize: '0.85rem', 
              padding: '0.5rem 1.2rem', 
              border: '1px solid var(--ifm-color-primary)', 
              color: 'var(--ifm-color-primary)',
              background: 'transparent',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%'
            }} 
            to={linkTo}
          >
            {linkText}
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function HomepageFeatures(): ReactNode {
  return (
    <section className="premiumFeaturesSection">
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
