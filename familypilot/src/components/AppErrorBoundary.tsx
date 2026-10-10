import { ErrorBoundary as RouterErrorBoundary, type ErrorBoundaryProps } from 'expo-router';
import { useEffect } from 'react';

import { reportClientError } from '@/src/services/monitoring/client-errors';

/** expo-router's own error screen, with the crash reported first (when the build turns reporting on). */
export function AppErrorBoundary(props: ErrorBoundaryProps) {
  useEffect(() => {
    void reportClientError('render', props.error, typeof window !== 'undefined' ? window.location.pathname : '');
  }, [props.error]);
  return <RouterErrorBoundary {...props} />;
}
