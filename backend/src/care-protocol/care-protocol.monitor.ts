import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from "@nestjs/common";
import { CareProtocolService } from "./care-protocol.service";

const SCAN_INTERVAL_MS = 15 * 60 * 1000;
const INITIAL_DELAY_MS = 6_000;

/**
 * Bộ quét tự động định kỳ toàn bộ lộ trình chăm sóc sầu riêng 2026-2027:
 * - Gửi nhắc lịch khi đến ngày dự kiến thực hiện mốc.
 * - Gửi cảnh báo khi trễ hạn / quá hạn kéo dài cho cả Hộ dân & Quản trị viên HTX.
 */
@Injectable()
export class CareProtocolMonitorService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(CareProtocolMonitorService.name);
  private initialTimer: ReturnType<typeof setTimeout> | null = null;
  private intervalTimer: ReturnType<typeof setInterval> | null = null;
  private scanning = false;

  constructor(private readonly service: CareProtocolService) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === "test") return;

    this.initialTimer = setTimeout(() => {
      void this.runSafeScan();
    }, INITIAL_DELAY_MS);
    this.initialTimer.unref?.();

    this.intervalTimer = setInterval(() => {
      void this.runSafeScan();
    }, SCAN_INTERVAL_MS);
    this.intervalTimer.unref?.();
  }

  onApplicationShutdown(): void {
    if (this.initialTimer) {
      clearTimeout(this.initialTimer);
      this.initialTimer = null;
    }
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
  }

  private async runSafeScan(): Promise<void> {
    if (this.scanning) return;
    this.scanning = true;
    try {
      const result = await this.service.scanAndNotifyAllPlans();
      if (result.dueNotifications > 0 || result.overdueWarnings > 0 || result.criticalViolations > 0) {
        this.logger.log(
          `Đã quét ${result.scanned} lộ trình 2026-2027: ${result.dueNotifications} nhắc lịch, ${result.overdueWarnings} cảnh báo trễ, ${result.criticalViolations} vi phạm quá hạn.`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `Quét tiến độ quy trình 2026-2027 tạm bỏ qua: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      this.scanning = false;
    }
  }
}

