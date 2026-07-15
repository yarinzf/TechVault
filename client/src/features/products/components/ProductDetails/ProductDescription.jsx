import {
  Monitor, Zap, Timer, RefreshCw, Cpu, MemoryStick, HardDrive, Layers,
  BatteryFull, Wifi, Bluetooth, Cable, MousePointer2, Ruler, Volume2,
  ShieldCheck, Mic, Palette, Info,
} from 'lucide-react';
import { useTranslation } from '../../../../context/LanguageContext';
import { getProductHighlights } from '../../utils/highlights';
import s from './ProductDescription.module.css';

const ICONS = {
  Monitor, Zap, Timer, RefreshCw, Cpu, MemoryStick, HardDrive, Layers,
  BatteryFull, Wifi, Bluetooth, Cable, MousePointer2, Ruler, Volume2,
  ShieldCheck, Mic, Palette, Info,
};

export default function ProductDescription({ product }) {
  const t = useTranslation();
  const text = product.description || product.shortDescription;
  const highlights = getProductHighlights(product, 6);

  if (!text && !highlights.length) return null;

  return (
    <div className={s.wrap}>
      {text && <p className={s.body}>{text}</p>}

      {highlights.length > 0 && (
        <div className={s.grid}>
          {highlights.map(({ key, value, iconName }) => {
            const Icon = ICONS[iconName] ?? Info;
            return (
              <div key={key} className={s.card}>
                <Icon size={22} className={s.cardIcon} />
                <span className={s.cardLabel}>{key}</span>
                <span className={s.cardVal}>{value}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
