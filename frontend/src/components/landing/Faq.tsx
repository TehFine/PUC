"use client";

import { useState } from "react";
import { FAQ } from "./data";

export default function Faq() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const toggle = (idx: number) => {
    setOpenIndex((prev) => (prev === idx ? null : idx));
  };

  return (
    <div className="sw-faq-list" role="region" aria-label="Những câu hỏi thường gặp">
      {FAQ.map((item, index) => {
        const isOpen = openIndex === index;
        return (
          <div key={item.q} className={`sw-grid sw-faq-row ${isOpen ? "is-open" : ""}`}>
            <div className="sw-cell sw-col-1 sw-faq-idxcell">
              <span className="sw-micro">Câu hỏi {String(index + 1).padStart(2, "0")}</span>
            </div>

            <div className="sw-cell sw-col-2-4 sw-faq-content">
              <button
                type="button"
                id={`faq-btn-${index}`}
                aria-expanded={isOpen}
                aria-controls={`faq-panel-${index}`}
                className="sw-faq-btn"
                onClick={() => toggle(index)}
              >
                <span className="sw-faq-qwrap">
                  <span>{item.q}</span>
                </span>
                <span className="sw-faq-sign" aria-hidden="true">
                  {isOpen ? "−" : "+"}
                </span>
              </button>

              {isOpen && (
                <div
                  id={`faq-panel-${index}`}
                  role="region"
                  aria-labelledby={`faq-btn-${index}`}
                  className="sw-faq-ans eh-fade-block"
                >
                  <span className="sw-faq-ans-label">Trả lời</span>
                  <p>
                    <span className="sw-hide-mobile">{item.a}</span>
                    <span className="sw-only-mobile">{item.shortA}</span>
                  </p>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
