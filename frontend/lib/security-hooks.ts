import { useState, useEffect, useRef, useCallback } from 'react';

// Debounced input hook for search/filter inputs
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

// Rate limiting hook for form submissions
export function useRateLimit(maxAttempts: number = 5, windowMs: number = 60000) {
  const attemptsRef = useRef<number[]>([]);
  const cooldownEndRef = useRef<number | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const [isBlocked, setIsBlocked] = useState(false);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  const checkRateLimit = useCallback(() => {
    const now = Date.now();
    const windowStart = now - windowMs;

    // Remove old attempts outside the window
    attemptsRef.current = attemptsRef.current.filter(attempt => attempt > windowStart);

    // Check if we're still in cooldown using ref for current value
    const currentCooldownEnd = cooldownEndRef.current;
    if (currentCooldownEnd && now < currentCooldownEnd) {
      return { ok: false, retryAfterMs: currentCooldownEnd - now };
    }

    // Check if we've exceeded the rate limit
    if (attemptsRef.current.length >= maxAttempts) {
      const cooldownDuration = 30000; // 30 second cooldown
      const newCooldownEnd = now + cooldownDuration;

      cooldownEndRef.current = newCooldownEnd;
      setIsBlocked(true);

      // Clear existing timer
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      // Auto-unblock after cooldown with cleanup tracking
      timerRef.current = setTimeout(() => {
        cooldownEndRef.current = null;
        setIsBlocked(false);
        timerRef.current = null;
      }, cooldownDuration);

      return { ok: false, retryAfterMs: cooldownDuration };
    }

    // Record this attempt
    attemptsRef.current.push(now);
    return { ok: true, retryAfterMs: 0 };
  }, [maxAttempts, windowMs]);

  const getRemainingCooldown = useCallback(() => {
    const currentCooldownEnd = cooldownEndRef.current;
    if (!currentCooldownEnd) return 0;
    return Math.max(0, currentCooldownEnd - Date.now());
  }, []);

  const getAttemptsRemaining = useCallback(() => {
    return Math.max(0, maxAttempts - attemptsRef.current.length);
  }, [maxAttempts]);

  return {
    canProceed: checkRateLimit,
    isBlocked,
    remainingCooldown: getRemainingCooldown,
    attemptsRemaining: getAttemptsRemaining,
  };
}

// Enhanced form submission hook with security features
export function useSecureSubmit<T>(
  onSubmit: (data: T) => Promise<void>,
  options: {
    maxAttempts?: number;
    rateLimitWindow?: number;
  } = {}
) {
  const {
    maxAttempts = 5,
    rateLimitWindow = 60000,
  } = options;

  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);
  const rateLimit = useRateLimit(maxAttempts, rateLimitWindow);

  // Stable references for memoization optimization
  const canProceed = rateLimit.canProceed;
  const getRemainingCooldown = rateLimit.remainingCooldown;
  const getAttemptsRemaining = rateLimit.attemptsRemaining;

  const secureSubmit = useCallback(async (data: T) => {
    // Check rate limiting with correct return format
    const rateLimitResult = canProceed();
    if (!rateLimitResult.ok) {
      throw new Error(`Too many attempts. Please wait ${Math.ceil(rateLimitResult.retryAfterMs / 1000)} seconds.`);
    }

    // Prevent duplicate submissions using ref to avoid stale closure
    if (isSubmittingRef.current) {
      throw new Error('Submission already in progress');
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);

    try {
      // Direct submission - no double invocation
      await onSubmit(data);
    } catch (error) {
      console.error('Submission error:', error);
      throw error;
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  }, [onSubmit, canProceed, getRemainingCooldown]);

  return {
    secureSubmit,
    isSubmitting,
    isBlocked: rateLimit.isBlocked,
    attemptsRemaining: getAttemptsRemaining,
    remainingCooldown: getRemainingCooldown,
  };
}

// Secure input validation hook with real-time feedback
export function useSecureInput(
  initialValue: string = '',
  validator: (value: string) => string | null,
  options: {
    debounceMs?: number;
    validateOnChange?: boolean;
    maxLength?: number;
  } = {}
) {
  const {
    debounceMs = 300,
    validateOnChange = true,
    maxLength = 1000,
  } = options;

  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [hasBeenTouched, setHasBeenTouched] = useState(false);

  const debouncedValue = useDebounce(value, debounceMs);

  // Real-time validation
  useEffect(() => {
    if (!validateOnChange || !hasBeenTouched) return;

    const validateAsync = async () => {
      setIsValidating(true);
      // Perform validation after debounce
      const validationError = validator(debouncedValue);
      setError(validationError);
      setIsValidating(false);
    };

    validateAsync();
  }, [debouncedValue, validator, validateOnChange, hasBeenTouched]);

  const handleChange = useCallback((newValue: string) => {
    // Length check
    if (newValue.length > maxLength) {
      setError(`Input too long (max ${maxLength} characters)`);
      return;
    }

    setValue(newValue);
    setHasBeenTouched(true);

    // Immediate feedback for obviously invalid input
    if (validateOnChange) {
      setIsValidating(true);
    }
  }, [maxLength, validateOnChange]);

  const handleBlur = useCallback(() => {
    setHasBeenTouched(true);
    const validationError = validator(value);
    setError(validationError);
  }, [value, validator]);

  const reset = useCallback(() => {
    setValue(initialValue);
    setError(null);
    setIsValidating(false);
    setHasBeenTouched(false);
  }, [initialValue]);

  return {
    value,
    error,
    isValidating,
    hasBeenTouched,
    isValid: !error && hasBeenTouched,
    onChange: handleChange,
    onBlur: handleBlur,
    reset,
  };
}

// File upload security hook
// SECURITY NOTE: Client-side validation is for UX only. All security enforcement
// must be done server-side. Magic byte validation provides better protection than
// MIME types but can still be bypassed by sophisticated attackers.
export function useSecureFileUpload(options: {
  maxSize?: number; // bytes
  allowedTypes?: string[];
  maxFiles?: number;
} = {}) {
  const {
    maxSize = 5 * 1024 * 1024, // 5MB default
    allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'],
    maxFiles = 10,
  } = options;

  const [files, setFiles] = useState<File[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [isValidating, setIsValidating] = useState(false);

  // Magic bytes for file type detection (more secure than MIME/extension)
  const checkMagicBytes = useCallback(async (file: File): Promise<string | null> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const buffer = e.target?.result as ArrayBuffer;
        if (!buffer) {
          resolve('Unable to read file');
          return;
        }

        const bytes = new Uint8Array(buffer.slice(0, 12)); // Read first 12 bytes
        const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');

        // Magic byte signatures for allowed file types
        const signatures: Record<string, RegExp[]> = {
          'image/jpeg': [/^ffd8ff/],
          'image/png': [/^89504e470d0a1a0a/],
          'image/gif': [/^474946383[79]61/],
          'application/pdf': [/^255044462d/],
        };

        // Check if file matches any allowed magic bytes
        for (const [mimeType, patterns] of Object.entries(signatures)) {
          if (allowedTypes.includes(mimeType)) {
            for (const pattern of patterns) {
              if (pattern.test(hex)) {
                resolve(null); // Valid file type
                return;
              }
            }
          }
        }

        resolve(`File type not allowed. Only ${allowedTypes.join(', ')} files are permitted.`);
      };

      reader.onerror = () => resolve('Unable to read file');
      reader.readAsArrayBuffer(file.slice(0, 12)); // Only read first 12 bytes
    });
  }, [allowedTypes]);

  const validateFile = useCallback(async (file: File): Promise<string | null> => {
    // File size check (this is safe client-side validation)
    if (file.size > maxSize) {
      return `File too large: ${Math.round(file.size / 1024 / 1024)}MB (max ${Math.round(maxSize / 1024 / 1024)}MB)`;
    }

    // File name security check (prevent path traversal, etc.)
    const dangerousChars = /[<>:"|?*\x00-\x1f]/;
    if (dangerousChars.test(file.name)) {
      return 'File name contains invalid characters';
    }

    // SECURITY: Magic byte validation (more secure than MIME type checking)
    // Note: This provides better protection but server-side validation is still required
    const magicByteError = await checkMagicBytes(file);
    if (magicByteError) {
      return magicByteError;
    }

    return null;
  }, [maxSize, checkMagicBytes]);

  const addFiles = useCallback(async (newFiles: FileList | File[]) => {
    setIsValidating(true);
    const fileArray = Array.from(newFiles);

    const validFiles: File[] = [];
    const newErrors: string[] = [];

    // Validate each file (now async due to magic byte checking)
    for (const file of fileArray) {
      const error = await validateFile(file);
      if (error) {
        newErrors.push(`${file.name}: ${error}`);
      } else {
        validFiles.push(file);
      }
    }

    // Move capacity enforcement inside setFiles to prevent race conditions
    let capacityError: string | null = null;
    setFiles(prev => {
      const currentCount = prev.length;
      const allowedSlots = Math.max(0, maxFiles - currentCount);

      if (validFiles.length > allowedSlots) {
        capacityError = `Too many files. Maximum ${maxFiles} allowed.`;
        // Only add files up to the limit
        return [...prev, ...validFiles.slice(0, allowedSlots)];
      }
      return [...prev, ...validFiles];
    });

    // Update errors using functional updater
    setErrors(prev => {
      const allErrors = [...prev, ...newErrors];
      if (capacityError) {
        allErrors.push(capacityError);
      }
      return allErrors;
    });
    setIsValidating(false);
  }, [maxFiles, validateFile]);

  const removeFile = useCallback((index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  }, []);

  const clearAll = useCallback(() => {
    setFiles([]);
    setErrors([]);
  }, []);

  const clearErrors = useCallback(() => {
    setErrors([]);
  }, []);

  return {
    files,
    errors,
    isValidating,
    addFiles,
    removeFile,
    clearAll,
    clearErrors,
    hasErrors: errors.length > 0,
    isValid: files.length > 0 && errors.length === 0,
  };
}