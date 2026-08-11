import { useRouter } from 'expo-router';
import { ReactNode } from 'react';

import { EmptyState } from '@/src/components/ui';
import { ScreenContainer } from '@/src/components/shared/ScreenContainer';
import { isPilotFeatureVisible, PilotFeature } from '@/src/config/pilot-features';

interface DeferredPilotGateProps {
  feature: PilotFeature;
  title?: string;
  children: ReactNode;
}

export function DeferredPilotGate({ feature, title, children }: DeferredPilotGateProps) {
  const router = useRouter();

  if (isPilotFeatureVisible(feature)) {
    return <>{children}</>;
  }

  return (
    <ScreenContainer>
      <EmptyState
        icon="construct-outline"
        title={title ?? 'Not in this pilot'}
        message="This feature is planned for a later release. For now, try Today's Pick on Home or Explore nearby venues."
        actionLabel="Back to Home"
        onAction={() => router.replace('/(tabs)' as never)}
      />
    </ScreenContainer>
  );
}
