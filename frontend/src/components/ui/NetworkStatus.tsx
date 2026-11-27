"use client";

import { useEffect, useRef } from "react";
import { setNetworkStatusToast } from "@/components/ui/Toast";
import { useNetworkQuality, usePerformanceTier, type NetQuality } from "@/lib/network";
import "./skeleton.css";

const MESSAGES = {
  slow: "Mạng yếu, đang tải chậm",
  offline: "Mất kết nối, đang chờ mạng",
  ok: "Đã kết nối lại mạng",
} as const;

/**
 * Ghi trạng thái mạng và chế độ hiệu năng vào <html data-net="…" data-perf="…">
 * và đồng bộ thông báo trạng thái mạng vào chung hệ thống Toast (góc dưới phải trên Laptop, cạnh trên trên Mobile).
 */
export default function NetworkStatus() {
  const quality = useNetworkQuality();
  const tier = usePerformanceTier();
  const previous = useRef<NetQuality>("good");

  useEffect(() => {
    document.documentElement.dataset.net = quality;
    document.documentElement.dataset.perf = tier;
    return () => {
      delete document.documentElement.dataset.net;
      delete document.documentElement.dataset.perf;
    };
  }, [quality, tier]);

  useEffect(() => {
    const before = previous.current;
    previous.current = quality;

    if (quality === "slow") {
      setNetworkStatusToast({ kind: "slow", text: MESSAGES.slow });
    } else if (quality === "offline") {
      setNetworkStatusToast({ kind: "offline", text: MESSAGES.offline });
    } else if (before === "offline") {
      setNetworkStatusToast({ kind: "ok", text: MESSAGES.ok });
    } else {
      setNetworkStatusToast(null);
    }
  }, [quality]);

  return null;
}
