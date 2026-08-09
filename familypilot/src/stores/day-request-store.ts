import { create } from 'zustand';

import { DayRequest } from '@/src/types/day-request';

interface DayRequestState {
  rawText: string;
  parsedRequest: DayRequest | null;
  setRawText: (text: string) => void;
  setParsedRequest: (request: DayRequest | null) => void;
  reset: () => void;
}

export const useDayRequestStore = create<DayRequestState>((set) => ({
  rawText: '',
  parsedRequest: null,
  setRawText: (text) => set({ rawText: text }),
  setParsedRequest: (request) => set({ parsedRequest: request }),
  reset: () => set({ rawText: '', parsedRequest: null }),
}));
