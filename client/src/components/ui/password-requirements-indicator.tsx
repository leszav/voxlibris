import { Check, X } from 'lucide-react';
import { 
  type PasswordRequirements, 
  type PasswordStrength,
  getPasswordStrengthLabel,
  getPasswordStrengthColorClass
} from '@/lib/password-validation';

interface PasswordRequirementsIndicatorProps {
  requirements: PasswordRequirements;
  strength?: PasswordStrength | null;
  showMatch?: boolean;
}

export function PasswordRequirementsIndicator({
  requirements,
  strength,
  showMatch = false,
}: PasswordRequirementsIndicatorProps) {
  return (
    <div className="space-y-2 text-sm">
      <div className="flex items-center gap-2">
        {requirements.length ? (
          <Check className="h-4 w-4 text-green-500" />
        ) : (
          <X className="h-4 w-4 text-red-500" />
        )}
        <span className={requirements.length ? "text-green-600" : "text-red-600"}>
          Минимум 8 символов
        </span>
      </div>
      
      <div className="flex items-center gap-2">
        {requirements.hasLetter ? (
          <Check className="h-4 w-4 text-green-500" />
        ) : (
          <X className="h-4 w-4 text-red-500" />
        )}
        <span className={requirements.hasLetter ? "text-green-600" : "text-red-600"}>
          Содержит буквы
        </span>
      </div>
      
      <div className="flex items-center gap-2">
        {requirements.hasDigit ? (
          <Check className="h-4 w-4 text-green-500" />
        ) : (
          <X className="h-4 w-4 text-red-500" />
        )}
        <span className={requirements.hasDigit ? "text-green-600" : "text-red-600"}>
          Содержит цифры
        </span>
      </div>
      
      <div className="flex items-center gap-2">
        {requirements.validChars ? (
          <Check className="h-4 w-4 text-green-500" />
        ) : (
          <X className="h-4 w-4 text-red-500" />
        )}
        <span className={requirements.validChars ? "text-green-600" : "text-red-600"}>
          Только латинские буквы, цифры и спецсимволы
        </span>
      </div>
      
      {strength && (
        <div className="flex items-center gap-2 mt-2 pt-2 border-t">
          <span className="text-muted-foreground">Сложность пароля:</span>
          <span className={`${getPasswordStrengthColorClass(strength)} font-medium`}>
            {getPasswordStrengthLabel(strength)}
          </span>
        </div>
      )}
      
      {showMatch && requirements.match !== undefined && (
        <div className="flex items-center gap-2">
          {requirements.match ? (
            <Check className="h-4 w-4 text-green-500" />
          ) : (
            <X className="h-4 w-4 text-red-500" />
          )}
          <span className={requirements.match ? "text-green-600" : "text-red-600"}>
            Пароли совпадают
          </span>
        </div>
      )}
    </div>
  );
}
