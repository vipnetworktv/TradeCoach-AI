import Image from "next/image";
import Link from "next/link";

export const TRADECOACH_LOGO_PNG = "/brand/tradecoach-ai-logo.png";

/** Native pixel size of `public/brand/tradecoach-ai-logo.png`. */
export const TRADECOACH_LOGO_WIDTH = 899;
export const TRADECOACH_LOGO_HEIGHT = 193;

type TradeCoachLogoProps = {
  href?: string;
  size?: "sidebar" | "nav" | "footer" | "auth" | "hero";
  className?: string;
  priority?: boolean;
};

const sizeConfig = {
  sidebar: {
    className: "h-auto w-full max-w-[260px]",
  },
  nav: {
    className: "h-11 w-auto sm:h-12",
  },
  footer: {
    className: "h-auto w-full max-w-[300px]",
  },
  auth: {
    className: "mx-auto h-auto w-full max-w-[340px]",
  },
  hero: {
    className: "h-14 w-auto sm:h-16",
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
      src={TRADECOACH_LOGO_PNG}
      alt="TradeCoach AI — Your Personal Trading Coach"
      width={TRADECOACH_LOGO_WIDTH}
      height={TRADECOACH_LOGO_HEIGHT}
      priority={priority}
      unoptimized
      className={`${config.className} ${className}`.trim()}
    />
  );

  if (!href) {
    return image;
  }

  return (
    <Link
      href={href}
      className="inline-flex shrink-0 items-center transition-opacity hover:opacity-90"
    >
      {image}
    </Link>
  );
}
