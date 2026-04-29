// Inline SVG icons for the viewer rail. Keep them visually consistent with
// the Figma D v2 prototype: small (14×14 default), thin strokes, no fills
// for outline icons. Color is inherited via CSS `currentColor`.

export function BrandMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="8" width="12" height="12" rx="2" fill="#6EC8E0" opacity="0.55" />
      <rect x="4" y="4" width="12" height="12" rx="2" fill="#6EC8E0" opacity="0.8" />
      <rect x="8" y="0" width="12" height="12" rx="2" fill="#6EC8E0" />
    </svg>
  );
}

export function StackIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="6" width="8" height="8" rx="1" fill="currentColor" opacity="0.4" />
      <rect x="3" y="3" width="8" height="8" rx="1" fill="currentColor" opacity="0.7" />
      <rect x="6" y="0" width="8" height="8" rx="1" fill="currentColor" />
    </svg>
  );
}

export function LayersIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="14" height="2" rx="1" fill="currentColor" />
      <rect x="0" y="5" width="14" height="2" rx="1" fill="currentColor" />
      <rect x="0" y="10" width="14" height="2" rx="1" fill="currentColor" />
    </svg>
  );
}

export function MeasureIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="2" height="14" rx="1" fill="currentColor" />
      <rect x="0" y="12" width="14" height="2" rx="1" fill="currentColor" />
      <rect x="4" y="0" width="1.5" height="4" fill="currentColor" />
      <rect x="8" y="0" width="1.5" height="4" fill="currentColor" />
    </svg>
  );
}

export function BookmarkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" xmlns="http://www.w3.org/2000/svg">
      <rect
        x="2.5"
        y="1"
        width="9"
        height="12"
        rx="1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

export function SettingsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" xmlns="http://www.w3.org/2000/svg">
      <circle
        cx="7"
        cy="7"
        r="5.25"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle cx="7" cy="7" r="1.5" fill="currentColor" />
    </svg>
  );
}

export function ArrowRightIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M3 8 H12 M9 5 L12 8 L9 11"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SketchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" xmlns="http://www.w3.org/2000/svg">
      {/* base square = polygon profile */}
      <rect
        x="2.5"
        y="7"
        width="9"
        height="6"
        rx="1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      {/* extrude arrow */}
      <path
        d="M7 5 V1 M5 2.5 L7 1 L9 2.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function PlusIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M6 1 V11 M1 6 H11"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
