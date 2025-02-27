import Link from 'next/link';
import {
  BoltIcon,
  CloudIcon,
  MusicalNoteIcon,
  CheckIcon,
} from '@heroicons/react/24/outline';
import { FeatureItem } from './components/FeatureItem';
import GithubIcon from './assets/github.svg';
import { Section } from './components/Section';
import { BackgroundVideo } from './components/BackgroundVideo';

const whatIsItFeatures = [
  {
    title: 'Instant settlement',
    description:
      'Accept payments at the speed of the blockchain. Money in your wallet in 2 seconds, not T+2.',
    icon: <CheckIcon className="w-5 h-5 text-indigo-400" />,
  },
  {
    title: 'Frictionless integration',
    description:
      'Just a single line of middleware or configuration in your existing web server stack can enable x402.',
    icon: <CheckIcon className="w-5 h-5 text-indigo-400" />,
  },

  {
    title: 'Security & trust via an open standard',
    description:
      "Anyone can implement or extend x402. It's not tied to any centralized provider, and encourages broad community participation.",
    icon: <CheckIcon className="w-5 h-5 text-indigo-400" />,
  },
  {
    title: 'Web native',
    description:
      "Activates the dormant 402 HTTP status code and works with any HTTP stack. If it's on the web, it can be paid for with x402.",
    icon: <CheckIcon className="w-5 h-5 text-indigo-400" />,
  },
];
const whyItMattersFeatures = [
  {
    title: 'AI Agents',
    description:
      'Agents can use the x402 Protocol to pay for API requests in real-time.',
    icon: <BoltIcon className="w-5 h-5 text-indigo-400" />,
  },
  {
    title: 'Cloud Storage Providers',
    description:
      'Using x402, customers can easily access storage services without account creation.',
    icon: <CloudIcon className="w-5 h-5 text-indigo-400" />,
  },
  {
    title: 'Content Creators',
    description:
      'x402 unlocks instant transactions, enabling true micropayments for content.',
    icon: <MusicalNoteIcon className="w-5 h-5 text-indigo-400" />,
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-800 to-black text-white relative overflow-hidden">
      {/* Video Background */}
      <div className="fixed w-full z-0">
        <div className="fixed w-full bg-gradient-to-t from-black" />
        <BackgroundVideo src="/neonblobs.mp4" />
      </div>

      {/* Content Container - Added relative and z-10 to appear above video */}
      <div className="relative z-10">
        {/* Hero Section */}
        <section className="max-w-6xl mx-auto px-4 pb-16 pt-20 lg:pt-28 lg:pb-20">
          <div className="text-center">
            <h1 className="text-5xl md:text-8xl font-bold mb-6 bg-gradient-to-r from-blue-400 to-purple-500 text-transparent bg-clip-text inline-block">
              x402
            </h1>
            <p className="text-xl text-gray-400 mb-8 font-mono">
              An open protocol for internet-native payments
            </p>
            <div className="flex flex-wrap gap-4 justify-center">
              <a
                href="/whitepaper.pdf"
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-mono transition-colors"
              >
                Read the Whitepaper
              </a>
              <Link
                href="https://github.com/coinbase/x402"
                target="_blank"
                rel="noopener noreferrer"
                className="px-6 py-3 bg-gray-800 hover:bg-gray-700 rounded-lg font-mono transition-colors flex items-center gap-2"
              >
                <GithubIcon className="w-5 h-5 mr-1" fill="currentColor" />
                View on GitHub
              </Link>
            </div>
          </div>
        </section>

        <Section>
          {/* What is it? */}
          <div className="relative">
            <div className="absolute -left-4 top-0 w-1 h-full bg-gradient-to-b from-blue-500 to-purple-500 rounded-full hidden lg:block"></div>
            <div className="lg:pl-12">
              <div className="flex items-center gap-4 mb-6">
                <h3 className="text-3xl font-bold text-blue-400">
                  A Chain-Agnostic Protocol for Web Payments
                </h3>
              </div>
              <div className="bg-gray-800/30 rounded-2xl p-8 backdrop-blur-2xl border border-gray-700/50">
                <p className="text-gray-300 leading-relaxed text-xl mb-8">
                  Built around the{' '}
                  <Link
                    href="https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/402"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-500"
                  >
                    HTTP 402
                  </Link>{' '}
                  status code,{' '}
                  <span className="font-bold">
                    x402 enables users to pay for resources via API
                  </span>{' '}
                  without registration, emails, OAuth, or complex signatures.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-10 text-gray-400">
                  {whatIsItFeatures.map((feature, index) => (
                    <FeatureItem key={index} {...feature} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </Section>

        <Section>
          {/* Why it matters */}
          <div className="relative">
            <div className="absolute -left-4 top-0 w-1 h-full bg-gradient-to-b from-purple-500 to-indigo-500 rounded-full hidden lg:block"></div>

            <div className="lg:pl-12">
              <div className="flex items-center gap-4 mb-6">
                <h3 className="text-3xl font-bold text-purple-400">
                  Powering Next-Gen Digital Commerce
                </h3>
              </div>
              <div className="bg-gray-800/30 rounded-2xl p-8  backdrop-blur-xl border border-gray-700/50">
                <p className="text-gray-300 leading-relaxed text-xl mb-8">
                  <span className="font-bold">
                    x402 unlocks new monetization models,
                  </span>{' '}
                  offering developers and content creators a frictionless way to
                  earn revenue from small transactions without forcing
                  subscriptions or showing ads.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {whyItMattersFeatures.map((feature, index) => (
                    <FeatureItem
                      key={index}
                      {...feature}
                      iconBgColor="bg-indigo-500/10"
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </Section>

        <Section>
          {/* How it works */}
          <div className="relative">
            <div className="absolute -left-4 top-0 w-1 h-full bg-gradient-to-b from-indigo-500 to-blue-500 rounded-full hidden lg:block"></div>
            <div className="lg:pl-12">
              <div className="flex items-center gap-4 mb-6">
                <h3 className="text-3xl font-bold text-indigo-400">
                  1 Line of Code to Accept Digital Dollars
                </h3>
              </div>
              <div className="bg-gray-800/30 rounded-2xl p-8 backdrop-blur-xl border border-gray-700/50">
                <p className="text-gray-300 leading-relaxed text-xl mb-8">
                  Just add a{' '}
                  <span className="font-bold">single line of code</span> in your
                  app, and you can require a USDC payment for each incoming
                  request.
                </p>
                <div className="mb-8">
                  <div className="bg-black/50 rounded-lg p-4 font-mono text-sm text-gray-300 relative overflow-hidden">
                    <pre className="syntax-highlight">
                      <span className="text-blue-400">app</span>
                      <span className="text-gray-300">.</span>
                      <span className="text-green-400">use</span>
                      <span className="text-gray-300">(</span>
                      <span className="text-amber-300">
                        &quot;/your-route&quot;
                      </span>
                      <span className="text-gray-300">, </span>
                      <span className="text-green-400">paymentMiddleware</span>
                      <span className="text-gray-300">(</span>
                      <span className="text-amber-300">&quot;$0.10&quot;</span>
                      <span className="text-gray-300">, </span>
                      <span className="text-blue-400">myAddress</span>
                      <span className="text-gray-300">));</span>
                      {'\n'}
                      {/* eslint-disable-next-line react/jsx-no-comment-textnodes */}
                      <span className="text-gray-400">// and thats it!</span>
                    </pre>
                  </div>
                </div>
                <p className="text-gray-300 leading-relaxed text-lg mb-8">
                  If a request arrives without payment, the server responds with
                  HTTP 402, prompting the client to pay and retry.
                </p>
                <div className="mb-8">
                  <div className="bg-black/50 rounded-lg p-4 font-mono text-sm text-gray-300 relative overflow-hidden">
                    <pre className="syntax-highlight">
                      <span className="text-purple-400">HTTP</span>
                      <span className="text-gray-300">/1.1 </span>
                      <span className="text-amber-300">402</span>
                      <span className="text-gray-300"> Payment Required</span>
                    </pre>
                  </div>
                </div>

                <p className="text-gray-300 leading-relaxed text-lg">
                  x402 allows any web developer to accept crypto payments
                  without the complexity of having to interact with the
                  blockchain.
                </p>
              </div>
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}
