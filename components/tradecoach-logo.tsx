import Image from "next/image";
import Link from "next/link";

export const TRADECOACH_LOGO_PNG = "/brand/tradecoach-ai-logo.png";

/** Uploaded master canvas (unchanged file). */
export const TRADECOACH_LOGO_WIDTH = 2000;
export const TRADECOACH_LOGO_HEIGHT = 2000;

/** Visible artwork area inside the master canvas. */
const LOGO_ART_WIDTH = 1737;
const LOGO_ART_HEIGHT = 339;

type TradeCoachLogoProps = {
  href?: string;
  size?: "sidebar" | "nav" | "footer" | "auth" | "hero";
  className?: string;
  priority?: boolean;
};

const sizeConfig = {
  sidebar: {
    heightClass: "h-9",
    maxWidthClass: "w-full max-w-[200px]",
  },
  nav: {
    heightClass: "h-11 sm:h-12",
    maxWidthClass: "",
  },
  footer: {
    heightClass: "h-14",
    maxWidthClass: "max-w-[300px]",
  },
  auth: {
    heightClass: "h-16 sm:h-[72px]",
    maxWidthClass: "max-w-[340px]",
  },
  hero: {
    heightClass: "h-14 sm:h-16",
    maxWidthClass: "",
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
    <span
      className={`relative inline-block overflow-hidden align-middle ${config.heightClass} ${config.maxWidthClass} ${className}`.trim()}
      style={{ aspectRatio: `${LOGO_ART_WIDTH} / ${LOGO_ART_HEIGHT}` }}
    >
      <Image
        src={TRADECOACH_LOGO_PNG}
        alt="TradeCoach AI — Your Personal Trading Coach"
        width={TRADECOACH_LOGO_WIDTH}
        height={TRADECOACH_LOGO_HEIGHT}
        priority={priority}
        unoptimized
        className="absolute left-1/2 top-1/2 max-w-none -translate-x-1/2 -translate-y-1/2"
        style={{
          height: `calc(100% * ${TRADECOACH_LOGO_HEIGHT} / ${LOGO_ART_HEIGHT})`,
          width: "auto",
        }}
      />
    </span>
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
