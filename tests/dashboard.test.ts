import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_DRAFT, type Project } from "../lib/projects/model";
import {
  dashboardCounts,
  dashboardProjects,
  PROJECT_STATUS,
  projectSeconds,
  durationLabel,
} from "../lib/projects/dashboard";
import { initialProject } from "../lib/titles/templates";
const make = (
  id: string,
  status: Project["status"],
  title: string,
  date = "2026-11-01T00:00:00Z",
): Project => ({
  ...EMPTY_DRAFT,
  id,
  title,
  status,
  revision: 1,
  createdAt: date,
  updatedAt: date,
});
test("dashboard counts reflect stored projects, never invented exports or balances", () => {
  const projects = [
    make("1", "completed", "Indian Movie"),
    make("2", "failed", "Untitled project"),
    make("3", "cancelled", "Cancelled"),
    make("4", "processing", "Running"),
  ];
  assert.deepEqual(dashboardCounts(projects), {
    all: 4,
    completed: 1,
    attention: 1,
    draft: 0,
  });
  assert.deepEqual(dashboardCounts([]), {
    all: 0,
    completed: 0,
    attention: 0,
    draft: 0,
  });
  assert.match(PROJECT_STATUS.failed.description, /reconnect local media/i);
  assert.match(
    PROJECT_STATUS.processing.description,
    /do not continue in the cloud/i,
  );
  assert.equal(PROJECT_STATUS.completed.action, "Reopen project");
});
test("project search, filters and stable sorting leave the source list intact", () => {
  const projects = [
    make("2", "failed", "Untitled project", "2026-10-31T00:00:00Z"),
    make("1", "completed", "Indian Movie"),
  ];
  assert.deepEqual(
    dashboardProjects(projects, " INDIAN ", "all", "recent").map((p) => p.id),
    ["1"],
  );
  assert.deepEqual(
    dashboardProjects(projects, "", "attention", "recent").map((p) => p.id),
    ["2"],
  );
  assert.deepEqual(
    dashboardProjects(projects, "", "completed", "recent").map((p) => p.id),
    ["1"],
  );
  assert.deepEqual(dashboardProjects(projects, "", "draft", "recent"), []);
  assert.deepEqual(
    dashboardProjects(projects, "", "all", "recent").map((p) => p.id),
    ["1", "2"],
  );
  assert.deepEqual(
    dashboardProjects(projects, "", "all", "oldest").map((p) => p.id),
    ["2", "1"],
  );
  assert.deepEqual(
    dashboardProjects(projects, "", "all", "name").map((p) => p.id),
    ["1", "2"],
  );
  assert.deepEqual(
    projects.map((p) => p.id),
    ["2", "1"],
  );
});
test("project duration uses saved composition ranges or actual title scenes", () => {
  const project = make("1", "draft", "Edit");
  assert.equal(durationLabel(projectSeconds(project)), "No media attached");
  assert.equal(durationLabel(NaN), "No media attached");
  assert.equal(durationLabel(3723.1), "1:02:03");
  project.settings = { ...project.settings, range: { start: 10, end: 42 } };
  assert.equal(projectSeconds(project), 32);
  project.titles = { version: 1, document: initialProject(), sources: [] };
  assert.equal(
    projectSeconds(project),
    project.titles.document.scenes.reduce((n, s) => n + s.duration, 0),
  );
});
