import asyncio
import sys
from pathlib import Path

async def test_gateway():
    try:
        from cathedral.zkhydra_gateway import ZkHydraGateway
    except ImportError:
        print("Failed to import ZkHydraGateway")
        sys.exit(1)

    gw = ZkHydraGateway()
    print("Gateway instantiated successfully.")

if __name__ == "__main__":
    asyncio.run(test_gateway())
