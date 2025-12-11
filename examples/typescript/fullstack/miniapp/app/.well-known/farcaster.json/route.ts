import { NextResponse } from "next/server";
import { minikitConfig } from "../../../minikit.config";

export async function GET() {
  // Return the manifest configuration
  // The manifest is served at /.well-known/farcaster.json
  return NextResponse.json(minikitConfig);
}
