"use client";

import { useEffect, useRef, useState } from "react";
import { STAGES } from "./data";

/** Quy trình chăm sóc theo từng giai đoạn: chọn giai đoạn ở bên trái, xem việc cần làm bên phải. */
export default function Stages() {
  const [activeId, setActiveId] = useState(STAGES[0].id);
  const index = Math.max(0, STAGES.findIndex((stage) => stage.id === activeId));
  const stage = STAGES[index];

  const listRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const animRef = useRef<number | null>(null);

  // Cuộn mượt đưa nút chỉ định vào chính giữa màn hình (nhanh lúc đầu, chậm dần khi về vị trí giữa)
  const scrollToButton = (targetIndex: number) => {
    const container = listRef.current;
    const btn = buttonRefs.current[targetIndex];
    if (!container || !btn) return;

    // Chỉ thực hiện khi danh sách ở dạng thanh cuộn ngang (mobile/tablet)
    const isHorizontal = container.scrollWidth > container.clientWidth;
    if (!isHorizontal) return;

    if (animRef.current !== null) {
      cancelAnimationFrame(animRef.current);
      animRef.current = null;
    }

    // Tính toán độ lệch chính xác theo bounding client rect để tâm nút nằm chính giữa container
    const containerRect = container.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    const currentBtnCenter = btnRect.left + btnRect.width / 2;
    const currentContainerCenter = containerRect.left + containerRect.width / 2;
    const delta = currentBtnCenter - currentContainerCenter;

    const maxScroll = container.scrollWidth - container.clientWidth;
    const targetScrollLeft = Math.max(0, Math.min(container.scrollLeft + delta, maxScroll));

    const startScrollLeft = container.scrollLeft;
    const distance = targetScrollLeft - startScrollLeft;
    if (Math.abs(distance) < 1) return;

    const duration = 540; // 540ms: nhịp nhàng, thanh thoát
    const startTime = performance.now();

    // Easing nhanh lúc đầu và hãm dần đều khi gần về vị trí chính giữa màn hình (Quartic Ease-Out)
    const easeOutQuart = (t: number) => 1 - Math.pow(1 - t, 4);

    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      const eased = easeOutQuart(progress);

      container.scrollLeft = startScrollLeft + distance * eased;

      if (progress < 1) {
        animRef.current = requestAnimationFrame(step);
      } else {
        animRef.current = null;
      }
    };

    animRef.current = requestAnimationFrame(step);
  };

  useEffect(() => {
    return () => {
      if (animRef.current !== null) {
        cancelAnimationFrame(animRef.current);
      }
    };
  }, []);

  const handleTabClick = (position: number) => {
    setActiveId(STAGES[position].id);
    // Khi bấm vào nút bất kỳ, nút tiếp theo tự động nhảy đến giữa màn hình để người dùng bấm tiếp
    const nextPosition = position < STAGES.length - 1 ? position + 1 : position;
    scrollToButton(nextPosition);
  };

  const handleNavClick = (newIndex: number) => {
    setActiveId(STAGES[newIndex].id);
    scrollToButton(newIndex);
  };

  return (
    <div className="lp-stages">
      <div
        ref={listRef}
        className="lp-stage-list"
        role="tablist"
        aria-label="Các giai đoạn chăm sóc"
        aria-orientation="vertical"
      >
        {STAGES.map((item, position) => (
          <button
            key={item.id}
            ref={(el) => {
              buttonRefs.current[position] = el;
            }}
            type="button"
            role="tab"
            id={`stage-tab-${item.id}`}
            aria-selected={item.id === activeId}
            aria-controls="stage-panel"
            className={item.id === activeId ? "on" : ""}
            onClick={() => handleTabClick(position)}
          >
            <b>{String(position + 1).padStart(2, "0")}</b>
            <span>{item.label}</span>
          </button>
        ))}
      </div>

      <article
        className="lp-stage-panel lp-glass"
        id="stage-panel"
        role="tabpanel"
        aria-labelledby={`stage-tab-${stage.id}`}
        key={stage.id}
      >
        <p className="lp-label">{stage.tag.toUpperCase()}</p>
        <h3>{stage.title}</h3>
        <ul className="lp-checks">
          {stage.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <div className="lp-stage-log">
          <span className="lp-label">GHI VÀO NHẬT KÝ</span>
          <p>{stage.log}</p>
        </div>
        <div className="lp-stage-nav">
          <button
            type="button"
            disabled={index === 0}
            onClick={() => handleNavClick(index - 1)}
          >
            ← Giai đoạn trước
          </button>
          <button
            type="button"
            disabled={index === STAGES.length - 1}
            onClick={() => handleNavClick(index + 1)}
          >
            Giai đoạn sau →
          </button>
        </div>
      </article>
    </div>
  );
}
