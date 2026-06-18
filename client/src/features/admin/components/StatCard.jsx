export function StatCard({
  title,
  value,
  change,
  changeType = 'neutral',
  icon: Icon,
  size = 'default',
}) {
  const changeClass =
    changeType === 'positive'
      ? 'text-[#10b981] bg-[#10b981]/10 border border-[#10b981]/20'
      : changeType === 'negative'
        ? 'text-[#ef4444] bg-[#ef4444]/10 border border-[#ef4444]/20'
        : 'text-muted-foreground bg-muted/10';

  return (
    <div
      className={`bg-card border border-border rounded-lg p-6 hover:border-[#2563eb]/30 hover:shadow-lg hover:shadow-[#2563eb]/5 transition-all group ${size === 'large' ? 'col-span-2' : ''
        }`}
      dir="rtl"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <p className="text-muted-foreground text-sm mb-2">{title}</p>
          <h3
            className={`text-foreground ${size === 'large' ? 'text-4xl' : 'text-3xl'
              } tracking-tight group-hover:text-[#2563eb] transition-colors`}
          >
            {value}
          </h3>
        </div>

        <div className="bg-[#2563eb]/10 p-3 rounded-lg group-hover:bg-[#2563eb]/20 group-hover:scale-110 transition-all">
          {Icon && <Icon className="w-6 h-6 text-[#2563eb]" />}
        </div>
      </div>

      {change && (
        <div className="flex items-center gap-2">
          <span className={`text-sm inline-flex items-center gap-1 px-2 py-0.5 rounded-md ${changeClass}`}>
            {change}
          </span>
          <span className="text-xs text-muted-foreground">מהתקופה הקודמת</span>
        </div>
      )}
    </div>
  );
}

export default StatCard;
