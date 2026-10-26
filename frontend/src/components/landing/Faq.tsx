"use client";

import { useState } from "react";
import { FAQ } from "./data";
import { display } from "./fonts";

export default function Faq() {
  const [openMap, setOpenMap] = useState<Record<number, boolean>>({});

  const toggle = (index: number) => {
    setOpenMap((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

  return (
    <div className="lp-faq" role="region" aria-label="Những câu hỏi thường gặp">
      {FAQ.map((item, index) => {
        const isOpen = Boolean(openMap[index]);
        return (
          <div
            key={item.q}
            className={`lp-faq-item lp-glass ${isOpen ? "is-open" : ""}`}
          >
            <button
              type="button"
              className="lp-faq-summary"
              id={`faq-btn-${index}`}
              aria-expanded={isOpen}
              aria-controls={`faq-panel-${index}`}
              onClick={() => toggle(index)}
            >
              <span className={`lp-faq-question ${display.className}`}>{item.q}</span>
              <span className="lp-faq-icon" aria-hidden="true">+</span>
            </button>
            <div
              id={`faq-panel-${index}`}
              role="region"
              aria-labelledby={`faq-btn-${index}`}
              className="lp-faq-body"
            >
              <div className="lp-faq-inner">
                <div className="lp-faq-divider" />
                <p className="lp-faq-answer">{item.a}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
