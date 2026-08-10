import { create } from 'zustand';

import { DayRequest } from '@/src/types/day-request';

export type DayRequestSource = 'none' | 'proactive' | 'user';

interface DayRequestState {
  rawText: string;
  parsedRequest: DayRequest | null;
  requestSource: DayRequestSource;
  setRawText: (text: string) => void;
  setParsedRequest: (request: DayRequest | null, source?: DayRequestSource) => void;
  reset: () => void;
}

export const useDayRequestStore = create<DayRequestState>((set) => ({
  rawText: '',
  parsedRequest: null,
  requestSource: 'none',
  setRawText: (text) => set({ rawText: text }),
  setParsedRequest: (request, source = 'user') =>
    set({ parsedRequest: request, requestSource: request ? source : 'none' }),
  reset: () => set({ rawText: '', parsedRequest: null, requestSource: 'none' }),
}));
