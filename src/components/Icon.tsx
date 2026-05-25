interface Props {
  name: 'pen' | 'book' | 'sparkle' | 'lock' | 'copy' | 'check' | 'arrow' | 'close' | 'logout' | 'wand';
  size?: number;
  className?: string;
}

export default function Icon({ name, size = 22, className }: Props) {
  const stroke = 'currentColor';
  const sw = 1.6;
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke,
    strokeWidth: sw,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className,
  };
  switch (name) {
    case 'pen':
      return (
        <svg {...common}>
          <path d="M14 4l6 6-11 11H3v-6L14 4Z" />
          <path d="M12.5 5.5l6 6" />
        </svg>
      );
    case 'book':
      return (
        <svg {...common}>
          <path d="M4 5c0-.6.4-1 1-1h5a3 3 0 0 1 3 3v13a3 3 0 0 0-3-3H4V5Z" />
          <path d="M20 5c0-.6-.4-1-1-1h-5a3 3 0 0 0-3 3v13a3 3 0 0 1 3-3h6V5Z" />
        </svg>
      );
    case 'sparkle':
      return (
        <svg {...common}>
          <path d="M12 3l1.8 4.5L18 9.3l-4.2 1.8L12 15.6l-1.8-4.5L6 9.3l4.2-1.8L12 3Z" />
          <path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15Z" />
        </svg>
      );
    case 'lock':
      return (
        <svg {...common}>
          <rect x="4" y="11" width="16" height="9" rx="2" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
      );
    case 'copy':
      return (
        <svg {...common}>
          <rect x="9" y="9" width="11" height="11" rx="2" />
          <path d="M5 15V5a2 2 0 0 1 2-2h10" />
        </svg>
      );
    case 'check':
      return (
        <svg {...common}>
          <path d="M4 12l5 5L20 6" />
        </svg>
      );
    case 'arrow':
      return (
        <svg {...common}>
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      );
    case 'close':
      return (
        <svg {...common}>
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      );
    case 'logout':
      return (
        <svg {...common}>
          <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
          <path d="M10 8l-4 4 4 4" />
          <path d="M6 12h12" />
        </svg>
      );
    case 'wand':
      return (
        <svg {...common}>
          <path d="M4 20L16 8" />
          <path d="M14 6l4 4" />
          <path d="M19 13l1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2Z" />
          <path d="M6 4l.7 1.6L8.3 6.3 6.7 7 6 8.6 5.3 7 3.7 6.3 5.3 5.6 6 4Z" />
        </svg>
      );
  }
}
