import { derivePairNextAction, pairStatusAfterContact } from './one-to-one-pair-action.ts';

function assertEquals(actual:unknown,expected:unknown){if(actual!==expected)throw new Error(`Expected ${expected}, received ${actual}`);}

const base={participantIds:['a','b'],deliveredMemberIds:['a','b'],scheduleStatus:'confirmed',guidedStatus:'completed',pairStatus:'verified',sharedReflectionMemberIds:['a','b'],openFollowUps:0,openMentorHelp:0};

Deno.test('pair action prioritizes incomplete delivery',()=>assertEquals(derivePairNextAction({...base,deliveredMemberIds:['a']}).code,'delivery_incomplete'));
Deno.test('pair action prioritizes mentor help after delivery',()=>assertEquals(derivePairNextAction({...base,openMentorHelp:1}).code,'mentor_help'));
Deno.test('unfinished pair action asks for schedule',()=>assertEquals(derivePairNextAction({...base,pairStatus:'matched',scheduleStatus:''}).code,'coordinate_schedule'));
Deno.test('completed handshake skips stale Guided Session and missing schedule',()=>{
  for(const pairStatus of ['verified','late_verified']){
    assertEquals(derivePairNextAction({...base,pairStatus,guidedStatus:'active',sharedReflectionMemberIds:[]}).code,'complete_reflection');
    assertEquals(derivePairNextAction({...base,pairStatus,scheduleStatus:'',guidedStatus:'draft'}).code,'complete');
  }
});
Deno.test('trio reflection includes the third participant',()=>{
  const result=derivePairNextAction({...base,participantIds:['a','b','c'],deliveredMemberIds:['a','b','c']});
  assertEquals(result.code,'complete_reflection');
  assertEquals(result.memberIds.join(','),'c');
});
Deno.test('pair action asks for verification',()=>assertEquals(derivePairNextAction({...base,pairStatus:'confirmed_schedule'}).code,'complete_verification'));
Deno.test('pair action asks for missing reflection',()=>assertEquals(derivePairNextAction({...base,sharedReflectionMemberIds:['a']}).code,'complete_reflection'));
Deno.test('pair action reports complete',()=>assertEquals(derivePairNextAction(base).code,'complete'));
Deno.test('contact does not regress a confirmed or verification-stage pair',()=>{
  assertEquals(pairStatusAfterContact('confirmed_schedule'),'confirmed_schedule');
  assertEquals(pairStatusAfterContact('partially_verified'),'partially_verified');
  assertEquals(pairStatusAfterContact('matched'),'contacted');
});
