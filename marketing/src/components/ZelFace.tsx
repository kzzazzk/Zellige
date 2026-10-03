import { useId } from "react";

export type Mood = "hello" | "look" | "thinking" | "excited" | "curious" | "focused" | "wink" | "content";
export const moods: Mood[] = ["hello", "look", "thinking", "excited", "curious", "focused", "wink", "content"];

/*
 * Zel's face: an obsidian oval with a brass rim on the emblem's centre star, and
 * one pair of eyes per mood. Drawn in the emblem's 1254-px space so it can sit on
 * top of the emblem image (web) or be composited onto it (scripts/build-brand.mjs).
 * Eye coordinates are at the original mascot's scale (oval at 622, 634; eyes at
 * x 521 / 723), scaled onto the star by the outer transform.
 */
const EYE_L = 521;
const EYE_R = 723;
const EYE_Y = 622;

function Arc({ x, up = true }: { x: number; up?: boolean }) {
  // ∩ for a smile-squint, ∪ for closed, relaxed eyes.
  const d = up ? `M${x - 44} ${EYE_Y + 22}Q${x} ${EYE_Y - 44} ${x + 44} ${EYE_Y + 22}` : `M${x - 42} ${EYE_Y - 8}Q${x} ${EYE_Y + 44} ${x + 42} ${EYE_Y - 8}`;
  return <path d={d} fill="none" stroke="#f8f6ef" strokeWidth="24" strokeLinecap="round" />;
}

function Open({ x, squint = false }: { x: number; squint?: boolean }) {
  return (
    <g className="companion-eye">
      <ellipse cx={x} cy={EYE_Y} rx="30" ry={squint ? 13 : 40} fill="#f8f6ef" />
      {!squint && <circle cx={x - 9} cy={EYE_Y - 14} r="8" fill="#0b1d29" opacity=".18" />}
    </g>
  );
}

export function Eyes({ mood }: { mood: Mood }) {
  switch (mood) {
    case "hello":
      return <><Arc x={EYE_L} /><Arc x={EYE_R} /></>;
    case "content":
      return <><Arc x={EYE_L} up={false} /><Arc x={EYE_R} up={false} /></>;
    case "wink":
      return <><Arc x={EYE_L} /><g className="companion-look"><Open x={EYE_R} /></g></>;
    case "excited":
      return (
        <g fill="none" stroke="#f8f6ef" strokeWidth="24" strokeLinecap="round" strokeLinejoin="round">
          <path d={`M${EYE_L - 34} ${EYE_Y - 36}L${EYE_L + 30} ${EYE_Y}L${EYE_L - 34} ${EYE_Y + 36}`} />
          <path d={`M${EYE_R + 34} ${EYE_Y - 36}L${EYE_R - 30} ${EYE_Y}L${EYE_R + 34} ${EYE_Y + 36}`} />
        </g>
      );
    case "focused":
      return <g className="companion-look"><Open x={EYE_L} squint /><Open x={EYE_R} squint /></g>;
    case "thinking":
      return (
        <>
          <path d={`M${EYE_L - 40} ${EYE_Y + 4}H${EYE_L + 38}`} stroke="#f8f6ef" strokeWidth="22" strokeLinecap="round" />
          <g transform="translate(14 -22)"><Open x={EYE_R} /></g>
        </>
      );
    case "curious":
      return (
        <g className="companion-look">
          <Open x={EYE_L} />
          <g transform={`rotate(-8 ${EYE_R} ${EYE_Y})`}><ellipse cx={EYE_R} cy={EYE_Y} rx="34" ry="46" fill="#f8f6ef" className="companion-eye" /></g>
        </g>
      );
    default:
      return <g className="companion-look"><Open x={EYE_L} /><Open x={EYE_R} /></g>;
  }
}

/** The face group, in emblem coordinates (viewBox 0 0 1254 1254). */
export function ZelFace({ mood }: { mood: Mood }) {
  const gradient = `zel-face-${useId().replaceAll(":", "")}`;
  return (
    <>
      <defs>
        <radialGradient id={gradient} cx="40%" cy="30%" r="75%">
          <stop offset="0" stopColor="#1a2433" />
          <stop offset=".55" stopColor="#05080d" />
          <stop offset="1" stopColor="#000" />
        </radialGradient>
      </defs>
      <g className="zel-face" transform="translate(627 627) scale(0.62) translate(-622 -634)">
        <ellipse cx="622" cy="634" rx="206" ry="168" fill="#c9a962" />
        <ellipse cx="622" cy="634" rx="196" ry="158" fill={`url(#${gradient})`} />
        <path d="M480 540Q540 488 640 486" fill="none" stroke="#fff" strokeOpacity=".55" strokeWidth="16" strokeLinecap="round" />
        <ellipse cx="760" cy="740" rx="40" ry="10" fill="#fff" opacity=".08" transform="rotate(-25 760 740)" />
        <Eyes mood={mood} />
      </g>
    </>
  );
}
