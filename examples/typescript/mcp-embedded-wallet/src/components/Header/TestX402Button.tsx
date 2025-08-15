import { Button } from "../Button";
import { makeX402Request } from "../../utils/x402Client";

/**
 * Button to send a test x402 request to the demo endpoint.
 *
 * @returns {JSX.Element} Rendered test button.
 */
export function TestX402Button() {
  const handleTestX402 = async () => {
    try {
      await makeX402Request({
        baseURL: "https://x402-demo-discovery-endpoint.vercel.app",
        path: "/protected",
        method: "GET",
        correlationId: `manual-test-${Date.now()}`,
      });
    } catch (e) {
      // Errors will be reflected in the Operations list via existing handlers
      console.error(e);
    }
  };

  return (
    <Button size="2" radius="large" onClick={handleTestX402}>
      Test x402
    </Button>
  );
}
