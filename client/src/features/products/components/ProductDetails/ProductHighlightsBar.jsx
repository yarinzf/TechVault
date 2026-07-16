import {
  Monitor, Zap, Timer, RefreshCw, Cpu, MemoryStick, HardDrive, Layers,
  BatteryFull, Wifi, Bluetooth, Cable, MousePointer2, Ruler, Volume2,
  ShieldCheck, Mic, Palette, Info,
} from 'lucide-react';
import { useLanguage } from '../../../../context/LanguageContext';
import { getProductHighlights } from '../../utils/highlights';
import { getSpecLabel } from '../../utils/specLabels';
import s from './ProductHighlightsBar.module.css';

const ICONS = {
  Monitor, Zap, Timer, RefreshCw, Cpu, MemoryStick, HardDrive, Layers,
  BatteryFull, Wifi, Bluetooth, Cable, MousePointer2, Ruler, Volume2,
  ShieldCheck, Mic, Palette, Info,
};

export default function ProductHighlightsBar({ product }) {
  const { language } = useLanguage();
  const highlights = getProductHighlights(product, 6);
  if (!highlights.length) return null;

  return (
    <div className={s.summary}>
      <div className={s.bar}>
        {highlights.map(({ key, value, iconName }) => {
          const Icon = ICONS[iconName] ?? Info;
          return (
            <div key={key} className={s.item}>
              <div className={s.icon}><Icon size={19} /></div>
              <div className={s.title}>{value}</div>
              <div className={s.sub}>{getSpecLabel(key, language)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
