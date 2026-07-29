import Image from "next/image";
import Link from "next/link";

export const TRADECOACH_LOGO_WEBP = "/brand/tradecoach-ai-logo.webp";
export const TRADECOACH_LOGO_PNG = "/brand/tradecoach-ai-logo.png";

type TradeCoachLogoProps = {
  href?: string;
  size?: "sidebar" | "nav" | "footer" | "auth";
  className?: string;
  priority?: boolean;
};

const sizeConfig = {
  sidebar: {
    width: 228,
    height: 84,
    className: "h-auto w-full max-w-[228px]",
  },
  nav: {
    width: 196,
    height: 72,
    className: "h-10 w-auto sm:h-11",
  },
  footer: {
    width: 220,
    height: 80,
    className: "h-auto w-full max-w-[220px]",
  },
  auth: {
    width: 240,
    height: 88,
    className: "mx-auto h-auto w-full max-w-[240px]",
  },
} as const;

export default function TradeCoachLogo({
  href = "/",
  size = "nav",
  className = "",
  priority = false,
}: TradeCoachLogoProps) {
  const config = sizeConfig[size];

  const image = (
    <Image
      src={TRADECOACH_LOGO_WEBP}
      alt="TradeCoach AI — Your personal trading coach"
      width={config.width}
      height={config.height}
      priority={priority}
      className={`${config.className} ${className}`.trim()}
    />
  );

  if (!href) {
    return image;
  }

  return (
    <Link
      href={href}
      className="inline-block transition-opacity hover:opacity-90"
    >
      {image}
    </Link>
  );
}
