import Image from "next/image";
import Link from "next/link";

export const TRADECOACH_LOGO_PNG = "/brand/tradecoach-ai-logo.png";
export const TRADECOACH_LOGO_COMPACT_PNG =
  "/brand/tradecoach-ai-logo-compact.png";

type TradeCoachLogoProps = {
  href?: string;
  size?: "sidebar" | "nav" | "footer" | "auth";
  className?: string;
  priority?: boolean;
};

const sizeConfig = {
  sidebar: {
    src: TRADECOACH_LOGO_COMPACT_PNG,
    width: 626,
    height: 168,
    className: "h-auto w-full max-w-[220px]",
  },
  nav: {
    src: TRADECOACH_LOGO_COMPACT_PNG,
    width: 626,
    height: 168,
    className: "h-9 w-auto sm:h-10",
  },
  footer: {
    src: TRADECOACH_LOGO_PNG,
    width: 627,
    height: 273,
    className: "h-auto w-full max-w-[240px]",
  },
  auth: {
    src: TRADECOACH_LOGO_PNG,
    width: 627,
    height: 273,
    className: "mx-auto h-auto w-full max-w-[280px]",
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
      src={config.src}
      alt="TradeCoach AI"
      width={config.width}
      height={config.height}
      priority={priority}
      quality={100}
      sizes={
        size === "nav"
          ? "(max-width: 640px) 160px, 200px"
          : size === "sidebar"
            ? "220px"
            : "(max-width: 640px) 240px, 280px"
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
