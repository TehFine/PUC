"use client";

import { useState } from "react";
import { STAGES } from "./data";

/** Quy trình chăm sóc theo từng giai đoạn: chọn giai đoạn ở bên trái, xem việc cần làm bên phải. */
export default function Stages() {
  const [activeId, setActiveId] = useState(STAGES[0].id);
  const index = Math.max(0, STAGES.findIndex((stage) => stage.id === activeId));
  const stage = STAGES[index];

  return (
    <div className="lp-stages">
      <div className="lp-stage-list" role="tablist" aria-label="Các giai đoạn chăm sóc" aria-orientation="vertical">
        {STAGES.map((item, position) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`stage-tab-${item.id}`}
            aria-selected={item.id === activeId}
            aria-controls="stage-panel"
            className={item.id === activeId ? "on" : ""}
            onClick={() => setActiveId(item.id)}
          >
            <b>{String(position + 1).padStart(2, "0")}</b>
            <span>{item.label}</span>
          </button>
        ))}
      </div>

      <article className="lp-stage-panel lp-glass" id="stage-panel" role="tabpanel" aria-labelledby={`stage-tab-${stage.id}`} key={stage.id}>
        <p className="lp-label">
          {stage.tag.toUpperCase()}
        </p>
        <h3>{stage.title}</h3>
        <ul className="lp-checks">
          {stage.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <div className="lp-stage-log">
          <span className="lp-label">
            GHI VÀO NHẬT KÝ
          </span>
          <p>{stage.log}</p>
        </div>
        <div className="lp-stage-nav">
          <button type="button" disabled={index === 0} onClick={() => setActiveId(STAGES[index - 1].id)}>
            ← Giai đoạn trước
          </button>
          <button type="button" disabled={index === STAGES.length - 1} onClick={() => setActiveId(STAGES[index + 1].id)}>
            Giai đoạn sau →
          </button>
        </div>
      </article>
    </div>
  );
}
