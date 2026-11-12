"use client";

import { Skeleton, SkeletonGroup } from "@/components/ui/Skeleton";
import { usePublic, type PublicCatalog } from "./use-public";

export default function BannedList() {
  const { data, loading, error } = usePublic<PublicCatalog>("catalog");
  const banned = (data?.pesticides ?? []).filter((item) => item.status === "banned");

  return (
    <div className="sw-between" style={{ height: "100%" }}>
      <div>
        <span className="sw-micro">Danh mục kiểm soát nghiêm ngặt</span>
        <h3 className="sw-cell-title sw-mt-8">Hoạt chất cấm sử dụng</h3>

        {loading && (
          <div className="sw-mt-16">
            <SkeletonGroup label="Đang tải danh mục thuốc bị cấm…">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }} aria-hidden="true">
                {[104, 128, 92, 116].map((width) => (
                  <Skeleton key={width} w={width} h={32} r={4} />
                ))}
              </div>
            </SkeletonGroup>
          </div>
        )}

        {error && <p className="sw-muted-sm sw-mt-12">Chưa tải được danh mục hoạt chất.</p>}

        {data && banned.length === 0 && (
          <p className="sw-muted-sm sw-mt-12">
            Hiện chưa ghi nhận hoạt chất cấm trong danh mục tra cứu.
          </p>
        )}

        {banned.length > 0 && (
          <ul className="sw-banned-grid sw-mt-16">
            {banned.map((item) => (
              <li key={`${item.name}-${item.activeIngredient}`}>
                <strong>{item.activeIngredient}</strong>
                <span>{item.name}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="sw-muted-sm sw-mt-20">
        Tuyệt đối không mua, không tồn trữ tại vườn. Khi chưa rõ thành phần một loại thuốc, hãy hỏi cán bộ kỹ thuật HTX trước khi sử dụng.
      </p>
    </div>
  );
}
