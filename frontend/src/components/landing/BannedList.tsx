"use client";

import { Skeleton, SkeletonGroup } from "@/components/ui/Skeleton";
import { usePublic, type PublicCatalog } from "./use-public";

/** Danh sách hoạt chất bị cấm lấy từ danh mục của hệ thống, hiển thị trong mục tiêu chuẩn xuất khẩu. */
export default function BannedList() {
  const { data, loading, error } = usePublic<PublicCatalog>("catalog");
  const banned = (data?.pesticides ?? []).filter((item) => item.status === "banned");

  return (
    <div className="lp-banned lp-glass">
      <p className="lp-label">
        THÀNH PHẦN THUỐC BỊ CẤM (THEO DANH MỤC HTX)
      </p>
      {loading && (
        <SkeletonGroup label="Đang tải danh mục thuốc bị cấm…">
          <div className="lp-sk-chips" aria-hidden="true">
            {[104, 128, 92, 116, 98].map((width) => (
              <Skeleton key={width} w={width} h={44} r={12} />
            ))}
          </div>
        </SkeletonGroup>
      )}
      {error && <p className="lp-catalog-state">Chưa tải được danh mục.</p>}
      {data && banned.length === 0 && <p className="lp-catalog-state">Danh mục hiện chưa ghi nhận thành phần thuốc bị cấm.</p>}
      {banned.length > 0 && (
        <ul>
          {banned.map((item) => (
            <li key={`${item.name}-${item.activeIngredient}`}>
              <strong>{item.activeIngredient}</strong>
              <small>{item.name}</small>
            </li>
          ))}
        </ul>
      )}
      <p className="lp-banned-note">Không dùng, không tồn trữ. Hãy hỏi cán bộ HTX nếu chưa chắc chắn về một loại thuốc.</p>
    </div>
  );
}
