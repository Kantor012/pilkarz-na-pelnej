export interface OffseasonState {
  week: number;
  totalWeeks: number;
}

export const DEFAULT_OFFSEASON_WEEKS = 6;
export const DEVELOPMENT_GAIN_SCALE = .96;

export function beginOffseason(totalWeeks = DEFAULT_OFFSEASON_WEEKS): OffseasonState {
  return { week: 1, totalWeeks: Math.max(1, Math.round(totalWeeks)) };
}

export function advanceOffseasonWeek(state: OffseasonState): OffseasonState | undefined {
  return state.week >= state.totalWeeks ? undefined : { ...state, week: state.week + 1 };
}
