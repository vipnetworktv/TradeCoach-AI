"use client";

import { useEffect, useRef } from "react";
import QRCode from "qrcode";

type TotpQrCodeProps = {
  value: string;
  size?: number;
};

export default function TotpQrCode({ value, size = 240 }: TotpQrCodeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas || !value) {
      return;
    }

    void QRCode.toCanvas(canvas, value, {
      width: size,
      margin: 2,
      errorCorrectionLevel: "M",
      color: {
        dark: "#000000",
        light: "#ffffff",
      },
    });
  }, [value, size]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      className="block"
      aria-label="Authenticator QR code"
    />
  );
}
