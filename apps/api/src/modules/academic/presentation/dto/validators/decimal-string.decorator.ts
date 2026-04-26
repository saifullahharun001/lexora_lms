import { Matches } from "class-validator";

const DECIMAL_STRING_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;

export function IsDecimalString(fieldLabel: string) {
  return Matches(DECIMAL_STRING_PATTERN, {
    message: `${fieldLabel} must be a non-negative decimal with up to 2 decimal places`
  });
}
