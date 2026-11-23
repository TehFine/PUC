import type { NextFunction, Request, Response } from "express";
import type { SecurityDefenseService } from "../../auth/security-defense.service";

/**
 * Chặn sớm các thiết bị đang trong thời gian cách ly do can thiệp gói tin (`SECURITY_QUARANTINED`),
 * các công cụ dò quét lỗ hổng / quét đường dẫn tự động (sqlmap, nuclei, ffuf, nikto, gobuster...),
 * các đường dẫn dò cấu hình nhạy cảm (.env, swagger, openapi, graphql, .git, actuator...)
 * và các yêu cầu chéo trang `Sec-Fetch-Site: cross-site` nhắm vào API nội bộ.
 */
const OFFENSIVE_SCANNER_UA_RE =
  /\b(?:sqlmap|nuclei|ffuf|nikto|gobuster|feroxbuster|dirbuster|wfuzz|dalfox|commix|acunetix|netsparker|invicti|nessus|openvas|arachni|w3af|havij|zmeu|masscan|zgrab|httpx-toolkit|dirsearch|wpscan|jaeles|katana|burpcollaborator)\b/i;

const RECON_PROBE_PATH_RE =
  /^\/(?:api\/)?(?:\.env(?:\..+)?|\.git(?:\/|$)|swagger(?:-ui)?(?:\/|$|\.)|api-docs(?:\/|$)|api-json(?:\/|$)|openapi\.(?:json|yaml|yml)$|graphql(?:\/|$)|graphiql(?:\/|$)|actuator(?:\/|$)|phpinfo(?:\.php)?$|wp-admin(?:\/|$)|wp-login\.php$|_ignition(?:\/|$)|server-status$|debug(?:\/|$)|trace\.axd$)/i;

export function createSecurityShieldMiddleware(defense?: SecurityDefenseService | null) {
  return function securityShield(req: Request, res: Response, next: NextFunction): void {
    const rawUa = req.headers["user-agent"];
    const ua = Array.isArray(rawUa) ? rawUa.join(" ") : rawUa || "";

    if (defense) {
      const retrySec = defense.getQuarantineRemainingSec(req.ip, ua);
      if (retrySec > 0) {
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("Retry-After", String(retrySec));
        res.status(429).json({
          error: "Thiết bị tạm thời bị khóa truy cập 15 phút do phát hiện hành vi can thiệp gói tin API bất thường.",
          code: "SECURITY_QUARANTINED",
        });
        return;
      }
    }

    if (ua && OFFENSIVE_SCANNER_UA_RE.test(ua)) {
      res.setHeader("Cache-Control", "no-store");
      res.status(403).json({
        error: "Yêu cầu bị từ chối bởi chính sách bảo mật hệ thống.",
        code: "FORBIDDEN",
      });
      return;
    }

    const rawPath = (req.originalUrl || req.url || "").split("?")[0] || "/";
    let decodedPath = rawPath;
    try {
      decodedPath = decodeURIComponent(rawPath);
    } catch {
      res.setHeader("Cache-Control", "no-store");
      res.status(400).json({
        error: "Đường dẫn yêu cầu chứa chuỗi mã hóa không hợp lệ.",
        code: "BAD_REQUEST",
      });
      return;
    }

    if (RECON_PROBE_PATH_RE.test(decodedPath) || decodedPath.includes("\0") || decodedPath.includes("..")) {
      res.setHeader("Cache-Control", "no-store");
      res.status(404).json({
        error: "Không tìm thấy đường dẫn.",
        code: "NOT_FOUND",
      });
      return;
    }

    const rawSecFetchSite = req.headers["sec-fetch-site"];
    const secFetchSites = Array.isArray(rawSecFetchSite)
      ? rawSecFetchSite
      : rawSecFetchSite
        ? [rawSecFetchSite]
        : [];
    if (
      secFetchSites.some((v) => v.trim().toLowerCase() === "cross-site") &&
      decodedPath.startsWith("/api") &&
      !decodedPath.startsWith("/api/public/") &&
      decodedPath !== "/api/health"
    ) {
      res.setHeader("Cache-Control", "no-store");
      res.status(403).json({
        error: "Nguồn gửi yêu cầu chéo trang (cross-site) không được phép.",
        code: "FORBIDDEN",
      });
      return;
    }

    next();
  };
}
