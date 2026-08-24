import {buildGoalCoach,nextTrafficTarget} from './goal-coach.ts';
const assertEquals=(actual:unknown,expected:unknown)=>{if(JSON.stringify(actual)!==JSON.stringify(expected))throw new Error(`${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);};

Deno.test('goal coach selects the next traffic-light threshold',()=>{assertEquals([12,35,58,74,96].map(nextTrafficTarget),[30,50,70,84,100]);});
Deno.test('goal coach recommends official sustainable routines and keeps saved goals',()=>{const r=buildGoalCoach({score:48,trafficLight:'red',weeks:8,actuals:{referrals:3,visitors:0,oneToOne:8,ceu:1,tyfbThb:0},palms:{referral:0,visitor:0,oneToOne:5,ceu:5,tyfb:0},goals:{oto:2}});assertEquals(r.scoreTarget,50);assertEquals(r.components.find(x=>x.key==='ref')?.suggestedGoal,1);assertEquals(r.components.find(x=>x.key==='oto')?.currentGoal,2);assertEquals(r.priorities.length,3);});
