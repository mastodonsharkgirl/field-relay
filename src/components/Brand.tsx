export default function Brand({ href = './' }: { href?: string }) {
  return (
    <a className="wordmark" href={href} aria-label="Field Relay home">
      <svg className="brand-mark" viewBox="0 0 40 40" fill="none" aria-hidden="true">
        <rect x="1" y="1" width="38" height="38" rx="10" fill="currentColor" />
        <path
          d="M11 27V13h17M11 20h12M21 27h8V15"
          stroke="white"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="28" cy="13" r="3" fill="#BFC9FF" />
      </svg>
      <span>
        field<span className="wordmark-light">relay</span>
        <span className="wordmark-period">.</span>
      </span>
    </a>
  );
}
