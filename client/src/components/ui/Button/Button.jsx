import s from './Button.module.css';

export default function Button({
  children,
  variant = 'primary',
  size,
  full,
  className = '',
  ...props
}) {
  const classes = [
    s.btn,
    s[variant],
    size && s[size],
    full && s.full,
    className,
  ].filter(Boolean).join(' ');

  return (
    <button className={classes} {...props}>
      {children}
    </button>
  );
}
