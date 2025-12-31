import * as React from "react"
import { Eye, EyeOff } from "lucide-react"
import { cn } from "../../lib/utils"

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    const [showPassword, setShowPassword] = React.useState(false)

    const baseClassName =
      "flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"

    if (type !== 'password') {
      return (
        <input
          type={type}
          className={cn(baseClassName, className)}
          ref={ref}
          {...props}
        />
      )
    }

    const isDisabled = Boolean(props.disabled)
    const inputType = showPassword ? 'text' : 'password'

    return (
      <div className="relative">
        <input
          type={inputType}
          className={cn(baseClassName, className, 'pr-10')}
          ref={ref}
          {...props}
        />
        <button
          type="button"
          className={cn(
            'absolute inset-y-0 right-0 flex items-center px-3 text-slate-500 hover:text-slate-700',
            isDisabled && 'pointer-events-none opacity-50'
          )}
          onClick={() => setShowPassword((v) => !v)}
          aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          aria-pressed={showPassword}
          disabled={isDisabled}
        >
          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    )
  }
)
Input.displayName = "Input"

export { Input }
