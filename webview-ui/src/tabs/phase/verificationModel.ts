import type { AssignedProfile, VerificationProfile } from '../../api/verification';

export function availableProfiles(all: readonly VerificationProfile[], assigned: readonly AssignedProfile[]): VerificationProfile[] {
  const assignedIds = new Set(assigned.map((profile) => profile.id));
  return all.filter((profile) => !assignedIds.has(profile.id));
}
