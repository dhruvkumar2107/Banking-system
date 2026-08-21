import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * className combiner: clsx for conditional logic + tailwind-merge so later
 * utilities win over earlier conflicting ones (e.g. a caller's `text-rose-600`
 * overrides a component default without specificity surprises).
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
