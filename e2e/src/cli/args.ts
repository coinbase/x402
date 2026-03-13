import { TestFilters } from './filters';
import type { NetworkMode } from '../networks/networks';

/**
 * Parse command-line arguments
 * Used primarily for CI/GitHub workflows
 */
export interface ParsedArgs {
  mode: 'interactive' | 'programmatic';
  verbose: boolean;
  logFile?: string;
  outputJson?: string;
  filters: TestFilters;
  showHelp: boolean;
  minimize: boolean;
  networkMode?: NetworkMode;  // undefined = prompt user, set = skip prompt
  parallel: boolean;
  concurrency: number;
}

export function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);

  // Help flag
  if (args.includes('-h') || args.includes('--help')) {
    return {
      mode: 'interactive',
      verbose: false,
      filters: {},
      showHelp: true,
      minimize: false,
      parallel: false,
      concurrency: 4,
    };
  }

  // If -i/--interactive is passed, enter interactive mode; otherwise default to programmatic
  const interactive = args.includes('-i') || args.includes('--interactive');
  const mode: 'interactive' | 'programmatic' = interactive ? 'interactive' : 'programmatic';

  // Parse verbose
  const verbose = args.includes('-v') || args.includes('--verbose');

  // Parse log file
  const logFile = args.find(arg => arg.startsWith('--log-file='))?.split('=')[1];

  // Parse JSON output file
  const outputJson = args.find(arg => arg.startsWith('--output-json='))?.split('=')[1];

  // Parse minimize flag
  const minimize = args.includes('--min');

  // Parse parallel mode flags
  const parallel = args.includes('--parallel');
  const concurrencyArg = args.find(arg => arg.startsWith('--concurrency='))?.split('=')[1];
  const concurrency = concurrencyArg ? parseInt(concurrencyArg, 10) : 4;

  // Parse network mode (optional - if not set, will prompt in interactive mode)
  let networkMode: NetworkMode | undefined;
  if (args.includes('--mainnet')) {
    networkMode = 'mainnet';
  } else if (args.includes('--testnet')) {
    networkMode = 'testnet';
  }

  // Parse filters (comma-separated lists)
  const transports = parseListArg(args, '--transport');
  const facilitators = parseListArg(args, '--facilitators');
  const servers = parseListArg(args, '--servers');
  const clients = parseListArg(args, '--clients');
  const extensions = parseListArg(args, '--extensions');
  const versions = parseListArg(args, '--versions')?.map(v => parseInt(v));
  const families = parseListArg(args, '--families');

  return {
    mode,
    verbose,
    logFile,
    outputJson,
    filters: {
      transports,
      facilitators,
      servers,
      clients,
      extensions,
      versions,
      protocolFamilies: families,
    },
    showHelp: false,
    minimize,
    networkMode,
    parallel,
    concurrency,
  };
}

function parseListArg(args: string[], argName: string): string[] | undefined {
  const arg = args.find(a => a.startsWith(`${argName}=`));
  if (!arg) return undefined;
  const value = arg.split('=')[1];
  return value.split(',').map(v => v.trim()).filter(v => v.length > 0);
}

export function printHelp(): void {
  console.log('Usage: pnpm test [options]');
  console.log('');
  console.log('Default (headless, runs all tests):');
  console.log('  pnpm test                  Run ALL tests headlessly on testnet');
  console.log('  pnpm test -v               Run all tests with verbose logging');
  console.log('');
  console.log('Interactive Mode:');
  console.log('  pnpm test -i               Launch interactive prompt mode');
  console.log('  pnpm test --interactive    Launch interactive prompt mode');
  console.log('');
  console.log('Network Selection:');
  console.log('  --testnet                  Use testnet networks (Base Sepolia + Solana Devnet) [default]');
  console.log('  --mainnet                  Use mainnet networks (Base + Solana) ⚠️  Real funds!');
  console.log('');
  console.log('Filters (headless mode):');
  console.log('  --transport=<list>         Comma-separated transports (e.g., http,mcp)');
  console.log('  --facilitators=<list>      Comma-separated facilitator names');
  console.log('  --servers=<list>           Comma-separated server names');
  console.log('  --clients=<list>           Comma-separated client names');
  console.log('  --extensions=<list>        Comma-separated extensions (e.g., bazaar)');
  console.log('  --versions=<list>          Comma-separated version numbers (e.g., 1,2)');
  console.log('  --families=<list>          Comma-separated protocol families (e.g., evm,svm)');
  console.log('');
  console.log('Options:');
  console.log('  -i, --interactive          Launch interactive prompt mode');
  console.log('  -v, --verbose              Enable verbose logging');
  console.log('  --log-file=<path>          Save verbose output to file');
  console.log('  --output-json=<path>       Write structured JSON results to file');
  console.log('  --min                      Minimize tests (coverage-based skipping)');
  console.log('  --parallel                 Run combos concurrently (per-family lanes)');
  console.log('  --concurrency=<N>          Max concurrent combos (default: 4, requires --parallel)');
  console.log('  -h, --help                 Show this help message');
  console.log('');
  console.log('Parallelism:');
  console.log('  EVM, SVM, APTOS, and STELLAR run in independent lanes automatically.');
  console.log('  Within each family, provide comma-delimited plural keys to add sub-lanes:');
  console.log('    CLIENT_EVM_PRIVATE_KEYS=0xkey1,0xkey2');
  console.log('    FACILITATOR_EVM_PRIVATE_KEYS=0xfkey1,0xfkey2');
  console.log('  Client and facilitator key counts must match per family.');
  console.log('');
  console.log('Examples:');
  console.log('  pnpm test                                           # Run all tests headlessly (testnet)');
  console.log('  pnpm test -i                                        # Interactive mode');
  console.log('  pnpm test --mainnet                                 # Use mainnet (real funds!)');
  console.log('  pnpm test --min -v                                  # Minimize with verbose');
  console.log('  pnpm test --transport=mcp                           # MCP transport only');
  console.log('  pnpm test --mainnet --facilitators=go --servers=express  # Mainnet with filters');
  console.log('  pnpm test --min --parallel -v                       # Parallel mode');
  console.log('  pnpm test --min --parallel --concurrency=8 -v       # Higher concurrency');
  console.log('');
  console.log('Note: --mainnet requires funded wallets with real tokens!');
  console.log('');
}
