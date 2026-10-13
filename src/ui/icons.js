// Original inline SVG glyphs for abilities and items (stroke-based, inherit currentColor).
const S = (d, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;

export const ICONS = {
  sword: S('<path d="M14 3h7v7L10 21l-3-3L18 7"/><path d="M5 14l5 5"/><path d="M3 21l3-3"/>'),
  blades: S('<path d="M4 20C8 12 12 7 20 4c-2 7-7 11-16 16z"/><path d="M8 16l-3 3"/>'),
  dual: S('<path d="M3 21L14 6l4-2-2 4L5 19"/><path d="M21 21L10 6 6 4l2 4 11 11"/>'),
  heavy: S('<path d="M12 2v14"/><path d="M8 6l4-4 4 4"/><path d="M6 16h12"/><path d="M12 16v6"/><circle cx="12" cy="22" r="0.5"/>'),
  lance: S('<path d="M3 21L19 5"/><path d="M15 3l6 0 0 6-3-3z"/><path d="M6 15l3 3"/>'),
  block: S('<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>'),
  shadow_blink: S('<path d="M15 3a8 8 0 1 0 6 13A7 7 0 0 1 15 3z"/><path d="M4 4l2 2M3 9h2M7 2v2"/>'),
  soul_drain: S('<path d="M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.5-7 10-7 10z"/><path d="M12 9v6M9.5 12.5L12 15l2.5-2.5"/>'),
  crimson_eclipse: S('<circle cx="12" cy="12" r="5" fill="currentColor" fill-opacity="0.25"/><circle cx="12" cy="12" r="9"/><path d="M12 1v2M12 21v2M1 12h2M21 12h2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/>'),
  blood_roses: S('<path d="M12 13c-3 0-5-2-5-5 2 0 3 1 3 1s0-3 2-5c2 2 2 5 2 5s1-1 3-1c0 3-2 5-5 5z"/><path d="M12 13v8M12 17c-2 0-3-1-4-2M12 18c2 0 3-1 4-2"/>'),
  crimson_chains: S('<rect x="3" y="9" width="8" height="6" rx="3"/><rect x="13" y="9" width="8" height="6" rx="3"/><path d="M9 12h6"/>'),
  queen_crimson_moon: S('<path d="M3 18l2-10 4 5 3-7 3 7 4-5 2 10z"/><path d="M3 21h18"/>'),
  spectral_dash: S('<path d="M3 8h8M2 12h10M3 16h8"/><path d="M14 6l7 6-7 6"/>'),
  moonlight_guard: S('<circle cx="12" cy="12" r="9"/><path d="M12 6a6 6 0 1 0 4 10.5A5 5 0 0 1 12 6z"/>'),
  celestial_execution: S('<path d="M12 2l2.5 7.5H22l-6 4.5 2.3 7.5L12 17l-6.3 4.5L8 14 2 9.5h7.5z"/>'),
  vial: S('<path d="M9 3h6M10 3v5l-4 7a4 4 0 0 0 3.5 6h5a4 4 0 0 0 3.5-6l-4-7V3"/><path d="M7.5 14h9"/>'),
  key: S('<circle cx="7" cy="12" r="4"/><path d="M11 12h10M17 12v3M20 12v2"/>'),
  power: S('<path d="M8 3c0 4-3 6-3 10a7 7 0 0 0 14 0c0-4-3-6-3-10"/><path d="M10 13l2 4 2-4"/>'),
  relic: S('<path d="M12 2l4 6-4 14-4-14z"/><path d="M8 8h8"/>'),
  record: S('<path d="M5 3h11l3 3v15H5z"/><path d="M8 9h8M8 13h8M8 17h5"/>'),
  ally: S('<circle cx="8" cy="8" r="3"/><circle cx="16" cy="8" r="3"/><path d="M2 20c0-3 3-5 6-5s6 2 6 5M12 20c0-3 2-5 4-5s6 2 6 5"/>'),
};

export function abilityIcon(id) {
  return ICONS[id] ?? ICONS.power;
}
