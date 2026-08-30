/**
 * Generative cover art for blog posts.
 *
 * The dataset carries no photography, so every post gets deterministic SVG
 * art instead, in one shared visual language: a dark green ground with a
 * faint plot grid and rolling field rows, plus a scene chosen by the post's
 * `cover:` frontmatter key so the art says what the post is about:
 *
 *   - "payment": an EBT card and market tokens (SNAP/EBT guide)
 *   - "seasons": a clock face under a dotted sun arc (seasons and hours)
 *   - "market":  a stall with a striped awning and a tote (visiting guides)
 *   - "fields":  the plain field scene, the default for anything else
 *
 * Small positions still come from a PRNG seeded by the slug, so two posts
 * sharing a scene never share a cover, and a post keeps its cover forever.
 * Pure server markup, crisp at any size, identical in both themes (the art
 * is its own dark surface, like a photo would be).
 */

export const BLOG_COVER_THEMES = ['fields', 'payment', 'seasons', 'market'] as const;
export type BlogCoverTheme = (typeof BLOG_COVER_THEMES)[number];

const WIDTH = 1200;
const HEIGHT = 630;

/** Small deterministic PRNG (mulberry32) seeded from a string. */
function seededRandom(seed: string): () => number {
  let h = 1779033703;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One rolling band: a filled bezier "hill" spanning the full width. */
function band(random: () => number, baseY: number, amplitude: number): string {
  const y = (offset: number) => (baseY + offset).toFixed(1);
  const lift = () => (random() - 0.5) * 2 * amplitude;
  return [
    `M0 ${y(lift())}`,
    `C ${WIDTH * 0.2} ${y(lift())}, ${WIDTH * 0.3} ${y(lift())}, ${WIDTH * 0.5} ${y(lift())}`,
    `S ${WIDTH * 0.85} ${y(lift())}, ${WIDTH} ${y(lift())}`,
    `L ${WIDTH} ${HEIGHT} L 0 ${HEIGHT} Z`,
  ].join(' ');
}

function Hills({ random, low = false, autumn = false }: { random: () => number; low?: boolean; autumn?: boolean }) {
  const start = low ? 0.62 : 0.42;
  const step = low ? 0.11 : 0.14;
  const fills = autumn
    ? ['#14532d', '#166534', '#92400e', '#4d7c0f'] // one amber band for late season
    : ['#14532d', '#166534', '#15803d', '#4d7c0f'];
  return (
    <>
      {fills.map((fill, index) => (
        <path key={fill + index} d={band(random, HEIGHT * (start + step * index), low ? 30 : 55)} fill={fill} />
      ))}
    </>
  );
}

function Grid() {
  return (
    <g stroke="#22c55e" strokeOpacity="0.12" strokeWidth="1">
      {Array.from({ length: 11 }, (_unused, i) => (
        <line key={`v${i}`} x1={(i + 1) * (WIDTH / 12)} y1="0" x2={(i + 1) * (WIDTH / 12)} y2={HEIGHT} />
      ))}
      {Array.from({ length: 5 }, (_unused, i) => (
        <line key={`h${i}`} x1="0" y1={(i + 1) * (HEIGHT / 6)} x2={WIDTH} y2={(i + 1) * (HEIGHT / 6)} />
      ))}
    </g>
  );
}

function Sun({ x, y, r }: { x: number; y: number; r: number }) {
  return (
    <>
      <circle cx={x} cy={y} r={r * 1.9} fill="#fbbf24" opacity="0.12" />
      <circle cx={x} cy={y} r={r} fill="#fcd34d" opacity="0.85" />
    </>
  );
}

/** Amber and lime dots drifting over the fields, like the map's markers. */
function ProduceDots({ random, count = 14 }: { random: () => number; count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_unused, index) => (
        <circle
          key={index}
          cx={random() * WIDTH}
          cy={HEIGHT * (0.55 + random() * 0.35)}
          r={3 + random() * 5}
          fill={random() > 0.5 ? '#fbbf24' : '#a3e635'}
          opacity={0.5 + random() * 0.4}
        />
      ))}
    </>
  );
}

/** Default scene: fields at first light. */
function FieldsScene({ random }: { random: () => number }) {
  return (
    <>
      <Sun x={WIDTH * (0.15 + random() * 0.7)} y={HEIGHT * (0.12 + random() * 0.14)} r={46 + random() * 36} />
      <Hills random={random} />
      <ProduceDots random={random} />
    </>
  );
}

/** SNAP/EBT scene: a benefits card and the tokens the booth trades for it. */
function PaymentScene({ random }: { random: () => number }) {
  const tilt = -6 - random() * 4;
  return (
    <>
      <Sun x={WIDTH * 0.85} y={HEIGHT * 0.16} r={40} />
      <Hills random={random} low />
      <g transform={`rotate(${tilt.toFixed(1)} 600 300)`}>
        <rect x="370" y="140" width="460" height="290" rx="26" fill="#15803d" stroke="#a3e635" strokeWidth="3" />
        {/* Chip */}
        <rect x="415" y="196" width="74" height="56" rx="10" fill="#fcd34d" />
        <path d="M415 224 h74 M452 196 v56" stroke="#b45309" strokeWidth="3" fill="none" />
        {/* Embossed number and name bars */}
        <rect x="415" y="300" width="300" height="22" rx="11" fill="#bbf7d0" opacity="0.75" />
        <rect x="415" y="352" width="170" height="18" rx="9" fill="#bbf7d0" opacity="0.5" />
        {/* Issuer mark */}
        <circle cx="768" cy="376" r="26" fill="#fbbf24" opacity="0.9" />
        <circle cx="736" cy="376" r="26" fill="#a3e635" opacity="0.8" />
      </g>
      {/* Wooden market tokens, the scrip you shop with. */}
      {[
        { x: 855, y: 470, r: 52 },
        { x: 940, y: 512, r: 44 },
        { x: 790, y: 528, r: 40 },
      ].map((token) => (
        <g key={token.x}>
          <circle cx={token.x} cy={token.y} r={token.r} fill="#fbbf24" />
          <circle cx={token.x} cy={token.y} r={token.r * 0.72} fill="none" stroke="#92400e" strokeWidth="4" strokeDasharray="10 7" />
          <circle cx={token.x} cy={token.y} r={token.r * 0.2} fill="#92400e" />
        </g>
      ))}
    </>
  );
}

/** Seasons-and-hours scene: a clock face under the day's sun arc. */
function SeasonsScene({ random }: { random: () => number }) {
  const clockX = 780;
  const clockY = 300;
  const clockR = 160;
  const ticks = Array.from({ length: 12 }, (_unused, i) => {
    const angle = (i / 12) * Math.PI * 2;
    return {
      x1: clockX + Math.sin(angle) * clockR * 0.82,
      y1: clockY - Math.cos(angle) * clockR * 0.82,
      x2: clockX + Math.sin(angle) * clockR * 0.92,
      y2: clockY - Math.cos(angle) * clockR * 0.92,
    };
  });
  // Sun positions along the morning arc; markets keep morning hours.
  const arc = [0.18, 0.3, 0.42].map((t, index) => ({
    x: WIDTH * t,
    y: HEIGHT * (0.34 - Math.sin((index + 1) / 4) * 0.18),
    r: index === 1 ? 34 : 22,
  }));
  return (
    <>
      <path
        d={`M ${WIDTH * 0.08} ${HEIGHT * 0.4} Q ${WIDTH * 0.3} ${HEIGHT * 0.02} ${WIDTH * 0.52} ${HEIGHT * 0.38}`}
        fill="none"
        stroke="#fbbf24"
        strokeWidth="3"
        strokeDasharray="2 14"
        strokeLinecap="round"
        opacity="0.8"
      />
      {arc.map((sun) => (
        <circle key={sun.x} cx={sun.x} cy={sun.y} r={sun.r} fill="#fcd34d" opacity={sun.r > 30 ? 0.9 : 0.55} />
      ))}
      <Hills random={random} low autumn />
      <circle cx={clockX} cy={clockY} r={clockR + 10} fill="#052e16" opacity="0.6" />
      <circle cx={clockX} cy={clockY} r={clockR} fill="#fef9c3" />
      <circle cx={clockX} cy={clockY} r={clockR} fill="none" stroke="#15803d" strokeWidth="8" />
      <g stroke="#166534" strokeWidth="5" strokeLinecap="round">
        {ticks.map((tick, index) => (
          <line key={index} x1={tick.x1} y1={tick.y1} x2={tick.x2} y2={tick.y2} />
        ))}
      </g>
      {/* Hands at nine o'clock, when the stalls are full. */}
      <g stroke="#14532d" strokeLinecap="round">
        <line x1={clockX} y1={clockY} x2={clockX - clockR * 0.52} y2={clockY} strokeWidth="12" />
        <line x1={clockX} y1={clockY} x2={clockX} y2={clockY - clockR * 0.72} strokeWidth="8" />
      </g>
      <circle cx={clockX} cy={clockY} r="12" fill="#14532d" />
    </>
  );
}

/** Market-day scene: a stall with a striped awning, produce, and a tote. */
function MarketScene({ random }: { random: () => number }) {
  const stallX = 330;
  const stallW = 540;
  const awningY = 150;
  const scallops = 6;
  const scallopW = stallW / scallops;
  const produce = Array.from({ length: 12 }, (_unused, index) => ({
    x: stallX + 50 + (index % 6) * ((stallW - 100) / 5),
    y: 388 - Math.floor(index / 6) * 34,
    fill: ['#fbbf24', '#a3e635', '#f97316', '#facc15', '#84cc16', '#fb923c'][index % 6],
  }));
  return (
    <>
      <Sun x={WIDTH * (0.1 + random() * 0.08)} y={HEIGHT * 0.15} r={44} />
      <Hills random={random} low />
      {/* Awning: alternating stripes with a scalloped hem. */}
      <rect x={stallX - 20} y={awningY} width={stallW + 40} height="88" rx="10" fill="#f0fdf4" />
      {Array.from({ length: scallops }, (_unused, i) =>
        i % 2 === 0 ? (
          <rect key={i} x={stallX + i * scallopW} y={awningY} width={scallopW} height="88" fill="#16a34a" />
        ) : null
      )}
      {Array.from({ length: scallops }, (_unused, i) => (
        <path
          key={`s${i}`}
          d={`M ${stallX - 20 + i * ((stallW + 40) / scallops)} 238 a ${((stallW + 40) / scallops) / 2} 30 0 0 0 ${(stallW + 40) / scallops} 0 Z`}
          fill={i % 2 === 0 ? '#16a34a' : '#f0fdf4'}
        />
      ))}
      {/* Table with produce rows. */}
      <rect x={stallX + 10} y={HEIGHT * 0.65} width={stallW - 20} height="120" rx="8" fill="#78350f" />
      <rect x={stallX + 30} y={HEIGHT * 0.65 - 26} width={stallW - 60} height="26" rx="6" fill="#92400e" />
      {produce.map((item, index) => (
        <circle key={index} cx={item.x} cy={item.y} r="17" fill={item.fill} />
      ))}
      {/* Stall legs */}
      <rect x={stallX} y={awningY + 88} width="18" height={HEIGHT * 0.65 - awningY - 88} fill="#052e16" opacity="0.65" />
      <rect x={stallX + stallW - 18} y={awningY + 88} width="18" height={HEIGHT * 0.65 - awningY - 88} fill="#052e16" opacity="0.65" />
      {/* Tote bag waiting to be filled. */}
      <g>
        <path d="M 985 430 q 32 -66 64 0" fill="none" stroke="#4d7c0f" strokeWidth="10" strokeLinecap="round" />
        <rect x="955" y="428" width="124" height="120" rx="16" fill="#a3e635" />
        <rect x="955" y="428" width="124" height="26" rx="13" fill="#84cc16" />
        <circle cx="1000" cy="486" r="12" fill="#166534" opacity="0.7" />
        <circle cx="1036" cy="492" r="10" fill="#b45309" opacity="0.7" />
      </g>
    </>
  );
}

export function BlogCover({
  slug,
  title,
  theme = 'fields',
}: {
  slug: string;
  title: string;
  theme?: BlogCoverTheme;
}) {
  const random = seededRandom(slug);
  const Scene =
    theme === 'payment' ? PaymentScene : theme === 'seasons' ? SeasonsScene : theme === 'market' ? MarketScene : FieldsScene;

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={`Cover art for ${title}`}
      className="h-full w-full"
      preserveAspectRatio="xMidYMid slice"
    >
      <rect width={WIDTH} height={HEIGHT} fill="#052e16" />
      <Grid />
      <Scene random={random} />
    </svg>
  );
}
