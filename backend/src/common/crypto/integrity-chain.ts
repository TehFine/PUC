import { createHash } from "node:crypto";

export type LedgerRecordKind = "journal" | "spray" | "minute";

export interface JournalHashInput {
  kind: "journal";
  prevHash: string | null;
  householdId: number | null;
  entryOn: string;
  plotCode: string | null;
  activity: string;
  recorder: string;
  isLateEntry: boolean;
  serverRecordedAt: Date | string;
}

export interface SprayHashInput {
  kind: "spray";
  prevHash: string | null;
  householdId: number | null;
  sprayedOn: string;
  plotCode: string | null;
  pesticideId: number | null;
  dose: string;
  isolationDays: number | null;
  mrlStatus: string;
  isLateEntry: boolean;
  serverRecordedAt: Date | string;
}

export interface MinuteHashInput {
  kind: "minute";
  prevHash: string | null;
  code: string;
  heldOn: string;
  officer: string;
  result: string;
  isLateEntry: boolean;
  serverRecordedAt: Date | string;
}

export type LedgerHashInput = JournalHashInput | SprayHashInput | MinuteHashInput;

function toEpochSecondsText(val: Date | string): string {
  const dt = val instanceof Date ? val : new Date(val);
  if (Number.isNaN(dt.getTime())) return "0";
  return String(Math.floor(dt.getTime() / 1000));
}

function toIsoDateText(val: unknown): string {
  if (!val) return "";
  if (val instanceof Date) {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(val);
  }
  const s = String(val).trim();
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  return m ? m[1] : s;
}

/**
 * Chuỗi chuẩn hóa khớp tuyệt đối 100% với hàm trigger PL/pgSQL `puc_compute_ledger_hash`
 * trong PostgreSQL (`017_transparency_field_audit_and_mass_balance.sql`).
 */
export function buildCanonicalLedgerPayload(input: LedgerHashInput): string {
  const prev = input.prevHash && input.prevHash.trim() ? input.prevHash.trim() : "GENESIS";
  const timeliness = input.isLateEntry ? "LATE" : "ONTIME";
  const epochSec = toEpochSecondsText(input.serverRecordedAt);

  if (input.kind === "journal") {
    return [
      "JOURNAL-V1",
      prev,
      String(input.householdId ?? 0),
      toIsoDateText(input.entryOn),
      String(input.plotCode ?? "").trim().toUpperCase(),
      String(input.activity ?? "").trim(),
      String(input.recorder ?? "").trim(),
      timeliness,
      epochSec,
    ].join("|");
  }

  if (input.kind === "spray") {
    return [
      "SPRAY-V1",
      prev,
      String(input.householdId ?? 0),
      toIsoDateText(input.sprayedOn),
      String(input.plotCode ?? "").trim().toUpperCase(),
      String(input.pesticideId ?? 0),
      String(input.dose ?? "").trim(),
      String(input.isolationDays ?? 0),
      String(input.mrlStatus ?? "").trim(),
      timeliness,
      epochSec,
    ].join("|");
  }

  return [
    "MINUTE-V1",
    prev,
    String(input.code ?? "").trim().toUpperCase(),
    toIsoDateText(input.heldOn),
    String(input.officer ?? "").trim(),
    String(input.result ?? "").trim(),
    timeliness,
    epochSec,
  ].join("|");
}

export function computeLedgerRecordHash(input: LedgerHashInput): string {
  const payload = buildCanonicalLedgerPayload(input);
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

export interface VerifiableChainEntry {
  input: LedgerHashInput;
  storedPrevHash: string | null;
  storedRecordHash: string | null;
}

export interface ChainVerificationSummary {
  chainVerified: boolean;
  totalSealedRecords: number;
  verifiedCount: number;
  tamperedCount: number;
  onTimeCount: number;
  lateRecordCount: number;
  onTimePct: number;
  avgDelayHours: number;
  latestLedgerHash: string | null;
}

/**
 * Kiểm chứng độc lập chuỗi băm SHA-256 của một danh sách bản ghi (đã sắp xếp tăng dần theo thứ tự chuỗi).
 */
export function verifyOrderedChain(
  entries: Array<VerifiableChainEntry & { entryDelayHours?: number }>,
): ChainVerificationSummary {
  if (entries.length === 0) {
    return {
      chainVerified: true,
      totalSealedRecords: 0,
      verifiedCount: 0,
      tamperedCount: 0,
      onTimeCount: 0,
      lateRecordCount: 0,
      onTimePct: 100,
      avgDelayHours: 0,
      latestLedgerHash: null,
    };
  }

  let verifiedCount = 0;
  let tamperedCount = 0;
  let onTimeCount = 0;
  let lateRecordCount = 0;
  let totalDelay = 0;
  let expectedPrev: string | null = null;

  for (let i = 0; i < entries.length; i++) {
    const item = entries[i];
    const delay = Number(item.entryDelayHours ?? 0);
    if (Number.isFinite(delay) && delay >= 0) totalDelay += delay;
    if (item.input.isLateEntry) {
      lateRecordCount += 1;
    } else {
      onTimeCount += 1;
    }

    const storedPrev = item.storedPrevHash && item.storedPrevHash.trim() ? item.storedPrevHash.trim() : null;
    const prevMatches = i === 0 ? storedPrev === null : storedPrev === expectedPrev;
    const recomputed = computeLedgerRecordHash({
      ...item.input,
      prevHash: storedPrev,
    });
    const hashMatches = Boolean(item.storedRecordHash) && recomputed === item.storedRecordHash;

    if (prevMatches && hashMatches) {
      verifiedCount += 1;
    } else {
      tamperedCount += 1;
    }
    expectedPrev = item.storedRecordHash ?? recomputed;
  }

  const total = entries.length;
  const onTimePct = Number(((onTimeCount / total) * 100).toFixed(1));
  const avgDelayHours = Number((totalDelay / total).toFixed(1));
  const latestLedgerHash = entries[entries.length - 1]?.storedRecordHash ?? null;

  return {
    chainVerified: tamperedCount === 0,
    totalSealedRecords: total,
    verifiedCount,
    tamperedCount,
    onTimeCount,
    lateRecordCount,
    onTimePct,
    avgDelayHours,
    latestLedgerHash,
  };
}

