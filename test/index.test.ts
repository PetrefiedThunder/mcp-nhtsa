import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

type ToolHandler = (args: Record<string, unknown>) => Promise<{ content: { text: string }[] }>;
const { tools } = vi.hoisted(() => ({ tools: new Map<string, ToolHandler>() }));

vi.mock("@modelcontextprotocol/sdk/server/mcp.js", () => ({
  McpServer: class {
    tool(name: string, _description: string, _schema: unknown, handler: ToolHandler) {
      tools.set(name, handler);
    }
    async connect() {}
  },
}));
vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({
  StdioServerTransport: class {},
}));

await import("../src/index.ts");

afterEach(() => vi.unstubAllGlobals());

describe("NHTSA MCP tools", () => {
  it("registers the expected tools", () => {
    expect([...tools.keys()]).toEqual([
      "decode_vin", "recalls", "complaints", "safety_ratings", "get_makes",
    ]);
  });

  it("encodes recall search parameters and returns results", async () => {
    const fixture = JSON.parse(readFileSync(new URL("./fixtures/recallsByVehicle-land-rover-range-rover-2024.json", import.meta.url), "utf8"));
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => fixture.response,
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await tools.get("recalls")!({ make: "Land Rover", model: "Range Rover", year: 2024 });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.nhtsa.gov/recalls/recallsByVehicle?make=Land%20Rover&format=json&model=Range%20Rover&modelYear=2024",
    );
    const recalls = JSON.parse(result.content[0].text);
    expect(recalls).toEqual(fixture.response.results);
    expect(recalls[0]).toHaveProperty("NHTSACampaignNumber", fixture.response.results[0].NHTSACampaignNumber);
    expect(recalls[0]).toHaveProperty("Make", "LAND ROVER");
    expect(recalls[0]).toHaveProperty("Component", fixture.response.results[0].Component);
    expect(recalls[0]).toHaveProperty("Summary", fixture.response.results[0].Summary);
  });

  it("rejects a recall search without make or campaign number", async () => {
    await expect(tools.get("recalls")!({})).rejects.toThrow("Provide make or campaign_number");
  });
});
