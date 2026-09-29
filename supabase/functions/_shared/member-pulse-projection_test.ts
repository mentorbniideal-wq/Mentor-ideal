import { assertEquals } from "jsr:@std/assert";
import { projectPulseBoard } from "./member-pulse-projection.ts";

Deno.test("Growth Pulse projection omits answers, private text and absent members", () => {
  const result = projectPulseBoard([
    {
      id: "a",
      member_id: "m-a",
      stage: "onboarding",
      due_on: "2026-09-29",
      status: "completed",
      answers: { happiness: 2, need: "private" },
      free_text: "secret",
      completed_at: "2026-09-29T00:00:00Z",
    },
    {
      id: "b",
      member_id: "m-b",
      stage: "renewal",
      due_on: "2026-09-30",
      status: "due",
    },
  ], [{ id: "m-a", name: "TEST_A" }]);
  assertEquals(result.campaigns.length, 1);
  assertEquals(result.summary, { due: 0, waiting: 0, completed: 1 });
  assertEquals("answers" in result.campaigns[0], false);
  assertEquals("free_text" in result.campaigns[0], false);
  assertEquals(JSON.stringify(result).includes("secret"), false);
});
