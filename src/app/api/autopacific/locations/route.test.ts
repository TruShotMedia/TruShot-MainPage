import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";
import { GET } from "./route";
const mocks=vi.hoisted(()=>({context:vi.fn(),service:vi.fn(),rpc:vi.fn(),fetch:vi.fn()}));
vi.mock("@/lib/data/admin",()=>({getProductionContext:mocks.context}));
vi.mock("@/lib/supabase/service",()=>({createServiceClient:mocks.service}));
const request=(query="Brisbane")=>new Request(`https://example.test/api/autopacific/locations?q=${encodeURIComponent(query)}`);
describe("private location search",()=> {
  beforeEach(()=> {vi.resetAllMocks();vi.stubEnv("GEOAPIFY_API_KEY","private-test-key");vi.stubGlobal("fetch",mocks.fetch);mocks.context.mockResolvedValue({claims:{sub:"user"}});mocks.service.mockReturnValue({rpc:mocks.rpc});mocks.rpc.mockResolvedValue({data:true,error:null});});
  afterEach(()=> {vi.unstubAllEnvs();vi.unstubAllGlobals();});
  it("requires authenticated MFA-checked workspace context before searching",async()=> {
    mocks.context.mockResolvedValue(null);expect((await GET(request())).status).toBe(401);expect(mocks.service).not.toHaveBeenCalled();expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("rejects short and excessively long queries without consuming quota",async()=> {
    expect((await GET(request("ab"))).status).toBe(400);expect((await GET(request("a".repeat(201)))).status).toBe(400);expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("fails gracefully when the private key is absent",async()=> {
    vi.stubEnv("GEOAPIFY_API_KEY","");const response=await GET(request());expect(response.status).toBe(503);expect((await response.json()).code).toBe("NOT_CONFIGURED");expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("enforces the server budget and never calls the provider when exhausted",async()=> {
    mocks.rpc.mockResolvedValue({data:false,error:null});const response=await GET(request());expect(response.status).toBe(429);expect(response.headers.get("retry-after")).toBe("60");expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("biases Australia without excluding international addresses, strips invalid results, and never returns the key",async()=> {
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({results:[null,{formatted:"Melbourne, Australia",lat:-37.81,lon:144.96,result_type:"city"},{formatted:"Invalid",lat:999,lon:0}]})));
    const response=await GET(request("MEL"));const payload=await response.json();expect(payload.results).toHaveLength(1);expect(payload.results[0].precision).toBe("city");
    const url=mocks.fetch.mock.calls[0][0] as URL;expect(url.searchParams.get("text")).toContain("Melbourne");expect(url.searchParams.get("bias")).toBe("countrycode:au");expect(url.searchParams.has("filter")).toBe(false);
    expect(JSON.stringify(payload)).not.toContain("private-test-key");expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
  it("fails closed if quota storage fails and hides upstream URLs/errors",async()=> {
    mocks.rpc.mockResolvedValueOnce({error:new Error("secret")});expect((await GET(request())).status).toBe(503);expect(mocks.fetch).not.toHaveBeenCalled();
    mocks.fetch.mockRejectedValue(new Error("https://provider/?apiKey=private-test-key"));const response=await GET(request());expect(response.status).toBe(503);expect(JSON.stringify(await response.json())).not.toContain("private-test-key");
  });
});
