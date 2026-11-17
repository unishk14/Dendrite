import type { Metadata } from "next";
import { Kalam } from "next/font/google";
import { Landing } from "../../components/landing/Landing";
import "../../components/landing/landing.css";

// The ballpoint hand for margin notes. Self-hosted at build time by next/font,
// so the page makes no request to a font service when it is opened.
const pen = Kalam({ weight: ["400", "700"], subsets: ["latin"], variable: "--font-pen", display: "swap" });

export const metadata: Metadata = {
  title: "Dendrite: see where your day went",
  description:
    "Dendrite records which apps and websites you use, on your own computer, and turns it into a plain report of your day and week. No account, no cloud.",
};

export default function WelcomePage() {
  return <Landing className={pen.variable} />;
}
