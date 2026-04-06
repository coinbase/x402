import { paymentProxyFromConfig } from "@x402/next";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { ExactSvmScheme } from "@x402/svm/exact/server";
import { NextRequest, NextResponse } from "next/server";
import { createPaywall } from "@x402/paywall";
import { evmPaywall } from "@x402/paywall/evm";
import { svmPaywall } from "@x402/paywall/svm";

const evmPayeeAddress = process.env.RESOURCE_EVM_ADDRESS as `0x${string}`;
const svmPayeeAddress = process.env.RESOURCE_SVM_ADDRESS as string;
const facilitatorUrl = process.env.FACILITATOR_URL as string;

const EVM_NETWORK = "eip155:84532" as const; // Base Sepolia
const SVM_NETWORK = "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1" as const; // Solana Devnet

// List of blocked countries and regions
const BLOCKED_COUNTRIES = [
  "KP", // North Korea
  "IR", // Iran
  "CU", // Cuba
  "SY", // Syria
];

// List of blocked regions within specific countries
const BLOCKED_REGIONS = {
  UA: ["43", "14", "09"],
};

// Validate required environment variables
if (!facilitatorUrl) {
  console.error("❌ FACILITATOR_URL environment variable is required");
}

// Create HTTP facilitator client
const facilitatorClient = new HTTPFacilitatorClient({ url: facilitatorUrl });

// Build the base paywall provider
const basePaywall = createPaywall()
  .withNetwork(evmPaywall)
  .withNetwork(svmPaywall)
  .withConfig({
    appName: "Demo Example",
    appLogo: "/images/x402_logo.svg",
  })
  .build();

function injectSiteIntroAnimation(html: string): string {
  if (html.includes("x402-site-intro-overlay")) {
    return html;
  }

  const introCss = `
<style id="x402-site-intro-style">
  body.x402-site-intro-hidden .paywall-page {
    visibility: hidden;
  }
  #x402-site-intro-overlay {
    position: fixed;
    inset: 0;
    background: #ffffff;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    opacity: 1;
    transition: opacity 220ms ease-out;
  }
  #x402-site-intro-overlay.intro-done {
    opacity: 0;
    pointer-events: none;
  }
  #x402-site-intro-logo {
    width: 105px;
    height: 105px;
  }
</style>`;

  const introMarkup = `
<div id="x402-site-intro-overlay" aria-hidden="true">
  <div id="x402-site-intro-logo"></div>
</div>`;

  const introScript = `
<script>
  (function () {
    var SEGMENT_START = 60;
    var SEGMENT_END = 182;
    var SPEED = 1.5;
    var FALLBACK_MS = 2000;
    var done = false;

    function finish() {
      if (done) return;
      done = true;
      var overlay = document.getElementById("x402-site-intro-overlay");
      if (overlay) overlay.classList.add("intro-done");
      document.body.classList.remove("x402-site-intro-hidden");
    }

    function run() {
      document.body.classList.add("x402-site-intro-hidden");
      var container = document.getElementById("x402-site-intro-logo");
      if (!container || !window.lottie || !window.lottie.loadAnimation) {
        finish();
        return;
      }

      var timer = setTimeout(finish, FALLBACK_MS);
      var animation = window.lottie.loadAnimation({
        container: container,
        renderer: "svg",
        loop: false,
        autoplay: false,
        initialSegment: [SEGMENT_START, SEGMENT_END],
        path: "/lottie/CB_Dev_X402_02_v005.json"
      });

      animation.addEventListener("DOMLoaded", function () {
        animation.setSpeed(SPEED);
        animation.goToAndStop(SEGMENT_START, true);
        animation.playSegments([SEGMENT_START, SEGMENT_END], true);
      });
      animation.addEventListener("complete", function () {
        clearTimeout(timer);
        finish();
      });
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", run, { once: true });
    } else {
      run();
    }
  })();
</script>`;

  let nextHtml = html.replace("</head>", `${introCss}</head>`);
  nextHtml = nextHtml.replace(
    "</body>",
    `${introMarkup}<script src="https://unpkg.com/lottie-web@5.12.2/build/player/lottie.min.js"></script>${introScript}</body>`,
  );
  return nextHtml;
}

const paywall = {
  generateHtml: (paymentRequired: Parameters<typeof basePaywall.generateHtml>[0]) =>
    injectSiteIntroAnimation(basePaywall.generateHtml(paymentRequired)),
};

const x402PaymentProxy = paymentProxyFromConfig(
  {
    "/protected": {
      accepts: [
        {
          payTo: evmPayeeAddress,
          scheme: "exact",
          price: "$0.01",
          network: EVM_NETWORK,
        },
        {
          payTo: svmPayeeAddress,
          scheme: "exact",
          price: "$0.01",
          network: SVM_NETWORK,
        },
      ],
      description: "Access to protected content",
    },
  },
  facilitatorClient,
  [
    { network: EVM_NETWORK, server: new ExactEvmScheme() },
    { network: SVM_NETWORK, server: new ExactSvmScheme() },
  ],
  undefined, // paywallConfig
  paywall, // paywall provider
);

const geolocationProxy = async (req: NextRequest) => {
  // Get the country and region from Vercel's headers
  const country = req.headers.get("x-vercel-ip-country") || "US";
  const region = req.headers.get("x-vercel-ip-country-region");

  const isCountryBlocked = BLOCKED_COUNTRIES.includes(country);
  const isRegionBlocked =
    region && BLOCKED_REGIONS[country as keyof typeof BLOCKED_REGIONS]?.includes(region);

  if (isCountryBlocked || isRegionBlocked) {
    return new NextResponse("Access denied: This service is not available in your region", {
      status: 451,
      headers: {
        "Content-Type": "text/plain",
      },
    });
  }

  return null;
};

export const proxy = async (req: NextRequest) => {
  const geolocationResponse = await geolocationProxy(req);
  if (geolocationResponse) {
    return geolocationResponse;
  }
  const delegate = x402PaymentProxy as unknown as (
    request: NextRequest,
  ) => ReturnType<typeof x402PaymentProxy>;
  return delegate(req);
};

// Configure which paths the proxy should run on
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (metadata files)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
    "/", // Include the root path explicitly
  ],
};
