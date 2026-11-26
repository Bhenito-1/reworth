import Link from "next/link";

const backClassName =
  "inline-flex h-11 min-w-[2.75rem] shrink-0 items-center justify-start text-2xl leading-none text-[var(--rw-ink)] hover:text-[var(--rw-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rw-accent)] focus-visible:ring-offset-2";

type BackLinkProps = {
  href: string;
  className?: string;
};

export function BackLink({ href, className }: BackLinkProps) {
  return (
    <Link
      href={href}
      aria-label="Back"
      className={className ? `${backClassName} ${className}` : backClassName}
    >
      ←
    </Link>
  );
}

type BackButtonProps = {
  onClick: () => void;
  className?: string;
};

export function BackButton({ onClick, className }: BackButtonProps) {
  return (
    <button
      type="button"
      aria-label="Back"
      onClick={onClick}
      className={className ? `${backClassName} ${className}` : backClassName}
    >
      ←
    </button>
  );
}