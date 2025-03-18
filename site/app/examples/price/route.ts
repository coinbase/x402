type PriceRequest = {
  symbol: string;
};

export async function POST(req: Request) {
  const body: PriceRequest = await req.json();

  if (body.symbol.toLowerCase() === "btc") {
    return Response.json({ price: 90000 });
  }

  if (body.symbol.toLowerCase() === "eth") {
    return Response.json({ price: 3000 });
  }

  if (body.symbol.toLowerCase() === "sol") {
    return Response.json({ price: 125 });
  }

  return Response.json({ price: -1 });
}
