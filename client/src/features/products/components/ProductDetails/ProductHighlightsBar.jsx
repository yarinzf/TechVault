import {
  Monitor, Zap, Timer, RefreshCw, Cpu, MemoryStick, HardDrive, Layers,
  BatteryFull, Wifi, Bluetooth, Cable, MousePointer2, Ruler, Volume2,
  ShieldCheck, Mic, Palette, Info,
} from 'lucide-react';
import { getProductHighlights } from '../../utils/highlights';
import s from './ProductHighlightsBar.module.css';

const ICONS = {
  Monitor, Zap, Timer, RefreshCw, Cpu, MemoryStick, HardDrive, Layers,
  BatteryFull, Wifi, Bluetooth, Cable, MousePointer2, Ruler, Volume2,
  ShieldCheck, Mic, Palette, Info,
};

export default function ProductHighlightsBar({ product }) {
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
              <div className={s.sub}>{key}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
