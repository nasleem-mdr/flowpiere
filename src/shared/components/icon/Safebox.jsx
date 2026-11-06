export const SafeBoxIcon = ({ size = 24, color = 'currentColor', className = '', ...props }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill="none"
      stroke={color}
      strokeWidth="16"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      {/* Outer Vault Frame */}
      <rect x="32" y="64" width="232" height="352" rx="8" />
      
      {/* Base Legs */}
      <path d="M48 416v32h64v-32M400 416v32h64v-32" />

      {/* Gold Bars Inside */}
      {/* Top Bar */}
      <path d="M168 180h56l-20 64h-56z" />
      {/* Middle Row Bars */}
      <path d="M128 244h60l-20 64h-60z" />
      <path d="M188 244h56l-20 64h-56z" />
      {/* Bottom Row Bars */}
      <path d="M80 308h64l-24 76h-64z" />
      <path d="M144 308h64l-24 76h-64z" />
      <path d="M208 308h48l-16 76h-48z" />

      {/* Vault Door (Open) */}
      <path d="M264 44L480 96v352L264 404V44z" />
      <path d="M264 64h60v340h-60" />

      {/* Door Hinges & Rivets */}
      <path d="M464 128h16M464 156h16M464 344h16M464 372h16" />
      <circle cx="294" cy="112" r="8" fill={color} />
      <circle cx="294" cy="160" r="8" fill={color} />
      <circle cx="294" cy="208" r="8" fill={color} />
      <circle cx="294" cy="304" r="8" fill={color} />
      <circle cx="294" cy="352" r="8" fill={color} />
      <circle cx="294" cy="400" r="8" fill={color} />

      {/* Door Handle */}
      <path d="M344 176c32 0 48 32 48 80s-16 80-48 80" strokeWidth="20" />
      <path d="M344 208c18 0 28 20 28 48s-10 48-28 48" strokeWidth="16" />
    </svg>
  );
};