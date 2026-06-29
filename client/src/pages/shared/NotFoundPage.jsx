import { useNavigate } from 'react-router-dom';
import { Home, ArrowRight } from 'lucide-react';
import { useTranslation } from '../../context/LanguageContext';

export default function NotFoundPage() {
  const navigate = useNavigate();
  const t = useTranslation();

  return (
    <div className="page" dir="rtl">
      <div className="empty-state">
        <div className="text-6xl font-bold text-muted-foreground/30">404</div>
        <h3 className="text-lg font-semibold text-foreground">{t('notfound.title')}</h3>
        <p className="text-sm text-muted-foreground max-w-md">{t('notfound.body')}</p>
        <div className="flex gap-3 pt-2">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-secondary/50 hover:bg-secondary text-foreground transition-colors"
          >
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
            {t('notfound.go_back')}
          </button>
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-primary/10 hover:bg-primary/20 text-primary transition-colors"
          >
            <Home className="w-4 h-4" aria-hidden="true" />
            {t('notfound.go_home')}
          </button>
        </div>
      </div>
    </div>
  );
}
