import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ApprovalModal, type ApprovalRequest } from "./ApprovalModal";

const apiMock = vi.hoisted(() => vi.fn());
vi.mock("../api", () => ({ api: apiMock }));

const mockApproval: ApprovalRequest = {
  kind: "broll",
  stepId: "review_approval",
  proposalDigest: "a1b2c3d4e5f67890",
  prompt: "ตรวจและอนุมัติ B-roll สำหรับแต่ละช่วงบทสัมภาษณ์",
  items: [
    {
      segmentId: "interview_01",
      rationale: "Matched campus visuals",
      candidates: [
        { assetId: "media_0001", path: "/assets/footage/campus1.jpg", relativePath: "footage/campus1.jpg", kind: "image", thumbnailPath: "/cache/media_0001.jpg" },
        { assetId: "media_0002", path: "/assets/footage/campus2.jpg", relativePath: "footage/campus2.jpg", kind: "image" }
      ],
      selectedAssetId: "media_0001"
    }
  ]
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

test("renders ApprovalModal with candidates and handles approval decision", async () => {
  const onDecided = vi.fn();
  const onClose = vi.fn();

  apiMock.mockResolvedValueOnce({ ok: true, runId: "test-run" });

  render(
    <ApprovalModal
      runId="test-run"
      stepId="review_approval"
      approval={mockApproval}
      csrfToken="mock-csrf"
      onClose={onClose}
      onDecided={onDecided}
    />
  );

  expect(screen.getByText(/Operator Approval Required/i)).toBeDefined();
  expect(screen.getByText(/ตรวจและอนุมัติ B-roll/i)).toBeDefined();
  expect(screen.getByText(/ฉากสัมภาษณ์: interview_01/i)).toBeDefined();
  expect(screen.getByText("footage/campus1.jpg")).toBeDefined();
  expect(screen.getByText("footage/campus2.jpg")).toBeDefined();
  expect(screen.getByRole("img", { name: "B-roll footage/campus1.jpg" })).toHaveAttribute("src", "/api/v1/runs/test-run/approvals/review_approval/candidates/media_0001/thumbnail");

  // Click on the second candidate
  fireEvent.click(screen.getByText("footage/campus2.jpg"));

  // Click Approve button
  const approveBtn = screen.getByText(/ยืนยันอนุมัติ B-Roll/i);
  fireEvent.click(approveBtn);

  await waitFor(() => {
    expect(onDecided).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});

test("renders ApprovalModal for cover_card with Thai labels and submits approval", async () => {
  const onDecided = vi.fn();
  const onClose = vi.fn();

  apiMock.mockResolvedValueOnce({ ok: true, runId: "cover-run" });

  const coverApproval: ApprovalRequest = {
    kind: "cover_card",
    stepId: "sb_cover_1__review",
    proposalDigest: "11223344556677889900aabbccddeeff",
    prompt: "ตรวจและอนุมัติภาพปก: PSU Documentary",
    coverPhoto: "/assets/input/portrait.jpg",
    items: [
      {
        segmentId: "cover_1",
        segmentDialogue: "PSU Documentary",
        rationale: "ตรวจและอนุมัติภาพปกสำหรับ cover_1",
        candidates: [
          {
            assetId: "cover_cover_1",
            path: "/outputs/media/storyboard-covers/cover_1/generated.png",
            relativePath: "media/storyboard-covers/cover_1/generated.png",
            kind: "cover_card",
            thumbnailPath: "/outputs/media/storyboard-covers/cover_1/generated.png"
          }
        ],
        selectedAssetId: "cover_cover_1"
      }
    ]
  };

  render(
    <ApprovalModal
      runId="cover-run"
      stepId="sb_cover_1__review"
      approval={coverApproval}
      csrfToken="mock-csrf"
      onClose={onClose}
      onDecided={onDecided}
    />
  );

  expect(screen.getByText(/Operator Approval Required/i)).toBeDefined();
  expect(screen.getByText(/ตรวจและอนุมัติภาพปก: PSU Documentary/i)).toBeDefined();
  expect(screen.getByText(/ภาพปก: cover_1/i)).toBeDefined();
  expect(screen.getByText('🗣 "PSU Documentary"')).toBeDefined();
  expect(screen.getByText(/ภาพนิ่งปกที่เลือก \(Selected Cover Photo\):/i)).toBeDefined();
  expect(screen.getByText("/assets/input/portrait.jpg")).toBeDefined();
  expect(screen.getByRole("img", { name: "ภาพปก media/storyboard-covers/cover_1/generated.png" })).toHaveAttribute(
    "src",
    "/api/v1/runs/cover-run/approvals/sb_cover_1__review/candidates/cover_cover_1/thumbnail"
  );

  const approveBtn = screen.getByText(/ยืนยันอนุมัติภาพปก \(Approve Cover\)/i);
  fireEvent.click(approveBtn);

  await waitFor(() => {
    expect(onDecided).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});

