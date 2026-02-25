#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({ name: "mcp-nhtsa", version: "1.0.0" });
const BASE = "https://api.nhtsa.gov";

async function nhtsa(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`NHTSA API ${res.status}: ${await res.text()}`);
  return res.json();
}

server.tool("decode_vin", "Decode a Vehicle Identification Number (VIN)", {
  vin: z.string().describe("17-character VIN"),
  year: z.number().optional().describe("Model year (improves accuracy)"),
}, async ({ vin, year }) => {
  const yearParam = year ? `&modelyear=${year}` : "";
  const data = await nhtsa(`${BASE}/vehicles/DecodeVinValues/${vin}?format=json${yearParam}`);
  const result = data.Results?.[0];
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});

server.tool("recalls", "Search vehicle recall campaigns", {
  make: z.string().optional().describe("Vehicle make (e.g., Toyota, Ford)"),
  model: z.string().optional().describe("Vehicle model (e.g., Camry, F-150)"),
  year: z.number().optional().describe("Model year"),
  campaign_number: z.string().optional().describe("NHTSA campaign number"),
}, async ({ make, model, year, campaign_number }) => {
  if (campaign_number) {
    const data = await nhtsa(`${BASE}/recalls/recallsByNHTSACampaignNumber/${campaign_number}?format=json`);
    return { content: [{ type: "text", text: JSON.stringify(data.results, null, 2) }] };
  }
  if (!make) throw new Error("Provide make or campaign_number");
  let path = `${BASE}/recalls/recallsByVehicle?make=${encodeURIComponent(make)}&format=json`;
  if (model) path += `&model=${encodeURIComponent(model)}`;
  if (year) path += `&modelYear=${year}`;
  const data = await nhtsa(path);
  return { content: [{ type: "text", text: JSON.stringify(data.results, null, 2) }] };
});

server.tool("complaints", "Search vehicle safety complaints", {
  make: z.string().describe("Vehicle make"),
  model: z.string().optional().describe("Vehicle model"),
  year: z.number().optional().describe("Model year"),
}, async ({ make, model, year }) => {
  let path = `${BASE}/complaints/complaintsByVehicle?make=${encodeURIComponent(make)}&format=json`;
  if (model) path += `&model=${encodeURIComponent(model)}`;
  if (year) path += `&modelYear=${year}`;
  const data = await nhtsa(path);
  return { content: [{ type: "text", text: JSON.stringify(data.results?.slice(0, 10), null, 2) }] };
});

server.tool("safety_ratings", "Get NCAP crash test safety ratings", {
  make: z.string().optional().describe("Vehicle make"),
  model: z.string().optional().describe("Vehicle model"),
  year: z.number().optional().describe("Model year"),
  vehicle_id: z.number().optional().describe("NHTSA Vehicle ID"),
}, async ({ make, model, year, vehicle_id }) => {
  if (vehicle_id) {
    const data = await nhtsa(`${BASE}/SafetyRatings/VehicleId/${vehicle_id}?format=json`);
    return { content: [{ type: "text", text: JSON.stringify(data.Results, null, 2) }] };
  }
  if (!year) throw new Error("Provide year or vehicle_id");
  let path = `${BASE}/SafetyRatings/modelyear/${year}`;
  if (make) path += `/make/${encodeURIComponent(make)}`;
  if (model) path += `/model/${encodeURIComponent(model)}`;
  const data = await nhtsa(`${path}?format=json`);
  return { content: [{ type: "text", text: JSON.stringify(data.Results, null, 2) }] };
});

server.tool("get_makes", "Get vehicle makes for a year", {
  year: z.number().describe("Model year"),
  vehicle_type: z.string().optional().describe("Vehicle type (Passenger Car, Truck, etc.)"),
}, async ({ year, vehicle_type }) => {
  let path = `${BASE}/vehicles/GetMakesForVehicleType/${vehicle_type || "Passenger Car"}?format=json`;
  const data = await nhtsa(path);
  return { content: [{ type: "text", text: JSON.stringify(data.Results?.slice(0, 50), null, 2) }] };
});

const transport = new StdioServerTransport();
await server.connect(transport);
