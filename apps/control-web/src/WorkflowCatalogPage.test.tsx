import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, test, vi } from "vitest";
import WorkflowCatalogPage from "./WorkflowCatalogPage";

afterEach(() => vi.unstubAllGlobals());

test("degrades clearly when the graph catalog endpoints are absent", async () => {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    if (String(input).endsWith("/health")) return new Response(JSON.stringify({ ok: true, csrfToken: "test" }), { status: 200 });
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
  }));
  render(<MemoryRouter><WorkflowCatalogPage/></MemoryRouter>);
  expect(await screen.findByRole("alert")).toHaveTextContent("Graph authoring API is unavailable");
  expect(screen.getByText(/Guided Form and Run Monitor are unaffected/)).toBeInTheDocument();
});
