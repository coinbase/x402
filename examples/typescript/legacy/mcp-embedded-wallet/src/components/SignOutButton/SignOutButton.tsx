import { useSignOut } from "@coinbase/cdp-hooks";
import { type ReactNode } from "react";

import { Button } from "../Button";

export type SignOutButtonProps = {
  children?: ReactNode;
  onSuccess?: () => void;
};

/**
 * A button component that handles user sign-out functionality.
 * Uses CDP hooks for sign-out and supports custom content and success callback.
 *
 * @param root0 - Component props
 * @param root0.children - Optional custom content to display in the button
 * @param root0.onSuccess - Optional callback function to execute after successful sign-out
 * @returns {JSX.Element} The rendered sign-out button component
 */
export function SignOutButton({ children, onSuccess }: SignOutButtonProps) {
  const { signOut } = useSignOut();

  const handleSignOut = async () => {
    await signOut();
    onSuccess?.();
  };
  return (
    <Button variant="surface" onClick={handleSignOut}>
      {children || "Sign out"}
    </Button>
  );
}
