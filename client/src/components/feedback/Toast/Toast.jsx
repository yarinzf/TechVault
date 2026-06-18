import { useToast } from '../../../hooks/useToast';
import s from './Toast.module.css';

const ICONS = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };

export default function ToastContainer() {
  const { toasts, removeToast } = useToast();

  return (
    <div className={s.container}>
      {toasts.map(t => (
        <div key={t.id} className={`${s.toast} ${s[t.type]}`}>
          <span className={s.icon}>{ICONS[t.type]}</span>
          <span className={s.message}>{t.message}</span>
          <button className={s.close} onClick={() => removeToast(t.id)}>✕</button>
        </div>
      ))}
    </div>
  );
}
