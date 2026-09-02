import { lineAutomationDecision, lineAutomationMessage } from './line-automation.ts';

function fakeDb(result: { data?: Record<string, unknown> | null; error?: unknown }) {
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () => ({ data: result.data ?? null, error: result.error ?? null }),
  };
  return { from: () => query };
}

Deno.test('enabled LINE automation is allowed', async () => {
  const decision = await lineAutomationDecision(fakeDb({
    data: { automation_key: 'essential', enabled: true, protected: false },
  }), 'essential');
  if (!decision.allowed || decision.reason !== 'enabled') throw new Error('enabled control must run');
});

Deno.test('disabled protected LINE automation stays disabled', async () => {
  const decision = await lineAutomationDecision(fakeDb({
    data: { automation_key: 'coordinator', enabled: false, protected: true },
  }), 'coordinator');
  if (decision.allowed || decision.reason !== 'disabled_by_policy') {
    throw new Error('protected must lock editing, not override enabled');
  }
});

Deno.test('disabled editable LINE automation is blocked', async () => {
  const decision = await lineAutomationDecision(fakeDb({
    data: { automation_key: 'optional', enabled: false, protected: false },
  }), 'optional');
  if (decision.allowed || decision.reason !== 'disabled_by_admin') throw new Error('disabled control must not run');
});

Deno.test('uncatalogued control fails open during rollout', async () => {
  const decision = await lineAutomationDecision(fakeDb({ data: null }), 'new-job');
  if (!decision.allowed || decision.reason !== 'not_catalogued') throw new Error('new controls must remain rollout-safe');
});

Deno.test('custom LINE copy overrides fallback only when non-empty', () => {
  if (lineAutomationMessage({ control: { custom_message: '  ข้อความใหม่  ' } }, 'เดิม') !== 'ข้อความใหม่') {
    throw new Error('custom copy should be trimmed and used');
  }
  if (lineAutomationMessage({ control: { custom_message: '   ' } }, 'เดิม') !== 'เดิม') {
    throw new Error('blank custom copy should use fallback');
  }
});
