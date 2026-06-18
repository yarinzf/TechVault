import { useNavigate } from 'react-router-dom';
import Button from '../../components/ui/Button/Button';

export default function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <div className="page">
      <div className="empty-state">
        <div className="icon" style={{ fontSize: '4rem' }}>404</div>
        <h3>Page Not Found</h3>
        <p>The page you're looking for doesn't exist or has been moved.</p>
        <Button onClick={() => navigate('/')}>Go Home</Button>
      </div>
    </div>
  );
}
