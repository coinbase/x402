import { config } from "dotenv";
import { useFacilitator } from "x402/verify";
import { facilitator } from "@coinbase/x402";

config();

const { list } = useFacilitator(facilitator);

list().then(response => {
  console.log('\nDiscovered X402 Resources:');
  console.log('========================\n');

  response.items.forEach((item, index) => {
    console.log(`Resource ${index + 1}:`);
    console.log(`  Resource URL: ${item.resource}`);
    console.log(`  Type: ${item.type}`);
    console.log(`  Last Updated: ${new Date(item.lastUpdated).toLocaleString()}`);
    console.log(`  X402 Version: ${item.x402Version}`);
    console.log(`  Accepts: ${JSON.stringify(item.accepts, null, 2)}`);
    if (item.metadata && Object.keys(item.metadata).length > 0) {
      console.log(`  Metadata: ${JSON.stringify(item.metadata, null, 2)}`);
    }
    console.log('------------------------\n');
  });
})