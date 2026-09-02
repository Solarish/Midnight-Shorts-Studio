import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { CgBlockEditor, normalizeCgBlocksForMasterDuration, type CgBlock } from "./CgBlockEditor";

afterEach(cleanup);

test("normalizes enabled blocks to the master duration with an exact stable split", () => {
  const blocks: CgBlock[] = [
    { id: "first", type: "photo-stack", durationMs: 5000, enabled: true },
    { id: "second", type: "photo-collage", durationMs: 3800, enabled: true },
    { id: "off", type: "text-hold", durationMs: 4500, enabled: false }
  ];

  const normalized = normalizeCgBlocksForMasterDuration(blocks, 6_401);

  expect(normalized).toMatchObject([
    { id: "first", enabled: true, durationMs: 3201 },
    { id: "second", enabled: true, durationMs: 3200 },
    { id: "off", enabled: false, durationMs: 4500 }
  ]);
  expect(normalized.filter((block) => block.enabled).reduce((total, block) => total + block.durationMs, 0)).toBe(6_401);
});

test("uses manifest order while appending enabled blocks and removes from the tail", () => {
  const appended = normalizeCgBlocksForMasterDuration([], 25_300);
  expect(appended).toHaveLength(8);
  expect(appended.map((block) => block.type)).toEqual(["photo-stack", "photo-collage", "text-hold", "hero-strip", "portrait-row", "image-sweep", "outro", "fade-to-black"]);
  expect(appended.reduce((total, block) => total + block.durationMs, 0)).toBe(25_300);

  const reduced = normalizeCgBlocksForMasterDuration(appended, 3_200);
  expect(reduced).toHaveLength(1);
  expect(reduced[0]).toMatchObject({ id: appended[0]?.id, durationMs: 3200, enabled: true });
});

test("uses the left rail eye control to toggle a block without colliding with delete", () => {
  const onChange = vi.fn();
  render(<CgBlockEditor blocks={[{ id: "intro", type: "photo-stack", durationMs: 3200, enabled: true }]} onChange={onChange}/>);

  const deleteButton = screen.getByRole("button", { name: "Delete Photo Stack block" });
  expect(deleteButton).toHaveTextContent("×");
  expect(deleteButton).toHaveAttribute("title", "Delete Photo Stack block");
  const visibilityButton = screen.getByRole("button", { name: "Hide Photo Stack block" });
  expect(visibilityButton).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(visibilityButton);
  expect(onChange).toHaveBeenCalledWith([{ id: "intro", type: "photo-stack", durationMs: 3200, enabled: false }]);
  fireEvent.click(deleteButton);
  expect(onChange).toHaveBeenCalledWith([]);
});

test("persists the render-bound copy, look, media and motion block overrides", () => {
  const onChange = vi.fn();
  render(<CgBlockEditor blocks={[{ id: "intro", type: "photo-stack", durationMs: 3200, enabled: true, mediaOrder: [0, 2], visibleCount: 2 }]} onChange={onChange}/>);

  fireEvent.click(screen.getByText("Motion & media"));
  fireEvent.change(screen.getByLabelText("intro block text"), { target: { value: "CAROUSEL INTRO" } });
  expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ content: { text: "CAROUSEL INTRO" } })]);
  fireEvent.change(screen.getByLabelText("intro background color"), { target: { value: "#102030" } });
  expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ appearance: { backgroundColor: "#102030" } })]);
  fireEvent.change(screen.getByLabelText("intro image order"), { target: { value: "3, 1, 2" } });
  expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ mediaOrder: [2, 0, 1] })]);
  fireEvent.change(screen.getByLabelText("intro image order"), { target: { value: "3," } });
  expect(screen.getByLabelText("intro image order")).toHaveValue("3,");
  fireEvent.change(screen.getByLabelText("intro card scale"), { target: { value: "1.25" } });
  expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ appearance: { cardScale: 1.25 } })]);
  fireEvent.change(screen.getByLabelText("intro font"), { target: { value: "psu-stidti" } });
  expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ appearance: { fontFamily: "psu-stidti" } })]);
  fireEvent.change(screen.getByLabelText("intro text size"), { target: { value: "128" } });
  expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ appearance: { fontSizePx: 128 } })]);
  fireEvent.change(screen.getByLabelText("intro text position x"), { target: { value: "18" } });
  expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ appearance: { textPositionX: 18 } })]);
  fireEvent.change(screen.getByLabelText("intro text position y"), { target: { value: "-12" } });
  expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ appearance: { textPositionY: -12 } })]);
});

test("toggles text visibility independently from the block visibility eye", () => {
  const onChange = vi.fn();
  render(<CgBlockEditor blocks={[{ id: "intro", type: "photo-stack", durationMs: 3200, enabled: true, content: { text: "Intro" } }]} onChange={onChange}/>);

  fireEvent.click(screen.getByText("Motion & media"));
  const showText = screen.getByRole("checkbox", { name: "intro show text" });
  expect(showText).toBeChecked();
  fireEvent.click(showText);
  expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({
    enabled: true,
    content: { text: "Intro", showText: false }
  })]);
});
