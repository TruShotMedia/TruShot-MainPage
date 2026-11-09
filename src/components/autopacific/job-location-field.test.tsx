// @vitest-environment jsdom
import { act } from "react";
import { createRoot,type Root } from "react-dom/client";
import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";
import { JobLocationField } from "./job-location-field";
import type { JobLocation } from "@/lib/job-location";
vi.mock("next/dynamic",()=>({default:()=>function MapMock(props:{onPick?:(lat:number,lon:number)=>void}) {return <button type="button" onClick={()=>props.onPick?.(-27.47,153.02)}>Map pin test</button>;}}));
const point:JobLocation={version:1,label:"Brisbane, Australia",latitude:-27.47,longitude:153.02,precision:"city",provider:"geoapify",attribution:"OpenStreetMap"};
describe("job location picker",()=> {
  let container:HTMLDivElement;let root:Root;const fetchMock=vi.fn();
  beforeEach(()=> {vi.useFakeTimers();(globalThis as typeof globalThis&{IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;container=document.createElement("div");document.body.append(container);root=createRoot(container);vi.stubGlobal("fetch",fetchMock);fetchMock.mockReset();});
  afterEach(async()=> {await act(async()=>root.unmount());container.remove();vi.useRealTimers();vi.unstubAllGlobals();});
  const input=()=>container.querySelector<HTMLInputElement>('[role="combobox"]')!;
  const hidden=()=>container.querySelector<HTMLInputElement>('[name="location_details"]')!;
  async function type(text:string) {await act(async()=> {Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(input(),text);input().dispatchEvent(new Event("input",{bubbles:true}));});}
  async function advance(ms=500) {await act(async()=>vi.advanceTimersByTimeAsync(ms));}
  it("does not search on mount, and clears a stale pin as soon as text changes",async()=> {
    await act(async()=>root.render(<form><JobLocationField initialText={point.label} initialLocation={point}/></form>));await advance();expect(fetchMock).not.toHaveBeenCalled();expect(JSON.parse(hidden().value)).toEqual(point);
    await type("Another location");expect(hidden().value).toBe("");expect(input().value).toBe("Another location");
  });
  it("debounces search and supports keyboard selection of an approximate location",async()=> {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({results:[point]})));
    await act(async()=>root.render(<form><JobLocationField/></form>));await type("Bris");await advance(200);expect(fetchMock).not.toHaveBeenCalled();await type("Brisbane");await advance();expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async()=>input().dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowDown",bubbles:true})));
    await act(async()=>input().dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true})));
    expect(input().value).toBe(point.label);expect(JSON.parse(hidden().value)).toEqual(point);expect(container.textContent).toContain("Approximate area");
  });
  it("keeps free text usable when the provider is not connected",async()=> {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({error:"Address search isn’t connected yet. You can still enter a location or drop a pin."}),{status:503}));
    await act(async()=>root.render(<form><JobLocationField/></form>));await type("Glass House");await advance();expect(container.textContent).toContain("isn’t connected");expect(input().checkValidity()).toBe(true);expect(new FormData(container.querySelector("form")!).get("location")).toBe("Glass House");
  });
  it("ignores an aborted response, never replacing newer results with older suggestions",async()=> {
    let resolveFirst!:(value:Response)=>void;fetchMock.mockReturnValueOnce(new Promise(resolve=>{resolveFirst=resolve;})).mockResolvedValue(new Response(JSON.stringify({results:[point]})));
    await act(async()=>root.render(<JobLocationField/>));await type("Sydney");await advance();const signal=fetchMock.mock.calls[0][1].signal;await type("Brisbane");expect(signal.aborted).toBe(true);await advance();await act(async()=>resolveFirst(new Response(JSON.stringify({results:[{...point,label:"Old Sydney result"}]}))));expect(container.textContent).not.toContain("Old Sydney result");expect(container.textContent).toContain(point.label);
  });
  it("allows a manual pin without provider search and notifies a campaign editor",async()=> {
    const changed=vi.fn();await act(async()=>root.render(<JobLocationField initialText="My venue" onValueChange={changed}/>));
    await act(async()=>[...container.querySelectorAll("button")].find(button=>button.textContent==="Drop a pin")!.click());
    await act(async()=>[...container.querySelectorAll("button")].find(button=>button.textContent==="Map pin test")!.click());
    expect(JSON.parse(hidden().value)).toMatchObject({label:"My venue",provider:"manual",latitude:-27.47});expect(changed).toHaveBeenCalledWith("My venue",expect.objectContaining({precision:"manual"}));expect(fetchMock).not.toHaveBeenCalled();
  });
});
