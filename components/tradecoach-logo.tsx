import Image from "next/image";
import Link from "next/link";

export const TRADECOACH_LOGO_PNG = "/brand/tradecoach-ai-logo.png";

/** Native pixel size of `public/brand/tradecoach-ai-logo.png`. */
export const TRADECOACH_LOGO_WIDTH = 901;
export const TRADECOACH_LOGO_HEIGHT = 197;

type TradeCoachLogoProps = {
  href?: string;
  size?: "sidebar" | "nav" | "footer" | "auth" | "hero";
  className?: string;
  priority?: boolean;
};

const sizeConfig = {
  sidebar: {
    className: "h-auto w-full max-w-[240px]",
  },
  nav: {
    className: "h-10 w-auto sm:h-11",
  },
  footer: {
    className: "h-auto w-full max-w-[280px]",
  },
  auth: {
    className: "mx-auto h-auto w-full max-w-[320px]",
  },
  hero: {
    className: "h-12 w-auto sm:h-14",
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
      quality={100}
      sizes={
        size === "nav" || size === "hero"
          ? "(max-width: 640px) 180px, 220px"
          : size === "sidebar"
            ? "240px"
            : "(max-width: 640px) 280px, 320px"
      }
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
