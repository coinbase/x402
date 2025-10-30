import React from "react";
import { useSignInWithEmail, useVerifyEmailOTP } from "@coinbase/cdp-hooks";
import { useCallback, useMemo, useState } from "react";

/**
 * A multi-step authentication component that handles email-based sign-in flow.
 *
 * The component manages three states:
 * 1. Initial state: Displays a welcome screen with a sign-in button
 * 2. Email input: Collects and validates the user's email address
 * 3. OTP verification: Validates the one-time password sent to the user's email
 *
 * Features:
 * - Email validation using regex
 * - 6-digit OTP validation
 * - Loading states during API calls
 * - Error handling for failed authentication attempts
 * - Cancelable workflow with state reset
 *
 * @returns {JSX.Element} The rendered sign-in form component
 */
export default function SignIn() {
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [flowId, setFlowId] = useState("");
  const [step, setStep] = useState<"email" | "otp">("email");
  const [isLoading, setIsLoading] = useState(false);

  const emailIsValid = useMemo(() => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }, [email]);

  const otpIsValid = useMemo(() => {
    return otp.length === 6;
  }, [otp]);

  const signIn = useSignInWithEmail();
  const verifyEmailOTP = useVerifyEmailOTP();

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const { flowId } = await signIn({
        email,
      });

      setFlowId(flowId);
      setIsLoading(false);
      setStep("otp");
    } catch (error) {
      console.error(error);
      setIsLoading(false);
    }
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      await verifyEmailOTP({
        flowId,
        otp,
      });

      handleClose();
    } catch (error) {
      console.error(error);
      setIsLoading(false);
    }
  };

  const handleClose = useCallback(() => {
    setStep("email");
    setEmail("");
    setOtp("");
    setFlowId("");
  }, []);

  return (
    <div style={{ width: "100%" }}>
      {step === "email" && (
        <form onSubmit={handleEmailSubmit}>
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div>
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                required
                onChange={e => setEmail(e.target.value)}
                style={{ width: "100%", padding: "0.5rem" }}
              />
            </div>
            <button
              type="submit"
              disabled={isLoading || !emailIsValid}
              style={{ width: "100%", padding: "0.5rem" }}
            >
              {isLoading ? "Sending Code..." : "Continue"}
            </button>
          </div>
        </form>
      )}
      {step === "otp" && (
        <form onSubmit={handleOtpSubmit}>
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div>
              <label htmlFor="otp">Six-digit Verification Code</label>
              <input
                id="otp"
                type="number"
                placeholder="123456"
                minLength={6}
                maxLength={6}
                value={otp}
                onChange={e => setOtp(e.target.value)}
                required
                style={{ width: "100%", padding: "0.5rem" }}
              />
            </div>
            <p>We sent a code to {email}</p>
            <button
              type="submit"
              disabled={isLoading || !otpIsValid}
              style={{ width: "100%", padding: "0.5rem" }}
            >
              {isLoading ? "Verifying..." : "Verify"}
            </button>
            <button
              type="button"
              onClick={handleClose}
              style={{ width: "100%", padding: "0.5rem", background: "transparent" }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
