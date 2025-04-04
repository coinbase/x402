const esbuild = require("esbuild");
const path = require("path");

const packageDir = path.resolve(__dirname);
const outputDir = path.join(packageDir, "dist/paywall-component");

const buildOptions = {
  entryPoints: [path.join(packageDir, "src/paywall/component/index.ts")],
  bundle: true,
  sourcemap: true,
  target: ["es2020"],
  tsconfig: path.join(packageDir, "src/paywall/component/tsconfig.json"),
};

async function build() {
  try {
    await esbuild.build({
      ...buildOptions,
      outfile: path.join(outputDir, "x402-paywall.js"),
      format: "esm",
      minify: false,
    });

    await esbuild.build({
      ...buildOptions,
      outfile: path.join(outputDir, "x402-paywall.min.js"),
      format: "esm",
      minify: true,
    });

    console.log("Build complete!");
  } catch (error) {
    console.error("Build failed:", error);
    process.exit(1);
  }
}

if (process.argv.includes("--watch")) {
  esbuild
    .build({
      ...buildOptions,
      outfile: path.join(outputDir, "x402-paywall.js"),
      format: "esm",
      watch: true,
    })
    .then(() => console.log("Watching for changes..."));
} else {
  build();
}
