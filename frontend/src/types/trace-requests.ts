export type TraceAccessTier = "enterprise" | "authority";
export type TraceAccessScopeMode = "record" | "zone" | "coop";
export type TraceAccessRequestStatus = "pending" | "approved" | "rejected" | "revoked";

export interface TraceAccessRequestRecord {
  id: number;
  requestCode: string;
  requesterUserId: number | null;
  requesterUsername: string | null;
  requesterRole: string | null;
  requesterRoleLabel: string | null;
  requesterName: string;
  organization: string;
  contactPhone: string;
  purpose: string;
  scannedCode: string;
  targetKind: "lot" | "box" | "fruit" | "plot";
  resolvedLotCode: string | null;
  pucCode: string | null;
  requestedTier: TraceAccessTier;
  grantedTier: TraceAccessTier | null;
  scopeMode: TraceAccessScopeMode;
  durationHours: number;
  status: TraceAccessRequestStatus;
  passTokenMasked: string | null;
  expiresAt: string | null;
  reviewedBy: number | null;
  reviewedByName: string | null;
  reviewedByRole: string | null;
  reviewedByRoleLabel: string | null;
  reviewNote: string | null;
  reviewedAt: string | null;
  ip: string | null;
  accessCount: number;
  lastAccessedAt: string | null;
  createdAt: string;
  isExpired: boolean;
  isActiveNow: boolean;
}
