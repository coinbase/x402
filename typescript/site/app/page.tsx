import Link from 'next/link';
import {
  BoltIcon,
  CloudIcon,
  MusicalNoteIcon,
  CheckIcon,
  DocumentTextIcon,
  ArrowDownTrayIcon,
  QuestionMarkCircleIcon,
  CodeBracketIcon,
  BookOpenIcon,
  BriefcaseIcon,
} from '@heroicons/react/24/outline';
import { FeatureItem } from './components/FeatureItem';
import GithubIcon from './assets/github.svg';
import DiscordIcon from './assets/discord.svg';
import WordmarkCondensed from './assets/x402_wordmark_dark.svg';
import { Section } from './components/Section';
import { BackgroundVideo } from './components/BackgroundVideo';

const whatIsItFeatures = [
  {
    title: 'No fees',
    description: 'x402 as a protocol has 0 fees for either the customer or the merchant.',
    icon: <CheckIcon className="w-5 h-5 text-indigo-400" />,
  },
  {
    title: 'Instant settlement',
    description:
      'Accept payments at the speed of the blockchain. Money in your wallet in 2 seconds, not T+2.',
    icon: <CheckIcon className="w-5 h-5 text-indigo-400" />,
  },
  {
    title: 'Blockchain Agnostic',
    description:
      'x402 is not tied to any specific blockchain or token, its a neutral standard open to integration by all.',
    icon: <CheckIcon className="w-5 h-5 text-indigo-400" />,
  },
  {
    title: 'Frictionless',
    description:
      "As little as 1 line of middleware code or configuration in your existing web server stack and you can start accepting payments. Customers and agents aren't required to create an account or provide any personal information.",
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
      'Activates the dormant 402 HTTP status code and works with any HTTP stack. It works simply via headers and status codes on your existing HTTP server.',
    icon: <CheckIcon className="w-5 h-5 text-indigo-400" />,
  },
];
const whyItMattersFeatures = [
  {
    title: 'AI Agents',
    description: 'Agents can use the x402 Protocol to pay for API requests in real-time.',
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
    description: 'x402 unlocks instant transactions, enabling true micropayments for content.',
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

      <div className="relative z-10">
        {/* Top nav */}
        <section className="max-w-6xl mx-auto px-4 pt-4 lg:px-12">
          <div className="flex gap-4 md:gap-8 justify-between sm:justify-end">
            <Link
              href="https://docs.google.com/forms/d/e/1FAIpQLSeESQAfvSlmjzl8JTcAOdzYjcWZ2O2GZjhuSeb8vTPpNys7FQ/viewform"
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono hover:text-blue-400 transition-colors flex items-center gap-1 text-sm"
            >
              <QuestionMarkCircleIcon className="w-4 h-4 mr-1" />
              Learn more
            </Link>
            <Link
              href="/x402.pdf"
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono hover:text-blue-400 transition-colors flex items-center gap-1 text-sm"
            >
              <ArrowDownTrayIcon className="w-4 h-4 mr-1" />
              One-pager
            </Link>
            <Link
              href="/x402_brand_kit.zip"
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono hover:text-blue-400 transition-colors flex items-center gap-1 text-sm"
            >
              <BriefcaseIcon className="w-4 h-4 mr-1" />
              Brand kit
            </Link>
            <Link
              href="https://github.com/coinbase/x402"
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono hover:text-blue-400 transition-colors flex items-center gap-2 text-sm"
            >
              <GithubIcon className="w-4 h-4 mr-1" fill="currentColor" />
              GitHub
            </Link>
            <Link
              href="https://discord.gg/invite/cdp"
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono hover:text-blue-400 transition-colors flex items-center gap-2 text-sm"
            >
              <DiscordIcon className="w-4 h-4 mr-1" fill="currentColor" />
              Discord
            </Link>
          </div>
        </section>
        {/* Hero Section */}
        <section className="max-w-6xl mx-auto px-4 py-20 lg:py-28">
          <div className="text-center">
            <div className="w-64 mb-6 mx-auto">
              <WordmarkCondensed className="mx-auto" />
            </div>
            <p className="text-xl text-gray-400 mb-8 font-mono">
              An open protocol for internet-native payments
            </p>
            <div className="flex flex-wrap gap-4 mb-6 justify-center">
              <Link
                href="/x402-whitepaper.pdf"
                target="_blank"
                rel="noopener noreferrer"
                className="px-6 py-4 bg-blue-600 hover:bg-blue-700 rounded-lg font-mono transition-colors flex items-center gap-2 text-lg"
              >
                <DocumentTextIcon className="w-5 h-5 mr-1" />
                Read the whitepaper
              </Link>
            </div>
            <div className="flex flex-wrap gap-4 mb-8 justify-center">
              <Link
                href="https://x402.gitbook.io/x402"
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-3 border-2 border-transparent hover:border-blue-600 rounded-lg font-mono transition-colors flex items-center gap-2 text-sm"
              >
                <BookOpenIcon className="w-5 h-5 mr-1" />
                Read the docs
              </Link>
              <Link
                href="/protected"
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-3 border-2 border-transparent hover:border-blue-600 rounded-lg font-mono transition-colors flex items-center gap-2 text-sm"
              >
                <CodeBracketIcon className="w-5 h-5 mr-1" />
                Try it out
              </Link>
            </div>
          </div>
        </section>

        <Section>
          {/* What is it? */}
          <div className="relative">
            <div className="flex items-center gap-4 mb-6">
              <h3 className="text-3xl font-bold text-blue-400">
                The best way to accept digital payments.
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
                <span className="font-bold">x402 enables users to pay for resources via API</span>{' '}
                without registration, emails, OAuth, or complex signatures.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-10 text-gray-400">
                {whatIsItFeatures.map((feature, index) => (
                  <FeatureItem key={index} {...feature} />
                ))}
              </div>
            </div>
          </div>
        </Section>

        <Section>
          {/* Why it matters */}
          <div className="relative">
            <div className="flex items-center gap-4 mb-6">
              <h3 className="text-3xl font-bold text-purple-400">
                Powering Next-Gen Digital Commerce
              </h3>
            </div>
            <div className="bg-gray-800/30 rounded-2xl p-8  backdrop-blur-xl border border-gray-700/50">
              <p className="text-gray-300 leading-relaxed text-xl mb-8">
                <span className="font-bold">x402 unlocks new monetization models,</span> offering
                developers and content creators a frictionless way to earn revenue from small
                transactions without forcing subscriptions or showing ads.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {whyItMattersFeatures.map((feature, index) => (
                  <FeatureItem key={index} {...feature} iconBgColor="bg-indigo-500/10" />
                ))}
              </div>
            </div>
          </div>
        </Section>

        <Section>
          {/* How it works */}
          <div className="relative">
            <div className="flex items-center gap-4 mb-6">
              <h3 className="text-3xl font-bold text-indigo-400">
                1 Line of Code to Accept Digital Dollars
              </h3>
            </div>
            <div className="bg-gray-800/30 rounded-2xl p-8 backdrop-blur-xl border border-gray-700/50">
              <p className="text-gray-300 leading-relaxed text-xl mb-8">
                Just add a <span className="font-bold">single line of code</span> in your app, and
                you can require a USDC payment for each incoming request.
              </p>
              <div className="mb-8">
                <div className="bg-black/50 rounded-lg p-4 font-mono text-sm text-gray-300 relative overflow-hidden">
                  <pre className="syntax-highlight">
                    <span className="text-green-400">paymentMiddleware</span>
                    <span className="text-gray-300">(</span>
                    <span className="text-amber-300">&quot;0xYourAddress&quot;</span>
                    <span className="text-gray-300">, {'{'}</span>
                    <span className="text-amber-300">&quot;/your-endpoint&quot;</span>
                    <span className="text-gray-300">: </span>
                    <span className="text-amber-300">&quot;$0.01&quot;</span>
                    <span className="text-gray-300">{'}'}</span>
                    <span className="text-gray-300">);</span>
                    {'\n'}
                    {/* eslint-disable-next-line react/jsx-no-comment-textnodes */}
                    <span className="text-gray-400">// and thats it!</span>
                  </pre>
                </div>
              </div>
              <p className="text-gray-300 leading-relaxed text-lg mb-8">
                If a request arrives without payment, the server responds with HTTP 402, prompting
                the client to pay and retry.
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
                x402 allows any web developer to accept crypto payments without the complexity of
                having to interact with the blockchain.
              </p>
            </div>
          </div>
        </Section>
      </div>
      <footer className="relative z-10 py-8 text-center text-sm text-gray-400">
        By using this site, you agree to be bound by the{' '}
        <a
          href="https://www.coinbase.com/legal/developer-platform/terms-of-service"
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-500"
        >
          CDP Terms of Service
        </a>{' '}
        and{' '}
        <a
          href="https://www.coinbase.com/legal/privacy"
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-500"
        >
          Global Privacy Policy
        </a>
        .
      </footer>
    </div>
  );
}
