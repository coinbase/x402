// Empty paywall HTML template. Content here is static but can be changed at runtime.
/**
 * Returns a base HTML template for the X402 paywall.
 * This template contains the structure for payment prompts, wallet connection,
 * and transaction details.
 *
 * @returns {string} HTML template string for the paywall
 */
export function getBaseTemplate(): string {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
        <title>Payment Required</title>
    </head>
    <body>
        <div id="root"></div>
    </body>
    </html>
  `;
}
