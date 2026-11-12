/**
 * The Google Maps pin in its own colours, for links that open Google Maps.
 * It sits on a white disc so it stays legible on the green action buttons.
 * Inline paths for the same reason as the social glyphs: lucide ships no
 * brand icons.
 */
const PIN_SEGMENTS: { fill: string; d: string }[] = [
  {
    fill: '#34A853',
    d: 'M19.527 4.799c1.212 2.608.937 5.678-.405 8.173-1.101 2.047-2.744 3.74-4.098 5.614-.619.858-1.244 1.75-1.669 2.727-.141.325-.263.658-.383.992-.121.333-.224.673-.34 1.008-.109.314-.236.684-.627.687h-.007c-.466-.001-.579-.53-.695-.887-.284-.874-.581-1.713-1.019-2.525-.51-.944-1.145-1.817-1.79-2.671L19.527 4.799z',
  },
  {
    fill: '#FBBC04',
    d: 'M8.545 7.705l-3.959 4.707c.724 1.54 1.821 2.863 2.871 4.18.247.31.494.622.737.936l4.984-5.925-.029.01c-1.741.601-3.691-.291-4.392-1.987a3.377 3.377 0 0 1-.209-.716c-.063-.437-.077-.761-.004-1.198l.001-.007z',
  },
  {
    fill: '#EA4335',
    d: 'M5.492 3.149l-.003.004c-1.947 2.466-2.281 5.88-1.117 8.77l4.785-5.689-.058-.05-3.607-3.035z',
  },
  {
    fill: '#4285F4',
    d: 'M14.661.436l-3.838 4.563a.295.295 0 0 1 .027-.01c1.6-.551 3.403.15 4.22 1.626.176.319.323.683.377 1.045.068.446.085.773.012 1.22l-.003.016 3.836-4.561A8.382 8.382 0 0 0 14.67.439l-.009-.003z',
  },
  {
    fill: '#1A73E8',
    d: 'M9.466 5.868L14.162.285l-.047-.012A8.31 8.31 0 0 0 11.986 0a8.439 8.439 0 0 0-6.169 2.766l-.016.018 3.665 3.084z',
  },
];

interface GoogleMapsIconProps {
  className?: string;
  /** The white disc behind the pin, for coloured buttons. Off on plain cards. */
  disc?: boolean;
}

export function GoogleMapsIcon({ className = 'h-5 w-5', disc = true }: GoogleMapsIconProps) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center ${disc ? 'rounded-full bg-white' : ''} ${className}`}
    >
      <svg viewBox="0 0 24 24" className={disc ? 'h-[70%] w-[70%]' : 'h-full w-full'}>
        {PIN_SEGMENTS.map((segment) => (
          <path key={segment.fill} fill={segment.fill} d={segment.d} />
        ))}
      </svg>
    </span>
  );
}
