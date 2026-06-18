import s from './RangeSlider.module.css';

export default function RangeSlider({
  min = 0,
  max = 1000,
  value = [0, 1000],
  onChange,
  step = 1,
  formatValue = (v) => String(v),
}) {
  const [minVal, maxVal] = value;

  const minPct = ((minVal - min) / (max - min)) * 100;
  const maxPct = ((maxVal - min) / (max - min)) * 100;

  const handleMin = (e) => {
    const next = Math.min(Number(e.target.value), maxVal - step);
    onChange([next, maxVal]);
  };

  const handleMax = (e) => {
    const next = Math.max(Number(e.target.value), minVal + step);
    onChange([minVal, next]);
  };

  return (
    <div className={s.wrap} dir="ltr">
      <div className={s.track}>
        {/* Filled range between thumbs */}
        <div
          className={s.fill}
          style={{
            left:  `${minPct}%`,
            right: `${100 - maxPct}%`,
          }}
        />

        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={minVal}
          onChange={handleMin}
          className={`${s.input} ${s.inputMin}`}
          aria-label="מינימום"
          aria-valuenow={minVal}
          aria-valuemin={min}
          aria-valuemax={maxVal}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={maxVal}
          onChange={handleMax}
          className={`${s.input} ${s.inputMax}`}
          aria-label="מקסימום"
          aria-valuenow={maxVal}
          aria-valuemin={minVal}
          aria-valuemax={max}
        />
      </div>

      <div className={s.labels}>
        <span>{formatValue(minVal)}</span>
        <span>{formatValue(maxVal)}</span>
      </div>
    </div>
  );
}
