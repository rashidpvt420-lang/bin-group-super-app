export type TrackingPhase =
  | 'open'
  | 'scheduled'
  | 'accepted'
  | 'on_the_way'
  | 'arrived'
  | 'in_progress'
  | 'waiting_parts'
  | 'on_hold'
  | 'escalated'
  | 'disputed'
  | 'reopened'
  | 'completed'
  | 'cancelled';
export type TrackingTimelineStep = 'open' | 'accepted' | 'on_the_way' | 'arrived' | 'in_progress' | 'completed';
export type TrackingPanelState = {
  phase: TrackingPhase;
  statusKey: string;
  isTerminal: boolean;
  allowLiveTracking: boolean;
  technicianAssigned: boolean;
  technicianName: string;
  timelineStep: TrackingTimelineStep;
};
export const COMPLETED_TRACKING_STATUSES: readonly string[];
export const CANCELLED_TRACKING_STATUSES: readonly string[];
export function normalizeTrackingStatusKey(value: unknown): string;
export function hasAssignedTechnician(ticket: unknown): boolean;
export function assignedTechnicianDisplayName(ticket: unknown): string;
export function resolveTrackingPhase(ticket: unknown): TrackingPhase;
export function resolveTrackingPanelState(ticket: unknown): TrackingPanelState;
