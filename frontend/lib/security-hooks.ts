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
  const [isBlocked, setIsBlocked] = useState(false);
  const [cooldownEnd, setCooldownEnd] = useState<number | null>(null);

  const checkRateLimit = useCallback(() => {
    const now = Date.now();
    const windowStart = now - windowMs;

    // Remove old attempts outside the window
    attemptsRef.current = attemptsRef.current.filter(attempt => attempt > windowStart);

    // Check if we're still in cooldown
    if (cooldownEnd && now < cooldownEnd) {
      return false;
    }

    // Check if we've exceeded the rate limit
    if (attemptsRef.current.length >= maxAttempts) {
      const cooldownDuration = 30000; // 30 second cooldown
      setCooldownEnd(now + cooldownDuration);
      setIsBlocked(true);

      // Auto-unblock after cooldown
      setTimeout(() => {
        setIsBlocked(false);
        setCooldownEnd(null);
      }, cooldownDuration);

      return false;
    }

    // Record this attempt
    attemptsRef.current.push(now);
    return true;
  }, [maxAttempts, windowMs, cooldownEnd]);

  const getRemainingCooldown = useCallback(() => {
    if (!cooldownEnd) return 0;
    return Math.max(0, cooldownEnd - Date.now());
  }, [cooldownEnd]);

  const getAttemptsRemaining = useCallback(() => {
    return Math.max(0, maxAttempts - attemptsRef.current.length);
  }, [maxAttempts]);

  return {
    canProceed: checkRateLimit,
    isBlocked,
    remainingCooldown: getRemainingCooldown(),
    attemptsRemaining: getAttemptsRemaining(),
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
  const remainingCooldown = rateLimit.remainingCooldown;
  const attemptsRemaining = rateLimit.attemptsRemaining;

  const secureSubmit = useCallback(async (data: T) => {
    // Check rate limiting
    if (!canProceed()) {
      throw new Error(`Too many attempts. Please wait ${Math.ceil(remainingCooldown / 1000)} seconds.`);
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
  }, [onSubmit, canProceed, remainingCooldown]);

  return {
    secureSubmit,
    isSubmitting,
    isBlocked: rateLimit.isBlocked,
    attemptsRemaining,
    remainingCooldown,
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

  const validateFile = useCallback((file: File): string | null => {
    // File size check
    if (file.size > maxSize) {
      return `File too large: ${Math.round(file.size / 1024 / 1024)}MB (max ${Math.round(maxSize / 1024 / 1024)}MB)`;
    }

    // File type check
    if (!allowedTypes.includes(file.type)) {
      return `Invalid file type: ${file.type}. Allowed: ${allowedTypes.join(', ')}`;
    }

    // File name security check
    const dangerousChars = /[<>:"|?*\x00-\x1f]/;
    if (dangerousChars.test(file.name)) {
      return 'File name contains invalid characters';
    }

    // Extension vs MIME type check (basic)
    const extension = file.name.split('.').pop()?.toLowerCase();
    const mimeToExt: Record<string, string[]> = {
      'image/jpeg': ['jpg', 'jpeg'],
      'image/png': ['png'],
      'image/gif': ['gif'],
      'application/pdf': ['pdf'],
    };

    const expectedExts = mimeToExt[file.type];
    if (expectedExts && extension && !expectedExts.includes(extension)) {
      return 'File extension does not match file type';
    }

    return null;
  }, [maxSize, allowedTypes]);

  const addFiles = useCallback(async (newFiles: FileList | File[]) => {
    setIsValidating(true);
    const fileArray = Array.from(newFiles);

    // Check total file limit
    if (files.length + fileArray.length > maxFiles) {
      setErrors(prev => [...prev, `Too many files. Maximum ${maxFiles} allowed.`]);
      setIsValidating(false);
      return;
    }

    const validFiles: File[] = [];
    const newErrors: string[] = [];

    for (const file of fileArray) {
      const error = validateFile(file);
      if (error) {
        newErrors.push(`${file.name}: ${error}`);
      } else {
        validFiles.push(file);
      }
    }

    setFiles(prev => [...prev, ...validFiles]);
    setErrors(prev => [...prev, ...newErrors]);
    setIsValidating(false);
  }, [files.length, maxFiles, validateFile]);

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