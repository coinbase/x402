import { Inter, Roboto_Mono } from "next/font/google";

const inter = Inter({ subsets: ["latin"] });
const robotoMono = Roboto_Mono({ subsets: ["latin"] });

export default function Home() {
  return (
    <div className={`min-h-screen bg-black text-white ${inter.className}`}>
      <div className="max-w-6xl mx-auto px-4 py-16">
        {/* Hero Section */}
        <div className="text-center mb-20">
          <h1 className="text-6xl font-bold mb-6">
            x402
          </h1>
          <p className="text-xl text-gray-300 mb-8">
            An open protocol for internet-native payments.
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-3 gap-8 mb-20">
        <div className="bg-zinc-900 p-6 rounded-lg border border-zinc-800">
            <h3 className="text-xl font-bold mb-3">Instant Settlement</h3>
            <p className="text-gray-400">
              Accept payments at the speed of the blockchain. Money in your wallet in 2 seconds, not T+2.
            </p>
          </div>
          <div className="bg-zinc-900 p-6 rounded-lg border border-zinc-800">
            <h3 className="text-xl font-bold mb-3">Zero Integration</h3>
            <p className="text-gray-400">
              Accept payments for any API or website in as little as 1 line of code. No complex payments infrastructure needed.
            </p>
          </div>
          <div className="bg-zinc-900 p-6 rounded-lg border border-zinc-800">
            <h3 className="text-xl font-bold mb-3">Micropayments</h3>
            <p className="text-gray-400">
              Charge as little as $0.001 per API call.
            </p>
          </div>
          <div className="bg-zinc-900 p-6 rounded-lg border border-zinc-800">
            <h3 className="text-xl font-bold mb-3">Agentic Commerce</h3>
            <p className="text-gray-400">
              Built from the ground up to allow agents to pay for anything on the internet, x402 makes it easy to charge agents.
            </p>
          </div>
          <div className="bg-zinc-900 p-6 rounded-lg border border-zinc-800">
            <h3 className="text-xl font-bold mb-3">Web Native</h3>
            <p className="text-gray-400">
              x402 activates the dormant 402 HTTP status code and works with any HTTP stack. If its on the web it could be paid for with x402.
            </p>
          </div>
          <div className="bg-zinc-900 p-6 rounded-lg border border-zinc-800">
            <h3 className="text-xl font-bold mb-3">The Power of crypto without the complexity</h3>
            <p className="text-gray-400">
              No need to worry about gas or interacting with the blockchain. x402 allows any web developer to accept crypto payments without the complexity having to interact with the blockchain.
            </p>
          </div>
        </div>

        {/* Code Example */}
        <div className="bg-zinc-900 p-8 rounded-lg border border-zinc-800 mb-20">
          <h2 className="text-2xl font-bold mb-4">Simple Integration</h2>
          <pre className={`bg-black p-4 rounded-lg overflow-x-auto ${robotoMono.className}`}>
            <code className="text-white-400">
              {`
app.use("/your-route", paymentMiddleware("$0.10", myAddress));
// thats all!`}
            </code>
          </pre>
        </div>

        {/* Call to Action */}
        <div className="text-center">
          <h2 className="text-4xl font-bold mb-6">Learn More</h2>
          <p className="text-xl text-gray-300 mb-8">
            Checkout examples, or read the spec on Github.
          </p>
          <div className="space-x-4">
            <button className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-8 rounded-lg text-lg transition-all">
              Documentation
            </button>
            <button className="border border-blue-500 text-blue-500 hover:bg-blue-500 hover:text-white font-bold py-3 px-8 rounded-lg text-lg transition-all">
              View on GitHub
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
