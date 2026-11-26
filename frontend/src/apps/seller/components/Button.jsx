import { AppButton } from "../../../shared/ui";
export default function Button({
  variant = 'primary',
  children,
  onClick,
  width,
  className = '',
  type = 'button',
  ...rest
}) {
  return (
    <AppButton
      type={type}
      outlined={variant === 'secondary'}
      className={className}
      style={width ? {flex: 1, minWidth: 0} : undefined}
      onClick={onClick}
      {...rest}
    >
      {children}
    </AppButton>
  );
}
