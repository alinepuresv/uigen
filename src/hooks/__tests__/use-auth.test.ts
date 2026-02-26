import { describe, test, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAuth } from "@/hooks/use-auth";

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("@/actions", () => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
}));

vi.mock("@/lib/anon-work-tracker", () => ({
  getAnonWorkData: vi.fn(),
  clearAnonWork: vi.fn(),
}));

vi.mock("@/actions/get-projects", () => ({
  getProjects: vi.fn(),
}));

vi.mock("@/actions/create-project", () => ({
  createProject: vi.fn(),
}));

// ── Typed mock references ──────────────────────────────────────────────────

import { signIn as signInAction, signUp as signUpAction } from "@/actions";
import { getAnonWorkData, clearAnonWork } from "@/lib/anon-work-tracker";
import { getProjects } from "@/actions/get-projects";
import { createProject } from "@/actions/create-project";

const mockSignIn = vi.mocked(signInAction);
const mockSignUp = vi.mocked(signUpAction);
const mockGetAnonWorkData = vi.mocked(getAnonWorkData);
const mockClearAnonWork = vi.mocked(clearAnonWork);
const mockGetProjects = vi.mocked(getProjects);
const mockCreateProject = vi.mocked(createProject);

// ── Helpers ────────────────────────────────────────────────────────────────

const ANON_WORK = {
  messages: [{ role: "user", content: "hello" }],
  fileSystemData: { "/app.tsx": { type: "file", content: "export default () => <div/>" } },
};

const EXISTING_PROJECTS = [
  { id: "proj-1", name: "Project 1", createdAt: new Date(), updatedAt: new Date() },
  { id: "proj-2", name: "Project 2", createdAt: new Date(), updatedAt: new Date() },
];

const CREATED_PROJECT = {
  id: "new-proj",
  name: "New Design",
  messages: "[]",
  data: "{}",
  userId: "user-1",
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ── Test setup ─────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  // Default: no anon work, no existing projects
  mockGetAnonWorkData.mockReturnValue(null);
  mockGetProjects.mockResolvedValue([]);
  mockCreateProject.mockResolvedValue(CREATED_PROJECT);
});

// ── signIn ─────────────────────────────────────────────────────────────────

describe("signIn", () => {
  test("returns the action result on success", async () => {
    mockSignIn.mockResolvedValue({ success: true });

    const { result } = renderHook(() => useAuth());
    let returned: Awaited<ReturnType<typeof result.current.signIn>>;

    await act(async () => {
      returned = await result.current.signIn("user@example.com", "password123");
    });

    expect(returned!).toEqual({ success: true });
  });

  test("returns the action result on failure without redirecting", async () => {
    mockSignIn.mockResolvedValue({ success: false, error: "Invalid credentials" });

    const { result } = renderHook(() => useAuth());
    let returned: Awaited<ReturnType<typeof result.current.signIn>>;

    await act(async () => {
      returned = await result.current.signIn("user@example.com", "wrong");
    });

    expect(returned!).toEqual({ success: false, error: "Invalid credentials" });
    expect(mockPush).not.toHaveBeenCalled();
  });

  test("redirects to the migrated anon project when anon work exists", async () => {
    mockSignIn.mockResolvedValue({ success: true });
    mockGetAnonWorkData.mockReturnValue(ANON_WORK);
    mockCreateProject.mockResolvedValue({ ...CREATED_PROJECT, id: "anon-proj" });

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.signIn("user@example.com", "password123");
    });

    expect(mockCreateProject).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: ANON_WORK.messages,
        data: ANON_WORK.fileSystemData,
      })
    );
    expect(mockClearAnonWork).toHaveBeenCalledOnce();
    expect(mockPush).toHaveBeenCalledWith("/anon-proj");
  });

  test("does not migrate anon work when messages array is empty", async () => {
    mockSignIn.mockResolvedValue({ success: true });
    mockGetAnonWorkData.mockReturnValue({ messages: [], fileSystemData: {} });
    mockGetProjects.mockResolvedValue(EXISTING_PROJECTS);

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.signIn("user@example.com", "password123");
    });

    expect(mockClearAnonWork).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith("/proj-1");
  });

  test("redirects to the most recent existing project when no anon work", async () => {
    mockSignIn.mockResolvedValue({ success: true });
    mockGetProjects.mockResolvedValue(EXISTING_PROJECTS);

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.signIn("user@example.com", "password123");
    });

    expect(mockPush).toHaveBeenCalledWith("/proj-1");
    expect(mockCreateProject).not.toHaveBeenCalled();
  });

  test("creates a new project and redirects when no projects exist", async () => {
    mockSignIn.mockResolvedValue({ success: true });
    mockGetProjects.mockResolvedValue([]);
    mockCreateProject.mockResolvedValue({ ...CREATED_PROJECT, id: "brand-new" });

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.signIn("user@example.com", "password123");
    });

    expect(mockCreateProject).toHaveBeenCalledWith(
      expect.objectContaining({ messages: [], data: {} })
    );
    expect(mockPush).toHaveBeenCalledWith("/brand-new");
  });

  test("sets isLoading to true while in-flight and false when done", async () => {
    let resolveSignIn!: (v: { success: boolean }) => void;
    mockSignIn.mockReturnValue(new Promise((r) => (resolveSignIn = r)));

    const { result } = renderHook(() => useAuth());
    expect(result.current.isLoading).toBe(false);

    let signInPromise: Promise<unknown>;
    act(() => {
      signInPromise = result.current.signIn("user@example.com", "password123");
    });

    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      resolveSignIn({ success: false, error: "err" });
      await signInPromise;
    });

    expect(result.current.isLoading).toBe(false);
  });

  test("resets isLoading to false even when the action throws", async () => {
    mockSignIn.mockRejectedValue(new Error("network error"));

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.signIn("user@example.com", "password123").catch(() => {});
    });

    expect(result.current.isLoading).toBe(false);
  });
});

// ── signUp ─────────────────────────────────────────────────────────────────

describe("signUp", () => {
  test("returns the action result on success", async () => {
    mockSignUp.mockResolvedValue({ success: true });

    const { result } = renderHook(() => useAuth());
    let returned: Awaited<ReturnType<typeof result.current.signUp>>;

    await act(async () => {
      returned = await result.current.signUp("new@example.com", "password123");
    });

    expect(returned!).toEqual({ success: true });
  });

  test("returns the action result on failure without redirecting", async () => {
    mockSignUp.mockResolvedValue({ success: false, error: "Email already registered" });

    const { result } = renderHook(() => useAuth());
    let returned: Awaited<ReturnType<typeof result.current.signUp>>;

    await act(async () => {
      returned = await result.current.signUp("taken@example.com", "password123");
    });

    expect(returned!).toEqual({ success: false, error: "Email already registered" });
    expect(mockPush).not.toHaveBeenCalled();
  });

  test("migrates anon work after a successful sign-up", async () => {
    mockSignUp.mockResolvedValue({ success: true });
    mockGetAnonWorkData.mockReturnValue(ANON_WORK);
    mockCreateProject.mockResolvedValue({ ...CREATED_PROJECT, id: "anon-proj" });

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.signUp("new@example.com", "password123");
    });

    expect(mockCreateProject).toHaveBeenCalledWith(
      expect.objectContaining({ messages: ANON_WORK.messages })
    );
    expect(mockClearAnonWork).toHaveBeenCalledOnce();
    expect(mockPush).toHaveBeenCalledWith("/anon-proj");
  });

  test("redirects to most recent project when no anon work and projects exist", async () => {
    mockSignUp.mockResolvedValue({ success: true });
    mockGetProjects.mockResolvedValue(EXISTING_PROJECTS);

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.signUp("new@example.com", "password123");
    });

    expect(mockPush).toHaveBeenCalledWith("/proj-1");
  });

  test("creates a blank project and redirects for a brand-new user", async () => {
    mockSignUp.mockResolvedValue({ success: true });
    mockGetProjects.mockResolvedValue([]);
    mockCreateProject.mockResolvedValue({ ...CREATED_PROJECT, id: "fresh" });

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.signUp("new@example.com", "password123");
    });

    expect(mockCreateProject).toHaveBeenCalledWith(
      expect.objectContaining({ messages: [], data: {} })
    );
    expect(mockPush).toHaveBeenCalledWith("/fresh");
  });

  test("resets isLoading to false even when the action throws", async () => {
    mockSignUp.mockRejectedValue(new Error("network error"));

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.signUp("new@example.com", "password123").catch(() => {});
    });

    expect(result.current.isLoading).toBe(false);
  });
});

// ── initial state ──────────────────────────────────────────────────────────

describe("initial state", () => {
  test("isLoading starts as false", () => {
    const { result } = renderHook(() => useAuth());
    expect(result.current.isLoading).toBe(false);
  });

  test("exposes signIn and signUp as functions", () => {
    const { result } = renderHook(() => useAuth());
    expect(typeof result.current.signIn).toBe("function");
    expect(typeof result.current.signUp).toBe("function");
  });
});
