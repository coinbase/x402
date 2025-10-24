import React from "react";
import { Button as RadixButton, ButtonProps } from "@radix-ui/themes";

export const Button = React.forwardRef<React.ComponentRef<typeof RadixButton>, ButtonProps>(
  ({ children, ...props }, ref) => {
    return (
      <RadixButton ref={ref} style={{ cursor: "pointer" }} radius="large" {...props}>
        {children}
      </RadixButton>
    );
  },
);

Button.displayName = "Button";
