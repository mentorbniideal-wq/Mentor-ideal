import { evaluateOneToOneAccess, shouldCreateMentorNotification } from './one-to-one-workflow.ts';
const assertEquals=(actual:unknown,expected:unknown)=>{if(JSON.stringify(actual)!==JSON.stringify(expected))throw new Error(`${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);};

Deno.test('pilot access is enforced only when explicitly enabled and chapter rollout is off', () => {
  assertEquals(evaluateOneToOneAccess({ featureEnabled:false, emergencyStop:false, enforcePilotAccess:false, pilotIds:[] }, 'M1', false).allowed, true);
  assertEquals(evaluateOneToOneAccess({ featureEnabled:false, emergencyStop:false, enforcePilotAccess:true, pilotIds:['M1'] }, 'M1', false).allowed, true);
  assertEquals(evaluateOneToOneAccess({ featureEnabled:false, emergencyStop:false, enforcePilotAccess:true, pilotIds:['M1'] }, 'M2', false).reason, 'pilot_only');
  assertEquals(evaluateOneToOneAccess({ featureEnabled:true, emergencyStop:false, enforcePilotAccess:true, pilotIds:[] }, 'M2', false).allowed, true);
});

Deno.test('emergency stop preserves read-only access and blocks writes', () => {
  const control={ featureEnabled:true, emergencyStop:true, enforcePilotAccess:false, pilotIds:[] };
  assertEquals(evaluateOneToOneAccess(control, 'M1', true).allowed, true);
  assertEquals(evaluateOneToOneAccess(control, 'M1', false).reason, 'emergency_stop');
});

Deno.test('mentor notification is sent only for a new care item', () => {
  assertEquals(shouldCreateMentorNotification(null), true);
  assertEquals(shouldCreateMentorNotification('attention-1'), false);
});
